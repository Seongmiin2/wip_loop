import schema from '../../shared/charging-settings.json' with { type: 'json' };
export { schema };
export const policyDefaults = Object.fromEntries(schema.fields.map(field => [field.key, field.default]));
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function evaluateCharging(samples, values = policyDefaults, now = Date.now()) {
  const s = { ...policyDefaults, ...values };
  const history = [...samples].filter(v => finite(v.at)).sort((a, b) => a.at - b.at);
  const current = history.at(-1);
  const findings = [];
  const add = (code, title, severity, evidence, causes, action = 'observe') => findings.push({ code, title, severity, evidence, causes, action });
  const result = () => ({ findings, efficiency, lossW, offsetMm, riseRate, efficiencyRecovered: efficiency !== null && efficiency >= s.efficiencyRecover, action: findings.some(f => f.action === 'stop') ? 'stop' : findings.some(f => f.action === 'derate') ? 'derate' : findings.some(f => f.action === 'realign') ? 'realign' : 'observe', recoveryReady: !!current && finite(current.txTemperature) && finite(current.rxTemperature) && current.txTemperature <= s.temperatureResume && current.rxTemperature <= s.temperatureResume && !findings.some(f => f.action === 'stop'), scope: 'simulation' });
  let efficiency = null, lossW = null, offsetMm = null, riseRate = null;
  if (!current || current.at > now + 1000 || now - current.at > s.staleSeconds * 1000) {
    add('stale', '계측 갱신 필요', 'critical', '최신 표본이 없거나 유효 시간을 벗어났습니다.', ['통신 단절', '장비 전원', '계측 시각 오류'], 'stop');
    return result();
  }
  if (current.fod === true) add('fod', '이물질 보호 신호', 'critical', '장비 FOD 신호가 활성화되었습니다.', ['금속성 이물질', '감지 센서·보정 상태'], 'stop');
  if (current.bmsStop === true) add('bms', 'BMS 충전 정지', 'critical', '배터리 보호 정지 요청이 있습니다.', ['배터리 온도·전압·전류', 'BMS 인터록'], 'stop');
  if (current.sensorFault === true) add('sensor', '센서 이상', 'critical', '센서 유효성 신호가 비정상입니다.', ['단선·단락', '보정 또는 계측 오류'], 'stop');
  for (const [key, warn, stop, name] of [['txTemperature', s.temperatureWarn, s.temperature, '송신 코일'], ['rxTemperature', s.rxTemperatureWarn, s.rxTemperatureStop, '수신부']]) {
    const value = current[key];
    if (!finite(value)) continue;
    if (value >= stop) add(key, `${name} 과열`, 'critical', `${value.toFixed(1)}°C ≥ 정지 ${stop}°C`, ['정렬 불량', '냉각 성능 저하', '주변 온도·부하 증가'], 'stop');
    else if (value >= warn) add(key, `${name} 발열`, 'warning', `${value.toFixed(1)}°C ≥ 주의 ${warn}°C`, ['패드 정렬', '냉각·통풍', '부하 상태'], key === 'txTemperature' && value >= s.temperatureDerate ? 'derate' : 'observe');
  }
  if (finite(current.ambientTemperature) && current.ambientTemperature >= s.ambientWarn) add('ambient', '주변 온도 상승', 'warning', `${current.ambientTemperature}°C ≥ ${s.ambientWarn}°C`, ['설치 위치의 통풍', '주변 열원']);
  if (finite(current.fanRpm) && current.fanRpm < s.fanMinRpm) add('cooling', '냉각팬 성능 저하', 'warning', `${current.fanRpm} rpm < ${s.fanMinRpm} rpm`, ['팬 정지·마모', '필터·통풍구 막힘'], 'derate');
  const continuous = [];
  for (let i = history.length - 1; i >= 0; i--) {
    if (i < history.length - 1 && (history[i + 1].at - history[i].at > s.maxSampleGapSeconds * 1000 || history[i + 1].at <= history[i].at)) break;
    if (!finite(history[i].txTemperature) || current.at - history[i].at > 60000) break;
    continuous.unshift(history[i]);
  }
  if (continuous.length > 1 && current.at - continuous[0].at >= 1000) {
    riseRate = (current.txTemperature - continuous[0].txTemperature) / ((current.at - continuous[0].at) / 60000);
    if (riseRate >= s.riseRateWarn) add('rapid_heating', '급격한 온도 상승', 'warning', `${riseRate.toFixed(1)}°C/분 ≥ ${s.riseRateWarn}°C/분`, ['국부 발열', '냉각 이상', '부하·정렬 변화'], 'derate');
  }
  if (current.pdValid === false) add('pd_lost', 'PD 위치 검출 실패', 'critical', '송수신 위치 검출값이 유효하지 않습니다.', ['PD 센서·통신', '위치 검출 범위 이탈'], 'stop');
  if (finite(current.pdXmm) && finite(current.pdYmm)) {
    offsetMm = Math.hypot(current.pdXmm, current.pdYmm);
    if (offsetMm >= s.alignmentStopMm) add('pd_departure', 'PD 위치 이탈', 'critical', `합성 오차 ${offsetMm.toFixed(1)} mm ≥ ${s.alignmentStopMm} mm`, ['AMR 정지 위치', '충전 중 로봇 움직임'], 'stop');
    else if (offsetMm >= s.alignmentWarnMm) add('pd_offset', 'PD 재정렬 필요', 'warning', `X ${current.pdXmm} / Y ${current.pdYmm} mm · 합성 ${offsetMm.toFixed(1)} mm`, ['도킹 위치 오차', '송수신 패드 설치 위치'], s.autoRealign ? 'realign' : 'observe');
  }
  if (finite(current.pdAngleDeg) && Math.abs(current.pdAngleDeg) > s.alignmentAngleDeg) add('pd_angle', '패드 회전 오차', 'warning', `${current.pdAngleDeg}° · 허용 ±${s.alignmentAngleDeg}°`, ['AMR 진입 각도', '패드 설치 방향'], s.autoRealign ? 'realign' : 'observe');
  if (finite(current.gapMm) && (current.gapMm < s.gapMinMm || current.gapMm > s.gapMaxMm)) add('pad_gap', '패드 간격 이탈', 'warning', `${current.gapMm} mm · 범위 ${s.gapMinMm}~${s.gapMaxMm} mm`, ['패드 높이·평행도', '적재에 따른 차고 변화'], s.autoRealign ? 'realign' : 'observe');
  if (finite(current.alignmentSeconds) && current.alignmentSeconds >= s.alignmentTimeoutSeconds) add('pd_timeout', 'PD 정렬 시간 초과', 'critical', `${current.alignmentSeconds}초 ≥ ${s.alignmentTimeoutSeconds}초`, ['위치 수렴 실패', '센서 갱신 지연'], 'stop');
  if (finite(current.alignmentAttempts) && current.alignmentAttempts >= s.alignmentRetryLimit && findings.some(f => f.action === 'realign')) add('pd_retry_limit', 'PD 재탐색 한도 도달', 'critical', `${current.alignmentAttempts}회 / 허용 ${s.alignmentRetryLimit}회`, ['기계적 위치 점검 필요'], 'stop');
  if (finite(current.alignmentGain) && current.alignmentGain < s.alignmentMinGain) add('pd_no_gain', '재정렬 후 개선 부족', 'warning', `${current.alignmentGain}%p < ${s.alignmentMinGain}%p`, ['간격·회전 오차', '정렬 이외의 손실 원인'], 'observe');
  const validPower = sample => finite(sample.txInputW) && finite(sample.rxOutputW) && sample.txInputW >= s.minEvalPowerW && sample.rxOutputW >= 0 && sample.rxOutputW <= sample.txInputW && finite(sample.txAt) && finite(sample.rxAt) && Math.abs(sample.txAt - sample.rxAt) <= s.maxSkewMs && Math.abs(sample.at - sample.txAt) <= s.staleSeconds * 1000 && Math.abs(sample.at - sample.rxAt) <= s.staleSeconds * 1000;
  if (!validPower(current)) {
    const lowLoad = finite(current.txInputW) && current.txInputW >= 0 && current.txInputW < s.minEvalPowerW;
    add(lowLoad ? 'low_load' : 'invalid_power', lowLoad ? '저부하 · 효율 평가 제외' : '효율 계측 확인 필요', 'info', lowLoad ? `${current.txInputW} W < 평가 최소 ${s.minEvalPowerW} W` : '입출력 값·계측 경계·송수신 시각을 확인하세요.', ['저부하 동작 또는 계측 동기화·보정 상태']);
  } else {
    efficiency = current.rxOutputW / current.txInputW * 100;
    lossW = current.txInputW - current.rxOutputW;
    let since = current.at;
    const boundary = efficiency < s.efficiencyStop ? s.efficiencyStop : s.efficiencyWarn;
    for (let i = history.length - 2; i >= 0; i--) {
      if (!validPower(history[i]) || history[i].rxOutputW / history[i].txInputW * 100 >= boundary || history[i + 1].at - history[i].at > s.maxSampleGapSeconds * 1000 || history[i + 1].at <= history[i].at) break;
      since = history[i].at;
    }
    const held = (current.at - since) / 1000;
    if (efficiency < s.efficiencyWarn) add('low_efficiency', held >= s.efficiencyHoldSeconds ? '저효율 지속' : '저효율 지속 확인 중', held >= s.efficiencyHoldSeconds ? 'warning' : 'info', `${efficiency.toFixed(1)}% · ${held.toFixed(1)}/${s.efficiencyHoldSeconds}초 · 손실 ${lossW.toFixed(0)} W`, ['PD 위치·회전·패드 간격', '냉각·부품 손실', '부하 변화', '계측 보정'], held >= s.efficiencyHoldSeconds ? (efficiency < s.efficiencyStop ? 'stop' : 'derate') : 'observe');
    else if (efficiency < s.efficiencyRecover && history.some(v => validPower(v) && v.rxOutputW / v.txInputW * 100 < s.efficiencyWarn)) add('efficiency_recovery', '효율 회복 확인 중', 'info', `${efficiency.toFixed(1)}% < 회복 ${s.efficiencyRecover}%`, ['회복 기준 이상으로 안정되는지 확인']);
    if (lossW >= s.lossWarnW) add('power_loss', '전력 손실 증가', 'warning', `${lossW.toFixed(0)} W ≥ ${s.lossWarnW} W`, ['정렬·간격', '코일·회로 손실', '금속성 물체 가능성 · FOD 신호 별도 확인']);
  }
  if (finite(current.requestedW) && current.requestedW > 0 && finite(current.txInputW)) {
    const deviation = Math.abs(current.txInputW - current.requestedW) / current.requestedW * 100;
    if (deviation >= s.powerDeviationPercent && finite(current.lastPowerAdjustmentAt) && now - current.lastPowerAdjustmentAt < s.retryCooldownSeconds * 1000) add('power_cooldown', '전력 재조정 대기', 'info', `${Math.ceil(s.retryCooldownSeconds - (now - current.lastPowerAdjustmentAt) / 1000)}초 후 재평가`, ['반복 조정 방지 · 저장된 대기 시간 적용']);
    if (deviation >= s.powerDeviationPercent) add('power_deviation', '전력 재조정 확인', 'warning', `요청 대비 편차 ${deviation.toFixed(1)}%`, ['출력 제한·저감', 'BMS 요구량 변화', '전력 전달 상태'], current.powerAttempts >= s.powerRetryLimit ? 'stop' : 'observe');
  }
  return result();
}

