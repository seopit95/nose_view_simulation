import { BEAUTY_CONTROLS, BEAUTY_PRESETS, sanitizeBeauty, type BeautySettings } from './beauty';
import { NOSE_CONTROLS, ZERO, sanitizeAdjustments, type Adjustments } from './adjustments';

export type NosePreset = { id: string; name: string; adjustments: Adjustments };
export type Preferences = { beauty: BeautySettings; nosePresets: NosePreset[]; defaultNoseId: string; autoNose: boolean };
// Keep the origin key stable so existing installations can read their settings.
export const PREFERENCES_KEY = 'noseview.preferences.v1';
export const MAX_NOSE_PRESETS = 50, MAX_PRESET_NAME = 32;
// A user-named, editable starting point; not measurements of a public figure.
export const DEFAULT_PREFERENCES: Preferences = {
  beauty: { ...BEAUTY_PRESETS.natural }, autoNose: false, defaultNoseId: 'nose-default',
  nosePresets: [{ id: 'nose-default', name: '이효리 코 타입', adjustments: { ...ZERO, width: -18, bridge: -10, projection: 10, tip: 8 } }],
};
const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const finiteNose = (v: unknown): v is Adjustments => record(v) &&
  NOSE_CONTROLS.every(({ key }) => typeof v[key] === 'number' && Number.isFinite(v[key]));
type LegacyNose = Pick<Adjustments, 'width' | 'bridge' | 'tip'>;
const finiteLegacyNose = (v: unknown): v is LegacyNose => record(v) &&
  ['width', 'bridge', 'tip'].every(key => typeof v[key] === 'number' && Number.isFinite(v[key]));
const migrateNose = ({ width, bridge, tip }: LegacyNose) => sanitizeAdjustments({ ...ZERO, width, bridge, projection: -bridge, tip });
export const presetNameKey = (name: string) => name.trim().normalize('NFKC').toLowerCase();

export function validateNosePresets(presets: NosePreset[], defaultId: string): string {
  if (!presets.length || presets.length > MAX_NOSE_PRESETS) return `코 타입은 1개부터 ${MAX_NOSE_PRESETS}개까지 저장할 수 있습니다.`;
  const ids = new Set<string>(), names = new Set<string>();
  for (const preset of presets) {
    if (typeof preset.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(preset.id) || ids.has(preset.id)) return '코 타입 식별자가 올바르지 않습니다.';
    if (typeof preset.name !== 'string' || !preset.name.trim() || preset.name.length > MAX_PRESET_NAME || /\p{Cc}/u.test(preset.name)) return `타입 이름을 1~${MAX_PRESET_NAME}자로 입력해 주세요. 공백만 쓰거나 줄바꿈은 사용할 수 없습니다.`;
    const name = presetNameKey(preset.name);
    if (names.has(name)) return '같은 타입 이름이 있습니다. 서로 다른 이름을 입력해 주세요.';
    if (!finiteNose(preset.adjustments)) return '코 조절값을 확인해 주세요.';
    ids.add(preset.id); names.add(name);
  }
  return ids.has(defaultId) ? '' : '기본 코 타입을 선택해 주세요.';
}

export function getNosePreset(value: Preferences, id = value.defaultNoseId): NosePreset {
  return value.nosePresets.find(preset => preset.id === id) ?? value.nosePresets.find(preset => preset.id === value.defaultNoseId)!;
}

export function parsePreferences(raw: string | null): { value: Preferences; warning: string } {
  if (raw === null) return { value: DEFAULT_PREFERENCES, warning: '' };
  try {
    if (raw.length > 32768) throw new Error('Size');
    const data: unknown = JSON.parse(raw);
    if (!record(data) || typeof data.autoNose !== 'boolean' || !record(data.beauty)) throw new Error('Schema');
    const beauty = data.beauty;
    if (BEAUTY_CONTROLS.some(({ key }) => typeof beauty[key] !== 'number' || !Number.isFinite(beauty[key]))) throw new Error('Numbers');
    let presets: NosePreset[], defaultNoseId: string;
    if (data.version === 1 && finiteLegacyNose(data.nosePreset)) {
      presets = [{ ...DEFAULT_PREFERENCES.nosePresets[0], adjustments: migrateNose(data.nosePreset) }];
      defaultNoseId = presets[0].id;
    } else if ((data.version === 2 || data.version === 3) && Array.isArray(data.nosePresets) && typeof data.defaultNoseId === 'string') {
      presets = data.nosePresets.map((p: unknown) => {
        if (!record(p) || typeof p.id !== 'string' || typeof p.name !== 'string') throw new Error('Preset');
        let adjustments: Adjustments;
        if (data.version === 2 && finiteLegacyNose(p.adjustments)) adjustments = migrateNose(p.adjustments);
        else if (data.version === 3 && finiteNose(p.adjustments)) adjustments = sanitizeAdjustments(p.adjustments);
        else throw new Error('Numbers');
        return { id: p.id, name: p.name, adjustments };
      });
      defaultNoseId = data.defaultNoseId;
    } else throw new Error('Version');
    if (validateNosePresets(presets, defaultNoseId)) throw new Error('Presets');
    return { value: { beauty: sanitizeBeauty(beauty as BeautySettings), nosePresets: presets.map(p => ({ ...p, name: p.name.trim() })), defaultNoseId, autoNose: data.autoNose }, warning: '' };
  } catch {
    return { value: DEFAULT_PREFERENCES, warning: '저장된 기본 설정을 읽지 못해 기본 제공값을 사용합니다. 설정을 확인한 뒤 다시 저장해 주세요.' };
  }
}
export function serializePreferences(value: Preferences): string {
  // Whitelist all nested fields. Names and settings are the only persistent user data.
  const nosePresets = value.nosePresets.map(p => ({ id: p.id, name: p.name, adjustments: sanitizeAdjustments(p.adjustments) }));
  const error = validateNosePresets(nosePresets, value.defaultNoseId);
  if (error) throw new Error(error);
  return JSON.stringify({ version: 3, beauty: sanitizeBeauty(value.beauty),
    nosePresets: nosePresets.map(p => ({ ...p, name: p.name.trim() })), defaultNoseId: value.defaultNoseId, autoNose: value.autoNose === true });
}
