import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';

const imageUrl = `data:image/png;base64,${(await readFile(new URL('./fixtures/synthetic-person.png', import.meta.url))).toString('base64')}`;

// Only the capture device is substituted. Product UI, VIDEO MediaPipe inference,
// current-frame gating, and the WebGL renderer all run unchanged.
export async function installSyntheticFixture(page) {
  const install = dataUrl => { window.__syntheticImageUrl = dataUrl; };
  await page.addInitScript(install, imageUrl);
  await page.evaluate(install, imageUrl);
}

// Real disclosure clicks for tests that exercise advanced controls. Tests of
// the default consultation explicitly leave these closed.
export async function expandControls(page) {
  for (const selector of ['.nose-details', '.beauty-details']) {
    const details = page.locator(selector);
    if (await details.isVisible() && !await details.evaluate(el => el.open)) await details.locator('summary').click();
  }
}

export async function installSyntheticCamera(page, { width = 1254, height = 1254, fps = 30 } = {}) {
  await installSyntheticFixture(page);
  const install = ({ width, height, fps }) => {
    window.__syntheticCamera = { streams: [], calls: [], canvas: null, timer: null };
    navigator.mediaDevices.getUserMedia = async constraints => {
      const state = window.__syntheticCamera; state.calls.push(constraints);
      const image = new Image(); image.src = window.__syntheticImageUrl; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      const draw = () => context.drawImage(image, 0, 0, width, height);
      draw(); if (state.timer) clearInterval(state.timer);
      state.canvas = canvas; state.timer = setInterval(draw, 1000 / fps);
      const stream = canvas.captureStream(fps); state.streams.push(stream); return stream;
    };
    navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'synthetic-camera', label: '검증용 합성 카메라', groupId: 'test' }];
  };
  await page.addInitScript(install, { width, height, fps });
  await page.evaluate(install, { width, height, fps });
}

export async function connectSyntheticCamera(page, { pause = true, mirror = false } = {}) {
  await expect(page.getByText('로컬 엔진 준비 완료', { exact: true })).toBeVisible({ timeout: 35000 });
  await page.getByRole('button', { name: '웹캠 연결', exact: true }).click();
  await expect(page.getByRole('button', { name: '웹캠 연결 해제', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: '거울 보기', exact: true }).setChecked(mirror);
  if (pause) await pauseOnTrackedFace(page);
  else await expect(page.locator('.tracking-status')).toHaveText('정면 얼굴 추적 중', { timeout: 35000 });
}

export async function pauseOnTrackedFace(page) {
  // Pause in the same event turn that observes a valid model result: static
  // pixel assertions must not race the next VIDEO tracking result (K-09).
  await expect.poll(() => page.evaluate(() => {
    if (!['정면 얼굴 추적 중', '실시간 필터 적용 중'].includes(document.querySelector('.tracking-status')?.textContent)) return false;
    const button = [...document.querySelectorAll('.preview-actions button')].find(button => button.textContent === '일시정지');
    if (!button || button.disabled) return false;
    button.click(); return true;
  }), { timeout: 35000 }).toBe(true);
  await expect(page.getByRole('button', { name: '다시 재생', exact: true })).toBeVisible();
}
