import { sanitizeAdjustments, type Adjustments } from './adjustments';
export { sanitizeAdjustments, ZERO, type Adjustments } from './adjustments';
export type Point = { x: number; y: number; z?: number };
export type NoseProfile = { turn: number; tip: Point };
export type NoseRegion = { center: Point; radius: Point; visibility: number };
export type NoseRegions = { tip: NoseRegion; alar: [NoseRegion, NoseRegion]; nostrils: [NoseRegion, NoseRegion]; columella: NoseRegion; lipY: number };
export type NoseFrame = { center: Point; axis: Point; width: number; height: number; profile?: NoseProfile; regions?: NoseRegions };
export type QualityReason = 'ready' | 'missing' | 'multiple' | 'pose' | 'cropped' | 'small' | 'invalid';
export type Quality = { ok: boolean; reason: QualityReason; frame: NoseFrame | null; yaw: number; pitch: number; roll: number };

export const QUALITY_TEXT: Record<QualityReason, string> = {
  ready: '정면 얼굴 추적 중', missing: '얼굴을 화면 가운데에 맞춰 주세요',
  multiple: '한 분만 화면에 들어와 주세요', pose: '얼굴을 정면으로 돌려 주세요',
  cropped: '얼굴 전체가 보이도록 맞춰 주세요', small: '카메라에 조금 더 가까이 와 주세요',
  invalid: '얼굴을 다시 확인하고 있습니다',
};

/** Local inverse UV deformation, in nose-width / nose-height units. No physical measurements. */
export function inverseWarp(p: Point, input: Partial<Adjustments>, profile?: NoseProfile, regions?: NoseRegions): Point {
  const a = sanitizeAdjustments(input);
  if (profile && !Number.isFinite(profile.turn + profile.tip.x + profile.tip.y)) profile = undefined;
  const turn = profile ? Math.max(-1, Math.min(1, profile.turn)) : 0;
  const side = Math.abs(turn), tipX = (profile?.tip.x ?? 0) * side, tipY = .3 * (1 - side) + (profile?.tip.y ?? .3) * side;
  const envelope = Math.max(0, 1 - (p.x / .95) ** 2 - (p.y / .82) ** 2) ** 2;
  const lower = Math.exp(-(((p.y - .23) / .45) ** 2));
  const bridge = Math.exp(-(((p.y + .26) / .32) ** 2));
  const tip = Math.exp(-(((p.x - tipX) / .45) ** 2) - ((p.y - tipY) / .32) ** 2);
  const scale = 1 + envelope * ((regions ? 0 : a.width / 100 * .35 * lower) + a.bridge / 100 * .3 * bridge) * (1 - side);
  let q = { x: p.x / scale - turn * envelope * a.projection / 100 * .22 * bridge,
    y: p.y + a.tip / 100 * .16 * tip * envelope };
  if (!regions) return q;
  const weight = (q: Point, r: NoseRegion) => Math.max(0, 1 - ((q.x - r.center.x) / r.radius.x) ** 2 - ((q.y - r.center.y) / r.radius.y) ** 2) ** 3 * r.visibility;
  // Each bounded, compact field is composed in a fixed order. A detail never
  // moves a hidden-side region or samples a previous frame's anchor.
  const size = -a.tipSize / 100 * .3 * weight(q, regions.tip);
  q = { x: q.x + (q.x - regions.tip.center.x) * size, y: q.y + (q.y - regions.tip.center.y) * size };
  for (let i = 0; i < 2; i++) {
    const r = regions.alar[i], amount = weight(q, r);
    q.x -= (i === 0 ? -1 : 1) * a.width / 100 * (1 - side) * r.radius.x * .28 * amount;
    q.y += a.alarLift / 100 * r.radius.y * .28 * weight(q, r);
  }
  for (const r of regions.nostrils) {
    // Move the upper rim, fading to zero below it instead of translating the opening.
    const upperRim = 1 - smooth((q.y - r.center.y) / (r.radius.y * .75));
    q.y += a.nostrilExposure / 100 * r.radius.y * .28 * weight(q, r) * upperRim;
  }
  q.y += a.columella / 100 * regions.columella.radius.y * .28 * weight(q, regions.columella);
  // Fade over enough space for combined tip/columella motion: a narrow final
  // blend can reverse the sampling gradient above a short nose-to-lip gap.
  const mask = (1 - smooth((p.y - (regions.lipY - .44)) / .40)) * smooth((1 - (p.x / .95) ** 2 - (p.y / .82) ** 2) / .2);
  return { x: p.x + (q.x - p.x) * mask, y: p.y + (q.y - p.y) * mask };
}

const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

