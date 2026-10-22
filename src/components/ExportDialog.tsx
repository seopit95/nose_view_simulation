import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export function ExportDialog({ dataUrl, correctionLabel, onClose, onSaved }: { dataUrl: string; correctionLabel: string; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [consent, setConsent] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function save() {
    if (!consent || saving) return;
    setSaving(true); setError('');
    try {
      if (window.noseview) {
        const result = await window.noseview.savePng(dataUrl);
        if (result.error) { setError(result.error); return; }
        if (!result.saved) return;
      } else {
        const anchor = document.createElement('a'); anchor.href = dataUrl;
        anchor.download = `NoseView-${new Date().toISOString().replaceAll(':', '-')}.png`; anchor.click();
      }
      onSaved(); onClose();
    } catch { setError('파일을 저장하지 못했습니다. 저장 위치와 권한을 확인해 주세요.'); }
    finally { setSaving(false); }
  }
  return <dialog ref={dialog} className="export-dialog" onCancel={e => { e.preventDefault(); if (!saving) onClose(); }} aria-labelledby="export-title">
    <div className="dialog-heading"><div><span className="eyebrow">EXPORT PREVIEW</span><h2 id="export-title">비교 이미지 저장</h2></div><button className="icon-button" aria-label="저장 창 닫기" disabled={saving} onClick={onClose}><Icon name="close"/></button></div>
    <img className="export-preview" src={dataUrl} alt="원본과 가상 시뮬레이션 및 안내 문구가 포함된 저장 이미지 미리보기" />
    <p className="export-correction">{correctionLabel}</p>
    <p className="small-note">얼굴 이미지가 포함된 PNG 파일로 저장됩니다. 저장 위치는 직접 선택하며, 앱에는 상담 기록이 남지 않습니다.</p>
    <label className="consent-row"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>촬영 대상자의 이미지 저장 동의를 확인했습니다.</span></label>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="dialog-actions"><button className="secondary-button" disabled={saving} onClick={onClose}>취소</button><button className="primary-button" disabled={!consent || saving} onClick={() => void save()}><Icon name="save"/>{saving ? '저장 중…' : 'PNG 저장'}</button></div>
  </dialog>;
}
