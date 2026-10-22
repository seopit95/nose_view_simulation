import { expect, it } from 'vitest';
import { FrameGate } from '../src/core/frame-gate';

it('처리 중에는 프레임을 쌓지 않고 결과 수신 후에만 다음 프레임을 받는다', () => {
  const gate = new FrameGate();
  const first = gate.begin()!;
  expect(gate.begin()).toBeNull();
  expect(gate.complete(first)).toBe(true);
  expect(gate.begin()).not.toBeNull();
});
it('카메라/세션 변경 전 프레임은 화면에 표시하지 않는다', () => {
  const gate = new FrameGate();
  const oldFrame = gate.begin()!;
  gate.invalidate();
  expect(gate.begin()).toBeNull();
  expect(gate.complete(oldFrame)).toBe(false);
  const current = gate.begin()!;
  expect(gate.complete(current)).toBe(true);
});
it('중복된 오래된 응답이 현재 프레임 잠금을 풀지 않는다', () => {
  const gate = new FrameGate();
  const first = gate.begin()!; gate.complete(first);
  gate.begin();
  expect(gate.complete(first)).toBe(false);
  expect(gate.begin()).toBeNull();
});
