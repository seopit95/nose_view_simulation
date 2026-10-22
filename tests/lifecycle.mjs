import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { isolatedLaunch } from './electron-launch.mjs';
import { installSyntheticFixture, pauseOnTrackedFace } from './synthetic-camera.mjs';

await mkdir('qa', { recursive: true });
const report = { checkedAt: new Date().toISOString(), status: 'running', executable: process.env.NOSEVIEW_EXECUTABLE ?? 'electron .',
  sourceSha256: process.env.NOSEVIEW_SOURCE_SHA256 ?? null, checks: [], failures: [] };
await writeFile('qa/lifecycle-report.json', JSON.stringify(report, null, 2));
const app = await electron.launch(await isolatedLaunch());
const page = await app.firstWindow();
await installSyntheticFixture(page);
page.setDefaultTimeout(10000);
const ready = () => page.getByText('정면 얼굴 추적 중', { exact: true }).waitFor({ timeout: 35000 });
const button = name => page.getByRole('button', { name, exact: true });
const fatalText = '그래픽 처리가 중단되었습니다. 앱을 다시 실행해 주세요.';
async function check(name, run) {
  try {
    await page.reload(); await expect(button('웹캠 연결')).toBeEnabled({ timeout: 35000 }); await run();
    report.checks.push(name); console.log('PASS', name);
  } catch (error) {
    report.failures.push({ name, error: error.stack ?? String(error) }); console.error('FAIL', name, error.stack ?? String(error));
    await page.screenshot({ path: `qa/lifecycle-failure-${report.failures.length}.png`, fullPage: true }).catch(() => {});
  }
}
async function camera({ delayed = false, offset = 0, width = 960, height = 960, marked = false, requireFace = true } = {}) {
  // Real VIDEO inference on a synthetic image; never opens a physical camera.
  await page.evaluate(async ({ delayed, offset, width, height, marked }) => {
    const image = new Image(); image.src = window.__syntheticImageUrl; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    let marker = '#2050b0';
    const draw = () => {
      const size = Math.min(canvas.width, canvas.height);
      context.fillStyle = '#e5e6df'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, (canvas.width - size) / 2 + offset, (canvas.height - size) / 2, size, size);
      if (marked) {
        context.fillStyle = marker; context.fillRect(0, 0, canvas.width * .06, canvas.height);
        context.fillStyle = '#d09020'; context.fillRect(canvas.width * .94, 0, canvas.width * .06, canvas.height);
      }
    };
    draw(); const timer = setInterval(draw, 33);
    window.__camera = { streams: [], release: null, captures: 0, canvas, draw, timer,
      changeMarker: () => { marker = '#30a050'; draw(); } };
    const capture = window.createImageBitmap.bind(window);
    window.createImageBitmap = (...args) => { window.__camera.captures++; return capture(...args); };
    navigator.mediaDevices.getUserMedia = async () => {
      if (delayed) await new Promise(resolve => { window.__camera.release = resolve; });
      const stream = canvas.captureStream(30); window.__camera.streams.push(stream); return stream;
    };
  }, { delayed, offset, width, height, marked });
  await button('웹캠 연결').click();
  if (delayed) await expect.poll(() => page.evaluate(() => typeof window.__camera.release)).toBe('function');
  else if (requireFace) await ready();
}
async function hidden(value) {
  await page.evaluate(value => {
    Object.defineProperty(document, 'hidden', { configurable: true, value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);
}
async function muteCycle() {
  await page.evaluate(() => {
    const track = window.__camera.streams.at(-1).getVideoTracks()[0];
    track.dispatchEvent(new Event('mute')); track.dispatchEvent(new Event('unmute'));
  });
}
async function pausedWithoutCapture() {
  await expect(page.getByText('화면 일시정지', { exact: true })).toBeVisible();
  const count = await page.evaluate(() => window.__camera.captures);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => window.__camera.captures), count);
}
async function loseGraphics() {
  await page.locator('[data-testid=simulation-canvas]').evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
}
async function assertCurrentPixels({ exported = false, simulation = false, width, height } = {}) {
  const difference = await page.evaluate(async ({ exported, simulation }) => {
    let rendered = document.querySelector('[data-testid=simulation-canvas]');
    if (exported) { rendered = document.querySelector('dialog img'); await rendered.decode(); }
    const output = document.createElement('canvas');
    output.width = exported ? 800 : rendered.width;
    output.height = exported ? rendered.naturalHeight - 240 : rendered.height;
    const actual = output.getContext('2d');
    if (exported) actual.drawImage(rendered, simulation ? 800 : 0, 60, 800, output.height, 0, 0, 800, output.height);
    else actual.drawImage(rendered, 0, 0);
    const pixels = actual.getImageData(0, 0, output.width, output.height).data;
    const expected = document.createElement('canvas'); expected.width = output.width; expected.height = output.height;
    const context = expected.getContext('2d');
    const input = window.__camera.canvas;
    context.translate(output.width, 0); context.scale(-1, 1);
    context.drawImage(input, 0, 0, output.width, output.height);
    const source = context.getImageData(0, 0, output.width, output.height).data;
    let total = 0, mismatched = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      let max = 0;
      for (let c = 0; c < 3; c++) { const delta = Math.abs(pixels[i + c] - source[i + c]); total += delta; max = Math.max(max, delta); }
      if (max > 20) mismatched++;
    }
    return { width: output.width, height: output.height, mean: total / (output.width * output.height * 3), mismatchRatio: mismatched / (output.width * output.height) };
  }, { exported, simulation });
  (report.pixelChecks ??= []).push({ exported, simulation, ...difference });
  if (width) assert.equal(difference.width, width);
  if (height) assert.equal(difference.height, height);
  // Canvas video passes through YUV conversion and resizing; allow minor color/edge differences.
  assert.ok(difference.mean < 3 && difference.mismatchRatio < .01, `Current source must fill the entire frame: ${JSON.stringify(difference)}`);
}
try {
  await check('Resolution changes replace every pixel in live, paused, exported and restored previews', async () => {
    await camera({ width: 1280, height: 720, marked: true });
    await button('보정 없음').click();
    await pauseOnTrackedFace(page);
    await page.screenshot({ path: 'qa/resolution-webcam.png', fullPage: true });
    for (const mode of ['원본', '가상 보기', '비교']) {
      await button(mode).click(); await assertCurrentPixels({ width: 1280, height: 720 });
    }
    await button('비교 이미지 저장').click();
    await assertCurrentPixels({ exported: true, width: 800, height: 450 });
    await assertCurrentPixels({ exported: true, simulation: true, width: 800, height: 450 });
    await button('저장 창 닫기').click(); await button('다시 재생').click();
    await page.evaluate(() => window.__camera.changeMarker());
    await expect(async () => assertCurrentPixels({ width: 1280, height: 720 })).toPass({ timeout: 5000 });
    for (const [width, height, renderedWidth, renderedHeight] of [[640, 480, 640, 480], [720, 1280, 720, 1280], [1280, 720, 1280, 720]]) {
      await page.evaluate(({ width, height }) => {
        window.__camera.canvas.width = width; window.__camera.canvas.height = height; window.__camera.draw();
      }, { width, height });
      await expect.poll(() => page.locator('[data-testid=simulation-canvas]').evaluate(canvas => [canvas.width, canvas.height])).toEqual([renderedWidth, renderedHeight]);
      await assertCurrentPixels({ width: renderedWidth, height: renderedHeight });
    }
    await button('웹캠 연결 해제').click(); await button('가상 보기').click();
    assert.equal(await page.locator('[data-testid=simulation-canvas]').evaluate(canvas => {
      const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
      const context = copy.getContext('2d'); context.drawImage(canvas, 0, 0);
      return context.getImageData(0, 0, copy.width, copy.height).data.some((value, index) => index % 4 !== 3 && value !== 0);
    }), false, 'Disconnect must leave no source pixels');
    await page.evaluate(() => clearInterval(window.__camera.timer));
    await camera({ width: 1254, height: 1254, requireFace: false });
    await expect.poll(() => page.locator('[data-testid=simulation-canvas]').evaluate(canvas => [canvas.width, canvas.height])).toEqual([1254, 1254]);
    await button('보정 없음').click();
    // Pixel replacement must hold even when face quality rejects a frame.
    await assertCurrentPixels({ width: 1254, height: 1254 });
  });
  await check('Fatal graphics failure clears export image and consultation settings', async () => {
    await camera(); await pauseOnTrackedFace(page);
    await page.getByRole('slider', { name: '콧볼 폭', exact: true }).fill('30');
    await button('A안 저장').click(); await button('비교 이미지 저장').click();
    await loseGraphics();
    await expect(page.getByRole('dialog', { name: '비교 이미지 저장' })).toHaveCount(0);
    await expect(page.getByText(fatalText, { exact: true })).toBeVisible();
    await expect(button('A안 저장')).toBeDisabled();
    await expect(page.getByRole('slider', { name: '콧볼 폭', exact: true })).toHaveValue('0');
  });
  await check('New consultation preserves fatal error and reload recovery', async () => {
    await loseGraphics(); await button('새 상담').click(); await button('새 상담 시작').click();
    await expect(page.getByText(fatalText, { exact: true })).toBeVisible();
    await expect(button('앱 다시 불러오기')).toBeEnabled();
    await expect(page.getByText('카메라 연결 대기', { exact: true })).toHaveCount(0);
  });
  for (const reason of ['manual', 'hidden', 'export']) {
    await check(`Camera mute recovery preserves ${reason} pause until explicit resume`, async () => {
      await camera();
      if (reason === 'manual') await button('일시정지').click();
      if (reason === 'hidden') await hidden(true);
      if (reason === 'export') await button('비교 이미지 저장').click();
      await muteCycle();
      if (reason === 'hidden') await hidden(false);
      if (reason === 'export') await button('저장 창 닫기').click();
      await pausedWithoutCapture();
      await expect(button('다시 재생')).toBeEnabled();
      await button('다시 재생').click(); await ready();
    });
  }
  await check('Camera acquired while hidden waits for explicit resume', async () => {
    await camera({ delayed: true }); await hidden(true);
    await page.evaluate(() => window.__camera.release());
    await expect(button('웹캠 연결 해제')).toBeVisible();
    await hidden(false); await pausedWithoutCapture();
    await expect(button('다시 재생')).toBeEnabled();
    await button('다시 재생').click(); await ready();
  });
  await check('Mirroring a paused frame also mirrors its nose guide', async () => {
    await camera({ offset: 90 }); await button('일시정지').click();
    await page.getByLabel('조절 영역 표시', { exact: true }).check();
    const guide = page.locator('.nose-guide');
    const before = await guide.evaluate(element => parseFloat(element.style.left));
    assert.ok(Math.abs(before - 50) > 5, 'Fixture must be off-center');
    await page.getByLabel('거울 보기', { exact: true }).uncheck();
    await expect.poll(() => guide.evaluate(element => parseFloat(element.style.left))).toBeCloseTo(100 - before, 3);
  });
} finally {
  report.status = report.failures.length ? 'failed' : 'passed';
  await writeFile('qa/lifecycle-report.json', JSON.stringify(report, null, 2)); await app.close();
}
if (report.failures.length) process.exitCode = 1;
