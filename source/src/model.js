import { policyDefaults } from "./charging-policy.js";
export const STATUS = {
  charging: { label: "충전 중", tone: "green" },
  available: { label: "충전 대기", tone: "neutral" },
  paused: { label: "충전 중지", tone: "amber" },
  fault: { label: "장애", tone: "red" },
  offline: { label: "통신 끊김", tone: "gray" },
};
export const DEFAULT_SETTINGS = { ...policyDefaults };
export function makeState(now = Date.now()) {
  const specs = [
    ["A", "충전 구역 A", "charging", 76, 1.48, 41.2, "01"],
    ["A", "충전 구역 A", "charging", 44, 1.45, 39.8, "03"],
    ["B", "충전 구역 B", "available", 0, 0, 28.4, null],
    ["B", "충전 구역 B", "charging", 58, 1.47, 42.1, "05"],
    ["C", "충전 구역 C", "charging", 91, 1.45, 43.5, "02"],
    ["C", "충전 구역 C", "fault", 0, 0, 68.2, null],
  ];
  const stations = specs.map(
    ([zone, location, status, soc, power, temperature, robot], i) => ({
      id: `WPO-TX-0${i + 1}`,
      zone,
      location,
      status,
      soc,
      power,
      temperature,
      robot: robot ? `AMR-${robot}` : null,
      manualStop: false, pdXmm: 0, pdYmm: 0, pdAngleDeg: 0, gapMm: 15,
      pdValid: true, fod: false, bmsStop: false, sensorFault: false, rxTemperature: 38,
      efficiency: power ? 92.5 + i * 0.2 : 0,
      protocol: i % 2 ? "OCPP 2.0.1" : "OCPP 1.6-J",
      lastSeen: now,
      sessionStart: power ? now - (i + 1) * 420000 : null,
      sessionEnergy: power ? (i + 1) * 0.17 : 0,
      history: Array.from({ length: 30 }, (_, n) => ({
        at: now - (29 - n) * 2000,
        power: power ? power - Math.sin(n / 4) * 0.035 : 0,
        temperature: temperature - Math.sin(n / 5) * 0.5,
      })),
    }),
  );
  const sessions = Array.from({ length: 56 }, (_, i) => {
    const start = new Date(now);
    start.setDate(start.getDate() - Math.floor(i / 8));
    start.setHours(6 + (i % 8), (i * 7) % 60, 0, 0);
    // Every seeded session ends before the initial dashboard time.
    if (start.getTime() > now - 3600000) start.setTime(now - (i + 2) * 3600000);
    const minutes = 24 + (i % 7) * 5;
    return {
      id: `TX-${1040 - i}`,
      station: stations[i % 6].id,
      robot: `AMR-0${(i % 5) + 1}`,
      start: start.getTime(),
      end: start.getTime() + minutes * 60000,
      energy: +((minutes / 60) * 1.46).toFixed(3),
      reason: i % 11 === 0 ? "장애 중지" : "목표 충전 완료",
    };
  });
  return {
    stations,
    sessions,
    incidents: [
      {
        id: "EV-1001",
        station: "WPO-TX-06",
        type: "temperature",
        title: "송신 코일 온도 초과",
        severity: "critical",
        created: now - 180000,
        resolved: null,
        acknowledged: null,
        measured: 68.2,
        threshold: 65,
        notes: [
          {
            at: now - 180000,
            text: "데모 시나리오: 온도 임계값 초과, 충전 차단 상태로 전환",
          },
        ],
      },
    ],
    events: [
      {
        at: now - 180000,
        station: "WPO-TX-06",
        text: "코일 과열 감지 · 충전 차단",
        tone: "red",
      },
      {
        at: now - 45000,
        station: "WPO-TX-04",
        text: "AMR-05 충전 시작",
        tone: "green",
      },
    ],
    packets: [],
    audit: [],
    settings: { ...DEFAULT_SETTINGS },
    nextId: 1100,
    lastTick: now,
  };
}
export function addEvent(
  state,
  station,
  text,
  tone = "neutral",
  now = Date.now(),
) {
  state.events.unshift({ at: now, station, text, tone });
  state.events.length = Math.min(state.events.length, 150);
}
export function finishSession(state, station, reason, now) {
  if (!station.sessionStart) return;
  state.sessions.unshift({
    id: `TX-${state.nextId++}`,
    station: station.id,
    robot: station.robot,
    start: station.sessionStart,
    end: now,
    energy: station.sessionEnergy,
    reason,
  });
  station.sessionStart = null;
  station.sessionEnergy = 0;
}
export function raiseIncident(state, stationId, type, now = Date.now()) {
  const title = {temperature: "송신 코일 온도 초과", offline: "스테이션 통신 응답 없음", fod: "패드 이물질 감지", pd: "PD 위치 정렬 이탈", efficiency: "전력전송 효율 저하"}[type];
  if (!title) return false;
  const s = state.stations.find((s) => s.id === stationId);
  if (!s || state.incidents.some((i) => i.station === stationId && !i.resolved))
    return false;
  const wasCharging = s.status === "charging";
  const before = {power:s.power, efficiency:s.efficiency, temperature:s.temperature, robot:s.robot};
  if (["pd", "efficiency"].includes(type)) { s.pdXmm=state.settings.alignmentWarnMm+8; s.pdYmm=4; }
  if (type === "fod") s.fod=true;
  finishSession(state, s, type === "offline" ? "통신 중단" : "장애 중지", now);
  s.status = type === "offline" ? "offline" : "fault";
  s.power = 0;
  s.efficiency = 0;
  if (type === "temperature")
    s.temperature = Math.max(s.temperature, state.settings.temperature + 3.2);
  if (type === "offline")
    s.lastSeen = now - (state.settings.staleSeconds + 1) * 1000;
  state.incidents.unshift({
    id: `EV-${state.nextId++}`,
    station: stationId,
    type,
    title,
    wasCharging, before,
    severity: ["offline", "pd", "efficiency"].includes(type) ? "warning" : "critical",
    created: now,
    resolved: null,
    acknowledged: null,
    measured: type === "temperature" ? s.temperature : null,
    threshold: type === "temperature" ? state.settings.temperature : null,
    notes: [{ at: now, text: `데모 시나리오: ${title}` }],
  });
  addEvent(state, stationId, title, "red", now);
  return true;
}
export function acknowledge(state, id, now = Date.now()) {
  const incident = state.incidents.find((i) => i.id === id);
  if (!incident || incident.resolved || incident.acknowledged) return false;
  incident.acknowledged = now;
  incident.notes.push({ at: now, text: "관제 담당자가 장애를 확인했습니다." });
  addEvent(state, incident.station, `${id} 장애 확인 · 조치 중`, "amber", now);
  return true;
}
export function command(state, id, action, reason = "", now = Date.now()) {
  const s = state.stations.find((s) => s.id === id);
  if (!s) throw new Error("스테이션을 찾을 수 없습니다.");
  if (action === "start") {
    if (!["available", "paused"].includes(s.status))
      throw new Error("대기 또는 중지 상태에서 시작할 수 있습니다.");
    if (s.temperature >= state.settings.temperature)
      throw new Error("온도 임계값을 초과했습니다. 먼저 점검해 주세요.");
    s.manualStop = false;
    s.status = "charging";
    s.robot ||= `AMR-SIM-${id.slice(-2)}`;
    s.soc ||= 35;
    s.power = Math.min(1.46, state.settings.targetPowerKw ?? 1.5);
    s.efficiency = 93;
    s.sessionStart = now;
    s.sessionEnergy = 0;
  } else if (action === "stop") {
    if (s.status !== "charging")
      throw new Error("충전 중인 장비만 중지할 수 있습니다.");
    s.manualStop = true;
    finishSession(state, s, "관리자 중지", now);
    s.status = "paused";
    s.power = 0;
    s.efficiency = 0;
  } else if (action === "recover") {
    if (!["fault", "offline"].includes(s.status))
      throw new Error("장애 또는 통신 끊김 상태에서 복구할 수 있습니다.");
    if (!reason.trim()) throw new Error("점검 및 조치 내용을 입력해 주세요.");
    state.incidents
      .filter((i) => i.station === id && !i.resolved)
      .forEach((i) => {
        i.resolved = now;
        i.notes.push({
          at: now,
          text: `데모 점검 완료·복구: ${reason.trim()}`,
        });
      });
    s.status = "available";
    s.fod = false;
    s.temperature = 30;
    s.lastSeen = now;
    s.power = 0;
    s.robot = null;
    s.soc = 0;
  } else throw new Error("지원하지 않는 명령입니다.");
  const label = {
    start: "충전 시작",
    stop: "충전 중지",
    recover: "점검 완료·복구",
  }[action];
  state.audit.unshift({
    at: now,
    station: id,
    text: label,
    reason: reason.trim(),
    mode: "demo",
  });
  state.audit.length = Math.min(state.audit.length, 200);
  addEvent(state, id, `${label} · 데모 처리 완료`, "green", now);
}
export function completeCharge(state, id, now = Date.now(), targetSoc = 100) {
  const s = state.stations.find((s) => s.id === id);
  if (!s || s.status !== "charging")
    throw new Error("충전 중인 장비만 완충 처리할 수 있습니다.");
  s.soc = targetSoc;
  finishSession(state, s, "목표 충전 완료", now);
  s.status = "available";
  s.power = 0;
  s.efficiency = 0;
  addEvent(state, id, "목표 충전 완료 · 대기 전환", "green", now);
}
export function tick(state, now = Date.now()) {
  const elapsed = Math.max(0, Math.min(5, (now - state.lastTick) / 1000));
  state.lastTick = now;
  state.stations.forEach((s, i) => {
    if (s.status !== "offline") s.lastSeen = now;
    if (s.status === "charging" && !s.simulationControlled && !s.recoveryControlled) {
      s.power = Math.min(state.settings.targetPowerKw ?? 1.5, 1.46 + Math.sin(now / 8000 + i) * 0.025);
      s.sessionEnergy += (s.power * elapsed) / 3600;
      s.temperature = 41 + i * 0.5 + Math.sin(now / 10000 + i) * 0.4;
      s.soc = Math.min(100, s.soc + elapsed * 0.003);
      if (s.temperature >= state.settings.temperature)
        raiseIncident(state, s.id, "temperature", now);
      else if (s.soc >= state.settings.bmsSocLimit) {
        finishSession(state, s, "목표 충전 완료", now);
        s.status = "available";
        s.power = 0;
        s.efficiency = 0;
        addEvent(state, s.id, "목표 충전 완료 · 대기 전환", "green", now);
      }
    }
    s.history.push({ at: now, power: s.power, temperature: s.temperature });
    if (s.history.length > 60) s.history.shift();
  });
  const online = state.stations.filter((s) => s.status !== "offline");
  const s = online[Math.floor(now / 2000) % (online.length || 1)];
  if (s) {
    const action = s.protocol.includes("2.0.1")
      ? "TransactionEvent"
      : "MeterValues";
    const id = `sim-${state.nextId++}`;
    const payload = s.protocol.includes("2.0.1")
      ? {
          eventType: "Updated",
          triggerReason: "MeterValuePeriodic",
          seqNo: state.nextId,
          transactionInfo: { transactionId: `SIM-${s.id}` },
          timestamp: new Date(now).toISOString(),
        }
      : {
          connectorId: 1,
          meterValue: [
            {
              timestamp: new Date(now).toISOString(),
              sampledValue: [
                {
                  value: (s.power * 1000).toFixed(0),
                  measurand: "Power.Active.Import",
                  unit: "W",
                },
              ],
            },
          ],
        };
    // Synthetic frames are explicitly displayed as demo data, not an OCPP conformance test.
    state.packets.unshift({
      at: now,
      station: s.id,
      action: s.status === "charging" ? action : "Heartbeat",
      frame: [
        2,
        id,
        s.status === "charging" ? action : "Heartbeat",
        s.status === "charging" ? payload : {},
      ],
    });
    state.packets.length = Math.min(state.packets.length, 100);
  }
}
export function report(state, days = 1, now = Date.now()) {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));
  const sessions = state.sessions.filter(
    (s) => s.end >= from.getTime() && s.end <= now,
  );
  const incidents = state.incidents.filter(
    (i) => i.created >= from.getTime() && i.created <= now,
  );
  return {
    from: from.getTime(),
    to: now,
    sessions,
    incidents,
    energy: sessions.reduce((sum, s) => sum + s.energy, 0),
    minutes: sessions.length
      ? sessions.reduce((sum, s) => sum + (s.end - s.start) / 60000, 0) /
        sessions.length
      : 0,
    completed: sessions.filter((s) => s.reason === "목표 충전 완료").length,
  };
}
export function csv(rows) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value ?? "");
            if (/^[=+\-@\t\r\n]/.test(text)) text = "'" + text;
            return '"' + text.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
