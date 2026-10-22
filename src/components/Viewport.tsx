import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { CanvasTexture, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial,
  SRGBColorSpace, Vector2, Vector3, Vector4, WebGLRenderer } from 'three';
import { liveFilterStrength, sanitizeAdjustments, type Adjustments, type NoseFrame, type NoseRegion, type Quality } from '../core/geometry';
import { NOSE_CONTROLS } from '../core/adjustments';
import { beautyLabel, sanitizeBeauty, skinZones, type BeautySettings } from '../core/beauty';
import type { TrackedFrame } from '../tracking/pipeline';

export type ViewMode = 'compare' | 'simulation' | 'original';
export type ViewportHandle = { present: (frame: TrackedFrame) => void; clear: () => void; capture: (label: string) => string | null };
type Props = { adjustments: Adjustments; mode: ViewMode; split: number; mirror: boolean;
  beauty: BeautySettings; correctionActive: boolean; liveFilter: boolean;
  onSplit: (value: number) => void; onError: (message: string) => void; ready: boolean; showGuide: boolean; selectedControl?: keyof Adjustments };

const fragment = `
  uniform sampler2D uImage;
  uniform vec2 uResolution, uCenter, uAxis, uNoseSize;
  uniform vec2 uSkinAxis, uSkinNoseCenter, uSkinNoseSize;
  uniform vec3 uAdjust, uProfile;
  uniform vec4 uDetails;
  uniform vec4 uAreas[6];
  uniform vec2 uVisibleSides;
  uniform float uProjection, uDetailsReady, uLipY;
  uniform vec3 uBeauty;
  uniform vec3 uColor;
  uniform vec2 uTonal;
  uniform vec4 uSkin;
  uniform vec4 uProtected[3];
  uniform float uSkinEnabled;
  uniform float uEnabled, uMode, uSplit, uMirror;
  varying vec2 vUv;
  float square(float v) { return v * v; }
  float regionWeight(vec2 q, vec4 area) {
    vec2 delta = (q - area.xy) / area.zw;
    float t = max(0.0, 1.0 - dot(delta, delta));
    return t * t * t;
  }
  float skinMask(vec2 pixel) {
    vec2 axisY = vec2(-uSkinAxis.y, uSkinAxis.x);
    vec2 faceDelta = pixel - uSkin.xy;
    vec2 face = vec2(dot(faceDelta, uSkinAxis), dot(faceDelta, axisY)) / uSkin.zw;
    float mask = 1.0 - smoothstep(0.72, 1.0, dot(face, face));
    for (int i = 0; i < 3; i++) {
      vec2 d = pixel - uProtected[i].xy;
      vec2 q = vec2(dot(d, uSkinAxis), dot(d, axisY)) / uProtected[i].zw;
      mask *= smoothstep(1.0, 1.5, dot(q, q));
    }
    vec2 d = pixel - uSkinNoseCenter;
    vec2 nose = vec2(dot(d, uSkinAxis), dot(d, axisY)) / (uSkinNoseSize * vec2(0.95, 0.82));
    return mask * smoothstep(1.0, 1.5, dot(nose, nose)) * uSkinEnabled;
  }
  vec3 correctSkin(vec2 source) {
    vec2 uv = vec2(source.x, 1.0 - source.y);
    vec3 color = texture2D(uImage, uv).rgb;
    float amount = uSkinEnabled > 0.5 ? skinMask(source * uResolution) * uBeauty.x : 0.0;
    if (amount > 0.001) {
      vec3 sum = vec3(0.0); float weights = 0.0;
      vec2 stepSize = vec2(clamp(uSkinNoseSize.x * mix(0.04, 0.12, uBeauty.x), 1.0, 12.0)) / uResolution;
      for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec3 neighbor = texture2D(uImage, uv + offset * stepSize).rgb;
        vec3 delta = neighbor - color;
        float weight = exp(-dot(offset, offset) * 0.3 - dot(delta, delta) / mix(0.012, 0.05, uBeauty.x));
        sum += neighbor * weight; weights += weight;
      }
      color = mix(color, sum / weights, amount * 0.95);
    }
    // Wider tone controls preserve black/white endpoints without hard clipping.
    // Skip the curve at zero so 'off' preserves the original pixels exactly.
    if (uBeauty.y != 0.0 || uBeauty.z != 0.0 || uColor.z != 0.0) {
      vec3 gain = exp2(vec3(uBeauty.y * 2.5) + uBeauty.z * vec3(0.75, 0.0, -0.75) + uColor.z * vec3(0.35, -0.35, 0.35));
      color = gain * color / (vec3(1.0) + (gain - 1.0) * color);
    }
    // The preceding rational curve may round white just above 1 on the GPU.
    // Clamp before any fractional power to prevent NaN/black highlights.
    color = clamp(color, 0.0, 1.0);
    if (uTonal.x != 0.0 || uTonal.y != 0.0) {
      vec3 dark = vec3(1.0) - color;
      // Derivative >= 0.2 for every allowed pair; no reversal at extremes.
      color += 0.8 * (uTonal.x * color * dark * dark + uTonal.y * color * color * dark);
      color = clamp(color, 0.0, 1.0);
    }
    if (uColor.x != 0.0) {
      float power = exp2(uColor.x * 0.8);
      vec3 numerator = pow(color, vec3(power));
      color = numerator / (numerator + pow(vec3(1.0) - color, vec3(power)) * pow(0.18 / 0.82, power - 1.0));
    }
    if (uColor.y != 0.0) color = mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, 1.0 + uColor.y);
    return clamp(color, 0.0, 1.0);
  }
  void main() {
    vec2 screen = vec2(vUv.x, 1.0 - vUv.y);
    vec2 source = vec2(mix(screen.x, 1.0 - screen.x, uMirror), screen.y);
    bool modify = uMode < 0.5 || (uMode < 1.5 && screen.x >= uSplit);
    if (modify && uEnabled > 0.5) {
      vec2 delta = source * uResolution - uCenter;
      vec2 axisY = vec2(-uAxis.y, uAxis.x);
      vec2 q = vec2(dot(delta, uAxis), dot(delta, axisY)) / uNoseSize;
      float e = pow(max(0.0, 1.0 - square(q.x / 0.95) - square(q.y / 0.82)), 2.0);
      if (e > 0.0 && dot(abs(uAdjust), vec3(1.0)) + abs(uProjection) + dot(abs(uDetails), vec4(1.0)) > 0.0) {
      vec2 original = q;
      float lower = exp(-square((q.y - 0.23) / 0.45));
      float bridge = exp(-square((q.y + 0.26) / 0.32));
      float side = abs(uProfile.x);
      vec2 tipCenter = mix(vec2(0.0, 0.30), uProfile.yz, side);
      float tip = exp(-square((q.x - tipCenter.x) / 0.45) - square((q.y - tipCenter.y) / 0.32));
      q.x /= 1.0 + e * (uAdjust.x * (1.0 - uDetailsReady) * 0.35 * lower + uAdjust.y * 0.30 * bridge) * (1.0 - side);
      q.x -= uProfile.x * e * uProjection * 0.22 * bridge;
      q.y += uAdjust.z * 0.16 * tip * e;
      if (uDetailsReady > 0.5) {
        q += (q - uAreas[0].xy) * (-uDetails.x * 0.30 * regionWeight(q, uAreas[0]));
        for (int i = 0; i < 2; i++) {
          vec4 area = uAreas[i + 1]; float visible = i == 0 ? uVisibleSides.x : uVisibleSides.y;
          float direction = i == 0 ? -1.0 : 1.0;
          q.x -= direction * uAdjust.x * (1.0 - side) * area.z * 0.28 * regionWeight(q, area) * visible;
          q.y += uDetails.y * area.w * 0.28 * regionWeight(q, area) * visible;
        }
        for (int i = 0; i < 2; i++) {
          vec4 area = uAreas[i + 3]; float visible = i == 0 ? uVisibleSides.x : uVisibleSides.y;
          float upperRim = 1.0 - smoothstep(0.0, area.w * 0.75, q.y - area.y);
          q.y += uDetails.z * area.w * 0.28 * regionWeight(q, area) * visible * upperRim;
        }
        q.y += uDetails.w * uAreas[5].w * 0.28 * regionWeight(q, uAreas[5]);
        float mask = (1.0 - smoothstep(uLipY - 0.44, uLipY - 0.04, original.y)) *
          smoothstep(0.0, 0.2, 1.0 - square(original.x / 0.95) - square(original.y / 0.82));
        q = original + (q - original) * mask;
      }
      source = (uCenter + uAxis * q.x * uNoseSize.x + axisY * q.y * uNoseSize.y) / uResolution;
      }
    }
    gl_FragColor = vec4(correctSkin(source), 1.0);
    #include <colorspace_fragment>
  }
`;