/** Geometric regions, not a pixel segmentation of nostril openings. */
export function noseRegions(points: Point[], frame: NoseFrame, width: number, height: number): NoseRegions | undefined {
  const ids = [0, 1, 2, 4, 64, 79, 294, 309];
  if (ids.some(i => !points[i] || !Number.isFinite(points[i].x + points[i].y + (points[i].z ?? NaN)) || points[i].x < 0 || points[i].x > 1 || points[i].y < 0 || points[i].y > 1)) return;
  const local = (i: number): Point => {
    const dx = points[i].x * width - frame.center.x, dy = points[i].y * height - frame.center.y;
    return { x: (dx * frame.axis.x + dy * frame.axis.y) / frame.width, y: (-dx * frame.axis.y + dy * frame.axis.x) / frame.height };
  };
  const tipTop = local(4), tipBottom = local(1), bottom = local(2), lip = local(0);
  const tip = { x: (tipTop.x + tipBottom.x) / 2, y: (tipTop.y + tipBottom.y) / 2 };
  const alar = [local(64), local(294)], nostrils = [local(79), local(309)];
  const turn = frame.profile?.turn ?? 0, side = Math.abs(turn);
  if ([tip, bottom, ...alar, ...nostrils].some(p => Math.abs(p.x) > .9 || p.y < -.1 || p.y > .7) ||
    tip.y > bottom.y - .04 || lip.y < bottom.y + .1 || lip.y > 1.4) return;
  const gaps = [Math.min(nostrils[0].x - alar[0].x, tip.x - nostrils[0].x),
    Math.min(alar[1].x - nostrils[1].x, nostrils[1].x - tip.x)];
  // A visible wing/opening must remain distinct from the tip. The hidden
  // side may overlap in projection; fade it continuously instead of rejecting
  // the whole nose at an arbitrary intermediate yaw.
  if ((turn >= 0 && gaps[0] < .04) || (turn <= 0 && gaps[1] < .04)) return;
  const region = (center: Point, rx: number, ry: number, visibility = 1): NoseRegion => ({ center, radius: { x: rx, y: ry }, visibility });
  const visible = [turn >= 0 ? 1 : (1 - side) * smooth(gaps[0] / .08),
    turn <= 0 ? 1 : (1 - side) * smooth(gaps[1] / .08)];
  return { tip: region(tip, .32, .20),
    alar: [region(alar[0], .26, .22, visible[0]), region(alar[1], .26, .22, visible[1])],
    nostrils: [region(nostrils[0], .22, .13, visible[0]), region(nostrils[1], .22, .13, visible[1])],
    columella: region(bottom, .16, Math.min(.14, (lip.y - bottom.y) * .5)), lipY: lip.y };
}

/** Current-frame, depth-aware local geometry. This is a directional image warp,
 * not a reconstructed 3D nose: hidden skin/background surfaces are not invented. */
function evaluateFilter(p: Point[], m: number[], width: number, height: number): Quality {
  const pixel = (i: number) => ({ x: p[i].x * width, y: p[i].y * height });
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const top = pixel(168), bottom = pixel(2), tip = pixel(1), left = pixel(33), right = pixel(263);
  const yaw = Math.atan2(m[8], m[10]) * 180 / Math.PI;
  const pitch = Math.atan2(-m[9], Math.hypot(m[8], m[10])) * 180 / Math.PI;
  const blend = smooth((Math.abs(yaw) - 20) / 45);
  const noseHeight = distance(top, bottom), eyeSpan = distance(left, right);
  const eyeRoll = Math.atan2(right.y - left.y, right.x - left.x);
  const noseRoll = Math.atan2(top.x - bottom.x, bottom.y - top.y);
  const rollRadians = eyeRoll * (1 - blend) + noseRoll * blend;
  const roll = rollRadians * 180 / Math.PI;
  const fail = (reason: QualityReason): Quality => ({ ok: false, reason, frame: null, yaw, pitch, roll });
  if (Math.abs(yaw) > 90.001 || Math.abs(pitch) > 30 || Math.abs(roll) > 50) return fail('pose');
  if ([1, 2, 168, 10, 152, 234, 454].some(i => p[i].x < .025 || p[i].x > .975 || p[i].y < .025 || p[i].y > .975)) return fail('cropped');
  const faceHeight = distance(pixel(10), pixel(152)), inferenceScale = Math.min(1, 960 / Math.max(width, height));
  if (faceHeight * inferenceScale < 150 || faceHeight / height < .23) return fail('small');
  const projectedWidth = distance(pixel(98), pixel(327));
  if (noseHeight < 12 || noseHeight > faceHeight * .5 || (blend === 0 && (eyeSpan < 8 || projectedWidth < 8 || projectedWidth > eyeSpan || noseHeight > eyeSpan * 1.5))) return fail('invalid');
  const center = { x: (top.x + bottom.x) / 2, y: (top.y + bottom.y) / 2 };
  if (blend === 0) return { ok: true, reason: 'ready', yaw, pitch, roll,
    frame: { center, axis: { x: (right.x - left.x) / eyeSpan, y: (right.y - left.y) / eyeSpan }, width: projectedWidth, height: noseHeight } };
  if ([1, 2, 168, 98, 327].some(i => !Number.isFinite(p[i].z))) return fail('invalid');
  const depthWidth = Math.hypot((p[98].x - p[327].x) * width, (p[98].y - p[327].y) * height, (p[98].z! - p[327].z!) * width);
  if (depthWidth < 8 || depthWidth > faceHeight * .4) return fail('invalid');
  const axis = { x: Math.cos(rollRadians), y: Math.sin(rollRadians) };
  const tipOffset = (tip.x - center.x) * axis.x + (tip.y - center.y) * axis.y;
  // Bound against independent face/nose dimensions before normalizing by the tip itself.
  if (Math.abs(tipOffset) > Math.min(noseHeight, faceHeight * .22)) return fail('invalid');
  const profileWidth = Math.max(depthWidth, noseHeight * .55, Math.abs(tipOffset) * 1.8);
  if (profileWidth > faceHeight * .4) return fail('invalid');
  const noseWidth = projectedWidth * (1 - blend) + profileWidth * blend;
  if (noseWidth < 8) return fail('invalid');
  center.x += axis.x * tipOffset * .2 * blend; center.y += axis.y * tipOffset * .2 * blend;
  const cheeks = { x: (p[234].x + p[454].x) / 2 * width, y: (p[234].y + p[454].y) / 2 * height };
  const direction = (tip.x - cheeks.x) * axis.x + (tip.y - cheeks.y) * axis.y;
  const localTip = { x: ((tip.x - center.x) * axis.x + (tip.y - center.y) * axis.y) / noseWidth,
    y: (-(tip.x - center.x) * axis.y + (tip.y - center.y) * axis.x) / noseHeight };
  if (Math.abs(localTip.x) > .8 || Math.abs(localTip.y) > .7) return fail('invalid');
  return { ok: true, reason: 'ready', yaw, pitch, roll, frame: { center, axis, width: noseWidth, height: noseHeight,
    profile: { turn: (direction < 0 ? -1 : 1) * blend, tip: localTip } } };
}