export function planPower(values, action, previousKw, elapsedSeconds) {
  const s = { ...policyDefaults, ...values };
  if (action === 'stop') return 0;
  const cap = Math.min(s.targetPowerKw, s.ratedPowerKw) * (action === 'derate' || action === 'realign' ? s.deratePercent / 100 : 1);
  return Math.max(0, Math.min(cap, previousKw + s.rampKwPerSecond * Math.max(0, elapsedSeconds)));
}

export const diagnosticCases = {
  normal: '정상 충전', pd: 'PD 오차 + 저효율', heating: '발열 + 냉각 저하', gap: '패드 간격 이탈', rapid: '급격한 온도 상승', loss: '원인 미확정 손실', stale: '계측 지연', fod: 'FOD 보호', bms: 'BMS 정지', retry: '재정렬 반복 실패', sync: '송수신 시각 불일치', sensor: '온도 센서 이상', power: '전력 재조정 반복', angle: 'PD 회전 오차', lowload: '저부하', pdLost: 'PD 검출 실패', timeout: 'PD 시간 초과', gain: '재정렬 개선 부족',
};
export function diagnosticSamples(key, values = policyDefaults, now = Date.now()) {
  const s = { ...policyDefaults, ...values };
  return Array.from({length: 16}, (_, i) => {
    const at = now - (15 - i) * 1000;
    const sample = {at, txAt: at, rxAt: at, txInputW: 1400, rxOutputW: 1302, txTemperature: 40, rxTemperature: 38, ambientTemperature: 25, fanRpm: 1800, pdXmm: 1, pdYmm: 1, pdAngleDeg: 0, gapMm: 15, pdValid: true, alignmentAttempts: 0, requestedW: 1400};
    if (key === 'pd') Object.assign(sample, {pdXmm: 16, pdYmm: 8, rxOutputW: 1148});
    if (key === 'heating') Object.assign(sample, {txTemperature: 59, ambientTemperature: 43, fanRpm: 200});
    if (key === 'gap') sample.gapMm = 45;
    if (key === 'rapid') sample.txTemperature = 40 + i * .15;
    if (key === 'loss') sample.rxOutputW = 1100;
    if (key === 'stale') Object.assign(sample, {at: at - 600000, txAt: at - 600000, rxAt: at - 600000});
    if (key === 'fod') sample.fod = true;
    if (key === 'bms') sample.bmsStop = true;
    if (key === 'retry') Object.assign(sample, {pdXmm: 16, pdYmm: 8, alignmentAttempts: s.alignmentRetryLimit});
    if (key === 'sync') sample.rxAt = at - 20000;
    if (key === 'sensor') sample.sensorFault = true;
    if (key === 'power') Object.assign(sample, {requestedW: 1500, txInputW: 700, rxOutputW: 650, powerAttempts: s.powerRetryLimit});
    if (key === 'angle') sample.pdAngleDeg = 12;
    if (key === 'lowload') Object.assign(sample, {txInputW: 50, rxOutputW: 20});
    if (key === 'pdLost') sample.pdValid = false;
    if (key === 'timeout') sample.alignmentSeconds = s.alignmentTimeoutSeconds;
    if (key === 'gain') sample.alignmentGain = 0.2;
    return sample;
  });
}