class WarpRenderer {
  readonly canvas = document.createElement('canvas');
  readonly input = document.createElement('canvas');
  texture: CanvasTexture | null = null;
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 2);
  readonly geometry = new PlaneGeometry(2, 2);
  readonly material = new ShaderMaterial({
    uniforms: { uImage: { value: null as CanvasTexture | null }, uResolution: { value: new Vector2(1, 1) },
      uCenter: { value: new Vector2() }, uAxis: { value: new Vector2(1, 0) }, uNoseSize: { value: new Vector2(1, 1) },
      uAdjust: { value: new Vector3() }, uProfile: { value: new Vector3(0, 0, .3) }, uEnabled: { value: 0 }, uMode: { value: 1 },
      uProjection: { value: 0 }, uDetails: { value: new Vector4() }, uDetailsReady: { value: 0 }, uLipY: { value: 1 },
      uAreas: { value: Array.from({ length: 6 }, () => new Vector4(0, 0, 1, 1)) }, uVisibleSides: { value: new Vector2(1, 1) },
      uSkinAxis: { value: new Vector2(1, 0) }, uSkinNoseCenter: { value: new Vector2() }, uSkinNoseSize: { value: new Vector2(1, 1) },
      uBeauty: { value: new Vector3() }, uSkin: { value: new Vector4(0, 0, 1, 1) }, uSkinEnabled: { value: 0 },
      uColor: { value: new Vector3() }, uTonal: { value: new Vector2() },
      uProtected: { value: [new Vector4(0, 0, 1, 1), new Vector4(0, 0, 1, 1), new Vector4(0, 0, 1, 1)] },
      uSplit: { value: .5 }, uMirror: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: fragment, depthTest: false, depthWrite: false,
  });
  hasFrame = false;
  frame: NoseFrame | null = null;
  quality: Quality | null = null;
  filterQuality: Quality | null = null;
  constructor() {
    this.canvas.setAttribute('aria-label', '원본 및 코 윤곽 시뮬레이션 영상');
    this.canvas.dataset.testid = 'simulation-canvas';
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.scene.add(new Mesh(this.geometry, this.material));
  }
  present({ bitmap, quality, filterQuality, landmarks }: TrackedFrame) {
    const { width, height } = bitmap;
    if (!this.texture || this.input.width !== width || this.input.height !== height) {
      // GPU texture storage cannot be resized by changing its source canvas.
      this.texture?.dispose();
      this.input.width = width; this.input.height = height; this.renderer.setSize(width, height, false);
      this.texture = new CanvasTexture(this.input);
      this.texture.colorSpace = SRGBColorSpace; this.texture.generateMipmaps = false;
      this.texture.minFilter = LinearFilter; this.texture.magFilter = LinearFilter;
      this.material.uniforms.uImage.value = this.texture;
    }
    this.input.getContext('2d')!.drawImage(bitmap, 0, 0); bitmap.close();
    this.texture.needsUpdate = true; this.hasFrame = true; this.frame = quality.frame;
    this.quality = quality; this.filterQuality = filterQuality;
    const u = this.material.uniforms;
    const zones = landmarks ? skinZones(landmarks, width, height) : null;
    u.uSkinEnabled.value = zones ? 1 : 0;
    if (zones) {
      u.uSkin.value.set(zones.skin.x, zones.skin.y, zones.skin.rx, zones.skin.ry);
      u.uSkinAxis.value.set(zones.frame.axis.x, zones.frame.axis.y);
      u.uSkinNoseCenter.value.set(zones.frame.center.x, zones.frame.center.y);
      u.uSkinNoseSize.value.set(zones.frame.width, zones.frame.height);
    }
    zones?.protected.forEach((zone, i) => u.uProtected.value[i].set(zone.x, zone.y, zone.rx, zone.ry));
    u.uResolution.value.set(width, height); u.uEnabled.value = quality.ok ? 1 : 0;
  }
  draw(props: Pick<Props, 'adjustments' | 'mode' | 'split' | 'mirror' | 'beauty' | 'liveFilter'>) {
    const a = sanitizeAdjustments(props.adjustments), u = this.material.uniforms;
    const strength = props.liveFilter ? liveFilterStrength(this.filterQuality) : this.quality?.ok ? 1 : 0;
    const frame = props.liveFilter ? this.filterQuality?.frame : this.quality?.frame;
    if (frame) {
      u.uCenter.value.set(frame.center.x, frame.center.y); u.uAxis.value.set(frame.axis.x, frame.axis.y);
      u.uNoseSize.value.set(frame.width, frame.height);
    }
    u.uProfile.value.set(frame?.profile?.turn ?? 0, frame?.profile?.tip.x ?? 0, frame?.profile?.tip.y ?? .3);
    u.uEnabled.value = strength > 0 ? 1 : 0;
    u.uAdjust.value.set(a.width / 100 * strength, a.bridge / 100 * strength, a.tip / 100 * strength);
    u.uProjection.value = a.projection / 100 * strength;
    u.uDetails.value.set(a.tipSize / 100 * strength, a.alarLift / 100 * strength, a.nostrilExposure / 100 * strength, a.columella / 100 * strength);
    const regions = frame?.regions;
    u.uDetailsReady.value = regions ? 1 : 0;
    if (regions) {
      [regions.tip, ...regions.alar, ...regions.nostrils, regions.columella].forEach((r, i) => u.uAreas.value[i].set(r.center.x, r.center.y, r.radius.x, r.radius.y));
      u.uVisibleSides.value.set(regions.alar[0].visibility, regions.alar[1].visibility); u.uLipY.value = regions.lipY;
    }
    const b = sanitizeBeauty(props.beauty);
    u.uBeauty.value.set(b.smoothing / 100, b.brightness / 100, b.warmth / 100);
    u.uColor.value.set(b.contrast / 100, b.saturation / 100, b.tint / 100);
    u.uTonal.value.set(b.shadows / 100, b.highlights / 100);
    u.uMode.value = props.mode === 'simulation' ? 0 : props.mode === 'compare' ? 1 : 2;
    u.uSplit.value = props.split; u.uMirror.value = props.mirror ? 1 : 0;
    this.renderer.render(this.scene, this.camera);
  }
  clear() {
    this.hasFrame = false; this.frame = null; this.quality = null; this.filterQuality = null;
    this.texture?.dispose(); this.texture = null; this.material.uniforms.uImage.value = null;
    this.input.width = 1; this.input.height = 1;
    this.material.uniforms.uEnabled.value = 0; this.material.uniforms.uSkinEnabled.value = 0; this.renderer.clear();
  }
  dispose() { this.clear(); this.material.dispose(); this.geometry.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); }
}

