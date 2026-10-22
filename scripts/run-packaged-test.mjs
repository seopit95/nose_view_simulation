import { spawn } from 'node:child_process';
import { readCurrentBuild, projectRoot } from './build-info.mjs';

const build = await readCurrentBuild();
console.log('Verified package', { executable: build.executable, sourceSha256: build.sourceSha256, archiveSha256: build.archiveSha256 });
for (const script of ['tests/no-demo.mjs', 'tests/camera-startup.mjs', 'tests/profile-filter.mjs', 'tests/region-controls.mjs', 'tests/e2e.mjs', 'tests/lifecycle.mjs', 'tests/beauty.mjs', 'tests/preferences.mjs', 'tests/nose-presets.mjs', 'tests/live-filter.mjs', 'tests/consultation-ux.mjs', 'tests/ui-layout.mjs', 'tests/camera-permission.mjs']) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd: projectRoot, stdio: 'inherit',
      env: { ...process.env, NOSEVIEW_EXECUTABLE: build.executable, NOSEVIEW_SOURCE_SHA256: build.sourceSha256 }, shell: false });
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${script} failed (${code})`)));
    child.once('error', reject);
  });
}
