import { FrameGate } from '../core/frame-gate';
import { evaluateFace, type Point, type Quality } from '../core/geometry';
import type { WorkerRequest, WorkerResponse } from './messages';

export type TrackedFrame = { bitmap: ImageBitmap; quality: Quality; filterQuality: Quality; landmarks: Point[] | null; inferenceMs: number; processingMs: number };
type Callbacks = { ready: (delegate: string) => void; frame: (frame: TrackedFrame) => void; error: (message: string) => void };

export class Pipeline {
  private worker: Worker;
  private gate = new FrameGate();
  private source: HTMLVideoElement | HTMLImageElement | null = null;
  private ready = false;
  private disposed = false;
  private paused = false;
  private animation = 0;
  private lastVideoTime = -1;
  private imageSubmitted = false;
  private timeout: ReturnType<typeof setTimeout> | undefined;

  constructor(private callbacks: Callbacks) {
    this.worker = new Worker(new URL('vendor/face-worker.js', document.baseURI));
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (this.disposed) { if (msg.type === 'result') msg.bitmap.close(); return; }
      if (msg.type === 'ready') {
        if (this.ready) return;
        clearTimeout(this.timeout); this.ready = true; this.callbacks.ready(msg.delegate); return;
      }
      if (msg.type === 'fatal') { this.fail(msg.message); return; }
      if (!this.gate.isPending(msg.ticket)) { msg.bitmap.close(); return; }
      clearTimeout(this.timeout);
      const accepted = this.gate.complete(msg.ticket);
      if (this.disposed || !accepted || this.paused) { msg.bitmap.close(); return; }
      const quality = evaluateFace(msg.faces, msg.matrices, msg.bitmap.width, msg.bitmap.height);
      const filterQuality = evaluateFace(msg.faces, msg.matrices, msg.bitmap.width, msg.bitmap.height, 'filter');
      this.callbacks.frame({ bitmap: msg.bitmap, quality, filterQuality, landmarks: msg.faces.length === 1 ? msg.faces[0] : null, inferenceMs: msg.inferenceMs,
        processingMs: performance.now() - msg.timestamp });
    };
    this.worker.onerror = () => this.fail('얼굴 추적 엔진이 중단되었습니다. 앱을 다시 실행해 주세요.');
    this.send({ type: 'init', base: new URL('./', document.baseURI).href });
    this.timeout = setTimeout(() => this.fail('모델 준비 시간이 초과되었습니다. 앱을 다시 실행해 주세요.'), 30000);
    this.animation = requestAnimationFrame(this.tick);
  }

  private send(message: WorkerRequest, transfer?: Transferable[]) { this.worker.postMessage(message, transfer ?? []); }
  private fail(message: string) {
    if (this.disposed) return;
    this.dispose(); this.callbacks.error(message);
  }
  setSource(source: HTMLVideoElement | HTMLImageElement | null) {
    this.gate.invalidate(); this.source = source; this.lastVideoTime = -1; this.imageSubmitted = false; this.paused = false;
  }
  setPaused(paused: boolean) {
    this.paused = paused; this.gate.invalidate();
    if (!paused) { this.lastVideoTime = -1; this.imageSubmitted = false; }
  }
  private tick = () => {
    if (this.disposed) return;
    this.animation = requestAnimationFrame(this.tick);
    if (!this.ready || this.paused || !this.source) return;
    const source = this.source;
    const video = source instanceof HTMLVideoElement;
    if (video && (source.readyState < 2 || source.currentTime === this.lastVideoTime)) return;
    if (!video && (!source.complete || this.imageSubmitted)) return;
    const ticket = this.gate.begin();
    if (!ticket) return;
    const w = video ? source.videoWidth : source.naturalWidth;
    const h = video ? source.videoHeight : source.naturalHeight;
    if (!w || !h) { this.gate.complete(ticket); return; }
    if (video) this.lastVideoTime = source.currentTime;
    else this.imageSubmitted = true;
    const scale = Math.min(1, 1920 / Math.max(w, h));
    const timestamp = performance.now();
    // Capture can hang before anything reaches the Worker. A stale capture may
    // release its own ticket, but must never clear a newer frame's watchdog.
    this.timeout = setTimeout(() => {
      if (!this.gate.isPending(ticket)) return;
      if (this.gate.complete(ticket)) this.fail('카메라 프레임 취득 시간이 초과되었습니다. 앱을 다시 불러와 주세요.');
    }, 8000);
    void createImageBitmap(source, { resizeWidth: Math.round(w * scale), resizeHeight: Math.round(h * scale), resizeQuality: 'medium' })
      .then(bitmap => {
        if (this.disposed || !this.gate.isCurrent(ticket)) {
          bitmap.close();
          if (this.gate.isPending(ticket)) { clearTimeout(this.timeout); this.gate.complete(ticket); }
          return;
        }
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => this.fail('영상 처리가 멈췄습니다. 앱을 다시 실행해 주세요.'), 8000);
        try { this.send({ type: 'frame', bitmap, timestamp, ticket }, [bitmap]); }
        catch (error) { bitmap.close(); throw error; }
      })
      .catch(() => {
        if (!this.gate.isPending(ticket)) return;
        clearTimeout(this.timeout);
        const current = this.gate.complete(ticket);
        if (!current || this.disposed) return;
        this.fail('카메라 프레임을 읽지 못했습니다. 카메라 연결을 확인해 주세요.');
      });
  };
  dispose() {
    this.disposed = true; this.gate.invalidate(); this.source = null;
    clearTimeout(this.timeout); cancelAnimationFrame(this.animation); this.worker.terminate();
  }
}
