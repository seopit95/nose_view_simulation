import { useEffect, useRef, useState } from 'react';
import { QUALITY_TEXT, liveFilterStrength, type Quality } from './core/geometry';
import { NOSE_CONTROLS, ZERO, sanitizeAdjustments, type Adjustments } from './core/adjustments';
import { Pipeline, type TrackedFrame } from './tracking/pipeline';
import { Viewport, type ViewMode, type ViewportHandle } from './components/Viewport';
import { Icon } from './components/Icon';
import { ExportDialog } from './components/ExportDialog';
import { BEAUTY_CONTROLS, BEAUTY_PRESETS, beautyLabel, skinZones, type BeautySettings } from './core/beauty';
import { DEFAULT_PREFERENCES, PREFERENCES_KEY, getNosePreset, parsePreferences, serializePreferences, type Preferences } from './core/preferences';
import { SettingsDialog } from './components/SettingsDialog';

type Source = 'camera' | 'off';
type FilterLook = { adjustments: Adjustments; beauty: BeautySettings; nosePresetId: string };

export default function App() {
  const [loaded] = useState(() => {
    try { return parsePreferences(localStorage.getItem(PREFERENCES_KEY)); }
    catch { return { value: DEFAULT_PREFERENCES, warning: '기본 설정 저장소에 접근하지 못했습니다. 이번 실행은 기본 제공값을 사용합니다.' }; }
  });
  const [preferences, setPreferences] = useState(loaded.value), preferencesRef = useRef(preferences);
  const [settingsWarning, setSettingsWarning] = useState(loaded.warning), [settingsOpen, setSettingsOpen] = useState(false);
  const viewport = useRef<ViewportHandle>(null), pipeline = useRef<Pipeline | null>(null);
  const failed = useRef(false);
  const video = useRef(document.createElement('video')), stream = useRef<MediaStream | null>(null), operation = useRef(0);
  const frameTimes = useRef<number[]>([]), lastMetrics = useRef(0);
  const [source, setSource] = useState<Source>('off'), sourceRef = useRef<Source>('off');
  const [engine, setEngine] = useState('loading'), [error, setError] = useState(''), [toast, setToast] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]), [device, setDevice] = useState('');
  const [connecting, setConnecting] = useState(false), [cameraLabel, setCameraLabel] = useState('');
  const [quality, setQuality] = useState<Quality | null>(null), [hasFrame, setHasFrame] = useState(false);
  const [skinAvailable, setSkinAvailable] = useState(false);
  const [filterQuality, setFilterQuality] = useState<Quality | null>(null);
  const [filterLook, setFilterLook] = useState<FilterLook | null>(null), filterRef = useRef<FilterLook | null>(null);
  const [metrics, setMetrics] = useState({ fps: 0, ms: 0 });
  const [selectedNoseId, setSelectedNoseId] = useState(preferences.defaultNoseId);
  const selectedNose = getNosePreset(preferences, selectedNoseId);
  const [adjustments, setAdjustments] = useState<Adjustments>({ ...(preferences.autoNose ? getNosePreset(preferences).adjustments : ZERO) });
  const [selectedControl, setSelectedControl] = useState<keyof Adjustments>();
  const [beauty, setBeauty] = useState<BeautySettings>({ ...preferences.beauty });
  const [resolution, setResolution] = useState('');
  const [slots, setSlots] = useState<(Adjustments | null)[]>([null, null, null]);
  const [mode, setMode] = useState<ViewMode>('compare'), [split, setSplit] = useState(.5), [hold, setHold] = useState(false);
  const [paused, setPausedState] = useState(false), pauseRequested = useRef(false);
  const [mirror, setMirror] = useState(true), [guide, setGuide] = useState(false);
  const [exportImage, setExportImage] = useState<string | null>(null);
  const resetDialog = useRef<HTMLDialogElement>(null);

  function stopTracks() {
    const current = stream.current; stream.current = null;
    current?.getTracks().forEach(track => { track.onended = null; track.onmute = null; track.onunmute = null; track.stop(); });
    video.current.pause(); video.current.srcObject = null;
  }
  function setPaused(value: boolean) {
    pauseRequested.current = value; setPausedState(value); pipeline.current?.setPaused(value);
  }
  function clearFrame(preservePause = false) {
    const nextPaused = preservePause && pauseRequested.current;
    pipeline.current?.setSource(null); viewport.current?.clear(); setQuality(null); setFilterQuality(null); setHasFrame(false); setSkinAvailable(false);
    setPaused(nextPaused); setHold(false); frameTimes.current = []; setMetrics({ fps: 0, ms: 0 }); setResolution('');
  }
  function clearSettings(preserveFilter = false) {
    const saved = preferencesRef.current, look = preserveFilter ? filterRef.current : null;
    if (!preserveFilter) { filterRef.current = null; setFilterLook(null); }
    setSelectedNoseId(look?.nosePresetId ?? saved.defaultNoseId);
    setAdjustments({ ...(look?.adjustments ?? (saved.autoNose ? getNosePreset(saved).adjustments : ZERO)) }); setBeauty({ ...(look?.beauty ?? saved.beauty) });
    setSlots([null, null, null]); setExportImage(null); setSettingsOpen(false); setSelectedControl(undefined);
  }
  function savePreferences(value: Preferences): string | null {
    try {
      const raw = serializePreferences(value);
      localStorage.setItem(PREFERENCES_KEY, raw);
      const saved = parsePreferences(raw).value;
      preferencesRef.current = saved; setPreferences(saved); setSettingsWarning('');
      setToast('기본 설정을 저장했습니다. 다음 실행·연결·새 상담부터 적용됩니다.'); return null;
    } catch { return '설정을 저장하지 못했습니다. 기존 기본 설정은 유지됩니다. 다시 시도해 주세요.'; }
  }
  function changeSource(next: Source) { sourceRef.current = next; setSource(next); }
  function fatal(message: string) {
    if (failed.current) return;
    failed.current = true;
    operation.current++; stopTracks(); clearFrame(); clearSettings(); pipeline.current?.dispose();
    setToast(''); resetDialog.current?.close();
    setEngine('error'); setConnecting(false); changeSource('off'); setError(message);
  }
  async function refreshDevices() {
    try { setDevices((await navigator.mediaDevices.enumerateDevices()).filter(item => item.kind === 'videoinput')); }
    catch { /* Labels may be unavailable before the user grants camera permission. */ }
  }
  function disconnect(message = '') {
    operation.current++; stopTracks(); clearFrame(); clearSettings(); setConnecting(false); changeSource('off');
    if (!failed.current) setError(message);
  }
  async function connectCamera(selected = device) {
    if (failed.current) return;
    const token = ++operation.current; stopTracks(); clearFrame(); clearSettings(true);
    changeSource('off'); setError(''); setConnecting(true);
    let acquired: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('Unavailable', 'NotSupportedError');
      acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        ...(selected ? { deviceId: { exact: selected } } : {}),
        width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 },
      } });
      if (operation.current !== token) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream.current = acquired;
      const element = video.current; element.muted = true; element.playsInline = true; element.srcObject = acquired;
      let playbackTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([element.play(), new Promise<never>((_, reject) => {
          playbackTimer = setTimeout(() => reject(new DOMException('Camera first frame timed out', 'TimeoutError')), 8000);
        })]);
      } finally { clearTimeout(playbackTimer); }
      if (operation.current !== token) return;
      const track = acquired.getVideoTracks()[0];
      if (!track || track.readyState !== 'live') throw new Error('Camera ended');
      track.onended = () => { if (operation.current === token) disconnect('웹캠 연결이 끊겼습니다. USB 연결을 확인한 뒤 다시 연결해 주세요.'); };
      track.onmute = () => {
        if (operation.current === token) { clearFrame(true); setError('웹캠에서 영상이 들어오지 않습니다. 연결 상태를 확인해 주세요.'); }
      };
      track.onunmute = () => {
        if (operation.current === token) {
          setError(''); pipeline.current?.setSource(element);
          setPaused(pauseRequested.current || document.hidden);
        }
      };
      setCameraLabel(track.label || 'USB 웹캠'); setDevice(track.getSettings().deviceId || selected);
      changeSource('camera'); setConnecting(false); pipeline.current?.setSource(element); void refreshDevices();
      setPaused(document.hidden);
    } catch (cause) {
      acquired?.getTracks().forEach(track => track.stop());
      if (operation.current !== token) return;
      stopTracks(); setConnecting(false); changeSource('off');
      const name = cause instanceof Error ? cause.name : '';
      setError(name === 'NotAllowedError' ? '카메라 접근이 허용되지 않았습니다. 시스템 설정에서 카메라 권한을 확인한 뒤 다시 연결해 주세요.' :
        name === 'NotFoundError' || name === 'OverconstrainedError' ? '선택한 웹캠을 찾을 수 없습니다. USB 연결을 확인하거나 다른 카메라를 선택해 주세요.' :
        name === 'NotReadableError' ? '웹캠을 사용할 수 없습니다. 카메라를 사용 중인 다른 앱을 닫고 다시 연결해 주세요.' :
        name === 'TimeoutError' ? '웹캠 연결은 확인했지만 영상이 들어오지 않습니다. USB를 뺐다가 다시 꽂고, 허브를 사용 중이면 Mac/PC에 직접 연결해 주세요. 카메라를 쓰는 다른 앱을 닫은 뒤 다시 연결해 주세요.' :
        '웹캠 영상을 시작하지 못했습니다. 카메라와 운영체제의 지원 여부를 확인해 주세요.');
    }
  }
  function acceptFrame(frame: TrackedFrame) {
    if (failed.current) { frame.bitmap.close(); return; }
    setResolution(`${frame.bitmap.width} × ${frame.bitmap.height}`);
    setSkinAvailable(Boolean(frame.landmarks && skinZones(frame.landmarks, frame.bitmap.width, frame.bitmap.height)));
    viewport.current?.present(frame); setHasFrame(true); setQuality(frame.quality); setFilterQuality(frame.filterQuality);
    const now = performance.now(); frameTimes.current.push(now);
    frameTimes.current = frameTimes.current.filter(time => now - time < 1000);
    if (now - lastMetrics.current > 700) {
      setMetrics({ fps: frameTimes.current.length, ms: Math.round(frame.processingMs) }); lastMetrics.current = now;
    }
  }
  function togglePause() {
    setPaused(!pauseRequested.current);
  }
  function openExport() {
    if (filterRef.current || !quality?.ok) return;
    setPaused(true);
    const image = viewport.current?.capture(`웹캠 캡처 · ${new Date().toLocaleString('ko-KR')}`);
    if (image) setExportImage(image);
  }
  useEffect(() => {
    // Child renderer effects run first. A failed WebGL renderer must stop startup.
    if (failed.current) return;
    try {
      pipeline.current = new Pipeline({ ready: delegate => { if (!failed.current) setEngine(delegate); }, frame: acceptFrame, error: fatal });
    } catch { fatal('얼굴 추적 엔진을 시작하지 못했습니다. 앱을 다시 실행해 주세요.'); return; }
    void refreshDevices();
    const deviceChange = () => void refreshDevices();
    const visibility = () => {
      if (document.hidden && sourceRef.current === 'camera') { setPaused(true); setHold(false); }
    };
    navigator.mediaDevices?.addEventListener('devicechange', deviceChange);
    document.addEventListener('visibilitychange', visibility);
    const blur = () => setHold(false); window.addEventListener('blur', blur);
    return () => {
      operation.current++; stopTracks(); pipeline.current?.dispose();
      navigator.mediaDevices?.removeEventListener('devicechange', deviceChange);
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', blur);
    };
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);

  const working = engine !== 'loading' && engine !== 'error';
  const canAdjust = Boolean(quality?.ok && hasFrame && !connecting);
  const regionsAvailable = Boolean(quality?.frame?.regions);
  const controlDisabled = (key: keyof Adjustments) => !canAdjust || (!regionsAvailable && ['tipSize', 'alarLift', 'nostrilExposure', 'columella'].includes(key));
  const isFilter = filterLook !== null;
  const displayBeauty = filterLook?.beauty ?? beauty, displayAdjustments = filterLook?.adjustments ?? adjustments;
  const activeQuality = isFilter ? filterQuality : quality;
  const filterStrength = liveFilterStrength(filterQuality);
  const correctionActive = hasFrame && (BEAUTY_CONTROLS.some(({ key }) => key !== 'smoothing' && displayBeauty[key] !== 0) || Boolean(displayBeauty.smoothing && skinAvailable));
  function selectTab(filter: boolean) {
    if (filter && (!working || connecting)) return;
    const look = filter ? filterRef.current ?? { adjustments: { ...adjustments }, beauty: { ...beauty }, nosePresetId: selectedNoseId } : null;
    filterRef.current = look; setFilterLook(look); setHold(false);
  }
  const status = connecting ? '웹캠 연결 중…' : error ? '연결 상태 확인' : engine === 'loading' ? '얼굴 추적 준비 중…' :
    paused ? '화면 일시정지' : activeQuality ? isFilter && activeQuality.ok ? filterStrength === 1 ? '실시간 필터 적용 중' : filterStrength > 0 ? '각도에 맞춰 코 보정을 줄이고 있습니다' : '얼굴을 정면으로 돌려 주세요' : QUALITY_TEXT[activeQuality.reason] : source === 'off' ? '카메라 연결 대기' : '얼굴을 확인하고 있습니다';
  const detailCount = NOSE_CONTROLS.filter(c => !c.basic && adjustments[c.key] !== 0).length;
  function noseControl(control: typeof NOSE_CONTROLS[number]) {
    return <div className={`slider-field ${selectedControl === control.key ? 'selected-control' : ''}`} key={control.key}>
      <div className="slider-label"><label htmlFor={`adjust-${control.key}`} onClick={() => setSelectedControl(control.key)}>{control.label}</label><div className="slider-value"><output htmlFor={`adjust-${control.key}`}>{adjustments[control.key] > 0 ? '+' : ''}{adjustments[control.key]}</output>
        <button className="control-reset" disabled={controlDisabled(control.key)} aria-label={`${control.label} 초기화`} onClick={() => { setAdjustments(current => ({ ...current, [control.key]: 0 })); setSelectedControl(control.key); }}>0</button></div></div>
      <p id={`adjust-${control.key}-hint`} className={selectedControl === control.key ? 'control-hint' : 'sr-only'}>{control.hint}</p>
      <input id={`adjust-${control.key}`} type="range" min="-100" max="100" step="1" disabled={controlDisabled(control.key)} value={adjustments[control.key]} aria-describedby={`adjust-${control.key}-hint`}
        onFocus={() => setSelectedControl(control.key)} onChange={e => setAdjustments(current => ({ ...current, [control.key]: Number(e.target.value) }))}/>
      <div className="range-labels"><span>{control.low}</span><span>원본</span><span>{control.high}</span></div>
    </div>;
  }
  function beautyControl(control: typeof BEAUTY_CONTROLS[number]) {
    return <div className="beauty-control" key={control.key}>
      <div><label htmlFor={`beauty-${control.key}`}>{control.label}</label><output htmlFor={`beauty-${control.key}`}>{beauty[control.key] > 0 && control.key !== 'smoothing' ? '+' : ''}{beauty[control.key]}</output></div>
      <input id={`beauty-${control.key}`} type="range" min={control.min} max={control.max} value={beauty[control.key]} disabled={!working}
        onChange={e => setBeauty(current => ({ ...current, [control.key]: Number(e.target.value) }))}/>
    </div>;
  }

  return <div className={`app-shell ${isFilter ? 'filter-view' : ''}`}>
    <header className="topbar"><div className="brand"><span className="brand-mark"><svg width="25" height="30" viewBox="0 0 25 30" fill="none" aria-hidden="true"><path d="M11 2c4 7-3 14-2 18 1 3 7 0 8 4M6 27c4-2 9-2 13-1" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"/></svg></span><span>nose<span className="brand-light">view</span><small>VISUAL CONSULTATION</small></span></div>
      <div className="topbar-center"><div className="session-tabs" role="tablist" aria-label="상담 화면">
        {[false, true].map(filter => <button key={String(filter)} id={filter ? 'filter-tab' : 'consultation-tab'} role="tab"
          aria-selected={isFilter === filter} aria-controls="session-workspace" tabIndex={isFilter === filter ? 0 : -1}
          disabled={filter && (!working || (connecting && !isFilter))} onClick={() => selectTab(filter)}
          onKeyDown={e => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault();
            const target = e.key === 'Home' ? false : e.key === 'End' ? true : !isFilter;
            if (target && (!working || connecting)) return;
            selectTab(target); document.getElementById(target ? 'filter-tab' : 'consultation-tab')?.focus();
          }}>{filter ? '실시간 필터' : '상담 시뮬레이션'}</button>)}
      </div><span className="prototype-tag">개발 시제품</span></div>
      <div className="topbar-actions"><button className="new-session" disabled={isFilter} onClick={() => setSettingsOpen(true)}>기본 설정{settingsWarning && ' · 확인 필요'}</button>
        <button className="new-session" onClick={() => resetDialog.current?.showModal()}><Icon name="plus" size={17}/>새 상담</button></div>
    </header>

    <div className="workspace" id="session-workspace" role="tabpanel" aria-labelledby={isFilter ? 'filter-tab' : 'consultation-tab'}>
      <aside className="left-panel"><div className="section-heading"><span className="step-number">01</span><h2>촬영 환경</h2></div>
        <p className="panel-intro">편안하게 정면을 바라보세요.<br/>한 사람의 얼굴만 담아 주세요.</p>
        <div className="camera-card"><div className="camera-card-title"><Icon name="camera"/><strong>카메라</strong><span className={`dot ${source === 'camera' ? 'on' : ''}`}/></div>
          <label className="field-label" htmlFor="camera-select">입력 장치</label>
          <select id="camera-select" value={device} disabled={connecting || !working} onChange={e => { const value = e.target.value; setDevice(value); if (source === 'camera') void connectCamera(value); }}>
            <option value="">기본 카메라</option>{devices.map((item, index) => <option key={item.deviceId || index} value={item.deviceId}>{item.label || `웹캠 ${index + 1}`}</option>)}
          </select>
          <button className={`camera-connect ${source === 'camera' ? 'connected' : ''}`} disabled={!working} onClick={() => source === 'camera' || connecting ? disconnect() : void connectCamera()}>
            <Icon name="camera" size={18}/>{connecting ? '연결 취소' : source === 'camera' ? '웹캠 연결 해제' : '웹캠 연결'}</button>
          <p className="device-hint">{source === 'camera' ? cameraLabel : '일반 USB 웹캠을 연결할 수 있어요.'}</p>
        </div>
        <section className="beauty-panel" aria-label="촬영 보정">
          <h3>피부 · 화면 톤</h3>
          <div className="beauty-presets" role="group" aria-label="피부 보정 프리셋">
            {(['off', 'natural', 'soft', 'radiant', 'warm', 'clear'] as const).map((key, i) => <button key={key} disabled={!working}
              aria-pressed={BEAUTY_CONTROLS.every(({ key: field }) => beauty[field] === BEAUTY_PRESETS[key][field])}
              onClick={() => setBeauty({ ...BEAUTY_PRESETS[key] })}>{['보정 없음', '자연스럽게', '소프트', '화사하게', '따뜻하게', '맑게'][i]}</button>)}
          </div>
          <button className="saved-beauty" disabled={!working} onClick={() => setBeauty({ ...preferences.beauty })}>내 기본 보정 불러오기</button>
          {BEAUTY_CONTROLS.filter(c => c.key === 'smoothing' || c.key === 'brightness').map(beautyControl)}
          <details className="control-details beauty-details"><summary>색감 세부 조절</summary>
            {BEAUTY_CONTROLS.filter(c => c.key !== 'smoothing' && c.key !== 'brightness').map(beautyControl)}
            <p className="small-note">색온도 − 차갑게 / + 따뜻하게<br/>색조 − 초록 / + 분홍</p>
          </details>
          <p>원본과 가상에 같은 보정을 적용합니다.</p>
        </section>
        <details className="shooting-tips control-details"><summary>촬영 도움말</summary><div><span>1</span><p>카메라를 <strong>눈높이</strong>에 맞추기</p></div><div><span>2</span><p>얼굴 앞에서 <strong>고르게</strong> 비추기</p></div><div><span>3</span><p>머리카락·손으로 <strong>코를 가리지 않기</strong></p></div><p className="small-note">화면 톤은 얼굴 각도와 관계없이 유지됩니다. 피부 질감 보정은 얼굴 위치가 확인될 때 적용됩니다.</p></details>
        <div className="privacy-note"><Icon name="shield" size={18}/><p>이 기기에서 처리 · 영상 자동 저장 안 함</p></div>
      </aside>

      <main className="main-panel"><div className="page-heading"><h1>{isFilter ? '설정한 모습 그대로, 실시간으로' : '코 윤곽을 함께 확인하세요'}</h1></div>
        {isFilter && <div className="filter-controls">
          <label htmlFor="filter-camera-select">입력 장치</label>
          <select id="filter-camera-select" value={device} disabled={connecting || !working}
            onChange={e => { const value = e.target.value; setDevice(value); if (source === 'camera') void connectCamera(value); }}>
            <option value="">기본 카메라</option>{devices.map((item, index) => <option key={item.deviceId || index} value={item.deviceId}>{item.label || `웹캠 ${index + 1}`}</option>)}
          </select>
          <button className="camera-connect" disabled={!working} onClick={() => source === 'camera' || connecting ? disconnect() : void connectCamera()}>
            <Icon name="camera" size={18}/>{connecting ? '연결 취소' : source === 'camera' ? '웹캠 연결 해제' : '웹캠 연결'}</button>
          <button className="secondary-button" onClick={() => { selectTab(false); document.getElementById('consultation-tab')?.focus(); }}>보정 변경</button>
        </div>}
        <section className="preview-card" aria-label={isFilter ? '실시간 필터 미리보기' : '상담 미리보기'}><div className="preview-toolbar">{isFilter ? <span className="filter-lock">코 윤곽 · 촬영 보정 고정</span> : <div className="view-tabs" role="group" aria-label="보기 모드">
          {(['compare', 'simulation', 'original'] as ViewMode[]).map((value, i) => <button key={value} className={mode === value ? 'active' : ''} aria-pressed={mode === value} onClick={() => setMode(value)}>{i === 0 && <Icon name="compare" size={15}/>} {['비교', '가상 보기', '원본'][i]}</button>)}</div>}
          <span className={`source-badge ${source === 'camera' && !paused ? 'live' : ''}`}><span className="dot"/>{source === 'camera' ? paused ? 'PAUSED' : 'LIVE' : 'STANDBY'}</span></div>
          <div className={`photo-stage ${hasFrame ? 'has-frame' : ''}`}>
            <Viewport ref={viewport} adjustments={displayAdjustments} beauty={displayBeauty} correctionActive={correctionActive} liveFilter={isFilter} mode={isFilter ? 'simulation' : hold ? 'original' : mode} split={split} mirror={source === 'camera' && mirror} ready={hasFrame} onSplit={setSplit} onError={fatal} showGuide={!isFilter && guide} selectedControl={selectedControl}/>
            {!hasFrame && <div className="empty-preview"><div className="face-outline"><Icon name="face" size={64}/></div><h3>{engine === 'loading' ? '시뮬레이션을 준비하고 있어요' : connecting ? '웹캠 영상을 기다리고 있어요' : error ? '영상을 확인해 주세요' : '얼굴이 보이면 시작할 수 있어요'}</h3><p>{error || (connecting ? '카메라 권한창이 뜨면 허용해 주세요. 연결된 웹캠의 첫 영상을 기다리고 있습니다.' : source === 'off' ? isFilter ? '위에서 웹캠을 연결하세요. 고정한 보정값으로 시작합니다.' : '왼쪽에서 웹캠을 연결하세요.' : '웹캠에서 첫 영상을 기다리고 있습니다.')}</p>{engine === 'error' && <button className="secondary-button" onClick={() => window.location.reload()}>앱 다시 불러오기</button>}</div>}
            {hasFrame && (!activeQuality?.ok || (isFilter && filterStrength === 0)) && <div className="quality-overlay"><Icon name="face"/><span>{status}<small>{correctionActive ? '촬영 보정은 유지되며 코 변형은 대기합니다.' : '현재 원본 영상만 표시하고 있습니다.'}</small></span></div>}
          </div>
          <div className="preview-bottom"><div className={`tracking-status ${activeQuality?.ok && (!isFilter || filterStrength > 0) ? 'valid' : ''}`}><span className="dot"/>{status}</div><div className="preview-actions">
            <button disabled={source !== 'camera' || (!hasFrame && !paused)} onClick={togglePause} title="화면을 멈춰도 웹캠 연결은 유지됩니다"><Icon name={paused ? 'play' : 'pause'} size={16}/>{paused ? '다시 재생' : '일시정지'}</button>
            {!isFilter && <button disabled={!hasFrame} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setHold(true); }} onPointerUp={() => setHold(false)} onPointerCancel={() => setHold(false)} onBlur={() => setHold(false)} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setHold(true); } }} onKeyUp={() => setHold(false)}><Icon name="eye" size={17}/>눌러서 원본</button>}
          </div></div>
        </section>
        <div className="under-preview"><div className="preview-options">{!isFilter && <label><input type="checkbox" checked={guide} onChange={e => setGuide(e.target.checked)}/>조절 영역 표시</label>}<label><input type="checkbox" disabled={source !== 'camera'} checked={mirror} onChange={e => setMirror(e.target.checked)}/>거울 보기</label></div><details className="camera-status"><summary>촬영 상태</summary><p>{source === 'camera' ? !hasFrame ? '웹캠 연결 유지 · 영상 대기' : paused ? `${resolution} · 정지 프레임 · 웹캠 연결 유지` : `${metrics.fps} fps · 프레임 처리 ${metrics.ms} ms · ${resolution}` : '카메라가 꺼져 있습니다'}</p></details></div>
        {filterLook && <details className="filter-summary control-details" aria-label="고정된 필터 설정"><summary>적용된 설정 보기</summary><span>{NOSE_CONTROLS.map(({ key, label }) => `${label} ${displayAdjustments[key] > 0 ? '+' : ''}${displayAdjustments[key]}`).join(' · ')}</span><small>{beautyLabel(displayBeauty)}</small></details>}
        <div className="simulation-notice"><Icon name="info" size={18}/><p><strong>가상 시뮬레이션이며, 실제 수술 결과와 다를 수 있습니다.</strong><span>{isFilter ? '옆모습을 따라 코 윤곽을 표현합니다. 얼굴 추적이 끊기면 코 변형을 멈추며 화면 톤은 유지됩니다.' : '정면 영상의 2D 윤곽을 조절하는 시제품입니다. 코의 실제 높이·구조·수술 가능성을 예측하지 않습니다.'}</span></p></div>
      </main>

      <aside className="right-panel"><div className="control-scroll"><div className="section-heading"><span className="step-number">02</span><h2>윤곽 조절</h2></div><p className="panel-intro">작은 변화부터 천천히 살펴보세요.</p>
        <div className="nose-preset"><div className="preset-title"><label className="preset-field" htmlFor="nose-type">코 타입</label><button className="preset-edit" onClick={() => setSettingsOpen(true)}>프리셋 설정</button></div>
          <select id="nose-type" disabled={!canAdjust} value={selectedNoseId} onChange={event => {
            const preset = getNosePreset(preferences, event.target.value); setSelectedNoseId(preset.id);
            setAdjustments({ ...preset.adjustments }); setToast(`${preset.name}의 저장된 조절값을 적용했습니다.`);
          }}>{preferences.nosePresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <button className="preset-apply" disabled={!canAdjust} aria-pressed={NOSE_CONTROLS.every(({ key }) => adjustments[key] === selectedNose.adjustments[key])}
          onClick={() => { setAdjustments({ ...selectedNose.adjustments }); setToast(`${selectedNose.name}의 저장된 조절값을 적용했습니다.`); }}>선택한 타입 적용</button>
          </div>
        <div className="adjustment-heading"><span>직접 조절</span><button disabled={!canAdjust} onClick={() => { setAdjustments({ ...ZERO }); setSelectedControl(undefined); }}><Icon name="reset" size={14}/>초기화</button></div>
        {canAdjust && !regionsAvailable && <p className="region-note" role="status">코끝·콧날개·콧구멍·비주 경계가 선명하지 않아 세부 조절을 기다립니다. 코를 가리지 말고 정면을 바라봐 주세요.</p>}
        <div className="sliders basic-controls">{NOSE_CONTROLS.filter(c => c.basic).map(noseControl)}</div>
        <details className="control-details nose-details"><summary><span>세부 조절</span><small>{detailCount ? `${detailCount}개 적용 중` : '적용 없음'}</small></summary>
          {NOSE_CONTROLS.filter(c => !c.basic && c.key !== 'projection').map(noseControl)}
          <div className="profile-control">{NOSE_CONTROLS.filter(c => c.key === 'projection').map(noseControl)}
            <p className="profile-control-note">정면에서는 변화가 보이지 않습니다.<br/>값을 정한 뒤 실시간 필터에서 확인하세요.</p>
            <button className="secondary-button" disabled={!canAdjust} onClick={() => { selectTab(true); document.getElementById('filter-tab')?.focus(); }}>옆모습 확인</button>
          </div>
        </details>
        <p className="relative-note">0은 원본 · 수치는 상대값이며 mm가 아닙니다.</p>
        <div className="options-section"><div className="section-heading"><span className="step-number">03</span><h2>비교안 보관</h2></div><p className="panel-intro">마음에 드는 설정을 잠시 담아두세요.</p>
          <div className="slots">{slots.map((slot, index) => <div className={`slot ${slot ? 'filled' : ''}`} key={index}><button aria-label={`${'ABC'[index]}안 ${slot ? '불러오기' : '저장'}`} disabled={!canAdjust} onClick={() => { if (slot) { setAdjustments(sanitizeAdjustments(slot)); setToast(`${'ABC'[index]}안 설정을 불러왔습니다.`); } else { setSlots(current => current.map((value, i) => i === index ? { ...adjustments } : value)); setToast(`${'ABC'[index]}안에 현재 설정을 담았습니다.`); } }}><strong>{'ABC'[index]}</strong><small>{slot ? '불러오기' : '+ 저장'}</small></button>{slot && <button className="slot-replace" disabled={!canAdjust} aria-label={`${'ABC'[index]}안 현재 설정으로 갱신`} onClick={() => { setSlots(current => current.map((value, i) => i === index ? { ...adjustments } : value)); setToast(`${'ABC'[index]}안을 현재 설정으로 갱신했습니다.`); }}>갱신</button>}</div>)}</div><p className="small-note">조절값만 임시 보관합니다. 새 상담을 시작하거나 입력을 바꾸면 비워집니다.</p>
        </div>
        </div><div className="export-section"><button className="primary-button export-button" disabled={!canAdjust} onClick={openExport}><Icon name="save" size={18}/>비교 이미지 저장</button><p>저장 전 미리보기와 동의를 확인합니다.</p></div>
      </aside>
    </div>
    <footer className="app-footer"><span><span className={`dot ${working ? 'on' : ''}`}/>{working ? '로컬 엔진 준비 완료' : engine === 'loading' ? '로컬 엔진 준비 중' : '엔진 확인 필요'}</span><span>NoseView 0.9.0 · 상담용 개발 시제품</span><span>외부 서버 연결 없음</span></footer>
    {toast && <div className="toast" role="status"><Icon name="check" size={17}/>{toast}</div>}
    {exportImage && <ExportDialog dataUrl={exportImage} correctionLabel={beautyLabel(beauty)} onClose={() => setExportImage(null)} onSaved={() => setToast('비교 이미지 저장을 완료했습니다.')}/>}
    {settingsOpen && <SettingsDialog preferences={preferences} selectedNoseId={selectedNoseId} beauty={beauty} adjustments={adjustments} warning={settingsWarning} onSave={savePreferences} onClose={() => setSettingsOpen(false)}/>}
    <dialog ref={resetDialog} className="reset-dialog" aria-labelledby="reset-title"><h2 id="reset-title">새 상담을 시작할까요?</h2><p>카메라를 끄고 화면과 임시 비교안 A/B/C를 비웁니다. 직접 저장한 PNG 파일은 그대로 남습니다.</p><div className="dialog-actions"><button className="secondary-button" onClick={() => resetDialog.current?.close()}>계속 상담하기</button><button className="primary-button" onClick={() => { disconnect(); resetDialog.current?.close(); if (!failed.current) setToast('새 상담을 준비했습니다.'); }}>새 상담 시작</button></div></dialog>
  </div>;
}
