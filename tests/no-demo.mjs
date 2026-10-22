import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { readCurrentBuild } from '../scripts/build-info.mjs';
import { isolatedLaunch } from './electron-launch.mjs';
import { installSyntheticCamera, connectSyntheticCamera } from './synthetic-camera.mjs';
import { listPackage } from '@electron/asar';

// An automatic example or camera connection would expose a frame before consent to connect.
const build = await readCurrentBuild();
const launch = await isolatedLaunch();
const report = { checkedAt: new Date().toISOString(), status: 'running', executable: build.executable, sourceSha256: build.sourceSha256, checks: [] };
const packagedLaunch = { executablePath: build.executable, args: launch.args.filter(arg => arg !== '.') };
let app, page;
const requests = [];
async function start() {
  app = await electron.launch(packagedLaunch); page = await app.firstWindow();
  page.on('request', request => requests.push(request.url()));
  await page.addInitScript(() => {
    window.__cameraRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => { window.__cameraRequests++; throw new DOMException('Test did not authorize a camera', 'NotAllowedError'); };
  });
  await standby();
  await page.reload();
  await standby();
  assert.equal(await page.evaluate(() => window.__cameraRequests), 0);
}
async function standby() {
  await expect(page.getByText('로컬 엔진 준비 완료', { exact: true })).toBeVisible({ timeout: 35000 });
  await expect(page.getByRole('button', { name: /예시/ })).toHaveCount(0);
  await expect(page.locator('.tracking-status')).toHaveText('카메라 연결 대기');
  await expect(page.locator('.photo-stage')).not.toHaveClass(/has-frame/);
  await expect(page.getByRole('button', { name: '비교 이미지 저장', exact: true })).toBeDisabled();
  assert.deepEqual(requests.filter(url => /demo-person|synthetic-person/.test(url)), []);
}
try {
  await start();
  report.checks.push('Startup contains no example, frame, image request, or automatic camera capture');
  assert.deepEqual(listPackage(build.archive).filter(file => /demo-person|synthetic-person|[/\\]tests[/\\]/.test(file)), []);
  report.checks.push('Packaged app excludes the removed example and all synthetic test fixtures');
  await installSyntheticCamera(page); await connectSyntheticCamera(page);
  await expect(page.getByRole('button', { name: '비교 이미지 저장', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '비교 이미지 저장', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '촬영 대상자의 이미지 저장 동의를 확인했습니다.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'PNG 저장', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '저장 창 닫기', exact: true }).click();
  await page.getByRole('button', { name: '웹캠 연결 해제', exact: true }).click(); await standby();
  assert.ok(await page.evaluate(() => window.__syntheticCamera.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))));
  await connectSyntheticCamera(page);
  await page.getByRole('button', { name: '새 상담', exact: true }).click();
  await page.getByRole('button', { name: '새 상담 시작', exact: true }).click(); await standby();
  report.checks.push('Explicit camera connection runs real tracking; export requires subject consent; disconnect/new consultation return to empty standby');
  await app.close(); app = null;
  await start();
  report.checks.push('Actual restart with the same isolated profile stays in empty standby without opening the camera');
} catch (error) { report.failure = error.stack; process.exitCode = 1; console.error(error); }
finally {
  report.status = report.failure ? 'failed' : 'passed';
  await mkdir('qa', { recursive: true });
  await writeFile('qa/no-demo-report.json', JSON.stringify(report, null, 2));
  if (app) await app.close();
}
