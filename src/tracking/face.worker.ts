import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { WorkerRequest, WorkerResponse } from './messages';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
};
let detector: FaceLandmarker | null = null;
let trackingCanvas: OffscreenCanvas | null = null;

async function initialize(base: string) {
  try {
    const fileset = await FilesetResolver.forVisionTasks(new URL('vendor/wasm', base).href);
    const create = (delegate: 'GPU' | 'CPU') => FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: new URL('assets/face_landmarker.task', base).href, delegate },
      canvas: new OffscreenCanvas(1, 1), runningMode: 'VIDEO', numFaces: 2,
      minFaceDetectionConfidence: .65, minFacePresenceConfidence: .65, minTrackingConfidence: .65,
      outputFacialTransformationMatrixes: true, outputFaceBlendshapes: false,
    });
    let delegate: 'GPU' | 'CPU' = 'GPU';
    try { detector = await create('GPU'); }
    catch { delegate = 'CPU'; detector = await create('CPU'); }
    scope.postMessage({ type: 'ready', delegate });
  } catch {
    scope.postMessage({ type: 'fatal', message: '얼굴 추적 모델을 시작하지 못했습니다. 앱을 다시 실행해 주세요.' });
  }
}

scope.onmessage = event => {
  const msg = event.data;
  if (msg.type === 'init') { void initialize(msg.base); return; }
  const start = performance.now();
  try {
    if (!detector) throw new Error('Model not ready');
    // Keep the captured bitmap for display; infer from a smaller copy of this
    // exact frame, never from a later video frame.
    const scale = Math.min(1, 960 / Math.max(msg.bitmap.width, msg.bitmap.height));
    trackingCanvas ??= new OffscreenCanvas(1, 1);
    const width = Math.round(msg.bitmap.width * scale), height = Math.round(msg.bitmap.height * scale);
    if (trackingCanvas.width !== width || trackingCanvas.height !== height) {
      trackingCanvas.width = width; trackingCanvas.height = height;
    }
    trackingCanvas.getContext('2d')!.drawImage(msg.bitmap, 0, 0, width, height);
    const result = detector.detectForVideo(trackingCanvas, msg.timestamp);
    scope.postMessage({ type: 'result', bitmap: msg.bitmap, ticket: msg.ticket, timestamp: msg.timestamp,
      inferenceMs: performance.now() - start, faces: result.faceLandmarks,
      matrices: result.facialTransformationMatrixes.map(matrix => matrix.data) }, [msg.bitmap]);
  } catch {
    scope.postMessage({ type: 'result', bitmap: msg.bitmap, ticket: msg.ticket, timestamp: msg.timestamp,
      inferenceMs: performance.now() - start, faces: [], matrices: [], error: '추적을 잠시 사용할 수 없습니다' }, [msg.bitmap]);
  } finally {
    trackingCanvas?.getContext('2d')?.clearRect(0, 0, trackingCanvas.width, trackingCanvas.height);
  }
};
