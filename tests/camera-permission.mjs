import { _electron as electron, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { readCurrentBuild } from '../scripts/build-info.mjs';
import { isolatedLaunch } from './electron-launch.mjs';
const build = await readCurrentBuild();
await mkdir('qa', { recursive: true });
const report = { checkedAt: new Date().toISOString(), status: 'running', executable: build.executable, sourceSha256: build.sourceSha256, checks: [] };
await writeFile('qa/camera-permission-report.json', JSON.stringify(report, null, 2));
// Chromium's fake device generates a test pattern; no system camera is opened.
const isolated = await isolatedLaunch();
const app = await electron.launch({ executablePath: build.executable,
  args: isolated.args.filter(arg => arg !== '.'), timeout: 30000 });
const page = await app.firstWindow();
try {
  await expect(page.getByRole('button', { name: '웹캠 연결', exact: true })).toBeEnabled({ timeout: 35000 });
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__streams = [];
    navigator.mediaDevices.getUserMedia = async constraints => { const stream = await original(constraints); window.__streams.push(stream); return stream; };
  });
  await page.getByRole('button', { name: '웹캠 연결', exact: true }).click();
  await expect(page.getByRole('button', { name: '웹캠 연결 해제', exact: true })).toBeVisible({ timeout: 15000 });
  const labels = await page.evaluate(() => window.__streams.flatMap(stream => stream.getTracks().map(track => ({ label: track.label, kind: track.kind, readyState: track.readyState }))));
  assert.equal(labels.length, 1); assert.equal(labels[0].kind, 'video');
  assert.match(labels[0].label, /fake|dummy/i);
  report.checks.push({ name: 'Real getUserMedia through app:// Electron permission handlers', labels });
  const audioDenied = await page.evaluate(async () => {
    try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); stream.getTracks().forEach(track => track.stop()); return false; }
    catch (error) { return error.name === 'NotAllowedError'; }
  });
  assert.equal(audioDenied, true); report.checks.push({ name: 'Microphone permission denied' });
  await page.getByRole('button', { name: '웹캠 연결 해제', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))), true);
  report.checks.push({ name: 'Camera disconnect stops actual Chromium capture track' });
  console.log(JSON.stringify(report, null, 2));
} catch (error) { report.failure = error.stack; console.error(error, await page.locator('body').innerText()); process.exitCode = 1; }
finally { report.status = report.failure ? 'failed' : 'passed'; await writeFile('qa/camera-permission-report.json', JSON.stringify(report, null, 2)); await app.close(); }
