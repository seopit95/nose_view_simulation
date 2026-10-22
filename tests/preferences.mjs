import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { isolatedLaunch } from './electron-launch.mjs';
import { expandControls, installSyntheticCamera, connectSyntheticCamera } from './synthetic-camera.mjs';

const launch = await isolatedLaunch();
const report = { checkedAt: new Date().toISOString(), status: 'running', executable: process.env.NOSEVIEW_EXECUTABLE ?? 'electron .',
  sourceSha256: process.env.NOSEVIEW_SOURCE_SHA256 ?? null, checks: [] };
await writeFile('qa/preferences-report.json', JSON.stringify(report, null, 2));
let app, page;
const button = name => page.getByRole('button', { name, exact: true });
const slider = name => page.getByRole('slider', { name, exact: true });
const ready = async () => { await connectSyntheticCamera(page); await expandControls(page); };
const noseControls = [['width', '콧볼 폭'], ['bridge', '콧대 폭'], ['projection', '옆모습 콧대'], ['tip', '코끝 상하'], ['tipSize', '코끝 크기'], ['alarLift', '콧날개 상하'], ['nostrilExposure', '콧구멍 윗선'], ['columella', '비주 상하']];
const savedNose = { width: -32, bridge: -24, projection: 36, tip: 21, tipSize: -27, alarLift: 18, nostrilExposure: -22, columella: 13 };
async function expectNose(value, prefix = '') { for (const [key, label] of noseControls) await expect(slider(`${prefix}${label}`)).toHaveValue(String(value[key])); }
const check = (name, detail) => { report.checks.push({ name, detail }); console.log('PASS', name, detail ?? ''); };
async function start() {
  app = await electron.launch(launch); page = await app.firstWindow(); page.setDefaultTimeout(10000); await installSyntheticCamera(page); await ready();
}
async function pixels(key) {
  return page.locator('[data-testid=simulation-canvas]').evaluate(async (canvas, key) => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
    const c = copy.getContext('2d'); c.drawImage(canvas, 0, 0);
    (window.__pixels ??= {})[key] = c.getImageData(0, 0, copy.width, copy.height);
  }, key);
}
async function diff(a, b) {
  return page.evaluate(([a, b]) => {
    const first = window.__pixels[a].data, second = window.__pixels[b].data; let changed = 0;
    for (let i = 0; i < first.length; i += 4) if (Math.max(...[0, 1, 2].map(c => Math.abs(first[i + c] - second[i + c]))) > 1) changed++;
    return changed;
  }, [a, b]);
}
try {
  await start();
  await button('보정 없음').click(); await button('원본').click(); await pixels('initial');
  await button('선택한 타입 적용').click();
  await expectNose({ width: -18, bridge: -10, projection: 10, tip: 8, tipSize: 0, alarLift: 0, nostrilExposure: 0, columella: 0 });
  await button('가상 보기').click(); await pixels('preset'); assert.ok(await diff('initial', 'preset') > 1000);
  for (const [key, label] of noseControls) await slider(label).fill(String(key === 'tip' ? 18 : savedNose[key]));
  await slider('화면 밝기').fill('26'); await slider('채도').fill('-15'); await slider('그림자').fill('22');
  await button('기본 설정').click(); await button('현재 코 조절값 가져오기').click();
  await expectNose({ ...savedNose, tip: 18 }, '프리셋 '); await slider('프리셋 코끝 상하').fill('21');
  await button('프리셋 비주 상하 초기화').click(); await expectNose({ ...savedNose, columella: 0 }, '프리셋 '); await slider('프리셋 비주 상하').fill('13');
  await page.getByLabel('새 상담에 코 프리셋 자동 적용', { exact: true }).check();
  await button('기본 설정 저장').click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('noseview.preferences.v1')));
  assert.deepEqual(Object.keys(stored).sort(), ['autoNose', 'beauty', 'defaultNoseId', 'nosePresets', 'version']);
  assert.equal(stored.version, 3); assert.deepEqual(stored.nosePresets[0].adjustments, savedNose);
  await button('선택한 타입 적용').click(); await expect(slider('코끝 상하')).toHaveValue('21');
  await button('A안 저장').click(); await slider('화면 밝기').fill('80'); await slider('콧볼 폭').fill('60'); await slider('비주 상하').fill('-60');
  await button('A안 불러오기').click(); await expectNose(savedNose); await expect(slider('화면 밝기')).toHaveValue('80');
  await button('기본 설정').click(); await slider('프리셋 콧볼 폭').fill('70'); await page.keyboard.press('Escape');
  await expect(button('기본 설정')).toBeFocused();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('noseview.preferences.v1'))), stored);
  await button('새 상담').click(); await button('새 상담 시작').click();
  await expect(slider('화면 밝기')).toHaveValue('26'); await expectNose(savedNose);
  await expect(button('A안 저장')).toBeVisible(); await expect(button('웹캠 연결')).toBeVisible();
  await app.close(); app = null; await start();
  await expect(slider('화면 밝기')).toHaveValue('26'); await expect(slider('채도')).toHaveValue('-15');
  await expectNose(savedNose); await expect(button('A안 저장')).toBeVisible();
  await expect(button('웹캠 연결 해제')).toBeVisible();
  await button('기본 설정').click(); await page.getByLabel('새 상담에 코 프리셋 자동 적용', { exact: true }).uncheck();
  await button('기본 설정 저장').click(); await page.reload(); await ready();
  await expectNose({ width: 0, bridge: 0, projection: 0, tip: 0, tipSize: 0, alarLift: 0, nostrilExposure: 0, columella: 0 }); await button('선택한 타입 적용').click(); await expectNose(savedNose);
  check('Preset changes rendered pixels, remains editable, explicit numeric defaults survive restart, cancel/temporary values do not, auto-nose is optional');

  // Only synthetic pixels enter captureStream. MediaPipe and GPU remain real.
  await button('웹캠 연결 해제').click();
  await page.evaluate(async () => {
    const image = new Image(); image.src = window.__syntheticImageUrl; await image.decode();
    const face = document.createElement('canvas'); face.width = face.height = 1600; const f = face.getContext('2d');
    f.fillStyle = '#777777'; f.fillRect(0, 0, 1600, 1600); f.translate(800, 800); f.rotate(Math.PI / 6); f.drawImage(image, -560, -560, 1120, 1120); f.resetTransform();
    const data = f.getImageData(0, 0, 1600, 1600); let seed = 11;
    for (let i = 0; i < data.data.length; i += 4) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const noise = seed % 19 - 9; for (let c = 0; c < 3; c++) data.data[i + c] += noise; }
    f.putImageData(data, 0, 0);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1600; const ctx = canvas.getContext('2d');
    window.__input = { mode: 'face', canvas, draw() {
      if (this.mode === 'face') ctx.drawImage(face, 0, 0);
      else if (this.mode === 'gradient') for (let i = 0; i < 256; i++) { ctx.fillStyle = `rgb(${i},${i},${i})`; ctx.fillRect(i * 1600 / 256, 0, 1600 / 256 + 1, 1600); }
      else {
        ['#000000', '#303030', '#808080', '#d0d0d0', '#ffffff', '#c48e71'].forEach((color, i) => {
          ctx.fillStyle = color; ctx.fillRect(i * 1600 / 6, 0, 1600 / 6 + 1, 1600);
        });
      }
    } };
    window.__input.draw(); window.__timer = setInterval(() => window.__input.draw(), 33);
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(30);
  });
  await button('웹캠 연결').click();
  await expect(page.getByText('얼굴을 정면으로 돌려 주세요', { exact: true }).first()).toBeVisible({ timeout: 35000 });
  await expect(slider('콧볼 폭')).toBeDisabled(); await expect(button('비교 이미지 저장')).toBeDisabled();
  await expect(slider('화면 밝기')).toHaveValue('26');
  // Freeze the intended single tilted face in the same UI turn. A separate
  // locator click may wait for button motion while VIDEO inference advances
  // to a different (including multiple-face) result on this synthetic fixture.
  await page.waitForFunction(() => {
    if (document.querySelector('.tracking-status')?.textContent !== '얼굴을 정면으로 돌려 주세요') return false;
    const pause = [...document.querySelectorAll('button')].find(el => el.textContent === '일시정지');
    if (!pause || pause.disabled) return false;
    pause.click(); return true;
  }, null, { timeout: 35000 });
  await expect(button('다시 재생')).toBeVisible();
  await button('원본').click(); await button('보정 없음').click(); await pixels('tiltedRaw');
  await slider('피부 보정 강도').fill('100'); await pixels('tiltedSkin'); const tiltedChanged = await diff('tiltedRaw', 'tiltedSkin');
  assert.ok(tiltedChanged > 1000, `Smoothing absent on real detected rotated face: ${tiltedChanged}`);
  await button('가상 보기').click(); await pixels('tiltedSimulation'); assert.equal(await diff('tiltedSkin', 'tiltedSimulation'), 0);
  await page.screenshot({ path: 'qa/preferences-tilted.png', fullPage: true });
  check('Rotated synthetic face retains smoothing while nose warp and export remain blocked', { tiltedChanged });

  await page.evaluate(() => { window.__input.mode = 'chart'; }); await button('다시 재생').click();
  await expect(page.getByText('얼굴을 화면 가운데에 맞춰 주세요', { exact: true }).first()).toBeVisible({ timeout: 35000 });
  await button('일시정지').click(); await page.getByLabel('거울 보기', { exact: true }).uncheck();
  await button('보정 없음').click(); await pixels('chartRaw');
  const patches = async key => page.evaluate(key => {
    const frame = window.__pixels[key]; return Array.from({ length: 6 }, (_, i) => {
      const at = (800 * frame.width + Math.floor((i + .5) * frame.width / 6)) * 4;
      return Array.from(frame.data.slice(at, at + 3));
    });
  }, key);
  const base = await patches('chartRaw');
  const values = {};
  for (const name of ['대비', '채도', '색조', '그림자', '하이라이트']) {
    for (const amount of [-100, 100]) {
      await button('보정 없음').click(); await slider(name).fill(String(amount)); await pixels('chart');
      values[`${name}${amount}`] = await patches('chart');
      assert.deepEqual(values[`${name}${amount}`][0], [0, 0, 0]); assert.deepEqual(values[`${name}${amount}`][4], [255, 255, 255]);
    }
  }
  assert.ok(values['대비100'][1][0] < base[1][0] - 5 && values['대비100'][3][0] > base[3][0] + 5);
  assert.ok(values['대비-100'][1][0] > base[1][0] + 5 && values['대비-100'][3][0] < base[3][0] - 5);
  assert.equal(Math.max(...values['채도-100'][5]) - Math.min(...values['채도-100'][5]), 0);
  assert.ok(values['채도100'][5][0] - values['채도100'][5][2] > base[5][0] - base[5][2]);
  assert.ok(values['색조100'][2][0] > base[2][0] && values['색조100'][2][1] < base[2][1]);
  assert.ok(values['색조-100'][2][0] < base[2][0] && values['색조-100'][2][1] > base[2][1]);
  assert.ok(values['그림자100'][1][0] > base[1][0] + 5 && values['그림자-100'][1][0] < base[1][0] - 5);
  assert.ok(Math.abs(values['그림자100'][1][0] - base[1][0]) > Math.abs(values['그림자100'][3][0] - base[3][0]));
  assert.ok(values['하이라이트100'][3][0] > base[3][0] + 5 && values['하이라이트-100'][3][0] < base[3][0] - 5);
  assert.ok(Math.abs(values['하이라이트-100'][3][0] - base[3][0]) > Math.abs(values['하이라이트-100'][1][0] - base[1][0]));
  for (const [brightness, warmth, tint, contrast, shadows, highlights] of [
    [-90, 0, 0, 100, 0, 0], [-50, 0, 0, -100, 0, 0], [-100, -100, -100, 100, -100, 100],
    [-100, 100, 100, -100, 100, -100], [100, 100, 100, 100, 100, 100], [100, -100, -100, -100, -100, -100],
  ]) {
    await button('보정 없음').click();
    for (const [label, value] of [['화면 밝기', brightness], ['색온도', warmth], ['색조', tint], ['대비', contrast], ['그림자', shadows], ['하이라이트', highlights]]) await slider(label).fill(String(value));
    await pixels('combined'); const result = await patches('combined');
    assert.deepEqual(result[0], [0, 0, 0]); assert.deepEqual(result[4], [255, 255, 255], `White endpoint with ${[brightness, warmth, tint, contrast, shadows, highlights]}`);
  }
  await button('보정 없음').click(); await pixels('offAgain'); assert.equal(await diff('chartRaw', 'offAgain'), 0);
  await button('내 기본 보정 불러오기').click(); await expect(slider('화면 밝기')).toHaveValue('26');
  await page.screenshot({ path: 'qa/preferences-tones.png', fullPage: true });
  check('Five new controls change real GPU color patches in both directions without a face; black/white and off identity are preserved', { base, values });

  await page.evaluate(() => { window.__input.mode = 'gradient'; }); await button('다시 재생').click();
  await expect.poll(() => page.locator('[data-testid=simulation-canvas]').evaluate(canvas => {
    const c = document.createElement('canvas'); c.width = c.height = 1600; const ctx = c.getContext('2d'); ctx.drawImage(canvas, 0, 0);
    return ctx.getImageData(100, 800, 1, 1).data[0];
  })).toBeGreaterThan(5);
  await button('일시정지').click(); await button('보정 없음').click();
  for (const [shadows, highlights] of [[100, -100], [-100, 100], [100, 100], [-100, -100]]) {
    await slider('그림자').fill(String(shadows)); await slider('하이라이트').fill(String(highlights)); await pixels('gradient');
    const ramp = await page.evaluate(() => {
      const f = window.__pixels.gradient; return Array.from({ length: 256 }, (_, i) => f.data[(800 * f.width + Math.floor((i + .5) * f.width / 256)) * 4]);
    });
    assert.ok(ramp.every((n, i) => i === 0 || n >= ramp[i - 1]), `Non-monotonic shadows ${shadows}, highlights ${highlights}`);
  }
  check('Combined shadow/highlight extremes keep all 256 grayscale levels in order');

  await button('웹캠 연결 해제').click(); await page.reload(); await ready();
  await button('기본 설정').click();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 810));
  await expect(button('기본 설정 저장')).toBeInViewport({ ratio: 1 });
  await slider('프리셋 코끝 상하').focus(); await page.keyboard.press('ArrowRight'); await expect(slider('프리셋 코끝 상하')).toHaveValue('22');
  assert.ok(await page.evaluate(() => document.getElementById('preset-tip').getBoundingClientRect().bottom <
    document.querySelector('.settings-dialog .dialog-actions').getBoundingClientRect().top), 'Focused slider must not hide behind the sticky save buttons');
  await page.screenshot({ path: 'qa/preferences-settings.png', fullPage: true }); await button('취소').click();
  await slider('하이라이트').scrollIntoViewIfNeeded(); await expect(slider('하이라이트')).toBeInViewport({ ratio: 1 });
  await expect(button('비교 이미지 저장')).toBeInViewport({ ratio: 1 });
  await button('비교 이미지 저장').click();
  await expect(page.locator('.export-correction')).toContainText('채도 -15'); await expect(page.locator('.export-correction')).toContainText('그림자 +22');
  await expect(button('PNG 저장')).toBeDisabled();
  await page.screenshot({ path: 'qa/preferences-export.png', fullPage: true }); await button('저장 창 닫기').click();
  check('Settings dialog and eight controls fit minimum window, keyboard editing works, export lists extended corrections and still requires consent');

  const original = await page.evaluate(() => localStorage.getItem('noseview.preferences.v1'));
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await slider('화면 밝기').fill('90'); await button('기본 설정').click(); await button('기본 설정 저장').click();
  await expect(page.getByRole('alert')).toContainText('설정을 저장하지 못했습니다');
  assert.equal(await page.evaluate(() => localStorage.getItem('noseview.preferences.v1')), original);
  await button('취소').click(); await page.reload(); await ready(); await expect(slider('화면 밝기')).toHaveValue('26');
  await page.evaluate(() => localStorage.setItem('noseview.preferences.v1', '{bad json'));
  await page.reload(); await ready(); await expect(slider('화면 밝기')).toHaveValue('12');
  await button('기본 설정 · 확인 필요').click();
  await expect(page.getByRole('alert')).toContainText('저장된 기본 설정을 읽지 못해');
  await button('기본 설정 저장').click(); await expect(button('기본 설정')).toBeVisible();
  check('Storage write failure preserves defaults and reports failure; malformed settings recover visibly and can be saved again');
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key) { if (key === 'noseview.preferences.v1') throw new DOMException('Unavailable', 'SecurityError'); return get.call(this, key); };
  });
  await page.reload(); await ready(); await expect(slider('화면 밝기')).toHaveValue('12');
  await button('기본 설정 · 확인 필요').click(); await expect(page.getByRole('alert')).toContainText('저장소에 접근하지 못했습니다');
  check('Storage access failure does not prevent startup and is shown in settings');
} catch (error) {
  report.failure = error.stack ?? String(error); process.exitCode = 1; console.error(error);
  if (page) await page.screenshot({ path: 'qa/preferences-failure.png', fullPage: true }).catch(() => {});
} finally {
  report.status = report.failure ? 'failed' : 'passed'; await writeFile('qa/preferences-report.json', JSON.stringify(report, null, 2));
  if (app) await app.close();
}
