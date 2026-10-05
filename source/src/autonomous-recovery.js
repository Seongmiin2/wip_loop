import { addEvent, raiseIncident, command, finishSession } from './model.js';

export const RECOVERY_STEPS = ['장애 감지', '보호 조치', '원인 분류', '자동 조치', '정상 확인', '재개 조건', '시험 충전', '처리 결과'];
export const RECOVERY_CASES = { temperature:'과열 · 자동 냉각', pd:'PD · 패드 재정렬', offline:'통신 · 재연결', efficiency:'저효율 · 정렬 원인', 'pd-stuck':'PD · 반복 실패', 'temperature-stuck':'과열 · 냉각 실패', 'offline-stuck':'통신 · 재연결 실패', fod:'이물질 · 현장 이관', 'efficiency-stuck':'저효율 · 시험 충전 실패', 'restart-rejected':'재시작 · 명령 거절' };
const terminal = job => ['resolved','handoff','manual'].includes(job.phase);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const actions = { temperature:'냉각 요청', pd:'PD 재정렬 요청', offline:'통신 재연결 요청', efficiency:'PD 재정렬 요청' };

// Demo-only coordinator. It never sends commands to physical devices or OCPP.
// Request acknowledgement and fresh, stable observations are separate gates.
export class AutonomousRecovery {
  constructor(state, {demoAutoRecharge=false}={}) { this.demoAutoRecharge=demoAutoRecharge; this.state=state; this.jobs=[]; this.lastTick=null; }
  note(job, text, now, kind='progress') {
    job.logs.push({at:now,text,kind});
    const incident=this.state.incidents.find(i=>i.id===job.incidentId);
    incident?.notes.push({at:now,text:`자동 처리 · ${text}`});
    addEvent(this.state,job.station,text,kind==='handoff'?'amber':kind==='resolved'?'green':'neutral',now);
    this.state.audit.unshift({at:now,station:job.station,text:`자동 처리 · ${text}`,reason:job.incidentId,mode:'demo-auto'});
    this.state.audit.length=Math.min(this.state.audit.length,200);
  }
  transition(job,phase,step,text,now) {
    if ((step > job.step && !['handoff','manual'].includes(phase)) || (phase === 'handoff' && job.phase === 'diagnose')) job.completedSteps.push(job.step);
    job.phase=phase;job.step=step;job.elapsed=0;job.stableMs=0;job.message=text;
    this.note(job,text,now,phase);
  }
  handoff(job,text,now) {
    const s=this.state.stations.find(s=>s.id===job.station);
    if(s?.recoveryControlled===job.id) {
      finishSession(this.state,s,'자동 재충전 검증 중단',now);
      s.power=0;s.efficiency=0;s.status=s.manualStop?'paused':'fault';delete s.recoveryControlled;
    }
    job.report.result=text;
    this.transition(job,'handoff',7,text,now);job.finished=now;
  }
  report(job,incident,s) {
    const details={
      temperature:[`송신 코일 ${s.temperature.toFixed(1)}℃ · 정지 기준 ${job.settings.temperature}℃`, '냉각 성능·부하·패드 정렬의 영향 가능성', '출력 차단 → 냉각 → 송수신 온도 안정 확인'],
      pd:[`PD 위치 오차 ${Math.hypot(s.pdXmm,s.pdYmm).toFixed(1)} mm`, '도킹 위치 또는 패드 중심 이탈 가능성', '출력 차단 → PD 재정렬 → 위치 안정 확인'],
      offline:['충전기 응답 지연 · 보호 정지', '네트워크 또는 장비 연결 중단 가능성', '재연결 → 응답 확인 → 최신 상태 연속 확인'],
      efficiency:['전력전송 효율 저하 신호 · 보호 정지', 'PD 오차에 따른 결합 저하 가능성. 다른 손실 원인은 미확정', 'PD 재정렬 → 시험 출력 → 유효 입출력 계측으로 효율 재확인'],
      fod:['이물질 보호 신호 활성', '금속성 이물질 또는 감지계 이상 가능성', '차단 유지 → 현장 제거·센서 확인. 자동 재개 금지']
    };
    const [fact,cause,plan]=details[job.type]||[incident.title,'원인 미확정','담당자 점검 요청'];
    return {fact,cause,plan,result:'처리 중',source:'가상 계측 · 규칙 기반 원인 후보'};
  }
  discover(now) {
    for(const incident of this.state.incidents.filter(i=>!i.resolved)) {
      if(incident.automation)continue;
      const station=this.state.stations.find(s=>s.id===incident.station);
      if(!station)continue;
      const job={id:`AUTO-${incident.id}`,incidentId:incident.id,station:station.id,type:incident.type,title:incident.title,phase:'detected',step:0,completedSteps:[],elapsed:0,stableMs:0,started:now,finished:null,attempts:0,request:null,logs:[],settings:{...this.state.settings},faultPersists:incident.demoPersistent===true,wasCharging:incident.wasCharging===true,message:'장애 접수 · 자동 처리 시작',lastSample:null,robot:station.robot,allowRecharge:this.demoAutoRecharge,rejectRestart:incident.demoRejectRestart===true};
      job.report=this.report(job,incident,station);
      this.jobs.unshift(job);incident.automation=job;
      this.note(job,'장애 접수 · 자동 처리 시작',now);
    }
  }
  launch(stationId,scenario,now=Date.now()) {
    if(!Object.hasOwn(RECOVERY_CASES,scenario))throw new Error('시험 사례를 확인하세요.');
    const station=this.state.stations.find(s=>s.id===stationId);
    if(!station||station.simulationControlled)throw new Error('시나리오 시험 중인 장비는 선택할 수 없습니다.');
    if(!['available','paused','charging'].includes(station.status))throw new Error('진행 중인 장애를 먼저 처리하세요.');
    const type=scenario==='restart-rejected'?'pd':scenario.replace('-stuck','');
    if(!raiseIncident(this.state,stationId,type,now))throw new Error('이미 진행 중인 장애가 있습니다.');
    const incident=this.state.incidents.find(i=>i.station===stationId&&!i.resolved);
    incident.demoPersistent=scenario.endsWith('-stuck');incident.demoRejectRestart=scenario==='restart-rejected';
    this.discover(now);return incident.automation;
  }
  takeover(id,now=Date.now()) {
    const job=this.jobs.find(j=>j.id===id);
    if(!job||terminal(job))return false;
    this.handoff(job,'운영자가 자동 처리를 중단하고 인수했습니다. 출력 차단 유지.',now);return true;
  }
  request(job,now) {
    const max=job.type==='temperature'?1:job.type==='offline'?3:job.settings.alignmentRetryLimit;
    if(job.attempts>=max)return this.handoff(job,`자동 조치 ${max}회 한도 도달 · 현장 점검 요청`,now);
    job.attempts++;
    job.request={id:`${job.id}-${job.attempts}`,sentAt:now,acknowledgedAt:null,status:'응답 대기'};
    this.transition(job,'action',3,`${actions[job.type]} · ${job.attempts}/${max}회`,now);
  }
  observe(job,delta,now) {
    const s=this.state.stations.find(s=>s.id===job.station);
    // These values are generated by the virtual device; failed cases remain abnormal.
    if(job.type==='temperature'&&!job.faultPersists) { s.temperature=Math.max(job.settings.temperatureResume-2,s.temperature-delta*.004); s.rxTemperature=Math.max(job.settings.temperatureResume-2,(s.rxTemperature??38)-delta*.003); }
    if(['pd','efficiency'].includes(job.type)&&(!job.faultPersists||job.type==='efficiency')) {
      s.pdXmm=Math.max(0,s.pdXmm-(job.settings.alignmentWarnMm+8)*delta/3000);
      s.pdYmm=Math.max(0,s.pdYmm-4*delta/3000);
    }
    if(job.type==='offline'&&job.request?.acknowledgedAt&&!job.faultPersists)s.lastSeen=now;
    return {at:now,temperature:s.temperature,rxTemperature:s.rxTemperature??38,power:s.power,lastSeen:s.lastSeen,pdXmm:s.pdXmm,pdYmm:s.pdYmm,protected:s.status==='fault'||s.status==='offline'};
  }
  healthy(job,sample,now) {
    if(!sample||!finite(sample.at)||sample.at>now||now-sample.at>job.settings.maxSampleGapSeconds*1000||sample.power!==0||!sample.protected)return false;
    if(job.type==='temperature')return finite(sample.temperature)&&finite(sample.rxTemperature)&&sample.temperature<=job.settings.temperatureResume&&sample.rxTemperature<=job.settings.temperatureResume;
    if(job.type==='offline')return finite(sample.lastSeen)&&sample.lastSeen>=job.request.acknowledgedAt&&now-sample.lastSeen<=job.settings.staleSeconds*1000;
    return finite(sample.pdXmm)&&finite(sample.pdYmm)&&Math.hypot(sample.pdXmm,sample.pdYmm)<job.settings.alignmentWarnMm&&finite(sample.temperature)&&sample.temperature<job.settings.temperatureWarn;
  }
  complete(job,now) {
    const s=this.state.stations.find(s=>s.id===job.station);
    if(job.allowRecharge && job.wasCharging && s.soc<job.settings.bmsSocLimit) {
      this.transition(job,'precheck',5,'복구 조건 충족 · 재충전 인터록 확인',now);return;
    }
    if(job.type==='efficiency')return this.handoff(job,'PD 정상화 · 무출력에서는 효율 검증 불가. 충전 중이던 작업의 재개 허가가 없어 실부하 확인 이관',now);
    this.finish(job,now,false,job.wasCharging?'재충전 시연 미허용 또는 목표 잔량 도달 · 정상 대기':'이전 충전 작업 없음 · 정상 대기');
  }
  finish(job,now,resumed,message) {
    const s=this.state.stations.find(s=>s.id===job.station),incident=this.state.incidents.find(i=>i.id===job.incidentId);
    incident.resolved=now;incident.resolution='automatic';s.lastSeen=now;
    if(!resumed){s.status='available';s.power=0;s.efficiency=0;}
    delete s.recoveryControlled;job.recharged=resumed;job.report.result=message;
    this.transition(job,'resolved',7,message,now);job.finished=now;
  }
  rechargeBlock(job,s,now) {
    const p=job.settings;
    if(!job.allowRecharge||!this.demoAutoRecharge)return '가상 자동 재충전 허가가 없습니다.';
    if(['precheck','restart'].includes(job.phase)&&(s.power!==0||!['fault','offline'].includes(s.status)))return '재개 전 출력 차단 상태 확인 실패';
    if(this.jobs.some(other=>other!==job&&other.station===job.station&&other.type===job.type&&other.recharged&&now-other.finished<600000))return '10분 이내 동일 장애 재발 · 반복 재충전 금지, 현장 점검 요청';
    if(s.manualStop)return '운영자 중지 또는 시나리오 중단 · 자동 재개 금지';
    if(!job.wasCharging||!job.robot||s.robot!==job.robot)return '이전 충전 작업과 도킹 로봇이 일치하지 않습니다.';
    if(!finite(s.soc)||s.soc>=p.bmsSocLimit)return '배터리 잔량 또는 목표 충전 조건 확인 필요';
    if(s.fod!==false||s.bmsStop!==false||s.sensorFault!==false)return 'FOD·BMS·센서 보호 해제 확인 필요';
    if(!finite(s.lastSeen)||s.lastSeen>now||now-s.lastSeen>p.staleSeconds*1000)return '최신 장비 상태 확인 실패';
    if(!finite(s.temperature)||!finite(s.rxTemperature)||s.temperature>=p.temperatureWarn||s.rxTemperature>=p.rxTemperatureWarn)return '송수신 온도가 재충전 허용 범위를 벗어났습니다.';
    if(s.pdValid!==true||!finite(s.pdXmm)||!finite(s.pdYmm)||Math.hypot(s.pdXmm,s.pdYmm)>=p.alignmentWarnMm||!finite(s.pdAngleDeg)||Math.abs(s.pdAngleDeg)>p.alignmentAngleDeg||!finite(s.gapMm)||s.gapMm<p.gapMinMm||s.gapMm>p.gapMaxMm)return 'PD 위치·회전·패드 간격 확인 필요';
    if(this.state.incidents.some(i=>i.station===s.id&&!i.resolved&&i.id!==job.incidentId))return '다른 미해결 장애가 있습니다.';
    if(!finite(p.targetPowerKw)||!finite(p.ratedPowerKw)||Math.min(p.targetPowerKw,p.ratedPowerKw)*1000<p.minEvalPowerW)return '목표 출력이 효율 평가 최소 부하보다 낮습니다.';
    return null;
  }
  recharge(job,delta,now,simulate) {
    const s=this.state.stations.find(s=>s.id===job.station),p=job.settings;
    const blocked=this.rechargeBlock(job,s,now);
    if(blocked)return this.handoff(job,blocked,now);
    if(job.phase==='precheck'&&job.elapsed>=1000) {
      job.rechargeRequest={id:`${job.id}-RECHARGE`,sentAt:now,acknowledgedAt:null,status:'응답 대기'};
      this.transition(job,'restart',5,'재개 조건 통과 · 가상 시험 충전 시작 요청',now);return;
    }
    if(job.phase==='restart') {
      if(simulate&&job.elapsed>=1000&&!job.rechargeRequest.acknowledgedAt) {
        if(job.rejectRestart){job.rechargeRequest.status='거절';return this.handoff(job,'시험 충전 명령 거절 · 출력 차단 유지, 담당자 확인 요청',now);}
        job.rechargeRequest.acknowledgedAt=now;job.rechargeRequest.status='가상 장비 수락';
        s.status='available';
        try {command(this.state,s.id,'start','자동 복구 후 가상 시험 충전',now);} catch(error){s.status='fault';return this.handoff(job,error.message,now);}
        s.recoveryControlled=job.id;
        job.targetKw=Math.min(p.targetPowerKw,p.ratedPowerKw);
        job.trialKw=Math.min(job.targetKw,Math.max(.35,p.minEvalPowerW/1000));
        s.power=job.trialKw;job.lastSample=null;job.previousSampleAt=null;
        this.transition(job,'trial',6,`시험 충전 ${job.trialKw.toFixed(2)} kW · 온도·PD·효율 확인`,now);return;
      }
      if(job.elapsed>=4000)this.handoff(job,'시험 충전 명령 응답 시간 초과 · 자동 재전송 없이 이관',now);
      return;
    }
    if(!['trial','ramp'].includes(job.phase))return;
    if(s.status!=='charging'||s.recoveryControlled!==job.id)return this.handoff(job,'재충전 제어 상태 변경 · 자동 처리 종료',now);
    if(simulate) {
      s.power=job.phase==='trial'?job.trialKw:Math.min(job.targetKw,s.power+p.rampKwPerSecond*delta/1000);
      s.efficiency=job.type==='efficiency'&&job.faultPersists?70:93;
      s.lastSeen=now;s.sessionEnergy+=s.power*delta/3600000;
      job.lastSample={at:now,txAt:now,rxAt:now,txInputW:s.power*1000,rxOutputW:s.power*s.efficiency*10,temperature:s.temperature,rxTemperature:s.rxTemperature,pdXmm:s.pdXmm,pdYmm:s.pdYmm,power:s.power};
    }
    const sample=job.lastSample;
    const fresh=sample&&finite(sample.at)&&sample.at<=now&&now-sample.at<=p.maxSampleGapSeconds*1000&&sample.at>=(job.rechargeRequest.acknowledgedAt??now)&&(!finite(job.previousSampleAt)||sample.at>job.previousSampleAt);
    if(fresh) {
      const valid=finite(sample.txInputW)&&sample.txInputW>=p.minEvalPowerW&&finite(sample.rxOutputW)&&sample.rxOutputW>=0&&sample.rxOutputW<=sample.txInputW&&finite(sample.txAt)&&finite(sample.rxAt)&&Math.abs(sample.txAt-sample.rxAt)<=p.maxSkewMs&&Math.abs(sample.at-sample.txAt)<=p.staleSeconds*1000&&Math.abs(sample.at-sample.rxAt)<=p.staleSeconds*1000;
      if(!valid)return this.handoff(job,'시험 충전 계측 무효 · 보호 정지, 계측 점검 요청',now);
      sample.efficiency=sample.rxOutputW/sample.txInputW*100;
      if(sample.efficiency<p.efficiencyRecover)return this.handoff(job,`시험 충전 효율 ${sample.efficiency.toFixed(1)}% < 회복 ${p.efficiencyRecover}% · 재정렬만으로 해결되지 않아 손실·냉각 점검 이관`,now);
      if(!finite(sample.temperature)||!finite(sample.rxTemperature)||sample.temperature>=p.temperatureWarn||sample.rxTemperature>=p.rxTemperatureWarn||!finite(sample.pdXmm)||!finite(sample.pdYmm)||Math.hypot(sample.pdXmm,sample.pdYmm)>=p.alignmentWarnMm)return this.handoff(job,'시험 충전 중 발열·정렬 이상 재발 · 차단 및 현장 이관',now);
      const atTarget=finite(sample.power)&&Math.abs(sample.power-(job.phase==='trial'?job.trialKw:job.targetKw))<.01;
      job.stableMs=atTarget?job.stableMs+delta:0;
    }else job.stableMs=0;
    job.previousSampleAt=sample?.at;
    if(job.stableMs>= (job.phase==='trial'?5000:3000)) {
      if(job.phase==='trial')this.transition(job,'ramp',6,`시험 충전 정상 · 목표 ${job.targetKw.toFixed(2)} kW로 점진 상승`,now);
      else this.finish(job,now,true,`자동 재충전 완료 · ${s.power.toFixed(2)} kW / 효율 ${sample.efficiency.toFixed(1)}% · 정상 충전 계속`);
      return;
    }
    const timeout=job.phase==='trial'?15000:15000+job.targetKw/Math.max(.01,p.rampKwPerSecond)*1000;
    if(job.elapsed>=timeout)this.handoff(job,'재충전 계측·안정 유지 확인 시간 초과 · 차단 및 이관',now);
  }
  tick(now=Date.now(), {simulate=true}={}) {
    const raw=this.lastTick===null?0:Math.max(0,now-this.lastTick);this.lastTick=now;
    const delta=Math.min(1000,raw);this.discover(now);
    for(const job of this.jobs) {
      const incident=this.state.incidents.find(i=>i.id===job.incidentId);
      if(incident?.resolved&&job.phase!=='resolved'&&job.phase!=='manual') {
        this.transition(job,'manual',7,'담당자 점검 완료 · 자동 처리 종료',now);job.finished=now;continue;
      }
      if(terminal(job))continue;
      const s=this.state.stations.find(s=>s.id===job.station);
      if(!s||!incident){this.handoff(job,'장비 또는 장애 기록 확인 필요',now);continue;}
      if(['precheck','restart','trial','ramp'].includes(job.phase)) {
        if(raw>job.settings.maxSampleGapSeconds*1000&&['trial','ramp'].includes(job.phase)){this.handoff(job,'재충전 중 계측 공백 · 차단 및 이관',now);continue;}
        job.elapsed+=delta;this.recharge(job,delta,now,simulate);continue;
      }
      if(s.power!==0||!['fault','offline'].includes(s.status)){this.handoff(job,'보호 상태가 변경되어 자동 처리를 중단했습니다.',now);continue;}
      if(raw>job.settings.maxSampleGapSeconds*1000)job.stableMs=0;
      job.elapsed+=delta;
      if(job.phase==='detected'&&job.elapsed>=1000){this.transition(job,'protect',1,'출력 0 kW 확인 · 보호 정지 유지',now);continue;}
      if(job.phase==='protect'&&job.elapsed>=1500){this.transition(job,'diagnose',2,`${job.title} · 계측과 보호 상태 확인`,now);continue;}
      if(job.phase==='diagnose'&&job.elapsed>=2000) {
        if(job.type==='fod'){this.handoff(job,'FOD 보호 유지 · 이물질 제거와 감지 해제 확인을 현장 담당자에게 요청',now);continue;}
        if(!Object.hasOwn(actions,job.type)){this.handoff(job,'자동 복구 절차가 없는 장애 · 담당자 점검 요청',now);continue;}
        if(['pd','efficiency'].includes(job.type)&&!job.settings.autoRealign){this.handoff(job,'PD 자동 조치 사용 안 함 · 운영자 판단 요청',now);continue;}
        this.note(job,`원인 후보: ${job.report.cause} · 조치 계획: ${job.report.plan}`,now);
        this.request(job,now);continue;
      }
      if(job.phase==='retry'&&job.elapsed>=job.settings.retryCooldownSeconds*1000){this.request(job,now);continue;}
      if(job.phase==='action') {
        if(simulate&&job.elapsed>=1000&&!job.request.acknowledgedAt) {
          if(job.type==='offline'&&job.faultPersists){if(job.elapsed>=4000)this.retry(job,now,'재연결 응답 시간 초과');continue;}
          job.request.acknowledgedAt=now;job.request.status='가상 장비 수락';this.note(job,'가상 장비 응답 수락 · 정상 복구 여부는 별도 확인',now);
        }
        if(!job.request.acknowledgedAt&&job.elapsed>=4000){this.retry(job,now,'명령 응답 시간 초과');continue;}
        if(job.request.acknowledgedAt) {
          if(simulate)job.lastSample=this.observe(job,delta,now);
          const minimum=job.type==='temperature'?3000:job.type==='offline'?2000:Math.max(2500,job.settings.alignmentHoldSeconds*1000);
          if(job.elapsed>=minimum)this.transition(job,'verify',4,job.type==='temperature'?`냉각 확인 · 송수신 온도 ${job.settings.temperatureResume}℃ 이하 유지`:job.type==='offline'?'재연결 후 최신 통신 상태 연속 확인':'PD 오차 기준 내 안정 유지 확인',now);
        }
        continue;
      }
      if(job.phase==='verify') {
        if(simulate)job.lastSample=this.observe(job,delta,now);
        const sample=job.lastSample;
        const newSample=sample&&sample.at!==job.previousSampleAt;
        if(newSample&&this.healthy(job,sample,now))job.stableMs+=delta;else job.stableMs=0;
        job.previousSampleAt=sample?.at;
        const hold=Math.max(3000,job.settings.alignmentHoldSeconds*1000);
        if(job.stableMs>=hold){this.complete(job,now);continue;}
        const timeout=job.type==='temperature'?15000:job.type==='offline'?6000:job.settings.alignmentTimeoutSeconds*1000;
        if(job.elapsed>=timeout)this.retry(job,now,'정상 조건 확인 실패');
      }
    }
  }
  retry(job,now,reason) {
    const limit=job.type==='temperature'?1:job.type==='offline'?3:job.settings.alignmentRetryLimit;
    if(job.attempts>=limit)return this.handoff(job,`${reason} · ${limit}회 한도 도달, 현장 담당자에게 이관`,now);
    this.transition(job,'retry',3,`${reason} · ${job.settings.retryCooldownSeconds}초 후 재시도`,now);
  }
}
