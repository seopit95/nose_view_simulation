import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsDialog } from '../src/components/SettingsDialog';
import { DEFAULT_PREFERENCES, parsePreferences, serializePreferences } from '../src/core/preferences';

const legacy = { version: 1, beauty: { ...DEFAULT_PREFERENCES.beauty, brightness: 27 },
  nosePreset: { width: -32, bridge: -24, tip: 21 }, autoNose: true };
const preset = (id = 'custom', name = '자연스러운 라인') => ({ id, name, adjustments: { width: -40, bridge: -20, projection: 47, tip: 15, tipSize: -26, alarLift: 33, nostrilExposure: -19, columella: 12 } });
const current = () => ({ beauty: DEFAULT_PREFERENCES.beauty, autoNose: true,
  nosePresets: [preset(), preset('second', '선명한 라인')], defaultNoseId: 'second' });

it('버전1의 저장값과 자동 적용 여부를 이름 있는 단일 타입으로 이전한다', () => {
  const raw = JSON.stringify(legacy), result = parsePreferences(raw);
  expect(result.warning).toBe('');
  expect(result.value).toEqual({ beauty: legacy.beauty, autoNose: true, defaultNoseId: 'nose-default',
    nosePresets: [{ id: 'nose-default', name: '이효리 코 타입', adjustments: { width: -32, bridge: -24, projection: 24, tip: 21, tipSize: 0, alarLift: 0, nostrilExposure: 0, columella: 0 } }] });
  expect(JSON.parse(serializePreferences(result.value)).version).toBe(3);
});

it('이름 있는 여러 타입과 별도 기본 선택이 저장 후 복원된다', () => {
  const value = current();
  expect(parsePreferences(serializePreferences(value))).toEqual({ value, warning: '' });
});

it('저장 경계는 알려진 필드만 저장하며 숫자를 범위 안으로 보정한다', () => {
  const input = { ...current(), beauty: { ...DEFAULT_PREFERENCES.beauty, brightness: 250, tint: NaN, frames: ['private'] },
    nosePresets: [{ ...preset('custom', '  부드러운 라인  '), image: 'private', adjustments: { width: -400, bridge: 20, projection: 150, tip: Infinity, tipSize: -26, alarLift: 33, nostrilExposure: -19, columella: NaN, landmarks: [1] } }],
    defaultNoseId: 'custom', frames: ['private'] };
  const stored = JSON.parse(serializePreferences(input));
  expect(Object.keys(stored).sort()).toEqual(['autoNose', 'beauty', 'defaultNoseId', 'nosePresets', 'version']);
  expect(stored.beauty.brightness).toBe(100); expect(stored.beauty.tint).toBe(0);
  expect(stored.nosePresets).toEqual([{ id: 'custom', name: '부드러운 라인', adjustments: { width: -100, bridge: 20, projection: 100, tip: 0, tipSize: -26, alarLift: 33, nostrilExposure: -19, columella: 0 } }]);
  expect(JSON.stringify(stored)).not.toMatch(/private|landmarks|frames/);
  expect(parsePreferences(JSON.stringify(stored)).warning).toBe('');
});

it('잘못된 이름·ID·기본 선택·타입 수는 저장을 거부하고 읽기에서는 안내한다', () => {
  for (const edit of [
    { nosePresets: [] }, { defaultNoseId: 'missing' },
    { nosePresets: [preset('second', '   ')] }, { nosePresets: [preset('second', '가'.repeat(33))] },
    { nosePresets: [preset('second', '줄\n바꿈')] }, { nosePresets: [preset('bad id')], defaultNoseId: 'bad id' },
    { nosePresets: [preset('second'), preset('second', '다른 타입')] },
    { nosePresets: [preset('first', 'TYPE'), preset('second', ' ｔｙｐｅ ')] },
    { nosePresets: Array.from({ length: 51 }, (_, i) => preset(`id-${i}`, `타입 ${i}`)), defaultNoseId: 'id-0' },
  ]) {
    const input = { ...current(), ...edit };
    expect(() => serializePreferences(input)).toThrow();
    expect(parsePreferences(JSON.stringify({ version: 3, ...input })).warning).not.toBe('');
  }
});

