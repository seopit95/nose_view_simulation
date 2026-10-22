import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { isolatedLaunch } from './electron-launch.mjs';
import { installSyntheticCamera, connectSyntheticCamera } from './synthetic-camera.mjs';

const report = { checkedAt: new Date().toISOString(), status: 'running', executable: process.env.NOSEVIEW_EXECUTABLE ?? 'electron .',
  sourceSha256: process.env.NOSEVIEW_SOURCE_SHA256 ?? null, kind: 'real-model-synthetic-camera', checks: [] };
const app = await electron.launch(await isolatedLaunch()), page = await app.firstWindow(); page.setDefaultTimeout(10000);
const button = name => page.getByRole('button', { name, exact: true });
const slider = name => page.getByRole('slider', { name, exact: true });
const capture = name => page.screenshot({ path: `qa/consultation-${name}.png`, fullPage: true, animations: 'disabled' });
const check = name => { report.checks.push({ name }); console.log('PASS', name); };
async function pixels() {
  return page.locator('[data-testid=simulation-canvas]').evaluate(async canvas => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return canvas.toDataURL();
  });
}
try {
  await installSyntheticCamera(page); await connectSyntheticCamera(page);
  await expect(page.locator('.right-panel').getByRole('slider')).toHaveCount(4);
  await expect(page.locator('.beauty-panel').getByRole('slider')).toHaveCount(2);
  for (const name of ['콧대 폭', '콧볼 폭', '코끝 크기', '코끝 상하']) await expect(slider(name)).toBeEnabled();
  await capture('simple');
  await button('가상 보기').click(); await button('보정 없음').click();
  const before = await pixels();
  await page.locator('.nose-details > summary').focus(); await page.keyboard.press('Enter');
  await expect(slider('비주 상하')).toBeVisible();
  await slider('콧날개 상하').fill('35'); await slider('콧구멍 윗선').fill('-45'); await slider('비주 상하').fill('-30');
  const changed = await pixels(); assert.notEqual(changed, before);
  await slider('옆모습 콧대').fill('60'); assert.equal(await pixels(), changed, 'profile-only change is explicitly deferred in front view');
  await expect(page.locator('.profile-control-note')).toContainText('정면에서는 변화가 보이지 않습니다');
  await page.locator('.nose-details > summary').click();
  await expect(page.locator('.right-panel').getByRole('slider')).toHaveCount(4);
  await expect(page.locator('.nose-details > summary')).toContainText('4개 적용 중');
  assert.equal(await pixels(), changed, 'collapsing controls must preserve applied pixels');
  await button('A안 저장').click(); await button('초기화').click(); assert.equal(await pixels(), before);
  await expect(page.locator('.nose-details > summary')).toContainText('적용 없음');
  await button('A안 불러오기').click(); assert.equal(await pixels(), changed);
  await page.locator('.nose-details > summary').click();
  await expect(slider('콧구멍 윗선')).toHaveValue('-45');
  await expect(slider('비주 상하')).toHaveValue('-30');
  await button('옆모습 확인').click();
  await expect(page.getByRole('tab', { name: '실시간 필터', exact: true })).toBeFocused();
  await expect(button('다시 재생')).toBeVisible();
  await expect(page.getByLabel('고정된 필터 설정')).toContainText('옆모습 콧대 +60');
  assert.equal(await pixels(), changed);
  await button('보정 변경').click();
  check('Four basic controls, explicit profile guidance, detail badge, A/B/C and filter keep the same settings and paused image');

  await page.locator('.beauty-details > summary').focus(); await page.keyboard.press('Space');
  await slider('색온도').fill('25'); await slider('대비').fill('-12');
  const corrected = await pixels(); assert.notEqual(corrected, changed);
  await page.locator('.beauty-details > summary').click();
  assert.equal(await pixels(), corrected);
  await expect(page.locator('.beauty-panel').getByRole('slider')).toHaveCount(2);
  check('Keyboard disclosure exposes additional tones without resetting the image when closed');

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 810));
  await slider('비주 상하').focus(); await expect(slider('비주 상하')).toBeInViewport({ ratio: 1 });
  const layout = await page.evaluate(() => ({ height: innerHeight, scrollHeight: document.documentElement.scrollHeight,
    overflow: [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().bottom > innerHeight && getComputedStyle(el).display !== 'none').map(el => ({ tag: el.tagName, class: el.className, height: el.getBoundingClientRect().height, bottom: el.getBoundingClientRect().bottom })).slice(0, 30) }));
  assert.ok(layout.scrollHeight <= layout.height, `panels must not overflow the window: ${JSON.stringify(layout)}`);
  await capture('details-minimum');
  await page.locator('.nose-details > summary').click();
  await page.locator('.control-scroll').evaluate(el => { el.scrollTop = 0; });
  await expect(button('비교 이미지 저장')).toBeInViewport({ ratio: 1 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await capture('simple-minimum');
  await page.getByRole('tab', { name: '실시간 필터', exact: true }).click();
  await page.locator('.filter-summary > summary').click();
  await expect(page.locator('.filter-summary > span')).toBeInViewport({ ratio: 1 });
  await expect(button('다시 재생')).toBeInViewport({ ratio: 1 });
  await expect(button('보정 변경')).toBeInViewport({ ratio: 1 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight));
  await capture('filter-minimum');
  await button('보정 변경').click();
  await button('기본 설정').click();
  for (const name of ['프리셋 코끝 상하', '프리셋 콧날개 상하', '프리셋 콧구멍 윗선', '프리셋 비주 상하']) await expect(slider(name)).toHaveCount(1);
  await button('설정 닫기').click();
  await button('비교 이미지 저장').click(); await expect(button('PNG 저장')).toBeDisabled();
  await capture('export');
  check('Minimum window and settings use the same names, and export still requires consent');
} catch (error) {
  report.failure = error.stack ?? String(error); process.exitCode = 1; console.error(error);
  await capture('failure').catch(() => {});
} finally {
  report.status = report.failure ? 'failed' : 'passed'; await writeFile('qa/consultation-ux-report.json', JSON.stringify(report, null, 2)); await app.close();
}
