import { expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, parsePreferences, serializePreferences } from '../src/core/preferences';

it('없거나 손상된 기본 설정이 앱 시작을 막지 않는다', () => {
  expect(parsePreferences(null)).toEqual({ value: DEFAULT_PREFERENCES, warning: '' });
  for (const raw of ['{', 'null', '[]', '{"version":3}', 'x'.repeat(32769)]) {
    const result = parsePreferences(raw);
    expect(result.value).toEqual(DEFAULT_PREFERENCES);
    expect(result.warning.length).toBeGreaterThan(0);
  }
});

it('저장 경계는 허용된 설정 필드만 보관한다', () => {
  const input = { ...DEFAULT_PREFERENCES, beauty: { ...DEFAULT_PREFERENCES.beauty, brightness: 250, tint: NaN },
    nosePresets: [{ ...DEFAULT_PREFERENCES.nosePresets[0], adjustments: { width: -400, bridge: 20, projection: 35, tip: Infinity, tipSize: 200, alarLift: -23, nostrilExposure: 45, columella: -12, landmarks: [1] } }], autoNose: true, frames: ['patient'], landmarks: [1] };
  const raw = serializePreferences(input);
  const stored = JSON.parse(raw);
  expect(Object.keys(stored).sort()).toEqual(['autoNose', 'beauty', 'defaultNoseId', 'nosePresets', 'version']);
  expect(stored.version).toBe(3);
  expect(stored.beauty.brightness).toBe(100); expect(stored.beauty.tint).toBe(0);
  expect(stored.nosePresets[0].adjustments).toEqual({ width: -100, bridge: 20, projection: 35, tip: 0, tipSize: 100, alarLift: -23, nostrilExposure: 45, columella: -12 });
  expect(parsePreferences(raw).value).toEqual({ beauty: stored.beauty, nosePresets: stored.nosePresets, defaultNoseId: stored.defaultNoseId, autoNose: true });
});

it('부분/타입 오류 설정은 조용히 적용하지 않고 안내와 기본값으로 복구한다', () => {
  for (const edit of [{ autoNose: 'true' }, { beauty: null }, { nosePreset: { width: '15', bridge: 0, tip: 0 } },
    { beauty: { ...DEFAULT_PREFERENCES.beauty, saturation: null } }]) {
    const result = parsePreferences(JSON.stringify({ version: 1, beauty: DEFAULT_PREFERENCES.beauty, nosePreset: { width: 0, bridge: 0, tip: 0 }, autoNose: false, ...edit }));
    expect(result.warning.length).toBeGreaterThan(0); expect(result.value).toEqual(DEFAULT_PREFERENCES);
  }
});


it('버전3은 8개 조절값이 모두 유한한 숫자여야 읽고 누락·타입 오류는 복구한다', () => {
  const adjustments = { width: -20, bridge: -13, projection: 42, tip: 17, tipSize: -22, alarLift: 31, nostrilExposure: -46, columella: 12 };
  const base = { version: 3, ...DEFAULT_PREFERENCES, nosePresets: [{ id: 'nose-default', name: '설정 검사', adjustments }] };
  expect(parsePreferences(JSON.stringify(base)).warning).toBe('');
  for (const key of Object.keys(adjustments)) {
    for (const bad of [undefined, null, '5', false]) {
      const broken = { ...base, nosePresets: [{ ...base.nosePresets[0], adjustments: { ...adjustments, [key]: bad } }] };
      const result = parsePreferences(JSON.stringify(broken));
      expect(result.warning, `${key}: ${String(bad)}`).not.toBe('');
      expect(result.value).toEqual(DEFAULT_PREFERENCES);
    }
    const nonfinite = JSON.stringify(base).replace(`"${key}":${adjustments[key as keyof typeof adjustments]}`, `"${key}":1e999`);
    expect(parsePreferences(nonfinite).warning, key).not.toBe('');
  }
  expect(parsePreferences(JSON.stringify({ ...base, version: 4 })).warning).not.toBe('');
});
