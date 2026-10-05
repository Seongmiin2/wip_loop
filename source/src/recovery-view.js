import { RECOVERY_STEPS, RECOVERY_CASES } from './autonomous-recovery.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when=at=>{const d=new Date(at);return [d.getHours(),d.getMinutes(),d.getSeconds()].map(n=>String(n).padStart(2,'0')).join(':');};
export const autoActive=job=>job&&!['resolved','handoff','manual'].includes(job.phase);
export function recoveryLabel(incident) {
  if(incident.resolved)return incident.automation?.recharged?'자동 재충전 완료':incident.resolution==='automatic'?'자동 복구 완료':'복구 완료';
  const job=incident.automation;
  if(!job)return incident.acknowledged?'조치 중':'자동 처리 대기';
  return {detected:'자동 접수',protect:'출력 차단 확인',diagnose:'원인 분류 중',action:'자동 조치 중',verify:'정상 확인 중',retry:'자동 재시도 대기',precheck:'재개 조건 확인',restart:'재시작 응답 대기',trial:'시험 충전 중',ramp:'충전 출력 상승',handoff:'현장 조치 필요',manual:'담당자 처리 완료'}[job.phase];
}
// The overview uses observed workflow steps, never an inferred completion percentage.
export function recoverySummary(incident) {
  const job = incident.automation;
  const tone = incident.resolved ? 'complete' : job?.phase === 'handoff' ? 'handoff' : 'active';
  const label = recoveryLabel(incident);
  const category = incident.resolved ? "처리 결과" : job?.phase === "handoff" ? "담당자 조치 필요" : autoActive(job) ? "자동 처리 중" : "처리 대기";
  const steps = job ? `<span class="recovery-progress" role="img" aria-label="${esc(RECOVERY_STEPS.map((name, index) => `${name}: ${job.completedSteps.includes(index) || (incident.resolved && index === RECOVERY_STEPS.length - 1) ? '완료' : autoActive(job) && index === job.step ? '진행 중' : '미진행'}`).join(', '))}">${RECOVERY_STEPS.map((name, index) => `<i class="${job.completedSteps.includes(index) || (incident.resolved && index === RECOVERY_STEPS.length - 1) ? 'done' : autoActive(job) && index === job.step ? 'current' : ''}" title="${esc(name)}"></i>`).join('')}</span>` : '';
  return `<span class="recovery-summary ${tone}" data-recovery-phase="${esc(job?.phase || 'pending')}"><span class="recovery-summary-heading"><span>${category}</span><strong>${esc(label)}</strong></span>${steps}<span class="recovery-summary-message">${esc(job?.message || (incident.resolved ? '처리 이력을 확인하세요.' : '처리 이력이 등록되면 진행 상황을 표시합니다.'))}</span></span>`;
}
export function recoveryOverview(engine) {
  const jobs=engine.jobs;
  return `<span>자동 처리 <b>${jobs.filter(autoActive).length}</b></span><span>재충전 완료 <b>${jobs.filter(j=>j.recharged).length}</b></span><span>현장 이관 <b>${jobs.filter(j=>j.phase==='handoff').length}</b></span>`;
}
export function recoveryCard(job, compact=false) {
  const phase=job.phase,done=['resolved','manual'].includes(phase),running=autoActive(job),sample=job.lastSample;
  const reading=job.type==='temperature'?`코일 ${Number.isFinite(sample?.temperature)?sample.temperature.toFixed(1)+'℃':'계측 대기'} · 냉각 기준 ${job.settings.temperatureResume}℃`:job.type==='offline'?`통신 ${job.request?.acknowledgedAt?'재연결 응답 수신':'응답 대기'}`:['pd','efficiency'].includes(job.type)?`PD X ${Number.isFinite(sample?.pdXmm)?sample.pdXmm.toFixed(1):'—'} / Y ${Number.isFinite(sample?.pdYmm)?sample.pdYmm.toFixed(1):'—'} mm`:'FOD 보호 · 출력 차단';
  return `<article class="auto-card ${done?'resolved':phase==='handoff'?'handoff':'running'}" data-auto-card="${job.id}"><header><div><span>${job.station} · ${job.incidentId}</span><h3>${esc(job.title)}</h3></div><span class="auto-state">${job.recharged?'재충전 완료':done?'처리 완료':phase==='handoff'?'담당자 이관':'자동 처리 중'}</span></header><ol class="auto-steps">${RECOVERY_STEPS.map((label,index)=>`<li class="${job.completedSteps.includes(index)||(done&&index===RECOVERY_STEPS.length-1)?'finished':index===job.step?'current':''}"><span>${job.completedSteps.includes(index)||(done&&index===RECOVERY_STEPS.length-1)?'✓':index+1}</span><b>${label}</b></li>`).join('')}</ol><dl class="auto-report"><div><dt>발생 내용</dt><dd>${esc(job.report.fact)}</dd></div><div><dt>원인 후보</dt><dd>${esc(job.report.cause)}</dd></div><div><dt>조치 계획</dt><dd>${esc(job.report.plan)}${job.allowRecharge&&job.wasCharging?' → 재개 조건 확인 → 시험 충전 → 정상 충전':''}</dd></div></dl><div class="auto-current" role="status"><strong>${esc(job.message)}</strong><p>${sample?.txInputW?`출력 ${(sample.txInputW/1000).toFixed(2)} kW · 효율 ${Number.isFinite(sample.efficiency)?sample.efficiency.toFixed(1)+'%':'확인 중'} · `:''}${reading}${job.phase==='verify'?` · 안정 확인 ${(job.stableMs/1000).toFixed(1)} / ${Math.max(3,job.settings.alignmentHoldSeconds)}초`:''}</p></div>${!compact?`<div class="auto-command"><span>가상 명령 <b>${job.request?esc(job.request.id):'준비 중'}</b></span><span>응답 <b>${job.request?.status||'—'}</b></span><span>조치 <b>${job.attempts}회</b></span>${job.rechargeRequest?`<span>재충전 명령 <b>${esc(job.rechargeRequest.id)} · ${esc(job.rechargeRequest.status)}</b></span>`:""}</div><ol class="auto-log">${job.logs.slice(-5).map(log=>`<li><time>${when(log.at)}</time><span>${esc(log.text)}</span></li>`).join('')}</ol>`:''}<footer>${running?`<button type="button" class="text-button" data-auto-takeover="${job.id}">자동 처리 중단 · 직접 인수</button>`:phase==='handoff'?`<button type="button" class="button" data-incident="${job.incidentId}">점검 및 조치</button>`:`<span>${job.recharged?'시험 충전·출력 상승 검증 완료 · 충전 계속':'정상 대기 · 충전 작업 및 재개 조건 확인 필요'}</span>`}${!compact?`<button type="button" class="text-button" data-incident="${job.incidentId}">전체 처리 이력 →</button>`:''}</footer></article>`;
}
const visibleJobs = engine => [...engine.jobs.filter(autoActive), ...engine.jobs.filter(j=>!autoActive(j))].slice(0,6);
export function recoveryBoard(engine) {
 return `<section class="panel auto-board"><div class="auto-heading"><div><h2>장애 자동 처리</h2><p>원인 보고부터 자동 재충전까지 · 가상 장비 시연</p></div><div id="auto-overview">${recoveryOverview(engine)}</div></div><div class="auto-demo-controls"><label>시험 장비<select id="auto-station">${engine.state.stations.map(s=>`<option value="${s.id}" ${s.id==='WPO-TX-04'?'selected':''}>${s.id} · ${s.robot||'도킹 로봇 없음'}${s.status==='charging'?' · 충전 중':''}</option>`).join('')}</select></label><label>장애 상황<select id="auto-case">${Object.entries(RECOVERY_CASES).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label class="auto-recharge-option"><span><input type="checkbox" id="auto-recharge-demo" ${engine.demoAutoRecharge?"checked":""}> 가상 자동 재충전</span><small>충전 중이던 로봇 · 안전 조건 통과 시</small></label><button type="button" class="button primary" data-auto-launch>장애 발생 · 자동 처리 보기</button></div><div id="auto-jobs">${visibleJobs(engine).map(job=>recoveryCard(job)).join('')||'<p class="auto-empty">장애가 감지되면 자동 처리 흐름이 여기에 표시됩니다.</p>'}</div><p class="auto-footnote">시간·계측·명령 응답은 압축 시연입니다. 실제 OCPP·CAN 명령은 전송하지 않습니다. 가상 재충전 선택은 이 브라우저의 시연에만 적용되며 서버의 고정 보호 설정을 변경하지 않습니다.</p></section>`;
}
export function updateRecoveryBoard(engine) {
 const root=document.querySelector('#auto-jobs');
 if(root){
  const shown=visibleJobs(engine),ids=shown.map(j=>j.id).join(',');
  if(root.dataset.ids!==ids){root.innerHTML=shown.map(j=>recoveryCard(j)).join('');root.dataset.ids=ids;}
  else for(const job of shown){
    const card=root.querySelector(`[data-auto-card="${job.id}"]`);if(!card)continue;
    const focused=card.contains(document.activeElement),target=focused?document.activeElement.dataset:null;
    card.outerHTML=recoveryCard(job);
    if(focused){const next=root.querySelector(`[data-auto-card="${job.id}"]`);const selector=target.autoTakeover?'[data-auto-takeover]':'[data-incident]';(next.querySelector(selector)||next.querySelector('button'))?.focus({preventScroll:true});}
  }
  document.querySelector('#auto-overview').innerHTML=recoveryOverview(engine);
 }
 document.querySelectorAll('[data-auto-detail]').forEach(root=>{const job=engine.jobs.find(j=>j.incidentId===root.dataset.autoDetail);if(job&&!root.contains(document.activeElement))root.innerHTML=recoveryCard(job,true);});
 document.querySelectorAll('[data-auto-status]').forEach(el=>{const incident=engine.state.incidents.find(i=>i.id===el.dataset.autoStatus);if(incident)el.textContent=recoveryLabel(incident);});
}
