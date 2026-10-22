import { mkdir, readFile, writeFile, cp, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const destination = new URL('../public/assets/face_landmarker.task', import.meta.url);
const expected = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
await mkdir(new URL('../public/vendor/', import.meta.url), { recursive: true });
await mkdir(new URL('../public/assets/', import.meta.url), { recursive: true });
try { await access(destination); }
catch {
  const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(data).digest('hex') !== expected) throw new Error('Model checksum mismatch');
  await writeFile(destination, data);
}
if (createHash('sha256').update(await readFile(destination)).digest('hex') !== expected) throw new Error('Bundled model checksum mismatch');
await cp(new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url), new URL('../public/vendor/wasm/', import.meta.url), { recursive: true });
console.log('Local model verified; MediaPipe WASM copied. Runtime downloads are not needed.');
