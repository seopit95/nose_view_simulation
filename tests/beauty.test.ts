import { expect, it } from 'vitest';
import { BEAUTY_PRESETS, sanitizeBeauty, skinZones } from '../src/core/beauty';

it('새 촬영 조절도 숫자만 받고 범위를 제한한다', () => {
  const result = sanitizeBeauty({ ...BEAUTY_PRESETS.off, contrast: 500, saturation: -500,
    tint: NaN, shadows: 45, highlights: -35 });
  expect(result).toMatchObject({ contrast: 100, saturation: -100, tint: 0, shadows: 45, highlights: -35 });
});

it('복원된 보정값도 범위를 제한하고 비정상 값은 0으로 처리한다', () => {
  expect(sanitizeBeauty({ smoothing: 200, brightness: -90, warmth: NaN }))
    .toEqual({ ...BEAUTY_PRESETS.off, smoothing: 100, brightness: -90, warmth: 0 });
  expect(sanitizeBeauty({ smoothing: 500, brightness: -150, warmth: 150 }))
    .toEqual({ ...BEAUTY_PRESETS.off, smoothing: 100, brightness: -100, warmth: 100 });
  expect(Object.values(sanitizeBeauty(BEAUTY_PRESETS.off)).every(n => n === 0)).toBe(true);
});

it('누락되거나 잘못된 얼굴 좌표에는 피부 마스크를 생성하지 않는다', () => {
  expect(skinZones([], 1920, 1080)).toBeNull();
  const face = Array.from({ length: 478 }, () => ({ x: .5, y: .5 }));
  expect(skinZones(face, 1920, 1080)).toBeNull();
  face[33] = { x: .35, y: .4 }; face[263] = { x: NaN, y: .4 };
  expect(skinZones(face, 1920, 1080)).toBeNull();
});

it.each([[1, 0], [2, Math.PI / 9]])('눈·눈썹·입 보호 영역은 크기와 회전을 따라간다 (%s, %s)', (scale, angle) => {
  const face = Array.from({ length: 478 }, () => ({ x: .5, y: .5 }));
  Object.assign(face, { 10: { x: .5, y: .16 }, 33: { x: .35, y: .39 }, 263: { x: .65, y: .39 },
    234: { x: .26, y: .5 }, 454: { x: .74, y: .5 }, 168: { x: .5, y: .42 }, 98: { x: .44, y: .55 }, 327: { x: .56, y: .55 }, 2: { x: .5, y: .56 }, 152: { x: .5, y: .82 } });
  for (const i of [133, 159, 145]) face[i] = { x: .40, y: i === 159 ? .38 : .40 };
  for (const i of [362, 386, 374]) face[i] = { x: .60, y: i === 386 ? .38 : .40 };
  for (const i of [70, 63, 105, 66, 107]) face[i] = { x: .37, y: .34 };
  for (const i of [300, 293, 334, 296, 336]) face[i] = { x: .63, y: .34 };
  for (const i of [61, 291, 0, 17, 13, 14]) face[i] = { x: i === 61 ? .40 : i === 291 ? .60 : .5, y: i === 17 ? .70 : .65 };
  const cos = Math.cos(angle), sin = Math.sin(angle), size = 1000 * scale;
  const rotated = face.map(p => ({ x: .5 + cos * (p.x - .5) - sin * (p.y - .5), y: .5 + sin * (p.x - .5) + cos * (p.y - .5) }));
  const regions = skinZones(rotated, size, size);
  for (const i of [33, 133, 263, 362, 70, 300, 61, 291, 13, 17]) {
    const exclusions = regions?.protected ?? [];
    expect(exclusions.some(z => {
      const dx = rotated[i].x * size - z.x, dy = rotated[i].y * size - z.y;
      return ((cos * dx + sin * dy) / z.rx) ** 2 + ((-sin * dx + cos * dy) / z.ry) ** 2 <= 1;
    }), `Landmark ${i} must be inside an exclusion`).toBe(true);
  }
  expect(skinZones(face.slice(0, 152).concat([{ x: NaN, y: .82 }], face.slice(153)), size, size)).toBeNull();
  expect(skinZones(face.map((p, i) => i === 152 ? { x: .5, y: .1 } : p), size, size)).toBeNull();
});
