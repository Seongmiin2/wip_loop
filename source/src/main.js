import { AutonomousRecovery } from "./autonomous-recovery.js";
import { recoveryBoard, recoveryCard, recoveryLabel, updateRecoveryBoard, autoActive, recoverySummary } from "./recovery-view.js";
import "./recovery-view.css";
import {
  STATUS,
  makeState,
  acknowledge,
  command,
  tick,
  report,
  csv,
} from "./model.js";
import { Simulation } from "./simulation.js";
import { renderSimulation, updateSimulation } from "./simulation-view.js";
const paths = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    station:
      '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 16h6m-3-6-2 3h4l-2 3"/>',
    alert:
      '<path d="m10.3 4-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>',
    chart: '<path d="M4 3v17h17M8 15v-4m5 4V7m5 8v-6"/>',
    history: '<path d="M3 11a9 9 0 1 1 2.5 7M3 4v7h7m2-4v5l3 2"/>',
    code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
    settings:
      '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    leaf: '<path d="M20 3C9 2 3 7 4 14c1 7 12 9 15-2 1-3 1-6 1-9Z M4 21l10-12"/>',
    bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-8Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
    play: '<path d="m8 4 13 8-13 8Z"/>',
    link: '<path d="m9 15 6-6M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 10a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1"/>',
  },
  icon = (t) =>
    `<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[t] || paths.grid}</svg>`,
  esc = (t) =>
    String(t ?? "").replace(
      /[&<>"']/g,
      (e) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[e],
    ),
  num = (t, e = 1) =>
    Number(t).toLocaleString("ko-KR", {
      minimumFractionDigits: e,
      maximumFractionDigits: e,
    }),
  time = (t) =>
    new Date(t).toLocaleTimeString("ko-KR", {
      hour12: !1,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  date = (t) =>
    new Date(t).toLocaleDateString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
    }),
  dateTime = (t) => `${date(t)} ${time(t)}`,
  ago = (t) => {
    const e = Math.max(0, Math.floor((Date.now() - t) / 1e3));
    return e < 60 ? `${e}초 전` : `${Math.floor(e / 60)}분 전`;
  },
  badge = (t) =>
    `<span class="badge ${STATUS[t].tone}"><i></i>${STATUS[t].label}</span>`,
  state = makeState(),
  lab = new Simulation(state),
  recovery = new AutonomousRecovery(state, {demoAutoRecharge:true});
const pages = [
    ["dashboard", "grid", "통합 관제"],
    ["stations", "station", "충전기"],
    ["incidents", "alert", "장애 · 자동 복구"],
    ["reports", "chart", "분석 리포트"],
    ["transactions", "history", "충전 이력"],
    ["packets", "history", "운영 이력"],
    ["simulator", "play", "충전 시연"],
  ],
  descriptions = {
    dashboard: "충전기 상태, 도킹된 AMR, 장애 발생 위치를 확인합니다.",
    stations: "장비별 상태와 충전 정보를 확인하고 제어합니다.",
    incidents: "발생 위치부터 진단 근거, 조치 이력까지 한곳에서.",
    reports: "운영 데이터를 모아 현장의 흐름을 읽습니다.",
    transactions: "완료된 충전 세션과 공급 전력량을 확인합니다.",
    packets: "현재 시연의 운영 이벤트와 조작 이력을 확인합니다.",
    simulator: "가상 장비로 충전 및 장애 대응 흐름을 시험합니다.",
    humanoid: "RB-Y1 무선충전의 목표, 제공 실적과 검증 조건을 확인합니다.",
    settings: "관제 화면과 데모 감지 기준을 관리합니다.",
  };
let page = pages.some((t) => t[0] === location.hash.slice(1).split("?")[0])
    ? location.hash.slice(1).split("?")[0]
    : "dashboard",
  zone = "all",
  stationFilter = "all",
  query = "",
  incidentFilter = "open",
  reportDays = 1,
  logFilter = "all",
  logQuery = "",
  paused = !1,
  pausedPackets = [],
  view = "map",
  drawerId = null,
  dialogOpen = !1,
  previousFocus = null,
  monitor = new URLSearchParams(location.search).has("monitor"),
  simulationClock = performance.now();
const app = document.querySelector("#app"),
  overlay = document.querySelector("#overlay"),
  openIncidents = () => state.incidents.filter((t) => !t.resolved),
  filteredStations = () =>
    state.stations.filter(
      (t) =>
        (zone === "all" || t.zone === zone) &&
        (stationFilter === "all" || t.status === stationFilter) &&
        `${t.id} ${t.robot || ""} ${t.location}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
function toast(t) {
  const e = document.createElement("div");
  ((e.className = "toast"),
    (e.textContent = t),
    document.querySelector("#notifications").append(e),
    setTimeout(() => e.remove(), 4200));
}
function empty(t) {
  return `<div class="empty">${icon("check")}<p>${t}</p></div>`;
}
function options(t, e) {
  return t
    .map(
      ([a, s]) =>
        `<option value="${a}" ${e === a ? "selected" : ""}>${esc(s)}</option>`,
    )
    .join("");
}
function renderShell() {
  app.innerHTML = `<aside class="sidebar">
    <a href="#dashboard" class="brand" aria-label="WIP LOOP 통합 관제"><span class="brand-crop"><img class="brand-logo" src="/brand/wip-logo.png" alt="WIP wipowerone" width="360" height="260"></span><span class="brand-product">LOOP</span></a>
    <div class="workspace">${icon("station")}<span>${esc(state.settings.site)}</span></div>
    <nav aria-label="주 메뉴">${pages.map(([id, symbol, label], i) => `${id === 'packets' ? '<div class="nav-divider"></div>' : ""}<a href="#${id}" aria-label="${label}" title="${label}" data-nav="${id}" class="nav-item ${page === id ? "active" : ""}">${icon(symbol)}<span>${label}</span>${id === "incidents" ? `<span class="nav-count">${openIncidents().length}</span>` : ""}</a>`).join("")}</nav>
    <div class="sidebar-bottom"><div class="brand-message"><strong>WIP LOOP</strong><p>피지컬 AI 기반 24시간<br>자율 무선충전 인프라</p><b>충전은 스스로, 끊김없이.</b></div><div class="operator"><span class="avatar">관제</span><span>전시 시연</span></div></div>
  </aside><div class="main-shell"><header class="topbar"><div class="breadcrumb"><span class="product-name">WIP LOOP</span><span>/</span><strong id="breadcrumb"></strong></div><div class="top-actions"><span class="demo-pill">전시 시뮬레이션 · 실제 장비 미연결</span><span id="server-status" class="connection"></span><button class="icon-button" data-action="monitor" aria-label="관제 모드 전환" title="관제 모드 전환">${icon("expand")}</button></div></header><main id="main" tabindex="-1"></main><footer><span>WIP LOOP</span><span id="clock"></span></footer></div>`;
  renderPage();
  renderConnection();
}
function header(extra = "") {
  const help = `<details class="page-help"><summary>화면 안내</summary><div><p>${descriptions[page]}</p><p>현재는 가상 장비 데모입니다. 실제 장비 제어는 연결되지 않았으며, 새로고침하면 시험 이력이 초기화됩니다.</p>${["dashboard", "stations"].includes(page) ? "<p>A·B·C는 충전기 위치를 구분하기 위한 예시 구역입니다. 실제 공정이나 조립 작업을 의미하지 않습니다.</p>" : ""}${page === "simulator" ? "<p>시간과 배터리 잔량은 압축 시연값입니다. 공급량은 진행 시간의 출력으로 계산하며 실제 배터리의 충전 성능을 검증하는 모델은 아닙니다.</p>" : ""}</div></details>`;
  return `<div class="page-heading"><h1>${pages.find((p) => p[0] === page)[2]}</h1><div class="heading-actions">${extra}<button class="button" data-action="restart-demo">시연 초기화</button>${help}</div></div>`;
}
function metric(t, e, a, s, i = "", n = "bolt") {
  return `<article class="metric ${i}"><div class="metric-label">${t}${icon(n)}</div><div class="metric-value">${e}<span>${a}</span></div><div class="metric-note">${s}</div></article>`;
}
function stats() {
  const charging = state.stations.filter((s) => s.status === "charging").length,
    online = state.stations.filter((s) => s.status !== "offline").length,
    power = state.stations.reduce((s, i) => s + i.power, 0);
  return `<div class="metrics">${metric("충전기 연결", online, `/ ${state.stations.length} 연결`, `대기 ${state.stations.filter((s) => s.status === "available").length}대 · 충전 중 ${charging}대`, "", "station")}${metric("충전 전력", num(power, 2), "kW", "", "featured")}${metric("오늘 공급 전력량", num(report(state).energy, 2), "kWh", `완료 세션 ${report(state).sessions.length}건 기준`, "", "chart")}${metric("진행 중 장애", openIncidents().length, "건", `미확인 ${openIncidents().filter((s) => !s.acknowledged).length}건`, openIncidents().length ? "attention" : "", "alert")}</div>`;
}
function stationCard(s, compact = false) {
  return `<button class="station-card ${s.status} ${compact ? "compact" : ""} ${drawerId === s.id ? "is-selected" : ""}" data-station="${s.id}" aria-haspopup="dialog" aria-expanded="${drawerId === s.id}" aria-label="충전기 ${s.id}, 도킹 AMR ${s.robot || "없음"}, ${STATUS[s.status].label} 상세 보기">
    <div class="station-top"><div class="station-identity"><span>충전기</span><strong>${s.id}</strong></div>${badge(s.status)}</div>
    <div class="docked-robot ${s.robot ? "" : "undocked"}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="4"/><path d="M9 8h6M9 16h6M2 9v6m20-6v6"/><circle cx="12" cy="12" r="1"/></svg><span>도킹 AMR</span><strong>${s.robot || "없음"}</strong></div>
    <div class="station-readings">${cardReadings(s)}</div><div class="soc-line"><span>배터리</span><div class="soc-track"><i style="width:${s.robot ? s.soc : 0}%"></i></div><b>${s.robot ? `${Math.floor(s.soc)}%` : "—"}</b></div>
  </button>`;
}
function cardReadings(s) {
  return `<span class="reading-primary"><small>충전 전력</small><b>${s.status === "offline" ? "—" : num(s.power, 2)} <em>kW</em></b></span><span class="reading-secondary"><small>코일 온도</small><b class="${s.temperature >= state.settings.temperature ? "red-text" : ""}">${s.status === "offline" ? "—" : num(s.temperature)} <em>°C</em></b></span>`;
}
function siteMap() {
  const zones = ["A", "B", "C"].filter((id) => zone === "all" || zone === id);
  return `<div class="site-map"><div class="map-zones ${zones.length === 1 ? "single-zone" : ""}">${zones
    .map(
      (id) =>
        `<section class="map-zone"><div class="zone-label"><span>${id}</span><strong>충전 구역</strong><small>충전기 2대</small></div><div class="zone-stations">${state.stations
          .filter((s) => s.zone === id)
          .map((s) => stationCard(s, true))
          .join("")}</div></section>`,
    )
    .join("")}</div></div>`;
}
function chart(history, { key = "power", unit = "kW", threshold = null, label = "전력 추이" } = {}) {
  if (history.length < 2) return empty("데이터 수집 중입니다.");
  const maximum = Math.max(...history.map(sample => sample[key]), threshold || 0, 0.1) * 1.2;
  const y = value => 112 - value / maximum * 112;
  const points = history.map((sample, index) => `${index / (history.length - 1) * 690},${y(sample[key])}`).join(" ");
  return `<div class="trend-chart" role="img" aria-label="${label}, 현재 ${num(history.at(-1)[key], 2)} ${unit}">
    <div class="chart-y"><span>${num(maximum)}</span><span>${num(maximum / 2)}</span><span>0.0</span></div>
    <div class="chart-plot"><svg viewBox="0 0 690 112" preserveAspectRatio="none" aria-hidden="true">${[0, 56, 112].map(level => `<line x1="0" y1="${level}" x2="690" y2="${level}" stroke="#edf1ef" vector-effect="non-scaling-stroke"/>`).join("")}
    <polygon points="0,112 ${points} 690,112" fill="#eef8f2"/><polyline points="${points}" fill="none" stroke="#16865a" stroke-width="1.8" vector-effect="non-scaling-stroke"/>
    ${threshold ? `<line x1="0" y1="${y(threshold)}" x2="690" y2="${y(threshold)}" stroke="#c67865" stroke-dasharray="5 5" vector-effect="non-scaling-stroke"/>` : ""}</svg>
    ${threshold ? `<span class="chart-threshold" style="bottom:${threshold / maximum * 100}%">임계 ${threshold}${unit}</span>` : ""}</div>
    <div class="chart-times"><time>${time(history[0].at)}</time><time>${time(history.at(-1).at)}</time></div></div>`;
}
function aggregateHistory() {
  return state.stations[0].history.map((t, e) => ({
    at: t.at,
    power: state.stations.reduce((a, s) => {
      var i;
      return a + (((i = s.history[e]) == null ? void 0 : i.power) || 0);
    }, 0),
  }));
}
function eventList(t = 5) {
  return (
    state.events
      .slice(0, t)
      .map(
        (e) =>
          `<button class="event-row" data-station="${e.station}"><span class="event-dot ${e.tone}"></span><span><strong title="${esc(e.text)}">${esc(e.text)}</strong><small>${e.station} · ${dateTime(e.at)}</small></span>${icon("arrow")}</button>`,
      )
      .join("") || empty("운영 이벤트가 없습니다.")
  );
}
function incidentPreview(i) {
  const station = state.stations.find(s => s.id === i.station);
  const resolved = Boolean(i.resolved);
  return `<button class="incident-preview ${resolved ? 'is-resolved' : ''}" data-incident="${i.id}" aria-haspopup="dialog"><div><span class="severity ${resolved ? 'green' : i.severity === 'critical' ? 'red' : 'amber'}">${resolved ? '복구 완료' : i.severity === 'critical' ? '긴급' : '주의'}</span><small>${ago(i.resolved || i.created)}</small></div><strong>${esc(i.title)}</strong><p>${esc(i.station)} · ${esc(station.location)}</p>${recoverySummary(i)}<div class="incident-bottom"><span>근거 및 처리 이력</span>${icon('arrow')}</div></button>`;
}
function dashboardIncidentPreviews() {
  const active = openIncidents();
  const latest = state.incidents.filter(i => i.resolved).sort((a, b) => b.resolved - a.resolved)[0];
  return (active.length ? active : latest ? [latest] : []).map(incidentPreview).join('') || empty('진행 중인 장애가 없습니다.');
}
function dashboard() {
  const t = openIncidents();
  return (
    header(
      `<button class="button" data-action="report">${icon("chart")} 운영 리포트</button><button class="button primary" data-action="monitor">${icon("expand")} 관제 모드</button>`,
    ) +
    `<div id="dashboard-stats">${stats()}</div><div class="dashboard-grid"><section class="panel map-panel"><div class="panel-heading"><div><h2>충전기 현황 <span class="count">6</span></h2></div><div class="segmented"><button data-view="map" class="${view === "map" ? "selected" : ""}">데모 배치도</button><button data-view="cards" class="${view === "cards" ? "selected" : ""}">카드</button></div></div><div class="map-toolbar"><div class="tabs">${[
      ["all", "전체 구역"],
      ["A", "A 구역"],
      ["B", "B 구역"],
      ["C", "C 구역"],
    ]
      .map(
        ([e, a]) =>
          `<button data-zone="${e}" class="${zone === e ? "active" : ""}">${a}</button>`,
      )
      .join(
        "",
      )}</div><div class="legend"><span><i class="green"></i>충전</span><span><i class="neutral"></i>대기</span><span><i class="red"></i>장애</span></div></div><div id="station-map">${
      view === "map"
        ? siteMap()
        : `<div class="station-grid">${state.stations
            .filter((e) => zone === "all" || e.zone === zone)
            .map((e) => stationCard(e))
            .join("")}</div>`
    }</div></section><aside class="operations-rail"><section class="panel incidents-panel"><div class="panel-heading"><div><h2>장애 · 자동 복구</h2></div><span class="count red">${t.length}</span></div><div id="incident-previews">${dashboardIncidentPreviews()}</div><button class="text-button full" data-action="incidents">전체 장애 분석 ${icon("arrow")}</button></section><section class="panel rail-events"><div class="panel-heading"><h2>최근 활동</h2><button class="text-button" data-action="logs">${icon("arrow")}<span class="sr-only">전체 운영 이벤트</span></button></div><div id="event-list">${eventList(3)}</div></section></aside></div><section class="panel dashboard-trend"><div class="panel-heading"><div><h2>충전 전력 추이</h2><p>최근 2분 · kW</p></div><span class="live-label"><i></i>2초 갱신</span></div><div id="power-chart">${chart(aggregateHistory())}</div></section>`
  );
}
function table(t, e) {
  return `<div class="table-wrap"><table><thead><tr>${t.map((a) => `<th>${a}</th>`).join("")}</tr></thead><tbody>${e || `<tr><td colspan="${t.length}" class="empty-cell">조건에 맞는 데이터가 없습니다.</td></tr>`}</tbody></table></div>`;
}
function stationRows() {
  return filteredStations()
    .map(
      (t) =>
        `<tr><td><button class="table-link" data-station="${t.id}">${t.id}</button><small>${t.protocol}</small></td><td>${t.location}</td><td>${badge(t.status)}</td><td>${t.robot || "—"}</td><td>${t.robot ? `${Math.floor(t.soc)}%` : "—"}</td><td>${t.status === "offline" ? "—" : num(t.power, 2)} kW</td><td class="${t.temperature >= state.settings.temperature ? "red-text" : ""}">${t.status === "offline" ? "—" : num(t.temperature)} °C</td><td>${ago(t.lastSeen)}</td><td><button class="button small-button" data-station="${t.id}">상세 / 제어</button></td></tr>`,
    )
    .join("") || `<tr><td colspan="9" class="empty-cell">조건에 맞는 장비가 없습니다.</td></tr>`;
}
function stationsPage() {
  return (
    header() +
    `<div class="panel"><div class="filter-bar"><label class="search">${icon("search")}<input id="station-search" placeholder="충전기·AMR·구역 검색" value="${esc(query)}" aria-label="충전기 검색"></label><label>상태 <select id="station-filter">${options([["all", "전체 상태"], ...Object.entries(STATUS).map(([t, e]) => [t, e.label])], stationFilter)}</select></label><label>구역 <select id="zone-filter">${options(
      [
        ["all", "전체 구역"],
        ["A", "A 구역"],
        ["B", "B 구역"],
        ["C", "C 구역"],
      ],
      zone,
    )}</select></label></div>${table(["충전기", "구역", "상태", "도킹 AMR", "배터리", "충전 전력", "코일 온도", "마지막 수신", "관리"], stationRows())}</div>`
  );
}
function incidentRows() {
  return state.incidents
    .filter(
      (t) =>
        incidentFilter === "all" ||
        (incidentFilter === "open" ? !t.resolved : !!t.resolved),
    )
    .map(
      (t) =>
        `<tr><td><span class="severity ${t.severity === "critical" ? "red" : "amber"}">${t.severity === "critical" ? "긴급" : "주의"}</span></td><td><button class="table-link" data-incident="${t.id}">${esc(t.title)}</button><small>${t.id} · ${t.station}</small></td><td>${state.stations.find((e) => e.id === t.station).zone}구역</td><td>${dateTime(t.created)}</td><td><span class="badge ${t.resolved ? "green" : t.acknowledged ? "amber" : "red"}">${recoveryLabel(t)}</span></td><td>${!t.resolved && !t.acknowledged ? `<button class="button small-button" data-ack="${t.id}">장애 확인</button>` : t.resolved ? dateTime(t.resolved) : "확인됨"}</td><td><button class="text-button" data-incident="${t.id}">분석 및 이력 ${icon("arrow")}</button></td></tr>`,
    )
    .join("");
}
function incidentMetrics() {
  return `<div class="metrics three">${metric("자동 처리 중", recovery.jobs.filter(autoActive).length, "건", "보호·조치·정상 확인", "", "settings")}${metric("현장 조치 필요", recovery.jobs.filter(j => j.phase === "handoff").length, "건", "자동 처리 한도·현장 점검", "attention", "alert")}${metric("복구 완료", state.incidents.filter(i => i.resolved).length, "건", "자동·담당자 처리 합계", "", "check")}</div>`;
}
function incidentTable() {
  return table(["심각도", "장애 / 충전기", "위치", "발생 시각", "처리 상태", "확인 / 복구", "상세"], incidentRows());
}
function incidentsPage() {
  return header() + `<div id="incident-metrics">${incidentMetrics()}</div>${recoveryBoard(recovery)}<section class="panel"><div class="filter-bar"><h2>장애 발생 및 처리 이력</h2><select id="incident-filter" aria-label="장애 처리 상태">${options([["open", "진행 중"], ["resolved", "복구 완료"], ["all", "전체 이력"]], incidentFilter)}</select></div><div id="incident-records">${incidentTable()}</div></section>`;
}
function sessionRows(t) {
  return t
    .map(
      (e) =>
        `<tr><td>${e.id}</td><td><button class="table-link" data-station="${e.station}">${e.station}</button></td><td>${e.robot || "—"}</td><td>${dateTime(e.start)}</td><td>${dateTime(e.end)}</td><td>${num((e.end - e.start) / 6e4)}분</td><td>${num(e.energy, 3)} kWh</td><td><span class="badge ${e.reason === "장애 중지" || e.reason === "통신 중단" ? "red" : "neutral"}">${e.reason}</span></td></tr>`,
    )
    .join("");
}
function periodControl() {
  return `<select id="report-period" aria-label="조회 기간">${options(
    [
      ["1", "오늘"],
      ["7", "최근 7일"],
      ["30", "최근 30일"],
    ],
    String(reportDays),
  )}</select>`;
}
function transactionsPage() {
  const t = report(state, reportDays);
  return (
    header(
      `${periodControl()}<button class="button" data-action="export-sessions">${icon("download")} CSV 내보내기</button>`,
    ) +
    `<div class="notice">완료·중단된 세션 ${t.sessions.length}건 · 진행 중인 충전은 충전기 상세에서 확인할 수 있습니다.</div><section class="panel">${table(["세션", "충전기", "AMR", "시작", "종료", "충전 시간", "공급 전력량", "종료 사유"], sessionRows(t.sessions))}</section>`
  );
}
function reportsPage() {
  const t = report(state, reportDays),
    e = t.sessions.length ? num((t.completed / t.sessions.length) * 100) : "—",
    a = state.stations.map((o) => ({
      ...o,
      energy: t.sessions
        .filter((l) => l.station === o.id)
        .reduce((l, h) => l + h.energy, 0),
      count: t.sessions.filter((l) => l.station === o.id).length,
    })),
    s = Math.max(...a.map((o) => o.energy), 1),
    i = t.incidents.filter((o) => o.resolved),
    n = i.length
      ? `${num(i.reduce((o, l) => o + (l.resolved - l.created) / 6e4, 0) / i.length)}분`
      : "집계 없음";
  return (
    header(
      `${periodControl()}<button class="button" data-action="export-report">${icon("download")} 요약 CSV</button><button class="button primary" data-action="print">리포트 인쇄 / PDF</button>`,
    ) +
    `<div class="report-banner"><div><h2>${reportDays === 1 ? "오늘의" : `최근 ${reportDays}일`} 무선충전 운영 리포트</h2><p>${date(t.from)} – ${date(t.to)} · ${esc(state.settings.site)} · 데모 데이터</p></div></div><div class="metrics">${metric("공급 전력량", num(t.energy, 2), "kWh", "기간 내 종료된 세션 합계", "featured")}${metric("완료·중단 세션", t.sessions.length, "건", `목표 충전 완료 ${t.completed}건`, "", "history")}${metric("평균 충전 시간", num(t.minutes), "분", "종료된 세션의 평균", "", "chart")}${metric("목표 충전 완료율", e, "%", "목표 충전 완료 / 전체 종료 세션", "", "check")}</div><div class="dashboard-bottom"><section class="panel"><div class="panel-heading"><div><h2>충전기별 공급 전력량</h2><p>kWh · 선택 기간 누적</p></div></div><div class="bar-chart">${a.map((o) => `<div class="bar-row"><button class="table-link" data-station="${o.id}">${o.id}</button><div class="bar-track"><i style="width:${(o.energy / s) * 100}%"></i></div><b>${num(o.energy, 2)}</b></div>`).join("")}</div></section><section class="panel"><div class="panel-heading"><div><h2>장애 및 운영 요약</h2></div></div><div class="report-summary"><div><span>발생 장애</span><strong>${t.incidents.length}건</strong></div><div><span>복구 완료</span><strong>${i.length}건</strong></div><div><span>평균 복구 소요</span><strong>${n}</strong></div><div><span>가장 많은 전력 공급</span><strong>${t.sessions.length ? [...a].sort((o, l) => l.energy - o.energy)[0].id : "집계 없음"}</strong></div></div><details class="inline-help"><summary>집계 기준</summary><p>공급량은 기간 내 종료된 세션의 합계입니다. 진행 중 세션과 탄소 절감량은 포함하지 않습니다.</p></details></section></div><section class="panel report-detail"><div class="panel-heading"><h2>장비별 운영 집계</h2><span class="muted">생성 ${dateTime(Date.now())}</span></div>${table(["충전기", "구역", "종료 세션", "공급 전력량", "발생 장애"], a.map((o) => `<tr><td>${o.id}</td><td>${o.location}</td><td>${o.count}건</td><td>${num(o.energy, 3)} kWh</td><td>${t.incidents.filter((l) => l.station === o.id).length}건</td></tr>`).join(""))}</section>`
  );
}
function packetsContent() {
  return (
    (paused ? pausedPackets : state.packets)
      .filter(
        (e) =>
          (logFilter === "all" || e.station === logFilter) &&
          `${e.action} ${JSON.stringify(e.frame)}`
            .toLowerCase()
            .includes(logQuery.toLowerCase()),
      )
      .map(
        (e) =>
          `<details class="packet"><summary><time>${time(e.at)}</time><span>${e.station}</span><span class="badge neutral">가상 수신</span><strong>${e.action}</strong><span class="muted">JSON 보기</span></summary><pre>${esc(JSON.stringify(e.frame, null, 2))}</pre></details>`,
      )
      .join("") || empty("조건에 맞는 메시지가 없습니다.")
  );
}
function packetsPage() {
  return header() + `<section class="panel audit-panel"><div class="panel-heading"><h2>운영 이벤트</h2><span class="muted">현재 전시 시연 · 최근 150건</span></div><div>${eventList(150)}</div></section><section class="panel audit-panel"><div class="panel-heading"><h2>조작 이력</h2><span class="muted">가상 장비 조작 기록</span></div>${auditTable()}</section>`;
}
function auditTable() {
  return table(
    ["시각", "대상", "명령", "조치 내용", "결과"],
    state.audit
      .map(
        (t) =>
          `<tr><td>${dateTime(t.at)}</td><td>${t.station}</td><td>${t.text}</td><td>${esc(t.reason || "—")}</td><td>데모 처리 완료</td></tr>`,
      )
      .join(""),
  );
}
function simulatorPage() {
  return header() + renderSimulation(lab);
}
function renderPage() {
  const t = {
    dashboard: dashboard,
    stations: stationsPage,
    incidents: incidentsPage,
    reports: reportsPage,
    transactions: transactionsPage,
    packets: packetsPage,
    simulator: simulatorPage,
  };
  ((document.querySelector("#main").innerHTML = t[page]()),
    (document.querySelector("#breadcrumb").textContent = pages.find(
      (e) => e[0] === page,
    )[2]),
    document.querySelectorAll("[data-nav]").forEach((e) => {
      const a = e.dataset.nav === page;
      (e.classList.toggle("active", a),
        a
          ? e.setAttribute("aria-current", "page")
          : e.removeAttribute("aria-current"));
    }),
    (document.querySelector(".nav-count").textContent = openIncidents().length),
    bindMetric(),
    page === "simulator" && updateSimulation(lab));
  document.querySelector(".demo-pill").textContent = "전시 시뮬레이션 · 실제 장비 미연결";
}
function bindMetric() {
  if (page !== "dashboard") return;
  const t = document.querySelector(".attention");
  t &&
    ((t.dataset.action = "incidents"),
    t.setAttribute("role", "button"),
    (t.tabIndex = 0));
}
function navigate(t) {
  location.hash !== `#${t}` ? (location.hash = t) : ((page = t), renderPage());
}
let selectedIncidentId = null;
function diagnosis(t, e) {
  const a = {
    temperature: {
      fact: `감지 시 코일 온도 ${num(t.measured)}°C · 기준 ${t.threshold}°C 초과`,
      guess: "송수신 패드 정렬 불량, 냉각 저하 또는 주변 온도 상승 가능성",
      checks: [
        "패드 주변 이물질과 통풍 공간을 확인합니다.",
        "송수신 패드의 정렬 상태를 점검합니다.",
        "온도 하강과 현장 안전 상태를 확인한 후 복구합니다.",
      ],
    },
    offline: {
      fact: `데모 통신 끊김 감지 · 발생 ${dateTime(t.created)}`,
      guess: "장비 전원 또는 네트워크 경로 장애 가능성",
      checks: [
        "충전기 전원과 현장 표시등을 확인합니다.",
        "네트워크 연결 및 CSMS 주소를 점검합니다.",
        "통신 복구 후 최신 상태를 다시 확인합니다.",
      ],
    },
    pd: {
      fact: "가상 PD 위치 오차 검출 · 출력 차단",
      guess: "도킹 위치 이탈 또는 위치 검출 이상 가능성",
      checks: ["출력 차단과 로봇 정지 상태를 확인합니다.", "PD 재정렬 응답과 위치 오차 추이를 확인합니다.", "반복 실패 시 패드 설치와 구동부를 점검합니다."],
    },
    efficiency: {
      fact: "가상 저효율 장애 · 정렬 원인 점검",
      guess: "패드 정렬·간격·냉각·계측 상태에 따른 손실 증가 가능성",
      checks: ["입출력 계측 경계와 동기화를 확인합니다.", "정렬 정상화와 효율 회복을 별도로 확인합니다.", "출력이 없는 상태에서는 효율 정상 판정을 하지 않습니다."],
    },
    fod: {
      fact: "데모 이물질 감지 신호로 충전 차단",
      guess: "패드 위 금속성 물체 또는 감지 센서 이상 가능성",
      checks: [
        "현장 절차에 따라 장비의 안전 상태를 확보합니다.",
        "패드 표면과 센서 상태를 점검합니다.",
        "이물질 제거 및 감지 해제 확인 후 복구합니다.",
      ],
    },
  }[t.type];
  return `<section class="diagnosis"><div class="section-label">장애 분석 · ${t.id}<span class="severity ${t.resolved ? "green" : "red"}">${t.resolved ? "복구 완료" : "조치 필요"}</span></div><h3>${t.title}</h3>${t.automation ? `<div data-auto-detail="${t.id}">${recoveryCard(t.automation, true)}</div>` : ""}<p class="evidence">${a.fact}</p><div class="diagnosis-block"><small>추정 원인 · 현장 확인 필요</small><p>${a.guess}</p></div><ol class="check-list">${a.checks.map((s) => `<li>${s}</li>`).join("")}</ol>${!t.resolved && !t.acknowledged ? `<button class="button" data-ack="${t.id}">${icon("check")} 장애 확인 · 조치 시작</button>` : ""}<div class="section-label history-label">장애 처리 이력</div><ol class="timeline">${t.notes.map((s) => `<li><span class="timeline-dot"></span><strong>${esc(s.text)}</strong><small>${dateTime(s.at)}</small></li>`).join("")}</ol></section>`;
}
function drawerContent(id) {
  const s = state.stations.find((i) => i.id === id),
    incident =
      state.incidents.find((i) => i.id === selectedIncidentId) ||
      state.incidents.find((i) => i.station === id && !i.resolved) ||
      state.incidents.find((i) => i.station === id),
    disabled = lab.active && lab.station === id,
    autoBusy = autoActive(incident?.automation);
  return `<div class="drawer-header"><div><div class="eyebrow">선택한 충전기 · ${s.location}</div><h2>충전기 ${s.id}</h2></div><button class="icon-button" data-action="close" aria-label="상세 패널 닫기">${icon("close")}</button></div><div class="drawer-meta">${badge(s.status)}<span>${s.protocol} · WPO-TX-1.5k</span></div><div class="drawer-body"><div class="live-readings" id="drawer-readings">${drawerReadings(s)}</div><section class="drawer-section"><div class="section-label">코일 온도 추이 <span>최근 2분 · °C</span></div><div id="drawer-chart">${chart(
    s.history,
    {
      key: "temperature",
      unit: "°C",
      threshold: state.settings.temperature,
      label: "코일 온도 추이",
    },
  )}</div></section>${incident ? diagnosis(incident) : `<div class="healthy-note">${icon("check")}진행 중인 장애가 없습니다.</div>`}<section class="drawer-section"><div class="section-label">연결 및 충전 정보</div><dl class="detail-list" id="drawer-details">${drawerDetails(s)}</dl></section></div><div class="drawer-actions"><span class="demo-caption">가상 장비 제어 · 실제 장비에 전송하지 않습니다</span><div>${s.status === "charging" ? `<button class="button danger" data-command="stop" data-id="${id}" ${disabled ? "disabled" : ""}>충전 중지</button>` : ["available", "paused"].includes(s.status) ? `<button class="button primary" data-command="start" data-id="${id}" ${disabled ? "disabled" : ""}>충전 시작</button>` : `<button class="button primary" data-command="recover" data-id="${id}" ${autoBusy ? 'disabled title="자동 처리를 먼저 직접 인수하세요"' : ""}>점검 완료·복구</button>`}<button class="button" data-device-logs="${id}">운영 이력 ${icon("arrow")}</button></div>${disabled ? "<small>시험 진행 중에는 수동 제어가 제한됩니다.</small>" : ""}</div>`;
}
function drawerDetails(s) {
  return `<div><dt>도킹 AMR</dt><dd>${s.robot || "없음"}</dd></div><div><dt>배터리 잔량</dt><dd>${s.robot ? `${Math.floor(s.soc)}%` : "—"}</dd></div><div><dt>세션 시작</dt><dd>${s.sessionStart ? dateTime(s.sessionStart) : "—"}</dd></div><div><dt>현재 세션 공급량</dt><dd>${num(s.sessionEnergy, 3)} kWh</dd></div><div><dt>마지막 수신</dt><dd>${dateTime(s.lastSeen)}</dd></div>`;
}
function drawerReadings(s) {
  return `<div><small>충전 전력</small><strong>${s.status === "offline" ? "—" : num(s.power, 2)}<em> kW</em></strong></div><div><small>코일 온도</small><strong class="${s.temperature >= state.settings.temperature ? "red-text" : ""}">${s.status === "offline" ? "—" : num(s.temperature)}<em> °C</em></strong></div><div><small>전송 효율</small><strong>${s.efficiency ? num(s.efficiency) : "—"}<em> %</em></strong></div>`;
}
function syncStationSelection() {
  document.querySelectorAll('.station-card').forEach(card => {
    const selected = card.dataset.station === drawerId;
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-expanded', String(selected));
  });
}
function openDrawer(t, e = selectedIncidentId) {
  var a;
  state.stations.some((s) => s.id === t) &&
    (drawerId || (previousFocus = document.activeElement),
    (selectedIncidentId = e),
    (drawerId = t),
    (dialogOpen = !1),
    (overlay.innerHTML = `<div class="scrim" data-action="close"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="${t} 상세 분석">${drawerContent(t)}</aside>`),
    document.body.classList.add("overlay-open"),
    (app.inert = !0),
    (a = overlay.querySelector("button")) == null || a.focus());
  syncStationSelection();
}
function closeOverlay() {
  const t = !!drawerId;
  const returnStation = previousFocus?.dataset.station;
  const returnIncident = previousFocus?.dataset.incident;
  ((drawerId = null),
    (selectedIncidentId = null),
    (dialogOpen = !1),
    (overlay.innerHTML = ""),
    document.body.classList.remove("overlay-open"),
    (app.inert = !1),
    t &&
      (previousFocus != null && previousFocus.isConnected
        ? previousFocus.focus()
        : (returnIncident && document.querySelector(`[data-incident="${CSS.escape(returnIncident)}"]`)
          || returnStation && document.querySelector(`[data-station="${CSS.escape(returnStation)}"]`)
          || document.querySelector('#main')).focus()));
  syncStationSelection();
}
function openCommand(t, e) {
  const a = {
    start: "충전 시작",
    stop: "충전 중지",
    recover: "점검 완료·복구",
  };
  ((dialogOpen = !0),
    (overlay.innerHTML = `<div class="scrim" data-action="cancel-command"></div><section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><div class="dialog-top"><span class="demo-pill">데모 명령</span><button class="icon-button" data-action="cancel-command" aria-label="취소">${icon("close")}</button></div><h2 id="confirm-title">${a[e]}</h2><p><strong>${t}</strong>에 ${a[e]} 동작을 적용합니다.</p><p class="muted">${e === "recover" ? "데모에서는 점검 완료를 가정해 온도와 통신 상태를 정상화하고 장애를 종료합니다. 충전은 자동 재개하지 않습니다." : "가상 장비의 상태만 변경됩니다. 실제 장비 명령은 전송되지 않습니다."}</p><form id="command-form" data-id="${t}" data-command="${e}"><label>조치 내용 ${e === "recover" ? "(필수)" : "(선택)"}<textarea name="reason" rows="3" maxlength="500" placeholder="점검 또는 명령 사유를 기록하세요" ${e === "recover" ? "required" : ""}></textarea></label><div class="dialog-actions"><button type="button" class="button" data-action="cancel-command">취소</button><button type="submit" class="button ${e === "stop" ? "danger" : "primary"}">데모 ${a[e]} 실행</button></div></form></section>`),
    overlay.querySelector("textarea").focus());
}
function download(t, e, a = "text/csv;charset=utf-8") {
  const s = URL.createObjectURL(
      new Blob([e], {
        type: a,
      }),
    ),
    i = document.createElement("a");
  ((i.href = s),
    (i.download = t),
    i.click(),
    setTimeout(() => URL.revokeObjectURL(s), 1e3),
    toast("파일을 다운로드했습니다."));
}
function renderConnection() {
  const status = document.querySelector('#server-status');
  if (status) { status.textContent = '독립 시연'; status.className = 'connection'; }
}
function refreshLive() {
  const t = (a, s) => {
    const i = document.getElementById(a);
    i && (i.innerHTML = s);
  };
  if (
    (page === "dashboard" &&
      (document.activeElement.closest(".metric") ||
        t("dashboard-stats", stats()),
      bindMetric(),
      document.querySelectorAll(".station-card").forEach((a) => {
        const s = state.stations.find((i) => i.id === a.dataset.station);
        ((a.querySelector(".station-readings").innerHTML = cardReadings(s)),
          (a.querySelector(".soc-track i").style.width = `${s.soc}%`),
          (a.querySelector(".soc-line b").textContent = s.robot
            ? `${Math.floor(s.soc)}%`
            : "—"));
      }),
      t("power-chart", chart(aggregateHistory()))),
    page === "stations" && !document.activeElement.closest("tbody"))
  ) {
    const a = document.querySelector("tbody");
    a && (a.innerHTML = stationRows());
  }
  if (
    (page === "packets" &&
      !paused &&
      !document.querySelector(".packet[open]") &&
      !document.activeElement.closest(".packet") &&
      t("packet-list", packetsContent()),
    drawerId && !dialogOpen)
  ) {
    const a = state.stations.find((s) => s.id === drawerId);
    (t("drawer-readings", drawerReadings(a)),
      t("drawer-details", drawerDetails(a)),
      t(
        "drawer-chart",
        chart(a.history, {
          key: "temperature",
          unit: "°C",
          threshold: state.settings.temperature,
          label: "코일 온도 추이",
        }),
      ));
  }
  const e = document.querySelector("#clock");
  e && (e.textContent = `· ${time(Date.now())}`);
}
function startScenario(t, e) {
  try {
    (lab.start(t, e), (simulationClock = performance.now()), renderPage());
  } catch (a) {
    toast(a.message);
  }
}
function simulationChanged() {
  ((document.querySelector(".nav-count").textContent = openIncidents().length),
    page === "simulator" ? updateSimulation(lab) : !["settings", "humanoid", "autonomy"].includes(page) && renderPage(),
    drawerId && !dialogOpen && openDrawer(drawerId));
}
function labAction(t, e) {
  try {
    if ((e || t === "full") && !lab.active) {
      startScenario(lab.station, e || "cycle");
      return;
    }
    if (e) lab.inject(e);
    else if (t === "pause") lab.togglePause();
    else if (t === "cancel") lab.cancel();
    else if (t === "full") lab.fullCharge();
    else if (t === "recover") {
      (openDrawer(lab.station, null), openCommand(lab.station, "recover"));
      return;
    }
    simulationChanged();
  } catch (a) {
    toast(a.message);
  }
}
document.addEventListener("click", (t) => {
  const e = t.target.closest("button, [data-action]");
  if (e) {
    if (e.hasAttribute("data-auto-launch")) {
      try { recovery.launch(document.getElementById("auto-station").value, document.getElementById("auto-case").value); updateRecoveryBoard(recovery); }
      catch (error) { toast(error.message); }
      return;
    }
    if (e.dataset.autoTakeover) {
      recovery.takeover(e.dataset.autoTakeover); updateRecoveryBoard(recovery);
      if (drawerId && !dialogOpen) openDrawer(drawerId);
      return;
    }
    if (e.dataset.lab || e.dataset.labFault)
      return labAction(e.dataset.lab, e.dataset.labFault);
    if (e.dataset.station) return openDrawer(e.dataset.station, null);
    if (e.dataset.incident) {
      const a = state.incidents.find((s) => s.id === e.dataset.incident);
      return openDrawer(a.station, a.id);
    }
    if (e.dataset.command) return openCommand(e.dataset.id, e.dataset.command);
    if (e.dataset.ack) {
      (acknowledge(state, e.dataset.ack),
        renderPage(),
        drawerId && openDrawer(drawerId),
        toast("장애를 확인했습니다. 조치 이력에 기록했습니다."));
      return;
    }
    if (e.dataset.zone) {
      ((zone = e.dataset.zone), renderPage());
      return;
    }
    if (e.dataset.view) {
      ((view = e.dataset.view), renderPage());
      return;
    }
    if (e.dataset.deviceLogs) {
      ((logFilter = e.dataset.deviceLogs), closeOverlay(), navigate("packets"));
      return;
    }
    switch (e.dataset.action) {
      case "close":
        closeOverlay();
        break;
      case "cancel-command":
        drawerId ? openDrawer(drawerId) : closeOverlay();
        break;
      case "report":
        navigate("reports");
        break;
      case "incidents":
        navigate("incidents");
        break;
      case "logs":
        navigate("packets");
        break;
      case "monitor":
        ((monitor = !monitor),
          document.body.classList.toggle("monitor-mode", monitor),
          toast(
            monitor
              ? "관제 모드 · 오른쪽 상단 버튼 또는 Esc로 종료"
              : "일반 화면으로 전환했습니다.",
          ));
        break;
      case "restart-demo":
        if (window.confirm("현재 시연 기록을 지우고 처음부터 시작할까요?")) {
          const url = new URL(location.href);
          url.hash = 'dashboard';
          if (monitor) url.searchParams.set('monitor', '1'); else url.searchParams.delete('monitor');
          url.searchParams.set("run", Date.now().toString());
          location.replace(url.href);
        }
        break;
      case "print":
        window.print();
        break;
      case "pause-log":
        ((paused = !paused),
          paused && (pausedPackets = [...state.packets]),
          renderPage());
        break;
      case "export-sessions": {
        const a = report(state, reportDays);
        download(
          "WIP_충전이력_DEMO.csv",
          csv([
            [
              "세션",
              "충전기",
              "AMR",
              "시작",
              "종료",
              "kWh",
              "종료 사유",
              "데이터",
            ],
            ...a.sessions.map((s) => [
              s.id,
              s.station,
              s.robot,
              new Date(s.start).toISOString(),
              new Date(s.end).toISOString(),
              s.energy.toFixed(3),
              s.reason,
              "DEMO",
            ]),
          ]),
        );
        break;
      }
      case "export-report": {
        const a = report(state, reportDays);
        download(
          "WIP_운영리포트_DEMO.csv",
          csv([
            ["항목", "값"],
            ["데이터", "DEMO"],
            ["시작", new Date(a.from).toISOString()],
            ["종료", new Date(a.to).toISOString()],
            ["공급량(kWh)", a.energy.toFixed(3)],
            ["종료 세션(건)", a.sessions.length],
            ["목표 충전 완료(건)", a.completed],
            ["평균 시간(분)", a.minutes.toFixed(1)],
            ["발생 장애(건)", a.incidents.length],
            ["복구 완료(건)", a.incidents.filter((s) => s.resolved).length],
          ]),
        );
        break;
      }
      case "export-logs":
        download(
          "WIP_통신로그_DEMO.json",
          JSON.stringify(
            {
              mode: "demo",
              synthetic: !0,
              generatedAt: new Date().toISOString(),
              packets: (paused ? pausedPackets : state.packets).filter(
                (a) =>
                  (logFilter === "all" || a.station === logFilter) &&
                  `${a.action} ${JSON.stringify(a.frame)}`
                    .toLowerCase()
                    .includes(logQuery.toLowerCase()),
              ),
              audit: state.audit,
            },
            null,
            2,
          ),
          "application/json",
        );
        break;
    }
  }
});
document.addEventListener("input", (t) => {
  (t.target.id === "station-search" &&
    ((query = t.target.value),
    (document.querySelector("tbody").innerHTML = stationRows())),
    t.target.id === "log-search" &&
      ((logQuery = t.target.value),
      (document.querySelector("#packet-list").innerHTML = packetsContent())));
});
document.addEventListener("change", (t) => {
  if (t.target.id === "auto-recharge-demo") { recovery.demoAutoRecharge=t.target.checked; return; }
  const { id: e, value: a } = t.target;
  if (["lab-target", "lab-type", "lab-speed"].includes(e)) {
    try {
      (e === "lab-speed"
        ? lab.setSpeed(a)
        : lab.preview(
            document.getElementById("lab-target").value,
            document.getElementById("lab-type").value,
          ),
        updateSimulation(lab));
    } catch (s) {
      toast(s.message);
    }
    return;
  }
  if (e === "station-filter") stationFilter = a;
  else if (e === "zone-filter") zone = a;
  else if (e === "incident-filter") incidentFilter = a;
  else if (e === "report-period") reportDays = Number(a);
  else if (e === "log-filter") logFilter = a;
  else return;
  renderPage();
});
document.addEventListener("submit", (t) => {
  t.preventDefault();
  const e = t.target,
    a = new FormData(e);
  if (e.id === "command-form")
    try {
      const s =
        lab.active &&
        lab.station === e.dataset.id &&
        lab.phase === "fault" &&
        e.dataset.command === "recover";
      if (lab.active && lab.station === e.dataset.id && !s)
        throw new Error("시험 진행 중에는 수동 제어가 제한됩니다.");
      (command(state, e.dataset.id, e.dataset.command, a.get("reason")),
        s
          ? (lab.afterRecovery(), closeOverlay(), navigate("simulator"))
          : (e.dataset.command === "recover" &&
              lab.station === e.dataset.id &&
              (lab.incidentType = null),
            renderPage(),
            openDrawer(e.dataset.id)),
        toast("데모 명령 처리 완료 · 조작 이력에 기록했습니다."));
    } catch (s) {
      toast(s.message);
    }
  else if (e.id === "scenario-form") startScenario(a.get("station"), a.get("type"));
});
document.addEventListener("keydown", (t) => {
  var e, a;
  if (
    (t.key === "Escape" &&
      (dialogOpen
        ? openDrawer(drawerId)
        : drawerId
          ? closeOverlay()
          : monitor &&
            ((monitor = !1), document.body.classList.remove("monitor-mode"))),
    (t.key === "Enter" || t.key === " ") &&
      t.target.matches('[role="button"][data-action]') &&
      (t.preventDefault(), t.target.click()),
    t.key === "Tab" && overlay.children.length)
  ) {
    const s = [
      ...overlay.querySelectorAll(
        'button:not(:disabled), input, select, textarea, [tabindex="0"]',
      ),
    ];
    t.shiftKey && document.activeElement === s[0]
      ? (t.preventDefault(), (e = s.at(-1)) == null || e.focus())
      : !t.shiftKey &&
        document.activeElement === s.at(-1) &&
        (t.preventDefault(), (a = s[0]) == null || a.focus());
  }
});
window.addEventListener("hashchange", () => {
  const t = location.hash.slice(1).split("?")[0];
  ((page = pages.some((e) => e[0] === t) ? t : "dashboard"),
    closeOverlay(),
    renderPage(),
    window.scrollTo(0, 0));
});
recovery.tick();
renderShell();
document.body.classList.toggle("monitor-mode", monitor);
setInterval(() => {
  const t = state.stations.map((e) => e.status).join();
  (tick(state),
    t !== state.stations.map((e) => e.status).join() &&
      (!["settings", "humanoid", "autonomy"].includes(page) && renderPage(), drawerId && !dialogOpen && openDrawer(drawerId)),
    refreshLive());
}, 2e3);
setInterval(() => {
  const t = performance.now(),
    e = document.hidden ? 0 : Math.min(250, t - simulationClock);
  if (((simulationClock = t), !!lab.active))
    try {
      lab.advance(e)
        ? simulationChanged()
        : page === "simulator" && updateSimulation(lab);
    } catch (a) {
      (lab.cancel(),
        (lab.message = a.message),
        toast(a.message),
        simulationChanged());
    }
}, 100);

let recoveryRevision = "";
setInterval(() => {
  if (document.hidden) return;
  recovery.tick();
  if (lab.phase === "fault" && ["available", "charging"].includes(lab.device.status) && !state.incidents.some(i=>i.station===lab.station&&!i.resolved)) {
    lab.afterRecovery();
    if (page === "simulator") updateSimulation(lab);
  }
  const revision = recovery.jobs.map(j => `${j.id}:${j.phase}:${j.logs.length}`).join("|");
  if (revision !== recoveryRevision) {
    recoveryRevision = revision;
    document.querySelector(".nav-count").textContent = openIncidents().length;
    if (page === "incidents") {
      document.querySelector("#incident-metrics").innerHTML = incidentMetrics();
      const records = document.querySelector("#incident-records");
      if (!records.contains(document.activeElement)) records.innerHTML = incidentTable();
    } else if (["dashboard", "stations", "reports", "packets"].includes(page)) renderPage();
    if (drawerId && !dialogOpen) openDrawer(drawerId);
    if (page === "simulator") updateSimulation(lab);
  }
  updateRecoveryBoard(recovery);
}, 500);
