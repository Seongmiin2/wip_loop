import { recoveryCard } from "./recovery-view.js";
import { STATUS } from "./model.js";
import { PHASES, SCENARIOS } from "./simulation.js";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const decimal = (value, digits = 1) => Number(value).toFixed(digits);
const time = (at) =>
  new Date(at).toLocaleTimeString("ko-KR", { hour12: false });
const option = (value, label, selected) =>
  `<option value="${value}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`;

function scene() {
  return `<svg class="lab-scene" viewBox="0 0 980 490" role="img" aria-labelledby="lab-scene-title lab-scene-description">
  <title id="lab-scene-title">AMR 무선충전 시나리오</title><desc id="lab-scene-description">가상 AMR이 충전 패드로 접근해 정렬, 인증, 충전하고 이탈하는 평면 애니메이션입니다.</desc>
  <defs><pattern id="lab-floor-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#dce6d5" stroke-width=".7"/></pattern><marker id="lab-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="m0 0 7 3.5L0 7" fill="none" stroke="#92aa80" stroke-width="1.3"/></marker></defs>
  <rect x="20" y="18" width="940" height="450" rx="16" fill="#f2f6f3" stroke="#d4dfd7"/>
  <text x="40" y="51" class="scene-caption">충전기 · AMR</text>
  <g class="lab-server" transform="translate(21 0)"><rect x="747" y="40" width="162" height="68" rx="10" fill="white" stroke="#c6d4ca"/><rect x="762" y="57" width="29" height="31" rx="5" fill="#e5eee7" stroke="#5b7663"/><path d="M769 65h15m-15 7h15m-15 7h8" stroke="#7b9b66"/><text x="804" y="68" class="scene-label">CSMS</text><text x="804" y="88" class="scene-small">가상 관제 서버</text><circle id="lab-server-dot" cx="892" cy="58" r="4" fill="#70a254"/></g>
  <path id="lab-network" d="M768 74H656Q640 74 640 90V143.5H562" fill="none" stroke="#9bb48a" stroke-width="2" stroke-dasharray="6 5"/>
  <text id="lab-network-text" x="650" y="61" text-anchor="middle" class="scene-small">OCPP · 대기</text>
  <g><rect id="lab-charger-body" x="478" y="121" width="84" height="45" rx="8" fill="#e2eae4" stroke="#4b6353"/><rect x="490" y="131" width="28" height="17" rx="3" fill="#fff" stroke="#bdcdb0"/><path d="m503 133-5 7h6l-4 6" fill="none" stroke="#648553" stroke-width="1.3"/><circle id="lab-station-led" cx="548" cy="138" r="4" fill="#7aa45f"/><text id="lab-device-label" x="520" y="109" text-anchor="middle" class="scene-label">WPO-TX-03</text></g>
  <rect id="lab-travel-lane" x="40" y="200" width="900" height="200" rx="18" fill="url(#lab-floor-grid)" stroke="#d7e2cd"/>
  <path d="M87 290H901" stroke="#bfceb1" stroke-width="2" stroke-dasharray="8 9" marker-end="url(#lab-arrow)"/>
  <text id="lab-entry-label" x="110" y="181" text-anchor="middle" class="scene-small">접근</text><text id="lab-exit-label" x="875" y="181" text-anchor="middle" class="scene-small">이탈</text>
  <path id="lab-pad-cable" d="M520 166V223" stroke="#c1ceaf" stroke-width="3"/>
  <g id="lab-pad"><rect x="438" y="223" width="164" height="134" rx="17" fill="#dff1e4" stroke="#73a381" stroke-width="2"/><path d="M449 245v-10h13m117 0h11v11m0 89v10h-12m-116 0h-13v-11" fill="none" stroke="#92ae78" stroke-width="2"/><circle cx="520" cy="290" r="51" fill="#f6faef" stroke="#bed1a9"/><circle cx="520" cy="290" r="37" fill="none" stroke="#d3e1c3"/><path d="M520 237v106m-53-53h106" stroke="#bed1a9" stroke-dasharray="3 4"/>
   <g id="lab-energy"><circle class="energy-ring ring-one" cx="520" cy="290" r="45"/><circle class="energy-ring ring-two" cx="520" cy="290" r="63"/><circle class="energy-ring ring-three" cx="520" cy="290" r="80"/></g>
  </g>
  <g id="lab-align-guides"><path d="M420 230h20v-20m180 20h-20v-20m-180 140h20v20m180-20h-20v20" fill="none" stroke="#95aa60" stroke-width="2" stroke-dasharray="4 3"/><text x="520" y="446" text-anchor="middle" class="scene-small">BLE 정렬 · 수신 코일 중심 맞춤</text></g>
  <g id="lab-fod"><path d="m579 307 16-8 13 14-18 10Z" fill="#b17a56" stroke="#935c40"/><circle cx="594" cy="310" r="26" fill="none" stroke="#c47753" stroke-dasharray="4 4"/><text x="631" y="319" class="scene-error">이물질 감지</text></g>
  <g id="lab-heat"><path d="M617 284c-13-13 13-15 0-28m13 28c-13-13 13-15 0-28m13 28c-13-13 13-15 0-28" stroke="#c87454" stroke-width="2" fill="none"/><text x="613" y="246" class="scene-error">온도 상승</text></g>
  <g id="lab-robot" transform="translate(110 290)">
   <ellipse cx="0" cy="46" rx="48" ry="13" fill="#50613b12"/><rect x="-48" y="-33" width="13" height="24" rx="4" fill="#28392e"/><rect x="35" y="-33" width="13" height="24" rx="4" fill="#28392e"/><rect x="-48" y="15" width="13" height="24" rx="4" fill="#28392e"/><rect x="35" y="15" width="13" height="24" rx="4" fill="#28392e"/>
   <rect x="-39" y="-49" width="78" height="98" rx="17" fill="#fff" stroke="#386348" stroke-width="2"/><rect x="-30" y="-33" width="60" height="61" rx="10" fill="#d9e7de" stroke="#c2d4ae"/><rect x="-18" y="-19" width="36" height="25" rx="4" fill="#f9fcf5" stroke="#adc29a"/><rect id="lab-battery-fill" x="-14" y="-15" width="9" height="17" rx="2" fill="#258f48"/><path d="M18-12h4v11h-4" fill="#adc29a"/><path d="m-5 17 5-5 5 5" fill="none" stroke="#86a574" stroke-width="2"/><rect x="-18" y="-44" width="36" height="5" rx="2" fill="#238348"/><circle cx="0" cy="39" r="3" fill="#71915c"/>
   <rect id="lab-robot-nameplate" x="-58" y="65" width="116" height="26" rx="6" fill="#fff" stroke="#d3e0c7"/><text id="lab-robot-label" x="0" y="82" text-anchor="middle" class="scene-label">AMR-SIM-03</text>
  </g>
  <g id="lab-charge-label"><rect x="410" y="426" width="220" height="30" rx="12" fill="#e1edcf"/><text id="lab-charge-text" x="520" y="446" text-anchor="middle" class="scene-label">무선 전력 전송</text></g>
  <text id="lab-pad-caption" x="520" y="446" text-anchor="middle" class="scene-small">무선충전 패드</text>
 </svg>`;
}

