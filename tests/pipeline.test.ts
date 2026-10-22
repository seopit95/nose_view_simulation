import { afterEach, expect, it, vi } from 'vitest';
import { Pipeline } from '../src/tracking/pipeline';
import type { WorkerRequest, WorkerResponse } from '../src/tracking/messages';

// Exercise the real coordinator at the asynchronous capture/worker boundary.
// The detector itself is exercised separately by the real-model Electron test.
class Video { readyState = 2; currentTime = 1; videoWidth = 1280; videoHeight = 720; }
class Photo { complete = true; naturalWidth = 960; naturalHeight = 960; }
class WorkerHarness {
  static latest: WorkerHarness;
  onmessage: ((event: { data: WorkerResponse }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  messages: WorkerRequest[] = [];
  constructor() { WorkerHarness.latest = this; }
  postMessage(message: WorkerRequest) { this.messages.push(message); }
  terminate() { this.terminated = true; }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function captureInProgress() {
  let tick: (() => void) | undefined;
  let reject: ((cause: Error) => void) | undefined;
  let resolve: ((bitmap: ImageBitmap) => void) | undefined;
  vi.stubGlobal('Worker', WorkerHarness);
  vi.stubGlobal('document', { baseURI: 'https://local.test/' });
  vi.stubGlobal('HTMLVideoElement', Video);
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { tick = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const capture = vi.fn(() => new Promise((ok, fail) => { resolve = ok; reject = fail; }));
  vi.stubGlobal('createImageBitmap', capture);
  const error = vi.fn(), ready = vi.fn(), frame = vi.fn();
  const pipeline = new Pipeline({ ready, frame, error });
  WorkerHarness.latest.onmessage!({ data: { type: 'ready', delegate: 'GPU' } });
  const video = new Video(); pipeline.setSource(video as unknown as HTMLVideoElement); tick!();
  return { pipeline, error, ready, frame, video, capture, tick: () => tick!(), resolve: (bitmap: ImageBitmap) => resolve!(bitmap),
    reject: () => reject!(new Error('Old video detached')), worker: WorkerHarness.latest };
}
it('이전 입력의 프레임 취득 실패는 새로운 입력을 중단하지 않는다', async () => {
  const state = captureInProgress();
  state.pipeline.setSource(new Photo() as unknown as HTMLImageElement);
  state.reject(); await new Promise(resolve => setImmediate(resolve));
  try { expect(state.error).not.toHaveBeenCalled(); expect(state.worker.terminated).toBe(false); }
  finally { state.pipeline.dispose(); }
});
it('현재 입력의 프레임 취득 실패는 오류로 알리고 자원을 정리한다', async () => {
  const state = captureInProgress();
  state.reject(); await new Promise(resolve => setImmediate(resolve));
  expect(state.error).toHaveBeenCalledOnce(); expect(state.worker.terminated).toBe(true);
});

const bitmap = () => ({ width: 960, height: 720, close: vi.fn() }) as unknown as ImageBitmap;
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

it('단일 얼굴의 현재 좌표는 윤곽 품질 실패에도 전달하고 복수 얼굴은 전달하지 않는다', async () => {
  const state = captureInProgress();
  try {
    const face = Array.from({ length: 478 }, () => ({ x: .5, y: .5 }));
    for (const faces of [[face], [face, face], []]) {
      state.resolve(bitmap()); await flush();
      const request = state.worker.messages.filter(m => m.type === 'frame').at(-1)!;
      if (request.type !== 'frame') throw new Error('Frame not submitted');
      state.worker.onmessage!({ data: { type: 'result', bitmap: bitmap(), ticket: request.ticket,
        timestamp: request.timestamp, inferenceMs: 1, faces, matrices: [] } });
      const delivered = state.frame.mock.calls.at(-1)![0];
      expect(delivered.quality.ok).toBe(false);
      expect(delivered.landmarks).toEqual(faces.length === 1 ? face : null);
      state.video.currentTime++; state.tick();
    }
  } finally { state.pipeline.dispose(); }
});

it('촬영 원본은 720p를 보존하고 4K 입력만 긴 변 1920으로 제한한다', async () => {
  const state = captureInProgress();
  try {
    expect(state.capture).toHaveBeenLastCalledWith(state.video, { resizeWidth: 1280, resizeHeight: 720, resizeQuality: 'medium' });
    state.resolve(bitmap()); await flush();
    const request = state.worker.messages.find(m => m.type === 'frame')!;
    if (request.type !== 'frame') throw new Error('Frame not submitted');
    state.worker.onmessage!({ data: { type: 'result', bitmap: bitmap(), ticket: request.ticket, timestamp: request.timestamp,
      inferenceMs: 1, faces: [], matrices: [] } });
    state.video.videoWidth = 3840; state.video.videoHeight = 2160; state.video.currentTime++; state.tick();
    expect(state.capture).toHaveBeenLastCalledWith(state.video, { resizeWidth: 1920, resizeHeight: 1080, resizeQuality: 'medium' });
  } finally { state.pipeline.dispose(); }
});

it('프레임 취득 자체가 멈춰도 제한 시간 후 오류를 알린다', async () => {
  vi.useFakeTimers(); const state = captureInProgress();
  try { await vi.advanceTimersByTimeAsync(8000); expect(state.error).toHaveBeenCalledOnce(); expect(state.worker.terminated).toBe(true); }
  finally { state.pipeline.dispose(); }
});

it('이전 입력의 늦은 bitmap은 추론하지 않고 닫는다', async () => {
  const state = captureInProgress(), image = bitmap();
  state.pipeline.setSource(new Photo() as unknown as HTMLImageElement);
  state.resolve(image); await flush();
  try { expect(state.worker.messages.filter(m => m.type === 'frame')).toHaveLength(0); expect(image.close).toHaveBeenCalledOnce(); }
  finally { state.pipeline.dispose(); }
});

it('종료된 파이프라인의 늦은 ready는 앱을 다시 준비 상태로 바꾸지 않는다', () => {
  const state = captureInProgress(); state.pipeline.dispose();
  state.worker.onmessage!({ data: { type: 'ready', delegate: 'CPU' } });
  expect(state.ready).toHaveBeenCalledTimes(1);
});

it('중복된 이전 결과가 현재 프레임의 응답 제한 시간을 해제하지 않는다', async () => {
  vi.useFakeTimers(); const state = captureInProgress(), first = bitmap();
  state.resolve(first); await flush();
  const request = state.worker.messages.find(m => m.type === 'frame')!;
  if (request.type !== 'frame') throw new Error('Frame not submitted');
  const response: WorkerResponse = { type: 'result', bitmap: first, ticket: request.ticket, timestamp: request.timestamp, inferenceMs: 1, faces: [], matrices: [] };
  state.worker.onmessage!({ data: response });
  state.video.currentTime++; state.tick(); state.resolve(bitmap()); await flush();
  state.worker.onmessage!({ data: { ...response, bitmap: bitmap() } });
  try { await vi.advanceTimersByTimeAsync(8000); expect(state.error).toHaveBeenCalledOnce(); }
  finally { state.pipeline.dispose(); }
});

it('Worker 전송 실패 때 소유한 bitmap을 닫고 오류를 알린다', async () => {
  const state = captureInProgress(), image = bitmap();
  state.worker.postMessage = () => { throw new Error('Transfer failed'); };
  state.resolve(image); await flush();
  try { expect(state.error).toHaveBeenCalledOnce(); expect(image.close).toHaveBeenCalledOnce(); }
  finally { state.pipeline.dispose(); }
});
