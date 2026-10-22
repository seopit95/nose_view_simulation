import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { isolatedLaunch } from './electron-launch.mjs';
import { expandControls } from './synthetic-camera.mjs';

// Rendering/state boundary test: replace inference with known rotated 3D points.
// This does NOT assert that MediaPipe detects a human at these angles. The normal
// E2E suite runs the real model; physical profile tracking is separately verified.
const report = { checkedAt: new Date().toISOString(), status: 'running', executable: process.env.NOSEVIEW_EXECUTABLE ?? 'electron .',
  sourceSha256: process.env.NOSEVIEW_SOURCE_SHA256 ?? null, kind: 'known-landmarks-real-gpu', checks: [] };
const app = await electron.launch(await isolatedLaunch()); const page = await app.firstWindow(); page.setDefaultTimeout(10000);
const button = name => page.getByRole('button', { name, exact: true });
const tab = name => page.getByRole('tab', { name, exact: true });
const slider = name => page.getByRole('slider', { name, exact: true });
const check = (name, detail) => { report.checks.push({ name, detail }); console.log('PASS', name, detail ?? ''); };
await page.addInitScript(sample => {
  const base = Array.from({ length: 478 }, () => ({ x: .5, y: .5, z: 0 }));
  Object.assign(base, { 1: { x: .5, y: .53, z: -.12 }, 2: { x: .5, y: .58, z: -.06 },
    168: { x: .5, y: .4, z: -.03 }, 98: { x: .44, y: .55, z: -.05 }, 327: { x: .56, y: .55, z: -.05 },
    33: { x: .35, y: .39, z: 0 }, 263: { x: .65, y: .39, z: 0 }, 10: { x: .5, y: .16, z: 0 },
    152: { x: .5, y: .83, z: 0 }, 234: { x: .26, y: .5, z: 0 }, 454: { x: .74, y: .5, z: 0 } });
  window.__profile = { yaw: 0, faces: 1, delivered: 0, pixel: 0 };
  window.Worker = class {
    onmessage = null; stopped = false;
    postMessage(message) {
      if (message.type === 'init') { queueMicrotask(() => this.onmessage?.({ data: { type: 'ready', delegate: 'GPU' } })); return; }
      const state = window.__profile, rad = state.yaw * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
      const face = (state.detailed ? sample : base).map(p => ({ x: .5 + (p.x - .5) * c - p.z * s, y: p.y, z: (p.x - .5) * s + p.z * c }));
      if (state.invalidRegion) face[79].x = NaN;
      if (state.shortLip) Object.assign(face[0], { x: .505384814542362, y: .571635533285865 });
      const data = { ...message, type: 'result', faces: Array.from({ length: state.faces }, () => face),
        matrices: [[c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, -50, 1]], inferenceMs: 0 };
      queueMicrotask(() => { if (this.stopped) message.bitmap.close(); else { state.delivered++; this.onmessage?.({ data }); } });
    }
    terminate() { this.stopped = true; }
  };
  navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'profile-fixture', groupId: '', label: '프로필 GPU 검사' }];
  navigator.mediaDevices.getUserMedia = async () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 960; const ctx = canvas.getContext('2d');
    const flat = ctx.createImageData(960, 960), textured = ctx.createImageData(960, 960);
    for (let y = 0; y < 960; y++) for (let x = 0; x < 960; x++) {
      const i = (y * 960 + x) * 4, noise = ((x + y) % 2 ? 15 : -15);
      flat.data.set([Math.round(x / 959 * 255), Math.round(y / 959 * 255), 100, 255], i);
      textured.data.set([Math.round(x / 959 * 255) + noise, Math.round(y / 959 * 255) + noise, 100 + noise, 255], i);
    }
    const draw = () => ctx.putImageData(window.__profile.texture ? textured : flat, 0, 0);
    draw(); window.__profile.timer = setInterval(draw, 33); return canvas.captureStream(30);
  };
}, JSON.parse(await readFile(new URL('./fixtures/synthetic-landmarks.json', import.meta.url), 'utf8')).points);
async function pixels(key) {
  await page.locator('[data-testid=simulation-canvas]').evaluate(async (canvas, key) => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
    const ctx = copy.getContext('2d'); ctx.drawImage(canvas, 0, 0);
    (window.__pixels ??= {})[key] = ctx.getImageData(0, 0, copy.width, copy.height);
  }, key);
}
async function change(yaw, faces = 1) {
  const n = await page.evaluate(([yaw, faces]) => { Object.assign(window.__profile, { yaw, faces }); return window.__profile.delivered; }, [yaw, faces]);
  await expect.poll(() => page.evaluate(() => window.__profile.delivered)).toBeGreaterThan(n + 2);
}
async function difference(a, b, channel = 0) {
  return page.evaluate(([a, b, channel]) => {
    const one = window.__pixels[a], two = window.__pixels[b]; let changed = 0, signed = 0, outside = 0;
    for (let i = 0; i < one.data.length; i += 4) {
      const d = two.data[i + channel] - one.data[i + channel]; if (Math.abs(d) <= (channel === 1 ? 0 : 1)) continue;
      changed++; signed += d; const x = i / 4 % one.width, y = Math.floor(i / 4 / one.width);
      if (x < one.width * .2 || x > one.width * .8 || y < one.height * .25 || y > one.height * .7) outside++;
    }
    return { changed, signed, outside };
  }, [a, b, channel]);
}
try {
  await page.reload(); await expect(page.getByText('로컬 엔진 준비 완료', { exact: true })).toBeVisible();
  await button('웹캠 연결').click(); await expect(slider('콧볼 폭')).toBeEnabled(); await expandControls(page);
  await page.getByLabel('거울 보기', { exact: true }).uncheck(); await button('보정 없음').click();
  await slider('옆모습 콧대').fill('100'); await tab('실시간 필터').click();
  const output = {};
  for (const yaw of [-90, -60, 60, 90]) {
    await change(yaw); await expect(page.locator('.tracking-status')).toHaveText('실시간 필터 적용 중');
    await pixels('modified'); await tab('상담 시뮬레이션').click(); await expect(slider('콧볼 폭')).toBeDisabled();
    await expect(button('비교 이미지 저장')).toBeDisabled(); await button('원본').click(); await pixels('original');
    const result = await difference('original', 'modified'); output[yaw] = result;
    assert.ok(result.changed > 1000, JSON.stringify(result)); assert.equal(result.outside, 0);
    assert.equal(Math.sign(result.signed), -Math.sign(yaw), `Profile projection direction ${yaw}`);
    await tab('실시간 필터').click();
  }
  check('Known ±60/90° landmarks keep actual GPU deformation local, project bridge contour in opposite directions, and preserve strict consultation/export gates', output);

  await change(0); await tab('상담 시뮬레이션').click(); await slider('옆모습 콧대').fill('0');
  const tipResults = {};
  for (const amount of [-100, 100]) {
    await slider('코끝 상하').fill(String(amount)); await tab('실시간 필터').click();
    for (const yaw of [-90, -60, 0, 60, 90]) {
      await change(yaw); await pixels('tip'); await tab('상담 시뮬레이션').click();
      await button('원본').click(); await pixels('tipSource');
      const horizontal = await difference('tipSource', 'tip'), vertical = await difference('tipSource', 'tip', 1);
      assert.equal(horizontal.changed, 0, `tip up/down must not project outward at ${yaw}°`);
      assert.ok(vertical.changed > 100, JSON.stringify(vertical));
      assert.equal(Math.sign(vertical.signed), Math.sign(amount)); assert.equal(vertical.outside, 0);
      tipResults[`${amount}/${yaw}`] = { horizontal, vertical };
      await tab('실시간 필터').click();
    }
    await change(0); await tab('상담 시뮬레이션').click();
  }
  await slider('코끝 상하').fill('0');
  check('Tip up/down changes only vertical GPU samples in both directions at0/±60/90° without adding projection', tipResults);

  await change(0); await tab('상담 시뮬레이션').click(); await slider('옆모습 콧대').fill('0'); await slider('화면 밝기').fill('25');
  await tab('실시간 필터').click(); await change(90); await pixels('zeroFilter');
  await tab('상담 시뮬레이션').click(); await button('원본').click(); await pixels('zeroOriginal');
  assert.equal((await difference('zeroFilter', 'zeroOriginal')).changed, 0);
  await page.getByLabel('거울 보기', { exact: true }).check(); await pixels('mirrorOriginal');
  await tab('실시간 필터').click(); await pixels('mirrorFilter');
  assert.equal((await difference('mirrorOriginal', 'mirrorFilter')).changed, 0);
  check('Zero profile adjustment preserves corrected source pixels across modes and mirror');

  await change(0); await tab('상담 시뮬레이션').click(); await slider('피부 보정 강도').fill('100');
  await page.evaluate(() => { window.__profile.texture = true; });
  await tab('실시간 필터').click(); await change(45); await pixels('skinFilter');
  await tab('상담 시뮬레이션').click(); await button('원본').click(); await pixels('skinOriginal');
  assert.equal(await page.evaluate(() => window.__pixels.skinFilter.data.every((v, i) => v === window.__pixels.skinOriginal.data[i])), true);
  await slider('피부 보정 강도').fill('0'); await pixels('skinOff');
  assert.ok((await difference('skinOff', 'skinOriginal')).changed > 1000);
  check('At known45° active skin smoothing changes textured pixels and stays exactly equal across zero-warp modes');
  await page.evaluate(() => { window.__profile.texture = false; });

  await change(0); await tab('상담 시뮬레이션').click(); await slider('옆모습 콧대').fill('100');
  await tab('실시간 필터').click();
  for (const faces of [0, 2]) {
    await change(90, faces); await pixels('blocked'); await tab('상담 시뮬레이션').click(); await button('원본').click(); await pixels('source');
    assert.equal((await difference('source', 'blocked')).changed, 0); await tab('실시간 필터').click();
  }
  await change(90, 1); await expect(page.locator('.tracking-status')).toHaveText('실시간 필터 적용 중');
  await pixels('recovered'); await tab('상담 시뮬레이션').click(); await button('원본').click(); await pixels('source');
  assert.ok((await difference('source', 'recovered')).changed > 1000);
  await change(0); await button('초기화').click(); await button('보정 없음').click();
  await page.getByLabel('거울 보기', { exact: true }).uncheck();
  await page.evaluate(() => { window.__profile.detailed = true; }); await change(0);
  const detailResults = {};
  for (const label of ['콧날개 상하', '콧구멍 윗선', '비주 상하']) {
    for (const amount of [-100, 100]) {
      await change(0); await slider(label).fill(String(amount)); await tab('실시간 필터').click();
      for (const yaw of [-90, -42, -36, 0, 36, 42, 90]) {
        await change(yaw); await pixels('detail'); await tab('상담 시뮬레이션').click(); await button('원본').click(); await pixels('source');
        const delta = await difference('source', 'detail', 1);
        assert.ok(delta.changed > 30, `${label}/${amount}/${yaw}: ${JSON.stringify(delta)}`);
        assert.equal(Math.sign(delta.signed), Math.sign(amount), `${label}/${amount}/${yaw} vertical direction`);
        assert.equal(delta.outside, 0);
        detailResults[`${label}/${amount}/${yaw}`] = delta;
        await tab('실시간 필터').click();
      }
      await change(0); await tab('상담 시뮬레이션').click(); await slider(label).fill('0');
    }
  }
  check('Known full-face landmarks drive both directions of alar, nostril and columella GPU movement at0/±36/42/90° without leaving the nose region', detailResults);
  await slider('비주 상하').fill('100'); await tab('실시간 필터').click(); await change(0); await pixels('detailValid');
  await page.evaluate(() => { window.__profile.invalidRegion = true; }); await change(0); await pixels('invalidDetail');
  await tab('상담 시뮬레이션').click(); await expect(slider('비주 상하')).toBeDisabled(); await button('원본').click(); await pixels('source');
  assert.equal((await difference('source', 'invalidDetail', 1)).changed, 0);
  await page.evaluate(() => { window.__profile.invalidRegion = false; }); await change(0); await expect(slider('비주 상하')).toBeEnabled();
  await tab('실시간 필터').click(); await pixels('detailRecovery');
  assert.equal((await difference('detailValid', 'detailRecovery', 1)).changed, 0); await tab('상담 시뮬레이션').click();
  check('Invalid detail landmarks suppress the detail shader and controls; current-frame recovery restores the exact filter');
  await page.evaluate(() => { window.__profile.shortLip = true; }); await change(0);
  await slider('코끝 상하').fill('100'); await slider('비주 상하').fill('100'); await tab('실시간 필터').click(); await pixels('shortLip');
  await tab('상담 시뮬레이션').click(); await button('원본').click(); await pixels('shortSource');
  const protectedGap = await page.evaluate(() => {
    const image = window.__pixels.shortLip, source = window.__pixels.shortSource;
    let reversals = 0, lipChanges = 0;
    for (let x = Math.floor(image.width * .48); x < image.width * .53; x++) {
      for (let y = Math.floor(image.height * .5); y < image.height * .62; y++) {
        const i = (y * image.width + x) * 4;
        if (image.data[i + 1] < image.data[i - image.width * 4 + 1]) reversals++;
        if (y > image.height * .572 && image.data[i + 1] !== source.data[i + 1]) lipChanges++;
      }
    }
    return { reversals, lipChanges };
  });
  assert.equal(protectedGap.reversals, 0); assert.equal(protectedGap.lipChanges, 0);
  assert.ok((await difference('shortSource', 'shortLip', 1)).changed > 100);
  check('Combined maximum tip and columella movement keeps GPU sampling ordered above a short lip gap and protects the lip', protectedGap);
  await button('새 상담').click(); await button('새 상담 시작').click();
  await expect(page.locator('.tracking-status')).toHaveText('카메라 연결 대기');
  await expect(page.locator('.photo-stage')).not.toHaveClass(/has-frame/);
  check('No/multiple-face responses clear profile warp immediately, recovery reapplies current settings, and new consultation clears the preview');
} catch (error) {
  report.failure = error.stack ?? String(error); process.exitCode = 1; console.error(error);
  await page.screenshot({ path: 'qa/profile-filter-failure.png', fullPage: true }).catch(() => {});
} finally {
  report.status = report.failure ? 'failed' : 'passed'; await writeFile('qa/profile-filter-report.json', JSON.stringify(report, null, 2)); await app.close();
}