it('최대50개와 이름32자도 손실 없이 복원되며 읽기에서도 미지 필드를 제거한다', () => {
  const value = { ...current(), nosePresets: Array.from({ length: 50 }, (_, i) => preset(`id-${i}`, `${i}`.padEnd(32, '가'))), defaultNoseId: 'id-49' };
  expect(parsePreferences(serializePreferences(value)).value).toEqual(value);
  const result = parsePreferences(JSON.stringify({ version: 3, ...current(), frame: 'private',
    nosePresets: current().nosePresets.map(p => ({ ...p, image: 'private', adjustments: { ...p.adjustments, landmarks: [] } })) }));
  expect(result.value).toEqual(current());
});

it('기존·현재 버전의 누락/타입/비정상 숫자는 조용히 적용하지 않는다', () => {
  for (const base of [legacy, { version: 2, beauty: legacy.beauty, autoNose: false, defaultNoseId: 'second',
    nosePresets: [{ id: 'second', name: '이전 타입', adjustments: { width: -20, bridge: 10, tip: 7 } }] }, { version: 3, ...current() }]) {
    for (const edit of [{ autoNose: 'true' }, { beauty: null }, { beauty: { ...DEFAULT_PREFERENCES.beauty, saturation: null } },
      base.version === 1 ? { nosePreset: { width: '15', bridge: 0, tip: 0 } } : { nosePresets: [{ ...preset('second'), adjustments: { width: null, bridge: 0, tip: 0 } }] }]) {
      expect(parsePreferences(JSON.stringify({ ...base, ...edit })).warning).not.toBe('');
    }
  }
});

it('정상 JSON이어도 크기 제한을 넘으면 복구 안내를 표시한다', () => {
  const raw = JSON.stringify({ version: 3, ...current(), extra: 'x'.repeat(32768) });
  expect(parsePreferences(raw).warning).not.toBe('');
  expect(parsePreferences(raw).value).toEqual(DEFAULT_PREFERENCES);
});


it('버전2의 여러 타입은 ID·이름·기본 선택과 기존 측면 효과를 보존한다', () => {
  const value = { version: 2, beauty: legacy.beauty, autoNose: false, defaultNoseId: 'sharp', nosePresets: [
    { id: 'soft', name: '부드러운 코', adjustments: { width: -51, bridge: -28, tip: 14 } },
    { id: 'sharp', name: '선명한 코', adjustments: { width: 23, bridge: 17, tip: -9 } },
  ] };
  const raw = JSON.stringify(value), result = parsePreferences(raw);
  expect(result.warning).toBe('');
  expect(result.value).toEqual({ beauty: legacy.beauty, autoNose: false, defaultNoseId: 'sharp', nosePresets: [
    { id: 'soft', name: '부드러운 코', adjustments: { width: -51, bridge: -28, projection: 28, tip: 14, tipSize: 0, alarLift: 0, nostrilExposure: 0, columella: 0 } },
    { id: 'sharp', name: '선명한 코', adjustments: { width: 23, bridge: 17, projection: -17, tip: -9, tipSize: 0, alarLift: 0, nostrilExposure: 0, columella: 0 } },
  ] });
  expect(JSON.stringify(value)).toBe(raw);
  expect(parsePreferences(serializePreferences(result.value))).toEqual(result);
});

it('기존 저장값의 새 필드는 무시하고 측면 값만 기존 콧대에서 이전한다', () => {
  for (const version of [1, 2]) {
    const old = { width: -150, bridge: 130, tip: 17, projection: -12, tipSize: 35 };
    const raw = JSON.stringify({ version, beauty: legacy.beauty, autoNose: true,
      ...(version === 1 ? { nosePreset: old } : { defaultNoseId: 'custom', nosePresets: [{ id: 'custom', name: '이전 설정', adjustments: old }] }) });
    expect(parsePreferences(raw).value.nosePresets[0].adjustments).toEqual({ width: -100, bridge: 100, projection: -100, tip: 17, tipSize: 0, alarLift: 0, nostrilExposure: 0, columella: 0 });
  }
});

it('설정 편집기는 8개 부위 조절값과 개별 초기화를 제공한다', () => {
  const markup = renderToStaticMarkup(createElement(SettingsDialog, { preferences: current(), selectedNoseId: 'custom', beauty: current().beauty,
    adjustments: preset().adjustments, warning: '', onSave: () => null, onClose: () => {} }));
  for (const label of ['콧볼 폭', '콧대 폭', '옆모습 콧대', '코끝 상하', '코끝 크기', '콧날개 상하', '콧구멍 윗선', '비주 상하']) {
    expect(markup).toContain(`>프리셋 ${label}</label>`);
    expect(markup).toContain(`aria-label="프리셋 ${label} 초기화"`);
  }
  expect(markup.match(/type="range"/g)).toHaveLength(8);
});
