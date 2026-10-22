import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { isolatedLaunch } from './electron-launch.mjs';
import { installSyntheticCamera } from './synthetic-camera.mjs';

const report = { checkedAt: new Date().toISOString(), status: 'running', executable: process.env.NOSEVIEW_EXECUTABLE ?? 'electron .',
  sourceSha256: process.env.NOSEVIEW_SOURCE_SHA256 ?? null, kind: 'synthetic-camera-playback-boundary', checks: [] };
const app = await electron.launch(await isolatedLaunch()), page = await app.firstWindow();
page.setDefaultTimeout(12000);
const button = name => page.getByRole('button', { name, exact: true });
const check = name => { report.checks.push({ name }); console.log('PASS', name); };
try {
  await installSyntheticCamera(page);
  await expect(page.getByText('로컬 엔진 준비 완료', { exact: true })).toBeVisible({ timeout: 35000 });
  await page.evaluate(() => {
    const play = HTMLMediaElement.prototype.play;
    window.__stallPlayback = true;
    HTMLMediaElement.prototype.play = function () {
      if (window.__stallPlayback) return new Promise(() => {});
      return play.call(this);
    };
  });
  await button('웹캠 연결').click(); await expect(button('연결 취소')).toBeVisible();
  const during = await page.locator('.empty-preview').innerText();
  await expect(button('웹캠 연결')).toBeVisible({ timeout: 12000 });
  const after = await page.locator('.empty-preview').innerText();
  const issues = [];
  if (!/첫 영상/.test(during) || /왼쪽에서 웹캠을 연결/.test(during)) issues.push('Pending playback still asks the user to connect');
  if (!/USB/.test(after) || !/영상/.test(after) || !/다시 연결/.test(after)) issues.push('Playback timeout has no actionable USB/retry explanation');
  assert.deepEqual(issues, []);
  assert.equal(await page.evaluate(() => window.__syntheticCamera.streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))), true);
  await expect(page.locator('.photo-stage')).not.toHaveClass(/has-frame/);
  await expect(button('비교 이미지 저장')).toBeDisabled();
  check('First-frame timeout shows USB/retry guidance, ends its acquired stream, and leaves no frame/export');

  await page.evaluate(() => { window.__stallPlayback = false; });
  await button('웹캠 연결').click();
  await expect(button('웹캠 연결 해제')).toBeVisible();
  await expect(page.locator('.photo-stage')).toHaveClass(/has-frame/);
  await expect(page.locator('.empty-preview')).toHaveCount(0);
  check('Explicit retry receives real model frames after an earlier playback timeout');

  await button('웹캠 연결 해제').click();
  await page.evaluate(() => { window.__stallPlayback = true; });
  await button('웹캠 연결').click();
  await expect.poll(() => page.evaluate(() => window.__syntheticCamera.streams.length)).toBe(3);
  await button('연결 취소').click();
  assert.equal(await page.evaluate(() => window.__syntheticCamera.streams[2].getTracks().every(t => t.readyState === 'ended')), true);
  await page.evaluate(() => { window.__stallPlayback = false; });
  await button('웹캠 연결').click();
  await expect(button('웹캠 연결 해제')).toBeVisible();
  // Let the cancelled playback deadline actually expire; it must not stop the new input.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 8500)));
  await expect(button('웹캠 연결 해제')).toBeVisible();
  await expect(page.locator('.photo-stage')).toHaveClass(/has-frame/);
  assert.equal(await page.evaluate(() => window.__syntheticCamera.streams[3].getTracks()[0].readyState), 'live');
  check('Cancelled stalled playback cannot clear or stop a later successful camera connection');
} catch (error) {
  report.failure = error.stack ?? String(error); process.exitCode = 1; console.error(error);
} finally {
  report.status = report.failure ? 'failed' : 'passed';
  await writeFile('qa/camera-startup-report.json', JSON.stringify(report, null, 2)); await app.close();
}
