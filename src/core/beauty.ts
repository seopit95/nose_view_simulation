import type { NoseFrame, Point } from './geometry';

export type BeautySettings = { smoothing: number; brightness: number; warmth: number;
  contrast: number; saturation: number; tint: number; shadows: number; highlights: number };
export const BEAUTY_CONTROLS: { key: keyof BeautySettings; label: string; min: number; max: number }[] = [
  { key: 'smoothing', label: '피부 보정 강도', min: 0, max: 100 },
  { key: 'brightness', label: '화면 밝기', min: -100, max: 100 },
  { key: 'warmth', label: '색온도', min: -100, max: 100 },
  { key: 'contrast', label: '대비', min: -100, max: 100 },
  { key: 'saturation', label: '채도', min: -100, max: 100 },
  { key: 'tint', label: '색조', min: -100, max: 100 },
  { key: 'shadows', label: '그림자', min: -100, max: 100 },
  { key: 'highlights', label: '하이라이트', min: -100, max: 100 },
];
const neutral = { contrast: 0, saturation: 0, tint: 0, shadows: 0, highlights: 0 };
export const BEAUTY_PRESETS = {
  off: { ...neutral, smoothing: 0, brightness: 0, warmth: 0 },
  natural: { ...neutral, smoothing: 30, brightness: 12, warmth: 0, contrast: -4, saturation: -3, shadows: 8, highlights: -15 },
  soft: { ...neutral, smoothing: 55, brightness: 22, warmth: 3, contrast: -12, shadows: 12, highlights: -25 },
  radiant: { ...neutral, smoothing: 85, brightness: 45, warmth: 5, highlights: -25 },
  warm: { ...neutral, smoothing: 30, brightness: 10, warmth: 18, tint: 5, highlights: -15 },
  clear: { ...neutral, smoothing: 25, brightness: 16, warmth: -10, saturation: -8, shadows: 8, highlights: -18 },
} satisfies Record<string, BeautySettings>;
export function sanitizeBeauty(value: Partial<BeautySettings>): BeautySettings {
  const clamp = (n: number, low: number, high: number) => Number.isFinite(n) ? Math.max(low, Math.min(high, n)) : 0;
  return Object.fromEntries(BEAUTY_CONTROLS.map(({ key, min, max }) => [key, clamp(value[key] ?? 0, min, max)])) as BeautySettings;
}
export function beautyLabel(value: BeautySettings): string {
  const b = sanitizeBeauty(value);
  if (!Object.values(b).some(Boolean)) return '피부 보정 없음';
  return '피부 보정 적용 · ' + BEAUTY_CONTROLS.map(({ key, label }) =>
    `${key === 'smoothing' ? '강도' : key === 'brightness' ? '밝기' : label} ${b[key] > 0 && key !== 'smoothing' ? '+' : ''}${b[key]}`).join(' / ');
}

export type SkinZone = { x: number; y: number; rx: number; ry: number };
export type SkinRegions = { skin: SkinZone; protected: SkinZone[]; frame: NoseFrame };
/** An inset face oval covers forehead, cheeks and chin, in display pixels.
 * ponytail: geometric masks do not detect hair/occlusion; segmentation is a
 * later option if real-camera visual review shows this conservative mask is insufficient. */
export function skinZones(points: Point[], width: number, height: number): SkinRegions | null {
  const protectedGroups = [[33, 133, 159, 145, 70, 63, 105, 66, 107],
    [263, 362, 386, 374, 300, 293, 334, 296, 336], [61, 291, 0, 17, 13, 14]];
  const indices = [10, 152, 33, 263, 234, 454, 168, 2, 98, 327, ...protectedGroups.flat()];
  if (width <= 0 || height <= 0 || !Number.isFinite(width + height) || indices.some(i => !points[i] ||
    !Number.isFinite(points[i].x + points[i].y) || points[i].x < 0 || points[i].x > 1 || points[i].y < 0 || points[i].y > 1)) return null;
  const p = (i: number) => ({ x: points[i].x * width, y: points[i].y * height });
  const left = p(33), right = p(263), span = Math.hypot(right.x - left.x, right.y - left.y);
  if (span < 32) return null;
  const noseWidth = Math.hypot(p(98).x - p(327).x, p(98).y - p(327).y);
  const noseHeight = Math.hypot(p(168).x - p(2).x, p(168).y - p(2).y);
  if (noseWidth < 4 || noseHeight < 6 || noseWidth > span || noseHeight > span * 1.5) return null;
  const frame: NoseFrame = { center: { x: (p(168).x + p(2).x) / 2, y: (p(168).y + p(2).y) / 2 },
    axis: { x: (right.x - left.x) / span, y: (right.y - left.y) / span }, width: noseWidth, height: noseHeight };
  const ax = (right.x - left.x) / span, ay = (right.y - left.y) / span;
  const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
  const local = (i: number) => { const v = p(i); const dx = v.x - center.x, dy = v.y - center.y; return { x: dx * ax + dy * ay, y: -dx * ay + dy * ax }; };
  const zone = (x: number, y: number, rx: number, ry: number) => ({ x: center.x + ax * x - ay * y, y: center.y + ay * x + ax * y, rx, ry });
  const top = local(10), chin = local(152), sideLeft = local(234), sideRight = local(454);
  if (top.y >= 0 || chin.y <= 0 || sideLeft.x >= sideRight.x) return null;
  const skin = zone((sideLeft.x + sideRight.x) / 2, (top.y + chin.y) / 2,
    (sideRight.x - sideLeft.x) * .46, (chin.y - top.y) * .475);
  const protectedZones = protectedGroups.map(group => {
    const points = group.map(local);
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    // Inflate beyond sqrt(2) so every corner of the landmark bounds is inside
    // the fully excluded ellipse, with a face-scaled margin before feathering.
    return zone((minX + maxX) / 2, (minY + maxY) / 2,
      (maxX - minX) * .75 + span * .03, (maxY - minY) * .75 + span * .03);
  });
  return skin.rx > 1 && skin.ry > 1 ? { skin, protected: protectedZones, frame } : null;
}