export const Viewport = forwardRef<ViewportHandle, Props>(function Viewport(props, ref) {
  const host = useRef<HTMLDivElement>(null), engine = useRef<WarpRenderer | null>(null);
  const current = useRef(props); current.current = props;
  const [ratio, setRatio] = useState(1), [bounds, setBounds] = useState({ width: 1, height: 1 });
  const [guide, setGuide] = useState<{ left: number; top: number; width: number; height: number; rotate: number; frame: NoseFrame } | null>(null);
  useEffect(() => {
    try {
      const renderer = new WarpRenderer(); engine.current = renderer;
      host.current!.appendChild(renderer.canvas);
      const lost = (event: Event) => { event.preventDefault(); current.current.onError('그래픽 처리가 중단되었습니다. 앱을 다시 실행해 주세요.'); };
      renderer.canvas.addEventListener('webglcontextlost', lost);
      return () => { renderer.canvas.removeEventListener('webglcontextlost', lost); renderer.dispose(); renderer.canvas.remove(); engine.current = null; };
    } catch { current.current.onError('WebGL2를 사용할 수 없습니다. 그래픽 드라이버를 확인해 주세요.'); }
  }, []);
  useEffect(() => {
    const parent = host.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect; setBounds({ width, height });
    });
    observer.observe(parent); return () => observer.disconnect();
  }, []);
  useEffect(() => { if (engine.current?.hasFrame) engine.current.draw(props); }, [props.adjustments, props.mode, props.split, props.mirror, props.beauty, props.liveFilter]);
  useImperativeHandle(ref, () => ({
    present(frame) {
      const renderer = engine.current;
      if (!renderer) { frame.bitmap.close(); return; }
      const w = frame.bitmap.width, h = frame.bitmap.height, f = frame.quality.frame;
      setRatio(w / h);
      setGuide(f ? { left: f.center.x / w * 100,
        top: f.center.y / h * 100, width: f.width * 1.9 / w * 100, height: f.height * 1.64 / h * 100,
        rotate: Math.atan2(f.axis.y, f.axis.x) * 180 / Math.PI, frame: f } : null);
      renderer.present(frame); renderer.draw(current.current);
    },
    clear() { engine.current?.clear(); setGuide(null); },
    capture(label) {
      const renderer = engine.current;
      if (current.current.liveFilter || !renderer?.hasFrame || !renderer.frame) return null;
      const output = document.createElement('canvas'), cell = 800;
      const imageHeight = Math.round(cell * renderer.input.height / renderer.input.width);
      output.width = 1600; output.height = imageHeight + 240;
      const ctx = output.getContext('2d')!;
      // Resize each view at the same origin before placing it in the sheet.
      // Fractional downscaling at x=0 vs x=800 can otherwise round colors differently.
      const cellCanvas = document.createElement('canvas'); cellCanvas.width = cell; cellCanvas.height = imageHeight;
      const cellContext = cellCanvas.getContext('2d')!;
      ctx.fillStyle = '#f6f7f6'; ctx.fillRect(0, 0, output.width, output.height);
      ctx.fillStyle = '#173e3b'; ctx.font = 'bold 23px sans-serif';
      ctx.fillText(current.current.correctionActive ? 'NoseView · 원본 (피부 보정)' : 'NoseView · 원본', 28, 37); ctx.fillText('가상 시뮬레이션', 828, 37);
      renderer.draw({ ...current.current, mode: 'original' }); cellContext.drawImage(renderer.canvas, 0, 0, cell, imageHeight); ctx.drawImage(cellCanvas, 0, 60);
      renderer.draw({ ...current.current, mode: 'simulation' }); cellContext.drawImage(renderer.canvas, 0, 0, cell, imageHeight); ctx.drawImage(cellCanvas, cell, 60);
      renderer.draw(current.current);
      ctx.fillStyle = '#173e3b'; ctx.font = 'bold 24px sans-serif';
      ctx.fillText('가상 시뮬레이션 · 실제 수술 결과와 다를 수 있습니다.', 28, imageHeight + 103);
      ctx.fillStyle = '#566663'; ctx.font = '18px sans-serif';
      const a = sanitizeAdjustments(current.current.adjustments);
      ctx.fillText(`${label}  |  상대 조절값 · 2D 윤곽 시제품`, 28, imageHeight + 132);
      for (let i = 0; i < 2; i++) ctx.fillText(NOSE_CONTROLS.slice(i * 4, i * 4 + 4).map(c => `${c.label} ${a[c.key] > 0 ? '+' : ''}${a[c.key]}`).join(' / '), 28, imageHeight + 158 + i * 26);
      ctx.font = '16px sans-serif'; ctx.fillText(`${beautyLabel(current.current.beauty)} · 원본과 가상에 동일 적용`, 28, imageHeight + 214);
      return output.toDataURL('image/png');
    },
  }), []);
  const displayWidth = Math.max(1, Math.min(bounds.width, bounds.height * ratio));
  let selectedAreas: NoseRegion[] = [];
  const areas = guide?.frame.regions, key = props.selectedControl;
  if (areas && key) selectedAreas = key === 'tipSize' || key === 'tip' ? [areas.tip] : key === 'alarLift' || key === 'width' ? areas.alar : key === 'nostrilExposure' ? areas.nostrils : key === 'columella' ? [areas.columella] : [];
  if (key === 'bridge' || key === 'projection') selectedAreas = [{ center: { x: 0, y: -.26 }, radius: { x: .42, y: .38 }, visibility: 1 }];
  return <div className="image-wrap" ref={host} style={{ width: displayWidth, height: displayWidth / ratio }}>
    {props.ready && <>
      <div className="image-badges"><span>{props.mode === 'simulation' ? '가상 시뮬레이션' : props.correctionActive ? '원본 · 피부 보정' : '원본'}</span>
        {props.mode === 'compare' && <span className="sim-badge">가상 시뮬레이션</span>}</div>
      {props.mode === 'compare' && <><div className="split-line" style={{ left: `${props.split * 100}%` }}><span>‹ ›</span></div>
        <input className="split-input" type="range" aria-label="원본 비교 경계" min="5" max="95" value={Math.round(props.split * 100)} onChange={e => props.onSplit(Number(e.target.value) / 100)} /></>}
    {props.showGuide && guide && <div className="nose-guide" style={{ left: `${props.mirror ? 100 - guide.left : guide.left}%`, top: `${guide.top}%`, width: `${guide.width}%`, height: `${guide.height}%`, borderColor: selectedAreas.length ? 'transparent' : undefined, background: selectedAreas.length ? 'transparent' : undefined,
      transform: `translate(-50%, -50%) rotate(${guide.rotate * (props.mirror ? -1 : 1)}deg)` }}>
      {selectedAreas.filter(a => a.visibility > .05).map((a, i) => <div key={i} data-region-guide={key} aria-label={`${NOSE_CONTROLS.find(c => c.key === key)?.label} 조절 영역`} style={{ position: 'absolute', pointerEvents: 'none', border: '2px solid #4079ff', background: '#4079ff12', borderRadius: '50%',
        left: `${50 + (props.mirror ? -1 : 1) * a.center.x / 1.9 * 100}%`, top: `${50 + a.center.y / 1.64 * 100}%`, width: `${a.radius.x * 2 / 1.9 * 100}%`, height: `${a.radius.y * 2 / 1.64 * 100}%`, transform: 'translate(-50%, -50%)' }}/>)}</div>}
    </>}
  </div>;
});
