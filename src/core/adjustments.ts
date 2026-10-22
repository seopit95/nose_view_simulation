export type Adjustments = { width: number; bridge: number; projection: number; tip: number;
  tipSize: number; alarLift: number; nostrilExposure: number; columella: number };
export const ZERO: Adjustments = { width: 0, bridge: 0, projection: 0, tip: 0, tipSize: 0, alarLift: 0, nostrilExposure: 0, columella: 0 };
export const NOSE_CONTROLS: { key: keyof Adjustments; label: string; hint: string; low: string; high: string; group: string; basic?: boolean }[] = [
  { key: 'bridge', label: '콧대 폭', hint: '콧대 위쪽과 중간의 양옆 폭입니다. 절골 수술 자체를 재현하지 않습니다.', low: '좁게', high: '넓게', group: '콧대', basic: true },
  { key: 'width', label: '콧볼 폭', hint: '코 양옆의 둥근 콧볼을 안쪽이나 바깥쪽으로 움직입니다.', low: '좁게', high: '넓게', group: '콧볼·콧구멍', basic: true },
  { key: 'tipSize', label: '코끝 크기', hint: '코끝 중앙의 둥근 부분을 작게 또는 크게 표현합니다.', low: '작게', high: '크게', group: '코끝', basic: true },
  { key: 'tip', label: '코끝 상하', hint: '코끝을 위아래로 움직입니다. 앞으로 돌출시키거나 회전시키는 조절은 아닙니다.', low: '아래로', high: '위로', group: '코끝', basic: true },
  { key: 'alarLift', label: '콧날개 상하', hint: '콧구멍 바깥쪽을 감싸는 콧날개를 올리거나 내립니다.', low: '아래로', high: '위로', group: '콧볼·콧구멍' },
  { key: 'nostrilExposure', label: '콧구멍 윗선', hint: '콧구멍의 윗테두리를 올리거나 내립니다. 비공 내리기는 아래로 조절하세요.', low: '아래로', high: '위로', group: '콧볼·콧구멍' },
  { key: 'columella', label: '비주 상하', hint: '두 콧구멍 사이 기둥(비주)의 아래끝을 올리거나 내립니다.', low: '아래로', high: '위로', group: '비주' },
  { key: 'projection', label: '옆모습 콧대', hint: '정면에서는 변화가 보이지 않습니다. 실시간 필터에서 고개를 돌려 확인하세요.', low: '안쪽으로', high: '바깥으로', group: '콧대' },
];
export function sanitizeAdjustments(value: Partial<Adjustments>): Adjustments {
  return Object.fromEntries(Object.keys(ZERO).map(key => {
    const n = value[key as keyof Adjustments];
    return [key, typeof n === 'number' && Number.isFinite(n) ? Math.max(-100, Math.min(100, n)) : 0];
  })) as Adjustments;
}
