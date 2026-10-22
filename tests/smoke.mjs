import { _electron as electron } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { isolatedLaunch } from './electron-launch.mjs';
import { installSyntheticCamera, connectSyntheticCamera } from './synthetic-camera.mjs';
const app = await electron.launch({ ...await isolatedLaunch(), timeout: 30000 });
const page = await app.firstWindow();
await installSyntheticCamera(page);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') console.log(msg.type(), msg.text()); });
try {
  await connectSyntheticCamera(page);
  console.log('FACE_READY', await page.locator('body').innerText());
} catch (error) {
  console.log('SMOKE_FAILED', error.message, await page.locator('body').innerText());
  process.exitCode = 1;
}
await page.screenshot({ path: 'qa/smoke.png', fullPage: true });
await writeFile('qa/smoke-errors.json', JSON.stringify(errors, null, 2));
console.log('PAGE_ERRORS', errors);
await app.close();
