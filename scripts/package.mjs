import { packager } from '@electron/packager';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { sourceFingerprint, fileSha256 } from './build-info.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const sourceSha256 = await sourceFingerprint(root);
if (!['darwin', 'win32'].includes(process.platform)) throw new Error('Build the desktop package on macOS or Windows.');
const output = path.join(root, 'out', `build-${Date.now()}`);
await mkdir(output, { recursive: true });
const packages = await packager({
  dir: root, out: output, platform: process.platform, arch: process.arch,
  asar: true, prune: false, name: 'NoseView', executableName: 'NoseView', appBundleId: 'local.noseview.prototype',
  icon: path.join(root, 'public/assets/app-icon'), appCategoryType: 'public.app-category.healthcare-fitness',
  extendInfo: { NSCameraUsageDescription: 'NoseView는 코 윤곽을 실시간으로 비교하기 위해 사용자가 선택한 웹캠을 사용합니다. 영상은 자동 저장되지 않습니다.' },
  ignore: [/^\/(?!dist(?:\/|$)|desktop(?:\/|$)|package\.json$|THIRD_PARTY_NOTICES\.md$|licenses(?:\/|$)).*/],
});
const directory = packages[0];
const application = process.platform === 'darwin' ? path.join(directory, 'NoseView.app') : directory;
const executable = process.platform === 'darwin' ? path.join(application, 'Contents/MacOS/NoseView') : path.join(directory, 'NoseView.exe');
const archive = process.platform === 'darwin' ? path.join(application, 'Contents/Resources/app.asar') : path.join(directory, 'resources/app.asar');
const archiveSha256 = await fileSha256(archive);
const zip = path.join(output, `NoseView-${version}-${process.platform}-${process.arch}.zip`);
const run = (command, args, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: 'inherit', env, shell: false });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
});
if (!process.argv.includes('--no-zip')) {
  if (process.platform === 'darwin') await run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', application, zip]);
  else await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Compress-Archive -LiteralPath $env:NOSEVIEW_PACKAGE_INPUT -DestinationPath $env:NOSEVIEW_PACKAGE_OUTPUT -CompressionLevel Optimal'],
    { ...process.env, NOSEVIEW_PACKAGE_INPUT: directory, NOSEVIEW_PACKAGE_OUTPUT: zip });
}
if (sourceSha256 !== await sourceFingerprint(root)) throw new Error('Source changed during packaging. Rebuild before testing.');
await writeFile(path.join(root, 'out/latest-build.json'), JSON.stringify({ version, application, executable, archive, zip,
  sourceSha256, archiveSha256, builtAt: new Date().toISOString(), platform: process.platform, arch: process.arch }, null, 2));
console.log(JSON.stringify({ application, executable, zip }, null, 2));