/** Conservative preview gates; this is not a calibrated medical pose/occlusion estimator. */
export function evaluateFace(faces: Point[][], matrices: number[][], width: number, height: number, purpose: 'consultation' | 'filter' = 'consultation'): Quality {
  const fail = (reason: QualityReason): Quality => ({ ok: false, reason, frame: null, yaw: 0, pitch: 0, roll: 0 });
  if (faces.length === 0) return fail('missing');
  if (faces.length !== 1) return fail('multiple');
  const p = faces[0], m = matrices[0];
  const indices = [1, 2, 168, 98, 327, 33, 263, 10, 152, 234, 454];
  if (p.length < 468 || !m || m.length !== 16 || !m.every(Number.isFinite) ||
    indices.some(i => !p[i] || !Number.isFinite(p[i].x) || !Number.isFinite(p[i].y)) ||
    width <= 0 || height <= 0 || !Number.isFinite(width + height)) return fail('invalid');
  if (purpose === 'filter') {
    const q = evaluateFilter(p, m, width, height);
    if (q.frame) q.frame.regions = noseRegions(p, q.frame, width, height);
    return q;
  }
  const pixel = (i: number) => ({ x: p[i].x * width, y: p[i].y * height });
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const le = pixel(33), re = pixel(263);
  const eyeSpan = distance(le, re);
  const inferenceScale = Math.min(1, 960 / Math.max(width, height));
  if (eyeSpan * inferenceScale < 65 || eyeSpan / width < .12) return fail('small');
  if ([10, 152, 234, 454].some(i => p[i].x < .025 || p[i].x > .975 || p[i].y < .025 || p[i].y > .975)) return fail('cropped');
  // MediaPipe facial transformation data uses the column-major OpenGL layout.
  const yaw = Math.atan2(m[8], m[10]) * 180 / Math.PI;
  const pitch = Math.atan2(-m[9], Math.hypot(m[8], m[10])) * 180 / Math.PI;
  const roll = Math.atan2(re.y - le.y, re.x - le.x) * 180 / Math.PI;
  const limits = [20, 20, 20];
  if (Math.abs(yaw) > limits[0] || Math.abs(pitch) > limits[1] || Math.abs(roll) > limits[2]) return { ...fail('pose'), yaw, pitch, roll };
  const top = pixel(168), bottom = pixel(2);
  const noseWidth = distance(pixel(98), pixel(327));
  const noseHeight = distance(top, bottom);
  if (noseWidth < 8 || noseHeight < 12 || noseWidth > eyeSpan || noseHeight > eyeSpan * 1.5) return fail('invalid');
  const frame: NoseFrame = { center: { x: (top.x + bottom.x) / 2, y: (top.y + bottom.y) / 2 },
    axis: { x: (re.x - le.x) / eyeSpan, y: (re.y - le.y) / eyeSpan }, width: noseWidth, height: noseHeight };
  frame.regions = noseRegions(p, frame, width, height);
  return {
    ok: true, reason: 'ready', yaw, pitch, roll,
    frame,
  };
}

/** Yaw does not fade a valid profile. Pitch/roll retain their existing limits. */
export function liveFilterStrength(quality: Quality | null): number {
  if (!quality?.ok || !quality.frame || ![quality.yaw, quality.pitch, quality.roll].every(Number.isFinite)) return 0;
  const t = Math.max(0, Math.min(1, Math.max((Math.abs(quality.pitch) - 20) / 10, (Math.abs(quality.roll) - 30) / 20)));
  return 1 - t * t * (3 - 2 * t);
}
