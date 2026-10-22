import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { isolatedLaunch } from './electron-launch.mjs';
import { expandControls, installSyntheticCamera, connectSyntheticCamera } from './synthetic-camera.mjs';

const report = { checkedAt: new Date().toISOString(), status: 'running', executable: process.env.NOSEVIEW_EXECUTABLE ?? 'electron .',
  sourceSha256: process.env.NOSEVIEW_SOURCE_SHA256 ?? null, checks: [] };
const app = await electron.launch(await isolatedLaunch());
const page = await app.firstWindow(); page.setDefaultTimeout(10000);
await installSyntheticCamera(page);
const button = name => page.getByRole('button', { name, exact: true });
const tab = name => page.getByRole('tab', { name, exact: true });
const slider = name => page.getByRole('slider', { name, exact: true });
const ready = () => page.getByText('정면 얼굴 추적 중', { exact: true }).waitFor({ timeout: 35000 });
const check = (name, detail) => { report.checks.push({ name, detail }); console.log('PASS', name, detail ?? ''); };
await writeFile('qa/live-filter-report.json', JSON.stringify(report, null, 2));
async function pixels(key) {
  return page.locator('[data-testid=simulation-canvas]').evaluate(async (canvas, key) => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
    const context = copy.getContext('2d'); context.drawImage(canvas, 0, 0);
    (window.__pixels ??= {})[key] = context.getImageData(0, 0, copy.width, copy.height);
  }, key);
}
async function diff(a, b) {
  return page.evaluate(([a, b]) => {
    const x = window.__pixels[a], y = window.__pixels[b]; let changed = 0, outside = 0;
    for (let i = 0; i < x.data.length; i += 4) if (Math.max(...[0, 1, 2].map(c => Math.abs(x.data[i + c] - y.data[i + c]))) > 1) {
      changed++; const column = i / 4 % x.width; if (column < x.width * .15 || column > x.width * .85) outside++;
    }
    return { changed, outside };
  }, [a, b]);
}
try {
  await expect(button('웹캠 연결')).toBeEnabled({ timeout: 35000 }); await expandControls(page);
  await slider('화면 밝기').fill('26'); await slider('색조').fill('12');
  await tab('실시간 필터').click();
  await connectSyntheticCamera(page);
  await expect(page.getByLabel('고정된 필터 설정')).toContainText('콧볼 폭 0');
  await expect(page.getByLabel('고정된 필터 설정')).toContainText('밝기 +26');
  await tab('상담 시뮬레이션').click();
  check('First camera connection from standby keeps the chosen filter tone and contour values');
  await slider('콧볼 폭').fill('-65'); await slider('콧대 폭').fill('-40'); await slider('코끝 상하').fill('35');
  await slider('화면 밝기').fill('26'); await slider('색조').fill('12');
  await button('가상 보기').click(); await pixels('simulation');
  await button('비교').click();
  await page.evaluate(() => { window.__canvas = document.querySelector('[data-testid=simulation-canvas]'); });
  await tab('실시간 필터').click(); await pixels('filter');
  assert.equal((await diff('simulation', 'filter')).changed, 0);
  await expect(slider('콧볼 폭')).toHaveCount(0); await expect(slider('피부 보정 강도')).toHaveCount(0);
  await expect(slider('원본 비교 경계')).toHaveCount(0); await expect(button('비교 이미지 저장')).toHaveCount(0);
  await expect(button('눌러서 원본')).toHaveCount(0); await expect(button('기본 설정')).toBeDisabled();
  await expect(page.getByLabel('고정된 필터 설정')).toContainText('콧볼 폭 -65');
  await expect(page.getByLabel('고정된 필터 설정')).toContainText('밝기 +26');
  await tab('실시간 필터').press('ArrowLeft'); await expect(tab('상담 시뮬레이션')).toBeFocused();
  await expect(slider('콧볼 폭')).toHaveValue('-65'); await expect(button('비교')).toHaveAttribute('aria-pressed', 'true');
  await tab('상담 시뮬레이션').press('ArrowRight'); await expect(tab('실시간 필터')).toBeFocused();
  await button('보정 변경').focus(); await button('보정 변경').press('Enter');
  await expect(tab('상담 시뮬레이션')).toBeFocused();
  await tab('실시간 필터').click();
  assert.ok(await page.evaluate(() => window.__canvas === document.querySelector('[data-testid=simulation-canvas]')));
  check('Filter tab locks the selected contour and all tones, shows the simulation without split/controls/export, and reuses the canvas with accessible navigation');

  // Synthetic moving input. Observe responses only; never replace MediaPipe results.
  await page.evaluate(async () => {
    const image = new Image(); image.src = window.__syntheticImageUrl; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1600; const c = canvas.getContext('2d');
    window.__camera = { mode: 'face', angle: 0, offset: 0, moving: false, ticks: 0, calls: 0, streams: [], canvas };
    const draw = () => {
      const state = window.__camera; state.ticks++;
      c.fillStyle = '#808080'; c.fillRect(0, 0, 1600, 1600);
      if (state.mode === 'missing') return;
      if (state.mode === 'multiple') { c.drawImage(image, 0, 400, 800, 800); c.drawImage(image, 800, 400, 800, 800); return; }
      const x = state.moving ? Math.sin(state.ticks / 20) * 65 : state.offset;
      c.save(); c.translate(800 + x, 800); c.rotate(state.angle * Math.PI / 180); c.drawImage(image, -560, -560, 1120, 1120); c.restore();
    };
    draw(); window.__drawTimer = setInterval(draw, 33);
    navigator.mediaDevices.getUserMedia = async () => {
      const state = window.__camera; state.calls++;
      if (state.reject) throw new DOMException('Synthetic device unavailable', 'NotReadableError');
      if (state.pending) await new Promise(resolve => { state.release = resolve; });
      const stream = canvas.captureStream(30); state.streams.push(stream); return stream;
    };
    navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'motion', label: '움직임 검증 카메라', groupId: 'test' }];
    navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
  });
  await page.getByRole('combobox', { name: '입력 장치' }).selectOption('motion');
  await expect(page.getByText('실시간 필터 적용 중', { exact: true })).toBeVisible({ timeout: 35000 });
  await expect(page.getByLabel('고정된 필터 설정')).toContainText('콧볼 폭 -65');
  await expect(page.getByLabel('고정된 필터 설정')).toContainText('밝기 +26');
  await page.evaluate(() => { window.__camera.moving = true; }); await pixels('moveA');
  await expect.poll(async () => { await pixels('moveB'); return (await diff('moveA', 'moveB')).changed; }).toBeGreaterThan(1000);
  await button('일시정지').click(); await pixels('pausedA');
  await tab('상담 시뮬레이션').click(); await button('가상 보기').click(); await pixels('pausedSimulation');
  assert.equal((await diff('pausedA', 'pausedSimulation')).changed, 0);
  await expect(slider('콧볼 폭')).toHaveValue('-65'); await expect(slider('색조')).toHaveValue('12');
  await tab('실시간 필터').click(); await pixels('pausedB'); assert.equal((await diff('pausedA', 'pausedB')).changed, 0);
  await expect(button('다시 재생')).toBeVisible();
  assert.equal(await page.evaluate(() => window.__camera.calls), 1);
  assert.ok(await page.evaluate(() => window.__camera.streams[0].getVideoTracks()[0].readyState === 'live'));
  await page.screenshot({ path: 'qa/live-filter-normal.png', fullPage: true });
  check('Camera replacement preserves locked values, live frames keep moving, tab round trips preserve pause and corrected pixels without reopening camera');

  await page.evaluate(() => { window.__camera.moving = false; window.__camera.angle = 30; }); await button('다시 재생').click();
  await expect.poll(async () => {
    await tab('상담 시뮬레이션').click();
    return page.locator('#adjust-width').isDisabled();
  }).toBe(true);
  await expect(page.getByText('얼굴을 정면으로 돌려 주세요', { exact: true }).first()).toBeVisible();
  await button('일시정지').click(); await button('원본').click(); await pixels('tiltedOriginal');
  await tab('실시간 필터').click(); await pixels('tiltedFilter');
  const tilted = await diff('tiltedOriginal', 'tiltedFilter'); assert.ok(tilted.changed > 1000, JSON.stringify(tilted)); assert.equal(tilted.outside, 0);
  await page.screenshot({ path: 'qa/live-filter-tilted.png', fullPage: true });
  await tab('상담 시뮬레이션').click(); await button('가상 보기').click(); await pixels('tiltedConsultation');
  assert.equal((await diff('tiltedOriginal', 'tiltedConsultation')).changed, 0);
  await expect(button('비교 이미지 저장')).toBeDisabled(); await tab('실시간 필터').click();
  check('A real detected tilted face receives a local nose filter while the consultation/export gate remains strict; paused tab switches immediately update rendering', tilted);

  for (const mode of ['missing', 'multiple']) {
    await page.evaluate(mode => { window.__camera.mode = mode; }, mode); await button('다시 재생').click();
    await expect(page.getByText(mode === 'missing' ? '얼굴을 화면 가운데에 맞춰 주세요' : '한 분만 화면에 들어와 주세요', { exact: true }).first()).toBeVisible({ timeout: 35000 });
    await button('일시정지').click(); await pixels('blockedFilter');
    await tab('상담 시뮬레이션').click(); await button('원본').click(); await pixels('blockedOriginal');
    assert.equal((await diff('blockedFilter', 'blockedOriginal')).changed, 0);
    await expect(button('비교 이미지 저장')).toBeDisabled(); await tab('실시간 필터').click();
  }
  await page.evaluate(() => { window.__camera.mode = 'face'; window.__camera.angle = 0; }); await button('다시 재생').click();
  await expect(page.getByText('실시간 필터 적용 중', { exact: true })).toBeVisible({ timeout: 35000 });
  await expect(page.getByLabel('고정된 필터 설정')).toContainText('콧볼 폭 -65');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 810));
  await expect(button('보정 변경')).toBeInViewport({ ratio: 1 }); await expect(button('웹캠 연결 해제')).toBeInViewport({ ratio: 1 });
  await expect(tab('상담 시뮬레이션')).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: 'qa/live-filter-minimum.png', fullPage: true });
  await button('새 상담').click(); await button('새 상담 시작').click();
  await expect(tab('상담 시뮬레이션')).toHaveAttribute('aria-selected', 'true');
  await expect(slider('콧볼 폭')).toHaveValue('0'); await expect(slider('화면 밝기')).toHaveValue('12');
  assert.ok(await page.evaluate(() => window.__camera.streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))));
  check('Missing/multiple faces suppress nose warp, recovery restores the locked look, minimum layout fits, and new consultation clears the look and camera tracks');

  await page.evaluate(() => {
    navigator.mediaDevices.enumerateDevices = async () => ['a', 'b'].map(deviceId => ({ kind: 'videoinput', deviceId, label: `Synthetic ${deviceId}`, groupId: '' }));
    navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
  });
  await button('웹캠 연결').click(); await ready();
  await slider('콧볼 폭').fill('-35'); await slider('화면 밝기').fill('33'); await tab('실시간 필터').click();
  await page.getByRole('combobox', { name: '입력 장치' }).selectOption('b');
  await expect(page.getByText('실시간 필터 적용 중', { exact: true })).toBeVisible({ timeout: 35000 });
  await expect(page.getByLabel('고정된 필터 설정')).toContainText('콧볼 폭 -35');
  await expect(page.getByLabel('고정된 필터 설정')).toContainText('밝기 +33');
  assert.equal(await page.evaluate(() => window.__camera.calls), 3);
  assert.ok(await page.evaluate(() => window.__camera.streams.slice(0, -1).every(s => s.getTracks().every(t => t.readyState === 'ended'))));
  await button('일시정지').click();
  await page.evaluate(() => window.__camera.streams.at(-1).getVideoTracks()[0].dispatchEvent(new Event('mute')));
  await expect(page.getByText('웹캠에서 영상이 들어오지 않습니다. 연결 상태를 확인해 주세요.', { exact: true })).toBeVisible();
  await page.evaluate(() => window.__camera.streams.at(-1).getVideoTracks()[0].dispatchEvent(new Event('unmute')));
  await expect(button('다시 재생')).toBeVisible();
  await expect(page.getByLabel('고정된 필터 설정')).toContainText('콧볼 폭 -35');
  await button('다시 재생').click();
  await expect(page.getByText('실시간 필터 적용 중', { exact: true })).toBeVisible({ timeout: 35000 });
  check('Device replacement retains the frozen look, ends the old stream, and mute/unmute preserves a manual pause');

  await page.evaluate(() => { window.__camera.reject = true; });
  await page.getByRole('combobox', { name: '입력 장치' }).selectOption('a');
  await expect(page.getByText('웹캠을 사용할 수 없습니다. 카메라를 사용 중인 다른 앱을 닫고 다시 연결해 주세요.', { exact: true })).toBeVisible();
  await expect(tab('실시간 필터')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('고정된 필터 설정')).toContainText('콧볼 폭 -35');
  await page.evaluate(() => { window.__camera.reject = false; });
  await button('웹캠 연결').click();
  await expect(page.getByText('실시간 필터 적용 중', { exact: true })).toBeVisible({ timeout: 35000 });
  await expect(page.getByLabel('고정된 필터 설정')).toContainText('밝기 +33');
  await page.evaluate(() => { window.__camera.pending = true; });
  await page.getByRole('combobox', { name: '입력 장치' }).selectOption('b');
  await expect(button('연결 취소')).toBeVisible();
  await expect(tab('실시간 필터')).toBeEnabled(); await expect(tab('실시간 필터')).toHaveAttribute('tabindex', '0');
  await tab('실시간 필터').focus(); await expect(tab('실시간 필터')).toBeFocused();
  await button('연결 취소').click();
  await expect(tab('상담 시뮬레이션')).toHaveAttribute('aria-selected', 'true');
  await expect(slider('콧볼 폭')).toHaveValue('0'); await expect(slider('화면 밝기')).toHaveValue('12');
  await page.evaluate(() => { window.__camera.pending = false; window.__camera.release(); });
  await expect.poll(() => page.evaluate(() => window.__camera.streams.every(s => s.getTracks().every(t => t.readyState === 'ended')))).toBe(true);
  check('Connection failure can retry with the locked look; cancellation clears it and stops a late-arriving stream');

  await button('웹캠 연결').click(); await ready();
  await slider('콧볼 폭').fill('-45'); await slider('화면 밝기').fill('25'); await tab('실시간 필터').click();
  await button('웹캠 연결 해제').click();
  await expect(tab('상담 시뮬레이션')).toHaveAttribute('aria-selected', 'true');
  await expect(slider('콧볼 폭')).toHaveValue('0'); await expect(slider('화면 밝기')).toHaveValue('12');
  await button('웹캠 연결').click(); await ready();
  await slider('콧볼 폭').fill('-45'); await slider('화면 밝기').fill('25'); await tab('실시간 필터').click();
  await page.locator('[data-testid=simulation-canvas]').dispatchEvent('webglcontextlost');
  await expect(tab('상담 시뮬레이션')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('실시간 필터')).toBeDisabled();
  await expect(slider('콧볼 폭')).toHaveValue('0'); await expect(slider('화면 밝기')).toHaveValue('12');
  await expect(button('비교 이미지 저장')).toBeDisabled();
  await expect(page.getByText('그래픽 처리가 중단되었습니다. 앱을 다시 실행해 주세요.', { exact: true })).toBeVisible();
  assert.ok(await page.evaluate(() => window.__camera.streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))));
  check('Disconnect and fatal graphics errors return to consultation, reset numbers, stop all streams, and keep exports blocked');
} catch (error) {
  report.failure = error.stack ?? String(error); process.exitCode = 1; console.error(error);
  await page.screenshot({ path: 'qa/live-filter-failure.png', fullPage: true }).catch(() => {});
} finally {
  report.status = report.failure ? 'failed' : 'passed'; await writeFile('qa/live-filter-report.json', JSON.stringify(report, null, 2)); await app.close();
}
