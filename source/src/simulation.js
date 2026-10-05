import {planPower, evaluateCharging} from './charging-policy.js';
import { command, completeCharge, addEvent, raiseIncident } from './model.js';
const PHASES = {
  idle: ["시험 준비", "시나리오를 선택하고 AMR의 충전 과정을 시작하세요."],
  approach: ["AMR 접근", "이동 경로를 따라 충전 스테이션으로 접근합니다."],
  align: ["도킹 · 패드 정렬", "송신 패드와 수신 코일의 중심을 맞춥니다."],
  authorize: ["로봇 인증", "AMR 식별 정보를 가상 CSMS에서 확인합니다."],
  charging: ["무선 전력 전송", "충전 출력과 배터리 잔량 변화를 확인합니다."],
  complete: ["목표 충전 완료", "출력을 0으로 전환하고 충전 세션을 기록합니다."],
  fault: ["보호 정지 · 자동 처리", "출력을 차단하고 자동 조치와 정상 확인을 진행합니다. 현장 이관 시 점검이 필요합니다."],
  recovery: ["복구 확인", "정상 대기 또는 검증된 자동 재충전 결과를 확인합니다."],
  depart: ["AMR 이탈", "충전 구역을 벗어나 다음 작업으로 이동합니다."],
  done: ["시험 완료", "시나리오 결과가 관제 현황과 충전·조치 이력에 반영되었습니다."],
  canceled: ["시험 중단", "충전 중이었다면 중지 처리했습니다. 발생한 장애는 그대로 유지합니다."]
};
const SCENARIOS = {
  cycle: ["정상 충전 전주기", "접근부터 완충·이탈까지"],
  temperature: ["코일 과열", "온도 상승 → 보호 차단"],
  fod: ["이물질 감지", "패드 위 이물질 → 차단"],
  offline: ["통신 끊김", "연결 단절 → 보호 정지"]
};
const DURATIONS = {
  approach: 3e3,
  align: 2500,
  authorize: 2e3,
  charging: 12e3,
  complete: 2e3,
  recovery: 2e3,
  depart: 3e3
};
const clamp = t => Math.max(0, Math.min(1, t));
class Simulation {
  constructor(e) {
    var a;
    this.state = e, this.station = ((a = e.stations.find(s => s.status === "available")) == null ? void 0 : a.id) || e.stations[0].id, this.type = "cycle", this.phase = "idle", this.elapsed = 0, this.total = 0, this.speed = 1, this.paused = !1, this.logs = [], this.completedPhases = [], this.robot = "AMR-SIM-03", this.soc = 35, this.x = 110, this.offset = 0, this.completed = !1, this.incidentType = null, this.message = "";
  }
  get active() {
    return !["idle", "done", "canceled"].includes(this.phase);
  }
  get device() {
    return this.state.stations.find(e => e.id === this.station);
  }
  get duration() {
    if (this.phase === "align") return Math.min(this.state.settings.alignmentTimeoutSeconds * 1000, 2500 + this.state.settings.alignmentHoldSeconds * 1000);
    return this.phase === "charging" && this.type !== "cycle" && !this.recharged ? 5e3 : DURATIONS[this.phase];
  }
  get progress() {
    return clamp(this.elapsed / (this.duration || 1));
  }
  note(e, a) {
    this.logs.unshift({
      at: a,
      text: e
    }), this.logs.length = Math.min(30, this.logs.length);
  }
  preview(e, a) {
    if (this.active) throw new Error("진행 중인 시험을 먼저 중단해 주세요.");
    if (!this.state.stations.some(s => s.id === e) || !SCENARIOS[a]) throw new Error("시험 대상을 확인해 주세요.");
    this.recharged = false; this.forceFull = false; this.diagnosticHistory = []; this.analysis = null;
    this.station = e, this.type = a, this.phase = "idle", this.logs = [], this.x = 110, this.offset = 0, this.soc = 35, this.robot = `AMR-SIM-${e.slice(-2)}`, this.incidentType = null, this.hadFault = !1, this.completed = !1, this.message = "", this.sessionEnergy = 0, this.completedPhases = [], this.total = 0, this.elapsed = 0, this.paused = !1;
  }
  start(e = this.station, a = this.type, s = Date.now()) {
    if (this.active) throw new Error("진행 중인 시험이 있습니다.");
    const i = this.state.stations.find(n => n.id === e);
    if (!i || !["available", "paused"].includes(i.status)) throw new Error("대기 또는 중지 상태의 장비를 선택하세요. 장애 장비는 먼저 복구해 주세요.");
    if (i.temperature >= this.state.settings.temperature) throw new Error("온도 임계값을 초과한 장비는 시험을 시작할 수 없습니다.");
    this.policyEpoch = s;
    this.preview(e, a), this.original = {
      robot: i.robot,
      soc: i.soc,
      status: i.status
    }, this.robot = i.robot || `AMR-SIM-${e.slice(-2)}`, this.soc = Math.min(i.soc || 35, 90), this.initialSoc = this.soc, this.hadCharge = !1, this.completed = !1, this.sessionEnergy = 0, i.simulationControlled = !0, this.note(`${SCENARIOS[a][0]} 시작 · ${e}`, s), this.enter("approach", s);
  }
  enter(e, a) {
    this.phase !== "idle" && this.phase !== e && this.phase !== "fault" && this.completedPhases.push(this.phase), this.phase = e, this.elapsed = 0;
    const s = this.device;
    e === "align" && (s.robot = this.robot, s.soc = this.soc), e === "charging" && (command(this.state, this.station, "start", "시각적 충전 시나리오", a), s.power = 0, this.hadCharge = !0), e === "complete" && (this.soc = this.forceFull ? 100 : this.state.settings.bmsSocLimit, completeCharge(this.state, this.station, a, this.soc), this.completed = !0), e === "done" && (s.robot = null, s.soc = 0, delete s.simulationControlled, this.paused = !1), this.note(PHASES[e][0], a), e !== "charging" && addEvent(this.state, this.station, `시각적 시험 · ${PHASES[e][0]}`, e === "fault" ? "red" : "neutral", a);
  }
  advance(e, a = Date.now()) {
    if (!this.active || this.paused || this.phase === "fault") return !1;
    const s = this.phase;
    this.elapsed += e * this.speed, this.total += e * this.speed;
    const i = this.progress,
      n = this.device;
    if (this.phase === "approach" && (this.x = 110 + 345 * i, this.offset = -24), this.phase === "align" && (this.x = 455 + 65 * Math.min(1, this.elapsed / 2500), this.offset = -24 * (1 - Math.min(1, this.elapsed / 2500)), n.pdXmm = (this.state.settings.alignmentWarnMm + 5) * (1 - Math.min(1, this.elapsed / 2500)), n.pdYmm = 0), this.phase === "authorize" && (this.x = 520, this.offset = 0), this.phase === "charging") {
      if (n.status !== "charging") return this.cancel(a), this.message = "외부 상태 변경으로 시험이 중단되었습니다.", !0;
      if (this.x = 520, this.offset = 0, this.soc = this.initialSoc + ((this.type === "cycle" || this.recharged) ? this.state.settings.bmsSocLimit - this.initialSoc : 12) * i, n.soc = Math.min(100, this.soc), n.power = planPower(this.state.settings, n.temperature >= this.state.settings.temperatureDerate ? "derate" : "observe", n.power, e * this.speed / 1000), n.efficiency = 93, n.sessionEnergy += n.power * e / 36e5, this.sessionEnergy = n.sessionEnergy, n.temperature = this.type === "temperature" && !this.recharged ? 40 + (this.state.settings.temperature - 40 + 3.2) * i : 40 + i * .2, this.type === "temperature" && !this.recharged && n.temperature >= this.state.settings.temperature) return this.inject("temperature", a), !0;
    }
    if (this.phase === "charging") {
      const at = this.policyEpoch + this.total;
      this.diagnosticHistory.push({at, txAt: at, rxAt: at, txInputW: n.power * 1000, rxOutputW: n.power * n.efficiency * 10, txTemperature: n.temperature, rxTemperature: 38, pdXmm: n.pdXmm || 0, pdYmm: n.pdYmm || 0, pdAngleDeg: 0, gapMm: 15, pdValid: true});
      this.diagnosticHistory = this.diagnosticHistory.slice(-150);
      this.analysis = evaluateCharging(this.diagnosticHistory, this.state.settings, at);
    }
    if (this.phase === "depart" && (this.x = 520 + 355 * i, this.offset = 0), i < 1) return !1;
    const o = {
      approach: "align",
      align: "authorize",
      authorize: "charging",
      complete: "depart",
      recovery: "depart",
      depart: "done"
    }[this.phase];
    return this.phase === "charging" ? (this.type === "cycle" || this.recharged) ? this.enter("complete", a) : this.inject(this.type, a) : o && this.enter(o, a), s !== this.phase;
  }
  togglePause() {
    if (!this.active || this.phase === "fault") throw new Error("진행 중인 단계에서 일시정지할 수 있습니다.");
    this.paused = !this.paused;
  }
  setSpeed(e) {
    if (![1, 2, 4].includes(Number(e))) throw new Error("지원하지 않는 속도입니다.");
    this.speed = Number(e);
  }
  inject(e, a = Date.now()) {
    if (this.phase !== "charging" || this.paused) throw new Error("충전 진행 중에 장애를 발생시킬 수 있습니다.");
    if (!["temperature", "offline", "fod"].includes(e)) throw new Error("지원하지 않는 장애입니다.");
    if (this.sessionEnergy = this.device.sessionEnergy, !raiseIncident(this.state, this.station, e, a)) throw new Error("이미 발생한 장애를 먼저 처리해 주세요.");
    this.incidentType = e, this.hadFault = !0, this.enter("fault", a), this.x = 520, this.offset = 0, this.note(`${SCENARIOS[e][0]} · 출력 0 kW · 보호 정지`, a);
  }
  fullCharge(e = Date.now()) {
    if (this.phase !== "charging" || this.paused) throw new Error("충전 진행 중에 완충 신호를 보낼 수 있습니다.");
    this.forceFull = true;
    this.note("수동 완충 트리거 · SoC 100%", e), this.enter("complete", e);
  }
  afterRecovery(e = Date.now()) {
    if (this.phase === "fault" && this.device.status === "charging" && !this.state.incidents.some(i=>i.station===this.station&&!i.resolved)) {
      this.completedPhases.push("fault");this.recharged=true;this.incidentType=null;this.initialSoc=this.device.soc;this.soc=this.device.soc;this.phase="charging";this.elapsed=0;this.diagnosticHistory=[];this.note("자동 시험 충전 검증 완료 · 목표 잔량까지 충전 계속",e);return;
    }
    if (this.phase !== "fault" || this.device.status !== "available") throw new Error("점검·복구 명령을 먼저 완료하세요.");
    this.completedPhases.push("fault"), this.incidentType = null, this.enter("recovery", e);
  }
  cancel(e = Date.now()) {
    if (!this.active) return;
    const a = this.device;
    a.manualStop = true;
    a.status === "charging" && (this.sessionEnergy = a.sessionEnergy, command(this.state, this.station, "stop", "시각적 시험 중단", e)), !this.hadCharge && !["fault", "offline"].includes(a.status) && (a.robot = this.original.robot, a.soc = this.original.soc, a.status = this.original.status), this.enter("canceled", e), delete a.simulationControlled, this.paused = !1;
  }
}
export {PHASES, SCENARIOS, Simulation};
