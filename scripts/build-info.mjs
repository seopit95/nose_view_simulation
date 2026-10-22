import { readFile, readdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const fileSha256 = async file => createHash('sha256').update(await readFile(file)).digest('hex');

export async function sourceFingerprint(root = projectRoot) {
  const files = ['package.json', 'package-lock.json', 'index.html', 'vite.config.ts', 'vite.worker.config.ts', 'tsconfig.json', 'THIRD_PARTY_NOTICES.md'];
  async function walk(directory) {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(relative); else files.push(relative);
    }
  }
  for (const directory of ['src', 'desktop', 'scripts', 'public/assets', 'licenses']) await walk(directory);
  const hash = createHash('sha256');
  for (const file of files.sort()) hash.update(file.replaceAll(path.sep, '/') + '\0').update(await readFile(path.join(root, file))).update('\0');
  return hash.digest('hex');
}

export async function readCurrentBuild(root = projectRoot) {
  const build = JSON.parse(await readFile(path.join(root, 'out/latest-build.json'), 'utf8'));
  if (!build.sourceSha256 || !build.archiveSha256 || !build.archive) throw new Error('Legacy build metadata: rebuild with npm run make.');
  const out = await realpath(path.join(root, 'out'));
  for (const file of [build.executable, build.archive]) {
    const relative = path.relative(out, await realpath(file));
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
      throw new Error('Build target is outside this project: rebuild with npm run make.');
    }
  }
  const executableDirectory = path.dirname(await realpath(build.executable));
  const expectedArchive = build.platform === 'darwin' ? path.resolve(executableDirectory, '../Resources/app.asar') : path.join(executableDirectory, 'resources/app.asar');
  if (await realpath(build.archive) !== expectedArchive) throw new Error('Executable and archive must belong to the same package. Rebuild with npm run make.');
  if (build.sourceSha256 !== await sourceFingerprint(root)) throw new Error('Source has changed: rebuild with npm run make.');
  if (build.archiveSha256 !== await fileSha256(build.archive)) throw new Error('Packaged archive has changed: rebuild with npm run make.');
  return build;
}
