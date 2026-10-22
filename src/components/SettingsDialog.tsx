import { useEffect, useRef, useState } from 'react';
import { beautyLabel, type BeautySettings } from '../core/beauty';
import { NOSE_CONTROLS, type Adjustments } from '../core/adjustments';
import { MAX_NOSE_PRESETS, MAX_PRESET_NAME, presetNameKey, validateNosePresets, type NosePreset, type Preferences } from '../core/preferences';

type Props = { preferences: Preferences; selectedNoseId: string; beauty: BeautySettings; adjustments: Adjustments; warning: string;
  onSave: (value: Preferences) => string | null; onClose: () => void };

export function SettingsDialog({ preferences, selectedNoseId, beauty, adjustments, warning, onSave, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [presets, setPresets] = useState(() => preferences.nosePresets.map(p => ({ ...p, adjustments: { ...p.adjustments } })));
  const [editId, setEditId] = useState(selectedNoseId), [defaultId, setDefaultId] = useState(preferences.defaultNoseId);
  const nameInput = useRef<HTMLInputElement>(null);
  const selected = presets.find(p => p.id === editId)!;
  const nose = selected.adjustments;
  const [autoNose, setAutoNose] = useState(preferences.autoNose), [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  function edit(patch: Partial<NosePreset>) { setPresets(current => current.map(p => p.id === editId ? { ...p, ...patch } : p)); setError(''); }
  function add() {
    if (presets.length >= MAX_NOSE_PRESETS) return;
    const names = new Set(presets.map(p => presetNameKey(p.name)));
    let name = '새 코 타입', suffix = 2;
    while (names.has(presetNameKey(name))) name = `새 코 타입 ${suffix++}`;
    const id = crypto.randomUUID();
    setPresets(current => [...current, { id, name, adjustments: { ...adjustments } }]); setEditId(id); setError('');
    nameInput.current?.focus();
  }
  function dismiss() { dialog.current?.close(); onClose(); }
  return <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-title" onCancel={event => { event.preventDefault(); dismiss(); }}>
    <div className="dialog-heading"><h2 id="settings-title">기본 설정</h2><button className="secondary-button" onClick={dismiss}>설정 닫기</button></div>
    <p className="settings-intro">저장하면 다음 실행·웹캠 연결·새 상담부터 이 값을 사용합니다.</p>
    {warning && <p className="form-error" role="alert">{warning}</p>}
    <section><h3>촬영 기본값</h3><p>현재 화면에서 조절한 보정값을 기본값으로 저장합니다.</p>
      <p className="settings-summary">{beautyLabel(beauty)}</p><p>화면 왼쪽에서 느낌을 조절한 뒤 이 창을 다시 열어 저장하세요.</p></section>
    <section><h3>코 타입 관리</h3><p>타입마다 이름과 윤곽을 저장하세요. 실제 인물의 코를 측정하거나 재현한 값은 아닙니다.</p>
      <label className="preset-field" htmlFor="preset-editor">편집할 코 타입</label>
      <div className="preset-toolbar"><select id="preset-editor" value={editId} onChange={event => { setEditId(event.target.value); setError(''); }}>
        {presets.map(p => <option key={p.id} value={p.id}>{p.name.trim() || '이름 입력 필요'}</option>)}</select>
        <button className="secondary-button" disabled={presets.length >= MAX_NOSE_PRESETS} onClick={add}>타입 추가</button></div>
      <label className="preset-field" htmlFor="preset-name">타입 이름</label>
      <input ref={nameInput} className="preset-name" id="preset-name" type="text" maxLength={MAX_PRESET_NAME} value={selected.name} onChange={event => edit({ name: event.target.value })}/>
      <p className="preset-count">{presets.length} / {MAX_NOSE_PRESETS}개 · 이름은 최대 {MAX_PRESET_NAME}자</p>
      <button className="secondary-button" onClick={() => edit({ adjustments: { ...adjustments } })}>현재 코 조절값 가져오기</button>
      {Array.from(new Set(NOSE_CONTROLS.map(control => control.group))).map(group => <fieldset className="nose-control-group" key={group}><legend>{group}</legend>
        {NOSE_CONTROLS.filter(control => control.group === group).map(({ key, label, hint, low, high }) => <div className="slider-field" key={key}>
          <div className="slider-label"><label htmlFor={`preset-${key}`}>프리셋 {label}</label><div className="slider-value"><output htmlFor={`preset-${key}`}>{nose[key] > 0 ? '+' : ''}{nose[key]}</output>
            <button className="control-reset" aria-label={`프리셋 ${label} 초기화`} onClick={() => edit({ adjustments: { ...nose, [key]: 0 } })}>0</button></div></div>
          <p id={`preset-${key}-hint`}>{hint}</p>
          <input id={`preset-${key}`} type="range" min="-100" max="100" step="1" value={nose[key]} aria-describedby={`preset-${key}-hint`}
            onChange={event => edit({ adjustments: { ...nose, [key]: Number(event.target.value) } })}/>
          <div className="range-labels"><span>{low}</span><span>0</span><span>{high}</span></div>
        </div>)}
      </fieldset>)}
      <label className="preset-field" htmlFor="default-nose">기본 코 타입</label>
      <select id="default-nose" value={defaultId} onChange={event => setDefaultId(event.target.value)}>
        {presets.map(p => <option key={p.id} value={p.id}>{p.name.trim() || '이름 입력 필요'}</option>)}</select>
      <label className="settings-check"><input type="checkbox" checked={autoNose} onChange={event => setAutoNose(event.target.checked)}/>새 상담에 코 프리셋 자동 적용</label>
      <p>코 변형은 정면 얼굴 조건을 만족할 때 표시됩니다. 저장 후 현재 상담에서는 오른쪽 코 타입을 선택하거나 적용 버튼을 누르세요.</p>
    </section>
    <p className="settings-intro">타입 이름과 보정 설정만 이 기기에 저장합니다. 얼굴 영상과 임시 비교안 A/B/C는 저장하지 않습니다.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button className="secondary-button" onClick={dismiss}>취소</button>
      <button className="primary-button" onClick={() => {
        const result = validateNosePresets(presets, defaultId) || onSave({ beauty: { ...beauty }, nosePresets: presets, defaultNoseId: defaultId, autoNose });
        if (result) setError(result); else dismiss();
      }}>기본 설정 저장</button></div>
  </dialog>;
}
