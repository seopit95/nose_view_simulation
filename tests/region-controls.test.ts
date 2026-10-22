import { expect, it } from 'vitest';
import sample from './fixtures/synthetic-landmarks.json';
import { evaluateFace, inverseWarp, sanitizeAdjustments, ZERO, type Point } from '../src/core/geometry';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -50, 1];
const quality = () => evaluateFace([sample.points], [identity], 1254, 1254);
const local = (p: Point, f: NonNullable<ReturnType<typeof quality>['frame']>) => {
  const x = p.x * 1254 - f.center.x, y = p.y * 1254 - f.center.y;
  return { x: (x * f.axis.x + y * f.axis.y) / f.width, y: (-x * f.axis.y + y * f.axis.x) / f.height };
};

it('코끝 상하를 조절해도 좌우 측면에서 돌출 방향으로 이동하지 않는다', () => {
  for (const turn of [-1, -.5, 0, .5, 1]) for (const amount of [-100, 100]) {
    const profile = { turn, tip: { x: .3 * turn, y: .3 } };
    const p = { x: profile.tip.x * Math.abs(turn), y: .3 };
    const moved = inverseWarp(p, { tip: amount }, profile);
    expect(moved.x).toBeCloseTo(p.x, 10);
    expect(Math.sign(moved.y - p.y)).toBe(Math.sign(amount));
  }
});

it('콧구멍 윗선은 움직이고 그 아래 경계는 함께 끌려가지 않는다', () => {
  const f = quality().frame!, r = f.regions!;
  for (const region of r.nostrils) for (const amount of [-100, 100]) {
    const rim = region.center;
    const below = { x: rim.x, y: rim.y + region.radius.y * .8 };
    const moved = inverseWarp(rim, { nostrilExposure: amount }, f.profile, r);
    expect(Math.sign(moved.y - rim.y)).toBe(Math.sign(amount));
    expect(inverseWarp(below, { nostrilExposure: amount }, f.profile, r)).toEqual(below);
  }
});

it('추가한 부위 수치를 잃지 않고 범위를 제한하며 미지 필드를 저장하지 않는다', () => {
  const value = sanitizeAdjustments({ ...ZERO, projection: 12, tipSize: 200, alarLift: -300, nostrilExposure: 42, columella: NaN });
  expect(value).toMatchObject({ projection: 12, tipSize: 100, alarLift: -100, nostrilExposure: 42, columella: 0 });
  expect(Object.keys(value)).toHaveLength(8);
});

it('실제 모델의 합성 얼굴에서 콧날개·비공·비주와 코끝 영역을 각각 찾는다', () => {
  const f = quality().frame!;
  expect(f.regions).toBeDefined();
  const r = f.regions!;
  expect(r.alar[0].center.x).toBeLessThan(r.nostrils[0].center.x);
  expect(r.nostrils[0].center.x).toBeLessThan(r.tip.center.x);
  expect(r.nostrils[1].center.x).toBeGreaterThan(r.tip.center.x);
  expect(r.alar[1].center.x).toBeGreaterThan(r.nostrils[1].center.x);
  expect(r.columella.center.y).toBeGreaterThan(r.tip.center.y);
});

it('각 부위의 상하 조절은 해당 기준점에서 올리기 방향의 역샘플링을 만든다', () => {
  const f = quality().frame!;
  for (const [key, index] of [['alarLift', 64], ['nostrilExposure', 79], ['columella', 2]] as const) {
    const p = local(sample.points[index], f);
    const up = inverseWarp(p, { ...ZERO, [key]: 100 }, f.profile, f.regions);
    const down = inverseWarp(p, { ...ZERO, [key]: -100 }, f.profile, f.regions);
    expect(up.y, key).toBeGreaterThan(p.y + .005);
    expect(down.y, key).toBeLessThan(p.y - .005);
  }
});

it('코끝 크기와 콧볼 폭은 다른 영역을 대상으로 하고 콧대 폭과 측면 라인은 분리된다', () => {
  const f = quality().frame!, r = f.regions!;
  const p = { x: r.tip.center.x + .12, y: r.tip.center.y };
  expect(inverseWarp(p, { ...ZERO, tipSize: 100 }, f.profile, r).x).toBeLessThan(p.x);
  expect(inverseWarp(p, { ...ZERO, width: 100 }, f.profile, r)).toEqual(p);
  const right = local(sample.points[294], f);
  expect(inverseWarp(right, { ...ZERO, width: 100 }, f.profile, r).x).toBeLessThan(right.x);
  const profile = { turn: 1, tip: { x: .3, y: .3 } };
  expect(inverseWarp({ x: 0, y: -.26 }, { ...ZERO, bridge: -100 }, profile).x).toBe(0);
  expect(inverseWarp({ x: 0, y: -.26 }, { ...ZERO, projection: 100 }, profile).x).toBeLessThan(-.03);
});

it('부위 좌표가 누락되거나 비정상이면 세부 효과를 추정하지 않고 차단한다', () => {
  const points = sample.points.map(p => ({ ...p })); points[79].x = NaN;
  const f = evaluateFace([points], [identity], 1254, 1254).frame!;
  expect(f.regions).toBeUndefined();
  expect(inverseWarp({ x: .2, y: .4 }, { ...ZERO, columella: 100 }, f.profile, f.regions)).toEqual({ x: .2, y: .4 });
});

