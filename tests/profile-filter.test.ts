import { expect, it } from 'vitest';
import { evaluateFace, inverseWarp, liveFilterStrength } from '../src/core/geometry';

// Rotate actual 3D coordinates, including depth. A 2D image rotation only tests roll.
const front = Array.from({ length: 478 }, () => ({ x: .5, y: .5, z: 0 }));
Object.assign(front, { 1: { x: .5, y: .53, z: -.12 }, 2: { x: .5, y: .58, z: -.06 },
  168: { x: .5, y: .4, z: -.03 }, 98: { x: .44, y: .55, z: -.05 }, 327: { x: .56, y: .55, z: -.05 },
  33: { x: .35, y: .39, z: 0 }, 263: { x: .65, y: .39, z: 0 }, 10: { x: .5, y: .16, z: 0 },
  152: { x: .5, y: .83, z: 0 }, 234: { x: .26, y: .5, z: 0 }, 454: { x: .74, y: .5, z: 0 } });
function at(yaw: number) {
  const angle = yaw * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const points = front.map(p => ({ x: .5 + (p.x - .5) * c - p.z * s, y: p.y, z: (p.x - .5) * s + p.z * c }));
  const matrix = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, -50, 1];
  return { points, matrix, quality: evaluateFace([points], [matrix], 960, 960, 'filter') };
}

it('실제3D 좌표가 옆으로 회전하고 눈 간격이0이 되어도90도 필터는 유지한다', () => {
  for (const yaw of [-90, -75, -60, -35, 0, 35, 60, 75, 90]) {
    const { points, matrix, quality } = at(yaw);
    expect(quality.ok, `yaw ${yaw}: ${quality.reason}`).toBe(true);
    expect(liveFilterStrength(quality)).toBe(1);
    expect(quality.frame!.width).toBeGreaterThan(60);
    if (Math.abs(yaw) > 20) expect(evaluateFace([points], [matrix], 960, 960).ok).toBe(false);
  }
});

it('측면 국소 축과 폭은 유한하며 좌우 코끝 좌표를 포함한다', () => {
  for (const yaw of [-90, -60, 60, 90]) {
    const { quality } = at(yaw), frame = quality.frame!;
    expect(frame).not.toBeNull();
    expect(Math.hypot(frame.axis.x, frame.axis.y)).toBeCloseTo(1);
    expect(Math.sign(frame.profile!.turn)).toBe(Math.sign(yaw));
    expect(Math.abs(frame.profile!.tip.x)).toBeLessThan(.65);
    expect(Math.abs(frame.profile!.tip.y)).toBeLessThan(.65);
  }
});

it('코 라인 조절은 좌우 측면에서 반대 방향으로 돌출하고 정면의 기존 폭 변형을 유지한다', () => {
  const adjustment = { width: -40, bridge: -70, projection: 70, tip: 30 };
  const position = { x: 0, y: -.26 };
  const right = inverseWarp(position, adjustment, { turn: 1, tip: { x: .3, y: .3 } });
  const left = inverseWarp(position, adjustment, { turn: -1, tip: { x: -.3, y: .3 } });
  expect(right.x).toBeLessThan(-.03); expect(left.x).toBeGreaterThan(.03);
  expect(left.x).toBeCloseTo(-right.x);
  expect(inverseWarp(position, adjustment, { turn: 0, tip: { x: .3, y: .1 } })).toEqual(inverseWarp(position, adjustment));
});

it('측면 최대 조절에도0변형·국소 경계·유한 좌표와 연속성을 보존한다', () => {
  const profile = { turn: 1, tip: { x: .3, y: .25 } };
  expect(inverseWarp({ x: .2, y: .1 }, { width: 0, bridge: 0, tip: 0 }, profile)).toEqual({ x: .2, y: .1 });
  for (const width of [-100, 100]) for (const bridge of [-100, 100]) for (const tip of [-100, 100]) {
    const value = { width, bridge, tip };
    expect(inverseWarp({ x: 1, y: 0 }, value, profile)).toEqual({ x: 1, y: 0 });
    for (let x = -.9; x <= .9; x += .1) for (let y = -.8; y <= .8; y += .1) {
      const p = inverseWarp({ x, y }, value, profile);
      expect(Number.isFinite(p.x + p.y)).toBe(true); expect(Math.hypot(p.x - x, p.y - y)).toBeLessThan(.4);
    }
    expect(inverseWarp({ x: .94999, y: 0 }, value, profile).x).toBeCloseTo(.94999, 7);
  }
});

it('측면에서도 가짜 깊이·추적 없음·복수·잘림·작은 얼굴은 변형하지 않는다', () => {
  const { points, matrix } = at(90);
  const noDepth = points.map(p => ({ ...p, z: NaN }));
  const cropped = points.map(p => ({ ...p })); cropped[1].x = 1.2;
  const small = points.map(p => ({ x: .5 + (p.x - .5) * .1, y: .5 + (p.y - .5) * .1, z: p.z * .1 }));
  for (const p of [noDepth, cropped, small]) expect(evaluateFace([p], [matrix], 960, 960, 'filter').frame).toBeNull();
  expect(evaluateFace([], [], 960, 960, 'filter').frame).toBeNull();
  expect(evaluateFace([points, points], [matrix, matrix], 960, 960, 'filter').frame).toBeNull();
});

it('화면 안쪽의 잘못된 코끝도 독립적인 얼굴 크기 범위로 차단한다', () => {
  for (const yaw of [-90, 90]) {
    const { points, matrix } = at(yaw);
    points[1].x = yaw > 0 ? .974 : .026;
    expect(evaluateFace([points], [matrix], 960, 960, 'filter').reason).toBe('invalid');
  }
});

it('비유한 측면 입력은 정면 참조식으로 복구하고 콧볼 폭은 완전 측면에서 축소된다', () => {
  const p = { x: .2, y: .1 }, a = { width: -40, bridge: -70, tip: 30 };
  expect(inverseWarp(p, a, { turn: 1, tip: { x: NaN, y: .3 } })).toEqual(inverseWarp(p, a));
  expect(inverseWarp(p, { width: -100, bridge: 0, tip: 0 }, { turn: 1, tip: { x: .4, y: .3 } })).toEqual(p);
});

it('정면에서 측면으로 넘어가는 경계의0폭과 극소폭을 거부한다', () => {
  for (const yaw of [20.001, 25]) {
    const { matrix } = at(yaw), points = front.map(p => ({ ...p }));
    points[98] = { x: .5, y: .55, z: -.05 }; points[327] = { x: .5, y: .55, z: .07 };
    expect(evaluateFace([points], [matrix], 960, 960, 'filter').reason).toBe('invalid');
  }
});
