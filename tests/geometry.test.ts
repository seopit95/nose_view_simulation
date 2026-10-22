import { describe, expect, it } from 'vitest';
import { evaluateFace, inverseWarp, sanitizeAdjustments, liveFilterStrength } from '../src/core/geometry';

const points = Array.from({ length: 478 }, () => ({ x: .5, y: .5, z: 0 }));
Object.assign(points, {
  1: { x: .5, y: .53, z: -.08 }, 2: { x: .5, y: .58, z: -.06 },
  168: { x: .5, y: .4, z: -.03 }, 98: { x: .44, y: .55, z: -.05 },
  327: { x: .56, y: .55, z: -.05 }, 33: { x: .35, y: .39, z: 0 },
  263: { x: .65, y: .39, z: 0 }, 10: { x: .5, y: .16, z: 0 },
  152: { x: .5, y: .83, z: 0 }, 234: { x: .26, y: .5, z: 0 }, 454: { x: .74, y: .5, z: 0 },
});
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -50, 1];

it('필터는 좌우 회전에서 강도를 유지하고 상하/기울기 경계에서만 약해진다', () => {
  const at = (yaw: number, pitch = 0, roll = 0) => {
    const m = [...identity], y = yaw * Math.PI / 180, p = pitch * Math.PI / 180, r = roll * Math.PI / 180;
    m[8] = Math.sin(y) * Math.cos(p); m[9] = -Math.sin(p); m[10] = Math.cos(y) * Math.cos(p);
    const face = points.map(v => ({ ...v, x: .5 + Math.cos(r) * (v.x - .5) - Math.sin(r) * (v.y - .5),
      y: .5 + Math.sin(r) * (v.x - .5) + Math.cos(r) * (v.y - .5) }));
    return { normal: evaluateFace([face], [m], 960, 960), filter: evaluateFace([face], [m], 960, 960, 'filter') };
  };
  const tilted = at(0, 0, 30);
  expect(tilted.normal.ok).toBe(false); expect(tilted.filter.ok).toBe(true);
  expect(liveFilterStrength(tilted.filter)).toBeCloseTo(1);
  expect(liveFilterStrength(at(27.5).filter)).toBe(1);
  expect(liveFilterStrength(at(0, 25).filter)).toBeCloseTo(.5);
  expect(liveFilterStrength(at(0, 0, 40).filter)).toBeCloseTo(.5);
  for (const q of [at(100).filter, at(0, 31).filter, at(0, 0, 51).filter]) {
    expect(q.frame).toBeNull(); expect(liveFilterStrength(q)).toBe(0);
  }
});

it('필터도 얼굴 없음·복수·잘림·작음·비정상 좌표/행렬에는 코를 변형하지 않는다', () => {
  const cropped = points.map(p => ({ ...p })); cropped[10].y = -.01;
  const invalid = points.map(p => ({ ...p })); invalid[98].x = NaN;
  for (const q of [evaluateFace([], [], 960, 960, 'filter'), evaluateFace([points, points], [identity], 960, 960, 'filter'),
    evaluateFace([cropped], [identity], 960, 960, 'filter'), evaluateFace([invalid], [identity], 960, 960, 'filter'),
    evaluateFace([points], [], 960, 960, 'filter'), evaluateFace([points], [identity], 160, 90, 'filter')]) {
    expect(q.frame).toBeNull(); expect(liveFilterStrength(q)).toBe(0);
  }
});

describe('시뮬레이션 품질 조건', () => {
  it('고해상도 표시에서도 작은 얼굴의 추론 픽셀 기준을 유지한다', () => {
    const portrait = points.map(p => ({ ...p }));
    portrait[33].x = .43; portrait[263].x = .57;
    portrait[168].y = .48; portrait[2].y = .52;
    expect(evaluateFace([portrait], [identity], 720, 1920).reason).toBe('small');
  });
  it('단일 정면 얼굴에서만 변형 좌표를 생성한다', () => {
    const result = evaluateFace([points], [identity], 1280, 720);
    expect(result.ok).toBe(true);
    expect(result.frame?.width).toBeCloseTo(153.6);
  });
  it.each([{ faces: [] }, { faces: [points, points] }])('얼굴 없음/복수 얼굴에는 변형을 끈다', ({ faces }) => {
    expect(evaluateFace(faces, [identity], 1280, 720).frame).toBeNull();
  });
  it('큰 좌우 회전과 행렬 누락에는 변형을 끈다', () => {
    const yaw30 = [.866, 0, -.5, 0, 0, 1, 0, 0, .5, 0, .866, 0, 0, 0, -50, 1];
    expect(evaluateFace([points], [yaw30], 1280, 720).reason).toBe('pose');
    expect(evaluateFace([points], [], 1280, 720).ok).toBe(false);
  });
  it('잘린 얼굴, 잘못된 좌표, 지나치게 작은 얼굴을 거부한다', () => {
    const cropped = points.map(p => ({ ...p })); cropped[10].y = -.01;
    expect(evaluateFace([cropped], [identity], 1280, 720).reason).toBe('cropped');
    const invalid = points.map(p => ({ ...p })); invalid[1].x = NaN;
    expect(evaluateFace([invalid], [identity], 1280, 720).ok).toBe(false);
    expect(evaluateFace([points], [identity], 160, 90).reason).toBe('small');
  });
});

describe('제한된 코 변형', () => {
  it('0 설정과 코 밖의 영역은 원본 좌표를 그대로 유지한다', () => {
    expect(inverseWarp({ x: .25, y: .3 }, { width: 0, bridge: 0, tip: 0 })).toEqual({ x: .25, y: .3 });
    expect(inverseWarp({ x: 1.5, y: 0 }, { width: 100, bridge: -100, tip: 100 })).toEqual({ x: 1.5, y: 0 });
  });
  it('폭을 늘리면 더 안쪽 픽셀을 샘플링하고, 좌우 대칭을 유지한다', () => {
    const right = inverseWarp({ x: .35, y: .23 }, { width: 100, bridge: 0, tip: 0 });
    const left = inverseWarp({ x: -.35, y: .23 }, { width: 100, bridge: 0, tip: 0 });
    expect(right.x).toBeLessThan(.35);
    expect(left.x).toBeCloseTo(-right.x);
  });
  it('외부/복원 입력도 범위를 제한하고 비정상 값은 기본값으로 처리한다', () => {
    expect(sanitizeAdjustments({ width: 10000, bridge: -999, tip: NaN })).toEqual({ width: 100, bridge: -100, tip: 0,
      projection: 0, tipSize: 0, alarLift: 0, nostrilExposure: 0, columella: 0 });
  });
  it('최대 조절 범위에서도 유한한 좌표를 유지하고 경계에서 연속적이다', () => {
    for (const width of [-100, 100]) for (const bridge of [-100, 100]) for (const tip of [-100, 100]) {
      for (let x = -.95; x <= .95; x += .05) for (let y = -.82; y <= .82; y += .05) {
        const warped = inverseWarp({ x, y }, { width, bridge, tip });
        expect(Number.isFinite(warped.x) && Number.isFinite(warped.y)).toBe(true);
        expect(Math.hypot(warped.x - x, warped.y - y)).toBeLessThan(.25);
      }
      expect(inverseWarp({ x: .94999, y: 0 }, { width, bridge, tip }).x).toBeCloseTo(.94999, 7);
    }
  });
});
