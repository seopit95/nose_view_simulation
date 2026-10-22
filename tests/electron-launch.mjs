import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';

// Tests must not read user defaults or activate a physical webcam, including
// when a startup regression calls getUserMedia before a page hook is installed.
export async function isolatedLaunch() {
  const root = path.resolve('qa/test-profiles'); await mkdir(root, { recursive: true });
  const profile = await mkdtemp(path.join(root, 'run-'));
  const args = [`--user-data-dir=${profile}`, '--use-fake-device-for-media-stream'];
  return process.env.NOSEVIEW_EXECUTABLE
    ? { executablePath: process.env.NOSEVIEW_EXECUTABLE, args }
    : { args: ['.', ...args] };
}
