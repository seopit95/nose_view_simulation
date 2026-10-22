import type { Point } from '../core/geometry';
import type { Ticket } from '../core/frame-gate';

export type WorkerRequest = { type: 'init'; base: string } |
  { type: 'frame'; bitmap: ImageBitmap; timestamp: number; ticket: Ticket };
export type WorkerResponse = { type: 'ready'; delegate: 'GPU' | 'CPU' } |
  { type: 'fatal'; message: string } |
  { type: 'result'; bitmap: ImageBitmap; ticket: Ticket; timestamp: number; inferenceMs: number;
    faces: Point[][]; matrices: number[][]; error?: string };
