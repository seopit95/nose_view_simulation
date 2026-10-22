import { afterEach, expect, it, vi } from 'vitest';

const detector = vi.hoisted(() => ({ detectForVideo: vi.fn((_image: unknown, _timestamp: number) => ({ faceLandmarks: [], facialTransformationMatrixes: [] })) }));
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  FaceLandmarker: { createFromOptions: async () => detector },
}));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); detector.detectForVideo.mockClear(); });

it.each([false, true])('Worker는 같은 프레임을 축소 추론한 뒤 임시 canvas를 비운다 (추론 실패=%s)', async failed => {
  const drawImage = vi.fn(), clearRect = vi.fn();
  class Canvas { constructor(public width: number, public height: number) {} getContext() { return { drawImage, clearRect }; } }
  const scope = { onmessage: null as unknown as (event: { data: unknown }) => void, postMessage: vi.fn() };
  vi.stubGlobal('self', scope); vi.stubGlobal('OffscreenCanvas', Canvas);
  await import('../src/tracking/face.worker');
  scope.onmessage({ data: { type: 'init', base: 'https://local.test/' } });
  await vi.waitFor(() => expect(scope.postMessage).toHaveBeenCalledWith({ type: 'ready', delegate: 'GPU' }));
  if (failed) detector.detectForVideo.mockImplementationOnce(() => { throw new Error('Inference failed'); });
  const bitmap = { width: 1920, height: 1080, close: vi.fn() }, ticket = { id: 1, generation: 1 };
  scope.onmessage({ data: { type: 'frame', bitmap, timestamp: 123, ticket } });
  const input = detector.detectForVideo.mock.calls[0]?.[0] as unknown as Canvas;
  expect(input).not.toBe(bitmap);
  expect([input.width, input.height]).toEqual([960, 540]);
  expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 960, 540);
  expect(scope.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'result', bitmap, ticket }), [bitmap]);
  expect(bitmap.close).not.toHaveBeenCalled();
  expect(clearRect).toHaveBeenCalledWith(0, 0, 960, 540);
});
