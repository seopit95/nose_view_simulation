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
const errors = []; page.on('pageerror', error => errors.push(error.message));
const button = name => page.getByRole('button', { name, exact: true });
const slider = name => page.getByRole('slider', { name, exact: true });
const tab = name => page.getByRole('tab', { name, exact: true });
const capture = name => page.screenshot({ path: `qa/ui-${name}.png`, fullPage: true, animations: 'disabled' });
const check = name => { report.checks.push({ name }); console.log('PASS', name); };
async function imageFits() {
  const geometry = await page.locator('[data-testid=simulation-canvas]').evaluate(canvas => {
    const rect = canvas.getBoundingClientRect(); return { ratio: rect.width / rect.height, source: canvas.width / canvas.height,
      width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  assert.ok(Math.abs(geometry.ratio - geometry.source) < .005, JSON.stringify(geometry));
  assert.ok(geometry.width > 200 && geometry.height > 200, JSON.stringify(geometry));
  assert.ok(geometry.right <= geometry.viewportWidth && geometry.bottom <= geometry.viewportHeight, JSON.stringify(geometry));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}
await writeFile('qa/ui-layout-report.json', JSON.stringify(report, null, 2));
try {
  await connectSyntheticCamera(page);
  await imageFits();
  for (const name of ['웹캠 연결 해제', '기본 설정', '새 상담', '비교 이미지 저장']) await expect(button(name)).toBeInViewport({ ratio: 1 });
  await capture('consultation');
  await button('선택한 타입 적용').click(); await expect(slider('콧볼 폭')).toHaveValue('-18');
  await expect(button('선택한 타입 적용')).toHaveAttribute('aria-pressed', 'true');
  await capture('preset');
  await tab('실시간 필터').click(); await imageFits(); await capture('filter');
  await button('보정 변경').click(); await expect(tab('상담 시뮬레이션')).toBeFocused();
  check('Default consultation and filter layouts preserve aspect ratio, visible primary actions and selected preset behavior');

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 810));
  await expect(button('비교 이미지 저장')).toBeInViewport({ ratio: 1 });
  await imageFits(); await capture('minimum');
  await expandControls(page);
  for (const name of ['피부 보정 강도', '하이라이트', '콧볼 폭', '콧대 폭', '옆모습 콧대', '코끝 상하', '코끝 크기', '콧날개 상하', '콧구멍 윗선', '비주 상하']) {
    await slider(name).focus(); await page.keyboard.press('ArrowRight');
    await expect(slider(name)).toBeInViewport({ ratio: 1 }); await expect(slider(name)).toBeFocused();
  }
  await button('A안 저장').scrollIntoViewIfNeeded(); await button('A안 저장').click();
  await expect(button('A안 불러오기')).toBeVisible();
  await button('A안 불러오기').focus(); await page.keyboard.press('Shift'); await capture('slot-focus');
  await button('선택한 타입 적용').scrollIntoViewIfNeeded(); await button('선택한 타입 적용').click();
  await button('선택한 타입 적용').hover();
  const contrast = await button('선택한 타입 적용').evaluate(async el => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(el.getAnimations().map(animation => animation.finished));
    const luminance = color => {
      const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
      return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
    };
    const style = getComputedStyle(el), text = luminance(style.color), background = luminance(style.backgroundColor);
    return (Math.max(text, background) + .05) / (Math.min(text, background) + .05);
  });
  assert.ok(contrast >= 4.5, `Selected hovered preset text must stay readable: contrast ${contrast}`);
  await expect(button('비교 이미지 저장')).toBeInViewport({ ratio: 1 });
  check('Minimum window keeps preview and export visible while keyboard scrolling reaches every control and comparison slots');

  await button('기본 설정').click();
  await slider('프리셋 비주 상하').focus(); await page.keyboard.press('ArrowRight');
  await expect(slider('프리셋 비주 상하')).toBeInViewport({ ratio: 1 });
  const input = await slider('프리셋 비주 상하').boundingBox();
  const actions = await button('기본 설정 저장').boundingBox(); assert.ok(input.y + input.height < actions.y);
  await expect(button('기본 설정 저장')).toBeInViewport({ ratio: 1 });
  await capture('settings'); await page.keyboard.press('Escape');
  await expect(button('기본 설정')).toBeFocused();
  await button('비교 이미지 저장').click();
  await expect(button('PNG 저장')).toBeInViewport({ ratio: 1 }); await expect(button('PNG 저장')).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: '촬영 대상자의 이미지 저장 동의를 확인했습니다.' })).toBeInViewport({ ratio: 1 });
  await capture('export'); await button('저장 창 닫기').click();
  await button('새 상담').click(); await expect(button('새 상담 시작')).toBeInViewport({ ratio: 1 });
  await capture('reset'); await button('계속 상담하기').click();
  check('Settings focus, export consent/actions and reset dialog remain accessible in the minimum window');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await button('기본 설정').click();
  const motion = await page.getByRole('dialog', { name: '기본 설정' }).evaluate(el => ({ animation: getComputedStyle(el).animationName,
    transition: getComputedStyle(el.querySelector('button')).transitionDuration }));
  assert.equal(motion.animation, 'none'); assert.equal(motion.transition, '0s');
  await button('설정 닫기').click();
  await button('새 상담').click(); await button('새 상담 시작').click();
  await expect(button('비교 이미지 저장')).toBeDisabled();
  await expect(page.getByRole('heading', { name: '얼굴이 보이면 시작할 수 있어요' })).toBeVisible();
  await capture('empty');
  assert.deepEqual(errors, []); check('Reduced-motion preference is honored and the disconnected state is clear without page errors');
} catch (error) {
  report.failure = error.stack ?? String(error); process.exitCode = 1; console.error(error);
  await capture('layout-failure').catch(() => {});
} finally {
  report.status = report.failure ? 'failed' : 'passed'; await writeFile('qa/ui-layout-report.json', JSON.stringify(report, null, 2)); await app.close();
}