const actionIcons = {
  full: '<rect x="3" y="6" width="16" height="12" rx="3"/><path d="M22 10v4m-15-2 3 3 5-6"/>',
  temperature: '<path d="M9 14.5V5a3 3 0 0 1 6 0v9.5a5 5 0 1 1-6 0Z"/><path d="M12 8v9m6-11h3m-3 4h2"/>',
  fod: '<path d="m3 9 9-5 9 5-9 5-9-5Zm0 6 9 5 9-5"/><path d="M12 7v3m0 6v1"/>',
  offline: '<path d="M5 8a11 11 0 0 1 15 1M8 12a6 6 0 0 1 8 0m-5 4 1-1 1 1M3 3l18 18"/>',
};
function actionButton(action, title) {
  return `<button type="button" class="lab-action" ${action === "full" ? 'data-lab="full" id="lab-full"' : `data-lab-fault="${action}"`} aria-describedby="lab-control-help">
    <span class="lab-action-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${actionIcons[action]}</svg></span>
    <span class="lab-action-copy"><strong id="lab-action-${action}-title">${title}</strong><small id="lab-action-${action}-detail">시험 시작</small></span>
    <svg class="lab-action-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>
  </button>`;
}

export function renderSimulation(lab) {
  const states = lab.state.stations;
  return `
 <section class="panel lab-controls"><form id="scenario-form"><label>충전기<select name="station" id="lab-target">${states.map((s) => option(s.id, `${s.id} · ${s.zone}구역 · ${s.status === "available" ? "대기" : s.status === "paused" ? "중지" : s.status === "charging" ? "충전 중" : "장애"}`, lab.station)).join("")}</select></label><label>시나리오<select name="type" id="lab-type">${Object.entries(
   SCENARIOS,
 )
   .map(([key, [label, detail]]) => option(key, label, lab.type))
   .join(
     "",
   )}</select></label><label>재생 속도<select id="lab-speed">${[1, 2, 4].map((s) => option(String(s), `${s}×`, String(lab.speed))).join("")}</select></label><button class="button primary" id="lab-start" type="submit">시나리오 실행</button><button class="button" id="lab-pause" type="button" data-lab="pause">일시정지</button><button class="button" id="lab-stop" type="button" data-lab="cancel">시험 중단</button></form></section>
 <div id="lab-stepper" class="lab-stepper"></div>
 <div class="lab-layout"><section class="panel lab-stage"><div class="panel-heading"><div><h2>충전 시뮬레이션</h2><p id="lab-location">${lab.device.location} · ${lab.device.protocol}</p></div><span id="lab-run-state" class="badge neutral">준비</span></div><div id="lab-visual">${scene()}</div><div class="lab-caption"><span id="lab-phase-number">01</span><div><h3 id="lab-phase-title"></h3><details class="lab-phase-help"><summary>단계 설명</summary><p id="lab-phase-description"></p></details></div><span id="lab-elapsed">00:00</span></div><div class="lab-phase-track"><i id="lab-phase-progress"></i></div></section>
 <aside class="panel lab-inspector"><div class="panel-heading"><div><h2>동작 상태</h2></div></div><div class="lab-battery"><div><span>배터리 잔량 <small>시연</small></span><strong id="lab-soc">35<small>%</small></strong></div><div class="lab-battery-track"><i id="lab-soc-bar"></i></div></div><dl class="lab-readings"><div><dt>충전 출력</dt><dd id="lab-power">0.00 <small>kW</small></dd></div><div><dt>코일 온도</dt><dd id="lab-temp">28.4 <small>°C</small></dd></div><div><dt>패드 정렬</dt><dd id="lab-alignment">미도킹</dd></div><div><dt>인증 상태</dt><dd id="lab-auth">대기</dd></div><div><dt>CSMS 통신</dt><dd id="lab-link">가상 연결</dd></div><div><dt>시험 세션 공급량</dt><dd id="lab-energy-value">0.0000 <small>kWh</small></dd></div></dl><div class="lab-policy-summary"><strong>설정 기준 진단 · 시연</strong><p id="lab-policy-status">충전 계측 대기</p></div><div id="lab-alert-box" class="lab-alert-box"></div><button class="button lab-detail" id="lab-device-detail" data-station="${lab.station}">장비 상세 · 장애 분석 →</button></aside></div>
 <section class="panel lab-triggers" aria-labelledby="lab-control-title"><div class="lab-control-heading"><h2 id="lab-control-title">시험 바로 실행</h2><span class="lab-control-target">대상 <strong id="lab-control-target">${lab.station}</strong></span></div><p id="lab-control-help" role="status">실행할 시험을 선택하세요.</p><div class="lab-trigger-actions">${actionButton("full", "정상 충전")}${actionButton("temperature", "코일 과열")}${actionButton("fod", "이물질 감지")}${actionButton("offline", "통신 끊김")}</div></section>
 <section class="panel lab-log-panel"><div class="panel-heading"><h2>시험 기록 <span id="lab-log-count" class="count">0건</span></h2><span class="muted" id="lab-log-status">시작 전</span></div><div id="lab-timeline" role="log" aria-live="polite"></div></section>`;
}
function steps(lab) {
  return lab.hadFault || (lab.type !== "cycle" && !lab.completed)
    ? [
        "approach",
        "align",
        "authorize",
        "charging",
        "fault",
        "recovery",
        "depart",
      ]
    : ["approach", "align", "authorize", "charging", "complete", "depart"];
}
export function updateSimulation(lab) {
  const root = document.querySelector("#lab-visual");
  if (!root) return;
  const s = lab.device,
    phase = lab.phase;
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el && el.textContent !== String(value)) el.textContent = value;
  };
  const visible = (id, show) =>
    (document.getElementById(id).style.opacity = show ? 1 : 0);
  const activeCharge =
    phase === "charging" && !lab.paused && s.status === "charging";
  const fault =
    phase === "fault" ||
    (phase === "canceled" && ["fault", "offline"].includes(s.status));
  root.className = `${activeCharge ? "is-charging" : ""} ${fault ? "is-fault" : ""} ${lab.paused ? "is-paused" : ""}`;
  document
    .getElementById("lab-robot")
    .setAttribute(
      "transform",
      `translate(${lab.x.toFixed(2)} ${(290 + lab.offset).toFixed(2)})`,
    );
  document
    .getElementById("lab-battery-fill")
    .setAttribute("width", String(Math.max(1, (28 * lab.soc) / 100)));
  visible("lab-energy", phase === "charging");
  visible("lab-align-guides", phase === "align");
  visible("lab-pad-caption", !["align", "charging", "complete", "fault", "recovery"].includes(phase));
  visible("lab-fod", lab.incidentType === "fod");
  visible(
    "lab-heat",
    lab.incidentType === "temperature" ||
      (phase === "charging" &&
        lab.type === "temperature" &&
        lab.progress > 0.3),
  );
  visible(
    "lab-charge-label",
    ["charging", "complete", "fault", "recovery"].includes(phase),
  );
  set(
    "lab-charge-text",
    fault
      ? "출력 차단 · 0 kW"
      : phase === "complete"
        ? "완충 · 출력 차단"
        : phase === "recovery"
          ? "복구 확인 · 대기"
          : lab.paused
            ? "시연 일시정지"
            : `무선 전력 ${decimal(s.power, 2)} kW`,
  );
  document.querySelector(".lab-stage").classList.toggle("has-fault", fault);
  for (const item of document.getElementById("lab-target").options) {
    const station = lab.state.stations.find((s) => s.id === item.value);
    const label = `${station.id} · ${station.zone}구역 · ${STATUS[station.status].label}`;
    if (item.textContent !== label) item.textContent = label;
  }
  const linkLost = s.status === "offline";
  document
    .getElementById("lab-network")
    .classList.toggle(
      "network-active",
      ["authorize", "charging"].includes(phase) && !lab.paused,
    );
  document
    .getElementById("lab-network")
    .classList.toggle("network-lost", linkLost);
  document
    .getElementById("lab-server-dot")
    .setAttribute("fill", linkLost ? "#bd7359" : "#70a254");
  document
    .getElementById("lab-station-led")
    .setAttribute("fill", fault ? "#c47753" : "#7aa45f");
  set(
    "lab-network-text",
    linkLost
      ? "통신 끊김 ×"
      : phase === "authorize"
        ? "Authorize → Accepted"
        : phase === "charging"
          ? s.protocol.includes("2.0.1")
            ? "TransactionEvent → CSMS"
            : "MeterValues → CSMS"
          : "OCPP · 대기",
  );
  set("lab-device-label", `충전기 ${lab.station}`);
  set("lab-robot-label", lab.robot);
  set("lab-location", `${s.location} · ${s.protocol}`);
  set(
    "lab-phase-title",
    lab.paused ? `${PHASES[phase][0]} · 일시정지` : PHASES[phase][0],
  );
  set("lab-phase-description", lab.message || PHASES[phase][1]);
  const seq = steps(lab),
    index = seq.indexOf(phase);
  set(
    "lab-phase-number",
    phase === "done" ? "✓" : String(Math.max(1, index + 1)).padStart(2, "0"),
  );
  set(
    "lab-elapsed",
    `${String(Math.floor(lab.total / 60000)).padStart(2, "0")}:${String(Math.floor(lab.total / 1000) % 60).padStart(2, "0")}`,
  );
  document.getElementById("lab-phase-progress").style.width =
    `${phase === "done" ? 100 : phase === "idle" ? 0 : phase === "fault" ? 100 : lab.progress * 100}%`;
  const status = document.getElementById("lab-run-state");
  const statusText = lab.paused
    ? "일시정지"
    : fault
      ? "점검 대기"
      : phase === "done"
        ? "완료"
        : phase === "canceled"
          ? "중단"
          : lab.active
            ? "시연 중"
            : "준비";
  set("lab-run-state", statusText);
  status.className = `badge ${fault ? "red" : lab.paused ? "amber" : lab.active || phase === "done" ? "green" : "neutral"}`;
  set("lab-soc", `${Math.floor(lab.soc)}%`);
  document.getElementById("lab-soc-bar").style.width = `${lab.soc}%`;
  set(
    "lab-power",
    `${decimal(s.power, 2)} kW${linkLost ? " · 데모 차단" : ""}`,
  );
  set("lab-temp", linkLost ? "— (수신 없음)" : `${decimal(s.temperature)} °C`);
  document
    .getElementById("lab-temp")
    .classList.toggle(
      "red-text",
      s.temperature >= lab.state.settings.temperature,
    );
  set(
    "lab-alignment",
    ["idle", "approach"].includes(phase)
      ? "미도킹"
      : phase === "align"
        ? `정렬 중 ${Math.floor(lab.progress * 100)}%`
        : ["depart", "done"].includes(phase)
          ? "분리"
          : "정렬 완료",
  );
  set(
    "lab-auth",
    ["idle", "approach", "align"].includes(phase)
      ? "대기"
      : phase === "authorize"
        ? "인증 요청 중"
        : "승인 (가상)",
  );
  set("lab-link", linkLost ? "연결 끊김" : "가상 연결");
  set("lab-energy-value", `${decimal(lab.sessionEnergy || 0, 4)} kWh`);
  const policyNotes = lab.analysis?.findings.filter(item => item.code !== 'low_load').map(item => item.title) || [];
  set("lab-policy-status", phase === 'align' ? `PD X ${decimal(s.pdXmm || 0)} / Y ${decimal(s.pdYmm || 0)} mm · 안정 확인 ${lab.state.settings.alignmentHoldSeconds}초` : phase === 'charging' ? (policyNotes.join(' · ') || `기준 내 동작 · 출력 상한 ${decimal(lab.state.settings.targetPowerKw, 2)} kW`) : '충전 계측 대기');
  document.getElementById("lab-device-detail").dataset.station = lab.station;
  document.getElementById("lab-start").disabled = lab.active;
  document.getElementById("lab-target").disabled = lab.active;
  document.getElementById("lab-type").disabled = lab.active;
  document.getElementById("lab-pause").disabled =
    !lab.active || phase === "fault";
  set("lab-pause", lab.paused ? "시연 재개" : "일시정지");
  document.getElementById("lab-stop").disabled = !lab.active;
  const canStart = !lab.active && ["available", "paused"].includes(s.status) && s.temperature < lab.state.settings.temperature;
  const canControl = canStart || activeCharge;
  const unavailable = fault || ["fault", "offline"].includes(s.status)
    ? "장애 복구 후 다시 시험할 수 있습니다."
    : lab.paused ? "일시정지 상태입니다. 시연을 재개해 주세요."
    : lab.active ? `${PHASES[phase][0]} 진행 중 · 충전 단계에서 조작할 수 있습니다.`
    : s.temperature >= lab.state.settings.temperature ? "코일 온도를 확인한 뒤 시험해 주세요."
    : "대기 또는 충전 중지 상태의 충전기를 선택하세요.";
  set("lab-control-title", canStart ? "시험 바로 실행" : activeCharge ? "충전 중 조작" : "시험 조작");
  set("lab-control-target", lab.station);
  set("lab-control-help", canStart ? "선택한 충전기로 도킹부터 시험합니다." : activeCharge ? "완충 또는 장애를 즉시 발생시킵니다." : unavailable);
  document.querySelector(".lab-triggers").dataset.mode = canStart ? "start" : activeCharge ? "inject" : "waiting";
  for (const action of ["full", "temperature", "fod", "offline"]) {
    const button = document.querySelector(action === "full" ? "#lab-full" : `[data-lab-fault="${action}"]`);
    const title = action === "full" ? (canStart ? "정상 충전" : "완충 처리") : SCENARIOS[action][0];
    const detail = canStart ? (action === "full" ? "전주기 시험 시작" : "시험 시작") : activeCharge ? (action === "full" ? "100% 완료 처리" : "장애 발생") : lab.paused ? "재개 후 사용" : fault ? "복구 후 사용" : lab.active ? "충전 중 사용" : "실행 조건 확인";
    set(`lab-action-${action}-title`, title);
    set(`lab-action-${action}-detail`, detail);
    button.disabled = !canControl;
    button.setAttribute("aria-label", `${title} · ${detail}`);
    button.title = canControl ? `${title} · ${detail}` : unavailable;
  }
  set("lab-log-count", `${lab.logs.length}건`);
  set("lab-log-status", lab.logs.length ? (phase === "done" ? "시험 완료" : phase === "canceled" ? "중단됨" : fault ? "점검 대기" : lab.paused ? "일시정지" : "기록 중") : "시작 전");
  const recoveryIncident = lab.state.incidents.find(i => i.station === lab.station && !i.resolved);
  const recoveryJob = recoveryIncident?.automation;
  const revision = `${recoveryJob?.phase}-${phase}-${lab.hadFault}-${lab.type}-${lab.logs.length}-${lab.logs[0]?.at}-${lab.paused}`;
  if (root.dataset.revision !== revision) {
    root.dataset.revision = revision;
    document.getElementById("lab-stepper").innerHTML = seq
      .map(
        (key, i) =>
          `<div class="lab-step ${phase === key ? "current" : lab.completedPhases.includes(key) ? "finished" : ""} ${phase === key && key === "fault" ? "step-fault" : ""}"><span>${lab.completedPhases.includes(key) ? "✓" : String(i + 1).padStart(2, "0")}</span><strong>${PHASES[key][0]}</strong></div>`,
      )
      .join("");
    document.getElementById("lab-alert-box").innerHTML = fault
      ? `<strong>${esc(SCENARIOS[lab.incidentType || lab.type]?.[0] || "장애")} · 보호 정지</strong><p>자동 조치와 정상 확인을 진행합니다. 현장 이관 시 점검이 필요합니다.</p>${recoveryJob ? `<div data-auto-detail="${recoveryIncident.id}">${recoveryCard(recoveryJob, true)}</div>` : "<p>자동 처리 접수 중</p>"}<a href="#incidents" class="button">자동 처리 전체 보기</a>`
      : phase === "done"
        ? `<strong>시나리오가 완료되었습니다.</strong><p>${lab.completed ? "목표 충전 완료 세션을 기록했습니다." : "복구 후 대기 상태를 확인했습니다."} 다시 실행하거나 다른 상황을 시험하세요.</p>`
        : "";
    document.getElementById("lab-alert-box").classList.toggle("fault", fault);
    document.getElementById("lab-timeline").innerHTML = lab.logs.length
      ? lab.logs
          .map(
            (log) =>
              `<div class="lab-log-row"><time>${time(log.at)}</time><span></span><strong>${esc(log.text)}</strong></div>`,
          )
          .join("")
      : '<div class="lab-log-empty"><span class="lab-empty-mark" aria-hidden="true">—</span><div><strong>아직 시험 기록이 없습니다</strong><p>위에서 시험을 실행하면 진행 단계와 결과가 여기에 남습니다.</p></div></div>';
  }
}
