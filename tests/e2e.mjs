import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile, readFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { isolatedLaunch } from './electron-launch.mjs';
import { installSyntheticCamera, connectSyntheticCamera } from './synthetic-camera.mjs';

await mkdir('qa', { recursive: true });
const report = { checkedAt: new Date().toISOString(), status: 'running', platform: process.platform, arch: process.arch,
  executable: process.env.NOSEVIEW_EXECUTABLE ?? 'electron .', sourceSha256: process.env.NOSEVIEW_SOURCE_SHA256 ?? null, checks: [], errors: [] };
await writeFile('qa/e2e-report.json', JSON.stringify(report, null, 2));
const check = (name, detail) => { report.checks.push({ name, detail }); console.log('PASS', name, detail ?? ''); };
const launch = await isolatedLaunch();
report.packagedApplication = Boolean(process.env.NOSEVIEW_EXECUTABLE);
const app = await electron.launch({ ...launch, timeout: 30000 });
const page = await app.firstWindow();
await installSyntheticCamera(page);
const requests = [];
page.on('request', request => requests.push(request.url()));
page.on('pageerror', error => report.errors.push(error.message));
const range = async (label, value) => {
  const input = page.getByRole('slider', { name: label, exact: true });
  await input.evaluate((element, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(next));
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await expect(input).toHaveValue(String(value));
};
const ready = () => page.getByText('정면 얼굴 추적 중', { exact: true }).waitFor({ timeout: 35000 });
try {
  await connectSyntheticCamera(page);
  check('Bundled local model recognizes a synthetic face, in Electron');
  await expect(page.getByRole('button', { name: '비교 이미지 저장', exact: true })).toBeInViewport();
  check('Export action visible at default window size');

  await page.getByRole('button', { name: '원본', exact: true }).click();
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid=simulation-canvas]');
    const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
    const ctx = copy.getContext('2d'); ctx.drawImage(canvas, 0, 0);
    window.__baseline = ctx.getImageData(0, 0, copy.width, copy.height).data;
  });
  await page.getByRole('button', { name: '가상 보기', exact: true }).click();
  const zeroDifference = await page.evaluate(() => {
    const source = document.querySelector('[data-testid=simulation-canvas]');
    const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(source, 0, 0); const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels.reduce((sum, value, index) => sum + Math.abs(value - window.__baseline[index]), 0);
  });
  assert.equal(zeroDifference, 0); check('Zero deformation is pixel-identical to original');
  await range('콧볼 폭', -80); await range('콧대 폭', -55); await range('코끝 상하', 65);
  await page.getByLabel('조절 영역 표시', { exact: true }).check();
  const deformation = await page.evaluate(() => {
    const source = document.querySelector('[data-testid=simulation-canvas]');
    const guide = document.querySelector('.nose-guide').getBoundingClientRect(), box = source.getBoundingClientRect();
    const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(source, 0, 0); const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const bounds = { left: (guide.left - box.left) / box.width * canvas.width - 3, top: (guide.top - box.top) / box.height * canvas.height - 3,
      right: (guide.right - box.left) / box.width * canvas.width + 3, bottom: (guide.bottom - box.top) / box.height * canvas.height + 3 };
    let changed = 0, outside = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const difference = Math.max(Math.abs(pixels[i] - window.__baseline[i]), Math.abs(pixels[i + 1] - window.__baseline[i + 1]), Math.abs(pixels[i + 2] - window.__baseline[i + 2]));
      if (difference > 1) {
        changed++; const x = (i / 4) % canvas.width, y = Math.floor(i / 4 / canvas.width);
        if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) outside++;
      }
    }
    return { changed, outside, total: canvas.width * canvas.height };
  });
  assert.ok(deformation.changed > 100 && deformation.changed / deformation.total < .1, JSON.stringify(deformation));
  assert.equal(deformation.outside, 0); check('Actual GPU warp changes only nose area', deformation);
  await page.getByLabel('조절 영역 표시', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'A안 저장', exact: true }).click();
  await range('콧볼 폭', 35); await page.getByRole('button', { name: 'A안 불러오기', exact: true }).click();
  await expect(page.getByRole('slider', { name: '콧볼 폭', exact: true })).toHaveValue('-80');
  check('A/B/C stores and restores actual adjustment values');
  await page.getByRole('button', { name: '비교', exact: true }).click();
  await range('원본 비교 경계', 41);
  await page.locator('.control-scroll').evaluate(element => { element.scrollTop = 0; });
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 5000 });
  await page.screenshot({ path: 'qa/desktop-camera.png', fullPage: true });

  await page.getByRole('button', { name: '비교 이미지 저장', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PNG 저장', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: '촬영 대상자의 이미지 저장 동의를 확인했습니다.' }).check();
  await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true, filePath: undefined }); });
  await page.getByRole('button', { name: 'PNG 저장', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '비교 이미지 저장' })).toBeVisible();
  const output = path.resolve(`qa/export-${Date.now()}.png`);
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, output);
  await page.screenshot({ path: 'qa/export-dialog.png', fullPage: true });
  await page.getByRole('button', { name: 'PNG 저장', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '비교 이미지 저장' })).toHaveCount(0);
  const saved = await readFile(output); assert.equal(saved.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(saved.readUInt32BE(16), 1600); assert.ok(saved.length > 10000);
  check('Consent-gated native PNG export, cancel handling, and real file write', { bytes: saved.length, width: 1600 });
  const invalid = await page.evaluate(() => window.noseview.savePng('data:image/png;base64,invalid'));
  assert.equal(invalid.saved, false); check('Desktop IPC rejects invalid image payloads');

  await app.context().setOffline(true); await page.reload(); await connectSyntheticCamera(page);
  check('Face tracking initializes after full reload with network offline');
  const denied = await page.evaluate(async () => {
    try { await fetch('https://example.com/blocked-by-app-policy'); return false; } catch { return true; }
  });
  assert.equal(denied, true); check('External renderer requests blocked');
  await app.context().setOffline(false);
  await page.getByRole('button', { name: '웹캠 연결 해제', exact: true }).click();

  // This is a real browser MediaStream from an animated canvas, not landmark/model mocks.
  // Never call the host getUserMedia in this test; a real webcam is not activated.
  await page.evaluate(async () => {
    const image = new Image(); image.src = window.__syntheticImageUrl; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 960;
    const ctx = canvas.getContext('2d');
    window.__cameraTest = { mode: 'face', denied: false, streams: [], calls: [], timer: 0, delayed: false, release: null };
    let index = 0;
    const draw = () => {
      ctx.fillStyle = '#e5e6df'; ctx.fillRect(0, 0, 960, 960);
      if (window.__cameraTest.mode === 'face') ctx.drawImage(image, Math.sin(index++ / 20) * 2, 0, 960, 960);
      if (window.__cameraTest.mode === 'multiple') { ctx.drawImage(image, 0, 210, 480, 480); ctx.drawImage(image, 480, 210, 480, 480); }
    };
    draw(); window.__cameraTest.timer = setInterval(draw, 33);
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async constraints => {
      const state = window.__cameraTest; state.calls.push(constraints);
      if (state.denied) throw new DOMException('Test camera denied', 'NotAllowedError');
      if (state.delayed) await new Promise(resolve => { state.release = resolve; });
      const stream = canvas.captureStream(30); state.streams.push(stream); return stream;
    } });
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', { configurable: true, value: async () => [{ kind: 'videoinput', deviceId: 'test-camera', label: '검증용 가상 웹캠', groupId: 'test' }] });
  });
  await page.getByRole('button', { name: '웹캠 연결', exact: true }).click(); await ready();
  await expect(page.getByRole('button', { name: '일시정지', exact: true })).toBeEnabled();
  await page.locator('.camera-status > summary').click();
  await expect.poll(async () => (await page.locator('.camera-status > p').innerText()).includes('fps')).toBe(true);
  await expect.poll(async () => Number((await page.locator('.camera-status > p').innerText()).split(' ')[0]), { timeout: 10000 }).toBeGreaterThan(3);
  const cameraMetrics = await page.locator('.camera-status > p').innerText();
  const cameraCalls = await page.evaluate(() => window.__cameraTest.calls);
  assert.equal(cameraCalls[0].audio, false); check('Animated camera stream uses actual VIDEO inference', { cameraMetrics, constraints: cameraCalls[0] });
  await page.evaluate(() => window.__cameraTest.streams.at(-1).getVideoTracks()[0].dispatchEvent(new Event('mute')));
  await expect(page.getByText('웹캠 연결 유지 · 영상 대기', { exact: true })).toBeVisible();
  await expect(page.getByRole('slider', { name: '콧볼 폭', exact: true })).toBeDisabled();
  assert.equal(await page.evaluate(() => window.__cameraTest.streams.at(-1).getVideoTracks()[0].readyState), 'live');
  await page.evaluate(() => window.__cameraTest.streams.at(-1).getVideoTracks()[0].dispatchEvent(new Event('unmute')));
  await ready(); check('Temporary camera mute shows connected state and recovers');
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await expect(page.getByText('화면 일시정지', { exact: true })).toBeVisible();
  const frozen = await page.locator('canvas').evaluate(canvas => canvas.toDataURL());
  await range('콧볼 폭', 45);
  const altered = await page.locator('canvas').evaluate(canvas => canvas.toDataURL());
  assert.notEqual(frozen, altered); check('Paused frame remains adjustable');
  await page.getByRole('button', { name: '다시 재생', exact: true }).click(); await ready();
  await page.evaluate(() => { window.__cameraTest.mode = 'multiple'; });
  await expect(page.getByRole('slider', { name: '콧볼 폭', exact: true })).toBeDisabled({ timeout: 10000 });
  await expect(page.getByText('한 분만 화면에 들어와 주세요', { exact: true }).first()).toBeVisible({ timeout: 10000 });
  check('Real model detects two faces and disables deformation');
  await page.evaluate(() => { window.__cameraTest.mode = 'missing'; });
  await expect(page.getByText('얼굴을 화면 가운데에 맞춰 주세요', { exact: true }).first()).toBeVisible({ timeout: 10000 });
  check('Real no-face frames display original and disable controls');
  await page.evaluate(() => { window.__cameraTest.mode = 'face'; }); await ready();
  await page.getByRole('button', { name: 'B안 저장', exact: true }).click();
  await page.evaluate(() => { const track = window.__cameraTest.streams.at(-1).getVideoTracks()[0]; track.stop(); track.dispatchEvent(new Event('ended')); });
  await expect(page.getByRole('button', { name: '웹캠 연결', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'B안 저장', exact: true })).toBeDisabled();
  await expect(page.getByRole('slider', { name: '콧볼 폭', exact: true })).toHaveValue('0');
  check('Unplug event clears preview and temporary consultation settings');

  await page.evaluate(() => { window.__cameraTest.denied = true; });
  await page.getByRole('button', { name: '웹캠 연결', exact: true }).click();
  await expect(page.getByText(/카메라 접근이 허용되지 않았습니다/)).toBeVisible();
  check('Permission denial produces actionable recovery message');
  await page.evaluate(() => { window.__cameraTest.denied = false; window.__cameraTest.delayed = true; });
  await page.getByRole('button', { name: '웹캠 연결', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof window.__cameraTest.release)).toBe('function');
  await page.getByRole('button', { name: '연결 취소', exact: true }).click();
  await page.evaluate(() => window.__cameraTest.release());
  await expect.poll(() => page.evaluate(() => window.__cameraTest.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')))).toBe(true);
  check('Cancelled asynchronous camera acquisition stops late-arriving tracks');
  await page.evaluate(() => { window.__cameraTest.delayed = false; });
  await connectSyntheticCamera(page);
  await page.getByRole('button', { name: 'C안 저장', exact: true }).click();
  await page.getByRole('button', { name: '새 상담', exact: true }).click();
  await page.getByRole('button', { name: '새 상담 시작', exact: true }).click();
  await expect(page.getByRole('slider', { name: '콧볼 폭', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'C안 저장', exact: true })).toBeDisabled();
  check('New consultation shuts down input and clears all slots');

  await app.context().addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (type.startsWith('webgl') || type === 'experimental-webgl') return null;
      return original.call(this, type, ...rest);
    };
    const OriginalWorker = window.Worker; window.__workerStarts = 0;
    window.Worker = class extends OriginalWorker { constructor(...args) { super(...args); window.__workerStarts++; } };
  });
  await page.reload();
  await expect(page.getByText('WebGL2를 사용할 수 없습니다. 그래픽 드라이버를 확인해 주세요.', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('엔진 확인 필요', { exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => window.__workerStarts), 0);
  check('Graphics startup failure stays failed and never starts inference/camera');
  report.externalRequests = requests.filter(url => /^https?:/.test(url) && !url.includes('blocked-by-app-policy'));
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.errors, []);
  check('No page exceptions or unexpected external requests');
} catch (error) {
  report.failure = error.stack; process.exitCode = 1;
  console.error(error);
  await page.screenshot({ path: 'qa/e2e-failure.png', fullPage: true }).catch(() => {});
  console.error(await page.locator('body').innerText());
} finally {
  report.status = report.failure ? 'failed' : 'passed';
  await writeFile('qa/e2e-report.json', JSON.stringify(report, null, 2));
  await app.close();
}
