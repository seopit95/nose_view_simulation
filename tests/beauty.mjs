import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { isolatedLaunch } from './electron-launch.mjs';
import { expandControls, installSyntheticCamera, connectSyntheticCamera, pauseOnTrackedFace } from './synthetic-camera.mjs';

await mkdir('qa', { recursive: true });
const report = { checkedAt: new Date().toISOString(), status: 'running', executable: process.env.NOSEVIEW_EXECUTABLE ?? 'electron .',
  sourceSha256: process.env.NOSEVIEW_SOURCE_SHA256 ?? null, checks: [] };
await writeFile('qa/beauty-report.json', JSON.stringify(report, null, 2));
const app = await electron.launch(await isolatedLaunch());
const page = await app.firstWindow(); page.setDefaultTimeout(10000);
await installSyntheticCamera(page);
// Observe real worker responses in memory; do not alter model results or retain
// landmarks in reports. Round-trip timing excludes capture and GPU presentation.
await app.context().addInitScript(() => {
  const NativeWorker = window.Worker;
  window.__measurements = [];
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args); this.sentAt = 0;
      this.addEventListener('message', ({ data }) => {
        if (data.type !== 'result') return;
        window.__landmarks = data.faces[0] ?? null;
        window.__measurements.push({ at: performance.now(), roundTrip: performance.now() - this.sentAt, inference: data.inferenceMs });
      });
    }
    postMessage(message, ...rest) { this.sentAt = performance.now(); return super.postMessage(message, ...rest); }
  };
});
const button = name => page.getByRole('button', { name, exact: true });
const slider = name => page.getByRole('slider', { name, exact: true });
const ready = () => page.getByText('정면 얼굴 추적 중', { exact: true }).waitFor({ timeout: 35000 });
const check = (name, detail) => { report.checks.push({ name, detail }); console.log('PASS', name, detail ?? ''); };
async function snapshot(key) {
  return page.locator('[data-testid=simulation-canvas]').evaluate(async (canvas, key) => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
    const context = copy.getContext('2d'); context.drawImage(canvas, 0, 0);
    (window.__frames ??= {})[key] = context.getImageData(0, 0, copy.width, copy.height);
    return { width: copy.width, height: copy.height };
  }, key);
}
async function difference(before, after, protectNose = false) {
  return page.evaluate(({ before, after, protectNose }) => {
    const a = window.__frames[before], b = window.__frames[after];
    let changed = 0, total = 0, light = 0, protectedChanges = 0, roughBefore = 0, roughAfter = 0;
    const box = document.querySelector('[data-testid=simulation-canvas]').getBoundingClientRect();
    const guide = document.querySelector('.nose-guide')?.getBoundingClientRect();
    const cx = guide ? (guide.left + guide.width / 2 - box.left) / box.width * a.width : 0;
    const cy = guide ? (guide.top + guide.height / 2 - box.top) / box.height * a.height : 0;
    const rx = guide ? guide.width / box.width * a.width / 2 : 1;
    const ry = guide ? guide.height / box.height * a.height / 2 : 1;
    for (let i = 0; i < a.data.length; i += 4) {
      let max = 0;
      for (let c = 0; c < 3; c++) { const delta = b.data[i + c] - a.data[i + c]; max = Math.max(max, Math.abs(delta)); total += Math.abs(delta); light += delta; }
      if (max > 1) {
        changed++;
        const x = (i / 4) % a.width, y = Math.floor(i / 4 / a.width);
        if (protectNose && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < .65) protectedChanges++;
        if (x + 1 < a.width) for (let c = 0; c < 3; c++) {
          roughBefore += Math.abs(a.data[i + c] - a.data[i + 4 + c]);
          roughAfter += Math.abs(b.data[i + c] - b.data[i + 4 + c]);
        }
      }
    }
    return { changed, mean: total / (a.width * a.height * 3), light: light / (a.width * a.height * 3), protectedChanges, roughBefore, roughAfter };
  }, { before, after, protectNose });
}
try {
  await page.reload();
  await connectSyntheticCamera(page); await expandControls(page);
  await expect(button('자연스럽게')).toHaveAttribute('aria-pressed', 'true');
  await button('원본').click(); await snapshot('natural');
  await expect(page.getByText('원본 · 피부 보정', { exact: true })).toBeVisible();
  await button('보정 없음').click(); await snapshot('raw');
  const tone = await difference('raw', 'natural'); assert.ok(tone.light > 1 && tone.changed > 10000, JSON.stringify(tone));
  await button('가상 보기').click(); await snapshot('rawSimulation');
  assert.equal((await difference('raw', 'rawSimulation')).mean, 0);
  await button('자연스럽게').click(); await snapshot('naturalSimulation');
  assert.equal((await difference('natural', 'naturalSimulation')).mean, 0);
  await page.screenshot({ path: 'qa/beauty-natural.png', fullPage: true, animations: 'disabled' });
  check('Natural correction is default, lifts tones, and is identical in original/simulation at zero warp', tone);

  // Synthetic pixels only. No host camera is opened, no landmark/model output is replaced.
  await button('웹캠 연결 해제').click();
  await page.evaluate(async () => {
    const image = new Image(); image.src = window.__syntheticImageUrl; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
    const context = canvas.getContext('2d'); context.fillStyle = '#bfc2bd'; context.fillRect(0, 0, 1920, 1080);
    context.drawImage(image, 420, 0, 1080, 1080);
    const pixels = context.getImageData(0, 0, 1920, 1080); let seed = 7;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed % 19) - 9;
      for (let c = 0; c < 3; c++) pixels.data[i + c] += noise;
    }
    context.putImageData(pixels, 0, 0);
    const clean = document.createElement('canvas'); clean.width = 1920; clean.height = 1080; clean.getContext('2d').drawImage(canvas, 0, 0);
    window.__beautyCamera = { canvas, clean, missing: false, calls: [], timer: setInterval(() => {
      if (window.__beautyCamera.missing) { context.fillStyle = '#bfc2bd'; context.fillRect(0, 0, 1920, 1080); }
      else context.drawImage(clean, 0, 0);
    }, 33) };
    navigator.mediaDevices.getUserMedia = async constraints => { window.__beautyCamera.calls.push(constraints); return canvas.captureStream(30); };
  });
  await button('웹캠 연결').click(); await ready();
  await page.getByLabel('거울 보기', { exact: true }).check();
  await expect.poll(() => page.locator('[data-testid=simulation-canvas]').evaluate(c => [c.width, c.height])).toEqual([1920, 1080]);
  await page.locator('.camera-status > summary').click();
  await expect(page.getByText(/1920 × 1080/).first()).toBeVisible();
  const constraints = await page.evaluate(() => window.__beautyCamera.calls[0]);
  assert.equal(constraints.video.width.ideal, 1920); assert.equal(constraints.video.height.ideal, 1080); assert.equal(constraints.audio, false);
  await expect.poll(() => page.locator('.camera-status > p').innerText()).toMatch(/fps/);
  await page.evaluate(() => { window.__measurements = []; });
  await page.waitForFunction(() => window.__measurements.length >= 60, null, { timeout: 20000 });
  report.syntheticPerformance = await page.evaluate(() => {
    const samples = window.__measurements.slice(10, 60);
    const percentile = (key, p) => samples.map(s => s[key]).sort((a, b) => a - b)[Math.ceil(samples.length * p) - 1];
    return { samples: samples.length, input: '1920x1080 synthetic stream, natural preset',
      processedFps: (samples.length - 1) * 1000 / (samples.at(-1).at - samples[0].at),
      workerRoundTripMs: { p50: percentile('roundTrip', .5), p95: percentile('roundTrip', .95) },
      inferenceMs: { p50: percentile('inference', .5), p95: percentile('inference', .95) },
      limitation: 'Short synthetic run; excludes sensor/capture/display latency and sustained hardware performance' };
  });
  report.previewMetrics = await page.locator('.camera-status > p').innerText();
  await pauseOnTrackedFace(page); await button('보정 없음').click(); await button('원본').click();
  assert.deepEqual(await snapshot('cameraRaw'), { width: 1920, height: 1080 });
  await page.getByLabel('조절 영역 표시', { exact: true }).check();
  await slider('피부 보정 강도').fill('40'); await snapshot('gentle');
  await slider('피부 보정 강도').fill('100'); await snapshot('smooth');
  const smooth = await difference('cameraRaw', 'smooth', true);
  assert.ok(smooth.changed > 500 && smooth.roughAfter < smooth.roughBefore * .98, JSON.stringify(smooth));
  assert.equal(smooth.protectedChanges, 0, JSON.stringify(smooth));
  // Fixed anatomical test areas, not regions calculated by the app's mask.
  // This catches reverting to the tiny cheek/forehead mask even when the UI
  // still offers 100 strength. Compare texture at the same pixels at both strengths.
  const coverage = await page.evaluate(() => {
    const raw = window.__frames.cameraRaw, gentle = window.__frames.gentle, strong = window.__frames.smooth;
    const p = i => ({ x: window.__landmarks[i].x * raw.width, y: window.__landmarks[i].y * raw.height });
    const span = Math.hypot(p(263).x - p(33).x, p(263).y - p(33).y), mid = (p(33).x + p(263).x) / 2;
    const cheeks = [[234, 98], [327, 454]].map(([a, b]) => ({
      left: p(a).x + (p(b).x - p(a).x) * .15, right: p(a).x + (p(b).x - p(a).x) * .85,
      top: p(2).y - span * .15, bottom: p(17).y + span * .1,
    }));
    const areas = [...cheeks,
      { left: mid - span * .18, right: mid + span * .18, top: p(10).y + span * .12, bottom: p(10).y + span * .3 },
      { left: mid - span * .17, right: mid + span * .17, top: p(17).y + span * .09, bottom: p(152).y - span * .08 }];
    let sampled = 0, changed = 0, gentleRoughness = 0, strongRoughness = 0, backgroundChanges = 0;
    for (const area of areas) for (let y = Math.ceil(area.top); y < area.bottom; y += 2) for (let sx = Math.ceil(area.left); sx < area.right; sx += 2) {
      const x = raw.width - 1 - sx, i = (y * raw.width + x) * 4; sampled++;
      if ([0, 1, 2].some(c => Math.abs(raw.data[i + c] - strong.data[i + c]) > 1)) changed++;
      for (let c = 0; c < 3; c++) {
        gentleRoughness += Math.abs(gentle.data[i + c] - gentle.data[i + 4 + c]);
        strongRoughness += Math.abs(strong.data[i + c] - strong.data[i + 4 + c]);
      }
    }
    for (let y = 0; y < raw.height; y++) for (const x of [10, raw.width - 11]) {
      const i = (y * raw.width + x) * 4;
      if ([0, 1, 2].some(c => raw.data[i + c] !== strong.data[i + c])) backgroundChanges++;
    }
    return { sampled, changed, fraction: changed / sampled, gentleRoughness, strongRoughness, backgroundChanges };
  });
  report.skinCoverage = coverage;
  assert.ok(coverage.sampled > 500 && coverage.fraction > .3, JSON.stringify(coverage));
  assert.ok(coverage.strongRoughness < coverage.gentleRoughness * .95, JSON.stringify(coverage));
  assert.equal(coverage.backgroundChanges, 0);
  const protectedPixels = await page.evaluate(() => {
    const a = window.__frames.cameraRaw, b = window.__frames.smooth;
    let changed = 0, sampled = 0;
    for (const i of [33, 133, 159, 145, 70, 63, 105, 66, 107, 263, 362, 386, 374, 300, 293, 334, 296, 336, 61, 291, 0, 17, 13, 14]) {
      const p = window.__landmarks[i];
      const cx = Math.floor((1 - p.x) * a.width), cy = Math.floor(p.y * a.height);
      for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
        const offset = (y * a.width + x) * 4; sampled++;
        if ([0, 1, 2].some(c => a.data[offset + c] !== b.data[offset + c])) changed++;
      }
    }
    return { sampled, changed };
  });
  report.protectedPixels = protectedPixels; assert.equal(protectedPixels.changed, 0);
  await slider('화면 밝기').fill('20'); await snapshot('bright');
  assert.ok((await difference('smooth', 'bright')).light > 1);
  await slider('색온도').fill('-25'); await snapshot('cool');
  assert.ok((await difference('bright', 'cool')).changed > 1000);
  await button('보정 없음').click();
  await slider('화면 밝기').fill('30'); await snapshot('oldBrightLimit');
  await slider('화면 밝기').fill('100'); await snapshot('maxBright');
  assert.ok((await difference('oldBrightLimit', 'maxBright')).light > 10);
  await slider('화면 밝기').fill('-30'); await snapshot('oldDarkLimit');
  await slider('화면 밝기').fill('-100'); await snapshot('maxDark');
  assert.ok((await difference('oldDarkLimit', 'maxDark')).light < -10);
  await button('보정 없음').click();
  for (const direction of [-1, 1]) {
    await slider('색온도').fill(String(50 * direction)); await snapshot('oldWarmLimit');
    await slider('색온도').fill(String(100 * direction)); await snapshot('maxWarm');
    assert.ok((await difference('oldWarmLimit', 'maxWarm')).mean > 2);
    const shift = await page.evaluate(() => {
      const a = window.__frames.oldWarmLimit, b = window.__frames.maxWarm;
      let red = 0, blue = 0;
      for (let i = 0; i < a.data.length; i += 4) { red += b.data[i] - a.data[i]; blue += b.data[i + 2] - a.data[i + 2]; }
      return { red: red / (a.width * a.height), blue: blue / (a.width * a.height) };
    });
    assert.ok(shift.red * direction > 1 && shift.blue * direction < -1, JSON.stringify({ direction, ...shift }));
  }
  await button('보정 없음').click(); await snapshot('restoredRaw');
  assert.equal((await difference('cameraRaw', 'restoredRaw')).mean, 0);
  check('Full HD frame stays adjustable while paused; smoothing reduces synthetic noise and protects nose/eyes/brows/lips', smooth);

  await button('화사하게').click();
  await expect(slider('피부 보정 강도')).toHaveValue('85');
  await expect(slider('화면 밝기')).toHaveValue('45');
  await page.getByLabel('조절 영역 표시', { exact: true }).uncheck();
  await button('비교').click(); await snapshot('exportReference');
  await page.screenshot({ path: 'qa/beauty-full-hd.png', fullPage: true, animations: 'disabled' });
  await button('비교 이미지 저장').click();
  await expect(page.getByText(/^피부 보정 적용 · 강도 85 \/ 밝기 \+45 \/ 색온도 \+5/)).toBeVisible();
  await expect(button('PNG 저장')).toBeDisabled();
  const exported = await page.locator('.export-preview').evaluate(async image => {
    await image.decode(); const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 450;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 60, 800, 450, 0, 0, 800, 450); const left = context.getImageData(0, 0, 800, 450).data;
    context.drawImage(image, 800, 60, 800, 450, 0, 0, 800, 450); const right = context.getImageData(0, 0, 800, 450).data;
    const source = document.createElement('canvas'); source.width = 1920; source.height = 1080;
    source.getContext('2d').putImageData(window.__frames.exportReference, 0, 0);
    context.drawImage(source, 0, 0, 800, 450); const expected = context.getImageData(0, 0, 800, 450).data;
    let halves = 0, preview = 0, maxHalf = 0;
    for (let i = 0; i < left.length; i++) { const delta = Math.abs(left[i] - right[i]); halves += delta; maxHalf = Math.max(maxHalf, delta); preview += Math.abs(left[i] - expected[i]); }
    return { halves, preview, maxHalf };
  });
  report.exportPixels = exported;
  assert.deepEqual(exported, { halves: 0, preview: 0, maxHalf: 0 });
  await page.screenshot({ path: 'qa/beauty-export.png', fullPage: true, animations: 'disabled' });
  await button('저장 창 닫기').click();
  await page.getByLabel('거울 보기', { exact: true }).uncheck(); await snapshot('unmirrored');
  await page.getByLabel('거울 보기', { exact: true }).check(); await snapshot('mirrored');
  const mirrorError = await page.evaluate(() => {
    const a = window.__frames.unmirrored, b = window.__frames.mirrored; let max = 0;
    for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) for (let c = 0; c < 3; c++) {
      max = Math.max(max, Math.abs(a.data[(y * a.width + x) * 4 + c] - b.data[(y * a.width + a.width - 1 - x) * 4 + c]));
    }
    return max;
  });
  assert.ok(mirrorError <= 1, `Mirror pixel error ${mirrorError}`);
  check('Export contains the same corrected pixels on both sides, consent remains required, and mirror is consistent');

  await button('다시 재생').click();
  await page.evaluate(() => { window.__beautyCamera.missing = true; });
  await expect(slider('콧볼 폭')).toBeDisabled();
  await expect(page.getByText('얼굴을 화면 가운데에 맞춰 주세요', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('원본 · 피부 보정', { exact: true })).toBeVisible();
  await expect(slider('화면 밝기')).toBeEnabled();
  await expect(slider('피부 보정 강도')).toBeEnabled();
  await expect(button('비교 이미지 저장')).toBeDisabled();
  await button('일시정지').click(); await button('보정 없음').click(); await snapshot('missingRaw');
  await slider('화면 밝기').fill('30'); await snapshot('missingBright');
  const missingTone = await difference('missingRaw', 'missingBright');
  assert.ok(missingTone.light > 10, JSON.stringify(missingTone));
  await button('새 상담').click(); await button('새 상담 시작').click();
  await expect(button('자연스럽게')).toHaveAttribute('aria-pressed', 'true');
  await expect(slider('피부 보정 강도')).toHaveValue('30');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1080, 790));
  await expect(button('비교 이미지 저장')).toBeInViewport();
  await page.locator('.left-panel').evaluate(el => { el.scrollTop = 0; });
  await button('자연스럽게').scrollIntoViewIfNeeded();
  await expect(button('자연스럽게')).toBeInViewport();
  await slider('색온도').scrollIntoViewIfNeeded();
  await expect(slider('색온도')).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: 'qa/beauty-minimum-window.png', fullPage: true, animations: 'disabled' });
  check('Tone continues without a face while warp/export remain blocked; new consultation restores defaults and controls fit', missingTone);
} catch (error) {
  report.failure = error.stack ?? String(error); process.exitCode = 1; console.error(error);
  await page.screenshot({ path: 'qa/beauty-failure.png', fullPage: true }).catch(() => {});
} finally {
  report.status = report.failure ? 'failed' : 'passed';
  await writeFile('qa/beauty-report.json', JSON.stringify(report, null, 2)); await app.close();
}
