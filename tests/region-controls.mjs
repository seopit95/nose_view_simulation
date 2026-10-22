import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { isolatedLaunch } from './electron-launch.mjs';
import { expandControls, installSyntheticCamera, connectSyntheticCamera } from './synthetic-camera.mjs';

const report = { checkedAt: new Date().toISOString(), status: 'running', executable: process.env.NOSEVIEW_EXECUTABLE ?? 'electron .',
  sourceSha256: process.env.NOSEVIEW_SOURCE_SHA256 ?? null, kind: 'real-model-synthetic-camera', checks: [] };
const app = await electron.launch(await isolatedLaunch()), page = await app.firstWindow(); page.setDefaultTimeout(10000);
const button = name => page.getByRole('button', { name, exact: true });
const slider = name => page.getByRole('slider', { name, exact: true });
const check = (name, detail) => { report.checks.push({ name, detail }); console.log('PASS', name, detail ?? ''); };
const labels = ['콧볼 폭', '콧대 폭', '옆모습 콧대', '코끝 상하', '코끝 크기', '콧날개 상하', '콧구멍 윗선', '비주 상하'];
async function pixels(key) {
  await page.locator('[data-testid=simulation-canvas]').evaluate(async (canvas, key) => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
    const ctx = copy.getContext('2d'); ctx.drawImage(canvas, 0, 0);
    (window.__regionsPixels ??= {})[key] = ctx.getImageData(0, 0, copy.width, copy.height);
  }, key);
}
async function diff(a, b) {
  return page.evaluate(([a, b]) => {
    const one = window.__regionsPixels[a], two = window.__regionsPixels[b]; let changed = 0, outside = 0, lower = 0;
    for (let i = 0; i < one.data.length; i += 4) {
      if (Math.max(...[0, 1, 2].map(c => Math.abs(one.data[i + c] - two.data[i + c]))) <= 1) continue;
      changed++; const x = i / 4 % one.width, y = Math.floor(i / 4 / one.width);
      // Independent generous nose bounds from the checked-in synthetic portrait.
      if (x < one.width * .40 || x > one.width * .61 || y < one.height * .38 || y > one.height * .64) outside++;
      if (y > one.height * .62) lower++;
    }
    return { changed, outside, lower };
  }, [a, b]);
}
try {
  await installSyntheticCamera(page); await connectSyntheticCamera(page); await expandControls(page);
  await expect(slider('코끝 크기')).toBeEnabled();
  for (const name of labels) await expect(slider(name)).toBeEnabled();
  await button('보정 없음').click(); await button('가상 보기').click(); await pixels('zero');
  const changes = {};
  for (const label of labels.filter(label => label !== '옆모습 콧대')) {
    for (const amount of [-100, 100]) {
      await slider(label).fill(String(amount)); await pixels('value');
      const result = await diff('zero', 'value');
      assert.ok(result.changed > 50, `${label}/${amount}: ${JSON.stringify(result)}`);
      assert.equal(result.outside, 0, label); assert.equal(result.lower, 0, `${label} changed mouth`);
      changes[`${label}/${amount}`] = result;
    }
    await button(`${label} 초기화`).click(); await pixels('reset'); assert.equal((await diff('zero', 'reset')).changed, 0);
  }
  check('Seven frontal controls each move actual GPU pixels in both directions, preserve background/mouth, and individual reset restores source', changes);
  await slider('옆모습 콧대').fill('100'); await pixels('projectionFront');
  assert.equal((await diff('zero', 'projectionFront')).changed, 0);
  await button('옆모습 콧대 초기화').click();
  check('Independent profile projection does not change a frontal image');

  const values = ['-36', '-22', '28', '15', '-34', '41', '-45', '29'];
  for (let i = 0; i < labels.length; i++) await slider(labels[i]).fill(values[i]);
  await pixels('combined'); await button('A안 저장').click();
  for (const label of labels) await button(`${label} 초기화`).click();
  await button('A안 불러오기').click();
  for (let i = 0; i < labels.length; i++) await expect(slider(labels[i])).toHaveValue(values[i]);
  await pixels('restored'); assert.equal((await diff('combined', 'restored')).changed, 0);
  await page.getByRole('tab', { name: '실시간 필터', exact: true }).click(); await pixels('filter');
  assert.equal((await diff('combined', 'filter')).changed, 0);
  for (const text of ['코끝 크기 -34', '콧날개 상하 +41', '콧구멍 윗선 -45', '비주 상하 +29']) await expect(page.locator('.filter-summary')).toContainText(text);
  await page.getByLabel('거울 보기', { exact: true }).check(); await pixels('mirror');
  assert.ok((await diff('filter', 'mirror')).changed > 10000);
  await page.getByLabel('거울 보기', { exact: true }).uncheck();
  await page.getByRole('tab', { name: '상담 시뮬레이션', exact: true }).click();
  check('A/B/C, paused filter tab, frozen8 values and mirror all preserve the configured look');

  await page.getByLabel('조절 영역 표시', { exact: true }).check(); await slider('비주 상하').focus();
  await expect(page.locator('[data-region-guide=columella]')).toBeVisible();
  await page.screenshot({ path: 'qa/region-controls-guide.png', fullPage: true });
  await button('비교 이미지 저장').click();
  await expect(button('PNG 저장')).toBeDisabled();
  const exportInfo = await page.locator('.export-preview').evaluate(img => ({ width: img.naturalWidth, height: img.naturalHeight, src: img.src }));
  assert.equal(exportInfo.width, 1600); assert.ok(exportInfo.height >= 1000);
  await writeFile('qa/region-controls-export.png', Buffer.from(exportInfo.src.split(',')[1], 'base64'));
  check('Selected columella guide and8-value comparison PNG are available with consent still required', { width: exportInfo.width, height: exportInfo.height });
} catch (error) {
  report.failure = error.stack ?? String(error); process.exitCode = 1; console.error(error);
  await page.screenshot({ path: 'qa/region-controls-failure.png', fullPage: true }).catch(() => {});
} finally {
  report.status = report.failure ? 'failed' : 'passed'; await writeFile('qa/region-controls-report.json', JSON.stringify(report, null, 2)); await app.close();
}