it('좌우60/90도에서도 현재 기하로 세부 영역을 만들고 가려진 쪽 효과는 줄인다', () => {
  for (const yaw of [-90, -60, 60, 90]) {
    const c = Math.cos(yaw * Math.PI / 180), s = Math.sin(yaw * Math.PI / 180);
    const points = sample.points.map(p => ({ x: .5 + (p.x - .5) * c - p.z * s, y: p.y, z: (p.x - .5) * s + p.z * c }));
    const m = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, -50, 1];
    const q = evaluateFace([points], [m], 1254, 1254, 'filter');
    expect(q.ok, `${yaw}/${q.reason}`).toBe(true);
    expect(q.frame!.regions, `regions ${yaw}`).toBeDefined();
    const v = q.frame!.regions!.alar.map(r => r.visibility);
    expect(Math.max(...v)).toBe(1); expect(Math.min(...v)).toBeLessThan(.1);
  }
});

it('정면부터 좌우90도까지 유효한 중간 각도에서 부위 보정이 꺼졌다 켜지지 않는다', () => {
  for (let yaw = -90; yaw <= 90; yaw += .5) {
    const c = Math.cos(yaw * Math.PI / 180), s = Math.sin(yaw * Math.PI / 180);
    const points = sample.points.map(p => ({ x: .5 + (p.x - .5) * c - p.z * s, y: p.y, z: (p.x - .5) * s + p.z * c }));
    const m = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, -50, 1];
    const q = evaluateFace([points], [m], 1254, 1254, 'filter');
    expect(q.ok, `${yaw}/${q.reason}`).toBe(true);
    expect(q.frame!.regions, `regions ${yaw}`).toBeDefined();
  }
});

it('거의 한 점으로 붕괴한 콧날개·비공 좌표를 코끝 보정으로 오인하지 않는다', () => {
  const f = quality().frame!, center = f.regions!.tip.center;
  const points = sample.points.map(p => ({ ...p }));
  [64, 79, 309, 294].forEach((id, i) => {
    const x = center.x + [-.002, -.001, .001, .002][i], y = center.y;
    points[id].x = (f.center.x + f.axis.x * x * f.width - f.axis.y * y * f.height) / 1254;
    points[id].y = (f.center.y + f.axis.y * x * f.width + f.axis.x * y * f.height) / 1254;
  });
  expect(evaluateFace([points], [identity], 1254, 1254).frame!.regions).toBeUndefined();
});

it('코·입술 간격이 짧아도 코끝과 비주를 함께 올릴 때 경계가 접히지 않는다', () => {
  const f = quality().frame!;
  for (const lipY of [.601, .62, .7, .9]) {
    const points = sample.points.map(p => ({ ...p }));
    points[0].x = (f.center.x - f.axis.y * lipY * f.height) / 1254;
    points[0].y = (f.center.y + f.axis.x * lipY * f.height) / 1254;
    const frame = evaluateFace([points], [identity], 1254, 1254).frame!;
    expect(frame.regions).toBeDefined();
    const combinations = [-100, 100].flatMap(tip => [-100, 100].map(columella => ({ ...ZERO, tip, columella })));
    combinations.push({ ...ZERO, width: -100, bridge: 100, projection: -100, tip: 100, tipSize: -100, alarLift: -100, nostrilExposure: -100, columella: -100 });
    for (const a of combinations) {
      for (let x = -.3; x < .3; x += .02) for (let y = .2; y < lipY; y += .01) {
        const p = inverseWarp({ x, y }, a, frame.profile, frame.regions);
        const dx = inverseWarp({ x: x + .0001, y }, a, frame.profile, frame.regions);
        const dy = inverseWarp({ x, y: y + .0001 }, a, frame.profile, frame.regions);
        const determinant = ((dx.x - p.x) * (dy.y - p.y) - (dy.x - p.x) * (dx.y - p.y)) / 1e-8;
        expect(determinant, `${lipY}/${JSON.stringify(a)}/${x}/${y}`).toBeGreaterThan(.05);
      }
      const lip = local(points[0], frame);
      expect(inverseWarp(lip, a, frame.profile, frame.regions)).toEqual(lip);
    }
  }
});

it('256개 혼합 끝값에도 유한 좌표·영역 밖·입술 보호와 뒤집히지 않는 표본 격자를 유지한다', () => {
  const f = quality().frame!;
  for (let combination = 0; combination < 256; combination++) {
    const a = Object.fromEntries(Object.keys(ZERO).map((key, index) => [key, combination & (1 << index) ? 100 : -100]));
    expect(inverseWarp({ x: 1.2, y: .2 }, a, f.profile, f.regions)).toEqual({ x: 1.2, y: .2 });
    const lip = local(sample.points[0], f);
    expect(inverseWarp(lip, a, f.profile, f.regions)).toEqual(lip);
    let minimum = Infinity;
    for (let x = -.95; x <= .95; x += .035) for (let y = -.8; y <= .8; y += .035) {
      const p = inverseWarp({ x, y }, a, f.profile, f.regions), dx = inverseWarp({ x: x + .0001, y }, a, f.profile, f.regions), dy = inverseWarp({ x, y: y + .0001 }, a, f.profile, f.regions);
      const determinant = ((dx.x - p.x) * (dy.y - p.y) - (dy.x - p.x) * (dx.y - p.y)) / 1e-8;
      minimum = Math.min(minimum, determinant);
    }
    expect(Number.isFinite(minimum)).toBe(true);
    expect(minimum, JSON.stringify(a)).toBeGreaterThan(.05);
  }
});
