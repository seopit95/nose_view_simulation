import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { isolatedLaunch } from './electron-launch.mjs';
import { expandControls, installSyntheticCamera, connectSyntheticCamera } from './synthetic-camera.mjs';

const launch = await isolatedLaunch();
const report = { checkedAt: new Date().toISOString(), status: 'running', executable: process.env.NOSEVIEW_EXECUTABLE ?? 'electron .',
  sourceSha256: process.env.NOSEVIEW_SOURCE_SHA256 ?? null, checks: [] };
let app, page;
const button = name => page.getByRole('button', { name, exact: true });
const slider = name => page.getByRole('slider', { name, exact: true });
const select = name => page.getByRole('combobox', { name, exact: true });
const nameField = () => page.getByRole('textbox', { name: '타입 이름', exact: true });
const raw = () => page.evaluate(() => localStorage.getItem('noseview.preferences.v1'));
const ready = async () => { await connectSyntheticCamera(page); await expandControls(page); };
const check = name => { report.checks.push({ name }); console.log('PASS', name); };
async function start() { app = await electron.launch(launch); page = await app.firstWindow(); page.setDefaultTimeout(10000); await installSyntheticCamera(page); await ready(); }
async function snapshot(key) {
  await page.locator('[data-testid=simulation-canvas]').evaluate(async (canvas, key) => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
    const ctx = c.getContext('2d'); ctx.drawImage(canvas, 0, 0);
    (window.__pixels ??= {})[key] = ctx.getImageData(0, 0, c.width, c.height);
  }, key);
}
try {
  await start(); await expect(select('코 타입')).toHaveValue('nose-default');
  const legacy = { version: 1, beauty: { smoothing: 30, brightness: 27, warmth: 0, contrast: -3, saturation: -2, tint: 0, shadows: 8, highlights: -6 },
    nosePreset: { width: -32, bridge: -24, tip: 21 }, autoNose: true };
  const legacyV2 = { version: 2, beauty: legacy.beauty, autoNose: true, defaultNoseId: 'old-second', nosePresets: [
    { id: 'old-first', name: '기존 자연형', adjustments: { width: -26, bridge: -11, tip: 7 } },
    { id: 'old-second', name: '기존 선명형', adjustments: { width: 13, bridge: 19, tip: -8 } },
  ] };
  await page.evaluate(value => localStorage.setItem('noseview.preferences.v1', value), JSON.stringify(legacyV2));
  await page.reload(); await ready(); await expect(select('코 타입')).toHaveValue('old-second');
  await expect(select('코 타입').locator('option:checked')).toHaveText('기존 선명형');
  await expect(slider('콧볼 폭')).toHaveValue('13'); await expect(slider('콧대 폭')).toHaveValue('19'); await expect(slider('코끝 상하')).toHaveValue('-8');
  await expect(slider('옆모습 콧대')).toHaveValue('-19');
  for (const label of ['코끝 크기', '콧날개 상하', '콧구멍 윗선', '비주 상하']) await expect(slider(label)).toHaveValue('0');
  assert.equal(await raw(), JSON.stringify(legacyV2));
  await page.evaluate(value => localStorage.setItem('noseview.preferences.v1', value), JSON.stringify(legacy));
  await page.reload(); await ready();
  await expect(slider('콧볼 폭')).toHaveValue('-32'); await expect(slider('화면 밝기')).toHaveValue('27');
  assert.equal(await raw(), JSON.stringify(legacy)); await expect(slider('옆모습 콧대')).toHaveValue('24');
  await button('프리셋 설정').click(); await expect(nameField()).toHaveValue('이효리 코 타입');
  await button('타입 추가').click(); await nameField().fill('취소할 타입'); await slider('프리셋 콧볼 폭').fill('80');
  await page.keyboard.press('Escape'); await expect(button('프리셋 설정')).toBeFocused();
  assert.equal(await raw(), JSON.stringify(legacy)); await expect(select('코 타입').locator('option')).toHaveCount(1);
  await expect(slider('콧볼 폭')).toHaveValue('-32');
  check('Legacy values migrate without rewriting storage, and cancelling an added type changes neither library nor current consultation');

  await button('프리셋 설정').click(); await button('타입 추가').click();
  await expect(slider('프리셋 콧볼 폭')).toHaveValue('-32');
  await nameField().fill('자연스러운 라인'); await slider('프리셋 콧볼 폭').fill('-55'); await slider('프리셋 코끝 상하').fill('12'); await slider('프리셋 코끝 크기').fill('-23'); await slider('프리셋 비주 상하').fill('16');
  const softId = await select('편집할 코 타입').inputValue();
  await expect(select('기본 코 타입')).toHaveValue('nose-default');
  await button('타입 추가').click(); await nameField().fill('선명한 라인');
  await slider('프리셋 콧볼 폭').fill('35'); await slider('프리셋 콧대 폭').fill('15'); await slider('프리셋 코끝 상하').fill('-20'); await slider('프리셋 옆모습 콧대').fill('-27'); await slider('프리셋 콧날개 상하').fill('22'); await slider('프리셋 콧구멍 윗선').fill('-34');
  const sharpId = await select('편집할 코 타입').inputValue(); assert.notEqual(softId, sharpId);
  await select('기본 코 타입').selectOption(softId);
  await select('편집할 코 타입').focus(); await page.screenshot({ path: 'qa/nose-presets-editor.png', fullPage: true });
  await button('기본 설정 저장').click();
  const stored = JSON.parse(await raw()); assert.equal(stored.version, 3); assert.equal(stored.nosePresets.length, 3); assert.equal(stored.defaultNoseId, softId);
  await expect(slider('콧볼 폭')).toHaveValue('-32'); await expect(select('코 타입')).toHaveValue('nose-default');
  await select('코 타입').selectOption(softId); await expect(slider('콧볼 폭')).toHaveValue('-55');
  await button('가상 보기').click(); await snapshot('soft');
  await select('코 타입').selectOption(sharpId); await expect(slider('콧볼 폭')).toHaveValue('35'); await snapshot('sharp');
  const changed = await page.evaluate(() => {
    const a = window.__pixels.soft, b = window.__pixels.sharp; let changed = 0, edges = 0;
    for (let i = 0; i < a.data.length; i += 4) if ([0, 1, 2].some(c => Math.abs(a.data[i + c] - b.data[i + c]) > 1)) {
      changed++; const x = (i / 4) % a.width; if (x < a.width * .15 || x > a.width * .85) edges++;
    }
    return { changed, edges };
  });
  assert.ok(changed.changed > 1000, JSON.stringify(changed)); assert.equal(changed.edges, 0);
  await expect(slider('화면 밝기')).toHaveValue('27');
  await slider('콧볼 폭').fill('40'); await expect(button('선택한 타입 적용')).toHaveAttribute('aria-pressed', 'false');
  await button('선택한 타입 적용').click(); await expect(slider('콧볼 폭')).toHaveValue('35');
  check('Multiple named types save independently, selecting changes real GPU nose pixels without changing background/tone, and reapply restores edited values');

  await button('프리셋 설정').click(); await expect(select('편집할 코 타입')).toHaveValue(sharpId);
  await nameField().fill('선명한 맞춤 라인'); await expect(select('기본 코 타입')).toHaveValue(softId);
  await button('기본 설정 저장').click();
  await expect(select('코 타입')).toHaveValue(sharpId); await expect(select('코 타입').locator('option:checked')).toHaveText('선명한 맞춤 라인');
  await button('프리셋 설정').click(); const beforeInvalid = await raw();
  for (const invalid of ['   ', ' 자연스러운 라인 ']) {
    await nameField().fill(invalid); await button('기본 설정 저장').click(); await expect(page.getByRole('alert')).toBeVisible();
    assert.equal(await raw(), beforeInvalid); await expect(nameField()).toHaveValue(invalid);
  }
  await nameField().fill('<b>맞춤 타입</b>'); await button('기본 설정 저장').click();
  await expect(select('코 타입').locator('option:checked')).toHaveText('<b>맞춤 타입</b>');
  assert.equal(await select('코 타입').locator('b').count(), 0);
  check('Renaming keeps stable selection and separate default, invalid names preserve storage/draft, and names render as plain text');

  await app.close(); app = null; await start();
  await expect(select('코 타입').locator('option')).toHaveCount(3); await expect(select('코 타입')).toHaveValue(softId);
  await expect(slider('콧볼 폭')).toHaveValue('-55'); await expect(slider('코끝 크기')).toHaveValue('-23'); await expect(slider('비주 상하')).toHaveValue('16'); await expect(slider('화면 밝기')).toHaveValue('27');
  await select('코 타입').selectOption(sharpId); await slider('코끝 상하').fill('-17');
  await page.getByRole('tab', { name: '실시간 필터', exact: true }).click();
  await expect(page.getByLabel('고정된 필터 설정')).toContainText('콧볼 폭 +35');
  for (const value of ['옆모습 콧대 -27', '콧날개 상하 +22', '콧구멍 윗선 -34']) await expect(page.getByLabel('고정된 필터 설정')).toContainText(value);
  await page.evaluate(async () => {
    const image = new Image(); image.src = window.__syntheticImageUrl; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
    const draw = () => canvas.getContext('2d').drawImage(image, 0, 0, 1024, 1024);
    draw(); window.__cameraTimer = setInterval(draw, 33);
    window.__cameraCalls = 0;
    navigator.mediaDevices.enumerateDevices = async () => ['a', 'b'].map(id => ({ kind: 'videoinput', deviceId: `synthetic-${id}`, groupId: '', label: `합성 카메라 ${id}` }));
    navigator.mediaDevices.getUserMedia = async () => { window.__cameraCalls++; return canvas.captureStream(30); };
    navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
  });
  await select('입력 장치').selectOption('synthetic-a'); await expect(button('웹캠 연결 해제')).toBeVisible({ timeout: 35000 });
  await expect(page.getByLabel('고정된 필터 설정')).toContainText('코끝 상하 -17');
  await select('입력 장치').selectOption('synthetic-b');
  await expect.poll(() => page.evaluate(() => window.__cameraCalls)).toBe(2);
  await expect(button('웹캠 연결 해제')).toBeVisible();
  await expect(page.getByLabel('고정된 필터 설정')).toContainText('코끝 상하 -17');
  await button('보정 변경').click(); await expect(select('코 타입')).toHaveValue(sharpId); await expect(slider('콧볼 폭')).toHaveValue('35'); await expect(slider('콧날개 상하')).toHaveValue('22'); await expect(slider('콧구멍 윗선')).toHaveValue('-34');
  await button('새 상담').click(); await button('새 상담 시작').click();
  await expect(select('코 타입')).toHaveValue(softId); await expect(slider('콧볼 폭')).toHaveValue('-55');
  await expect(select('코 타입')).toBeDisabled(); await expect(button('선택한 타입 적용')).toBeDisabled();
  await expect(select('코 타입').locator('option')).toHaveCount(3);
  check('Real restart restores library/default, live-filter camera connection and device change preserve selected type/custom values, and new consultation restores the chosen default');

  await button('기본 설정').click(); await page.getByLabel('새 상담에 코 프리셋 자동 적용', { exact: true }).uncheck();
  await button('기본 설정 저장').click(); await page.reload(); await ready();
  await expect(select('코 타입')).toHaveValue(softId); await expect(slider('콧볼 폭')).toHaveValue('0');
  await button('선택한 타입 적용').click(); await expect(slider('콧볼 폭')).toHaveValue('-55');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 810));
  await button('프리셋 설정').click();
  for (const control of [nameField(), select('편집할 코 타입'), slider('프리셋 코끝 상하'), slider('프리셋 콧구멍 윗선'), slider('프리셋 비주 상하'), select('기본 코 타입')]) {
    await control.focus(); await expect(control).toBeInViewport({ ratio: 1 });
    const box = await control.boundingBox(), actions = await button('기본 설정 저장').boundingBox();
    assert.ok(box.y + box.height < actions.y, 'Focused editor control must not hide behind save actions');
  }
  await expect(button('기본 설정 저장')).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: 'qa/nose-presets-settings.png', fullPage: true }); await button('취소').click();
  await page.screenshot({ path: 'qa/nose-presets-consultation.png', fullPage: true });
  check('Optional automatic application remains off when saved off; new editor fields and save action are keyboard-accessible in the minimum window');

  const beforeFailure = await raw();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await button('프리셋 설정').click(); await button('타입 추가').click(); await nameField().fill('실패 후 재시도');
  await button('기본 설정 저장').click(); await expect(page.getByRole('alert')).toContainText('설정을 저장하지 못했습니다');
  await expect(nameField()).toHaveValue('실패 후 재시도'); assert.equal(await raw(), beforeFailure);
  await button('취소').click(); await expect(select('코 타입').locator('option')).toHaveCount(3);
  check('Storage failure leaves saved library/current selection intact and retains the new draft for retry');
} catch (error) {
  report.failure = error.stack ?? String(error); process.exitCode = 1; console.error(error);
  if (page) await page.screenshot({ path: 'qa/nose-presets-failure.png', fullPage: true }).catch(() => {});
} finally {
  report.status = report.failure ? 'failed' : 'passed'; await writeFile('qa/nose-presets-report.json', JSON.stringify(report, null, 2));
  if (app) await app.close();
}
