import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { sourceFingerprint, readCurrentBuild } from '../scripts/build-info.mjs';

async function fixture() {
  const fixtures = path.resolve('qa/review-2026-09-10/build-fixtures');
  await mkdir(fixtures, { recursive: true });
  const root = await mkdtemp(path.join(fixtures, 'project-'));
  for (const dir of ['src', 'desktop', 'scripts', 'public/assets', 'licenses', 'out/build']) await mkdir(path.join(root, dir), { recursive: true });
  for (const file of ['package.json', 'package-lock.json', 'index.html', 'vite.config.ts', 'vite.worker.config.ts', 'tsconfig.json', 'THIRD_PARTY_NOTICES.md', 'src/app.ts']) await writeFile(path.join(root, file), 'original');
  const executable = path.join(root, 'out/build/NoseView.app/Contents/MacOS/NoseView'), archive = path.join(root, 'out/build/NoseView.app/Contents/Resources/app.asar');
  await mkdir(path.dirname(executable), { recursive: true }); await mkdir(path.dirname(archive), { recursive: true });
  await writeFile(executable, 'executable'); await writeFile(archive, 'original archive');
  const build = { platform: 'darwin', executable, archive, sourceSha256: await sourceFingerprint(root),
    archiveSha256: createHash('sha256').update(await readFile(archive)).digest('hex') };
  const save = async () => writeFile(path.join(root, 'out/latest-build.json'), JSON.stringify(build));
  await save(); return { root, build, save };
}

it('현재 프로젝트의 소스와 archive가 일치하는 앱만 검증 대상으로 반환한다', async () => {
  const f = await fixture(); expect((await readCurrentBuild(f.root)).executable).toBe(f.build.executable);
});
it('복사 전 다른 프로젝트를 가리키는 실행 파일을 거부한다', async () => {
  const f = await fixture(), other = await fixture(); f.build.executable = other.build.executable; await f.save();
  await expect(readCurrentBuild(f.root)).rejects.toThrow(/outside/i);
});
it('소스를 고친 뒤 다시 빌드하지 않은 패키지를 거부한다', async () => {
  const f = await fixture(); await writeFile(path.join(f.root, 'src/app.ts'), 'changed');
  await expect(readCurrentBuild(f.root)).rejects.toThrow(/source.*changed/i);
});
it('패키지 archive가 바뀌면 원래 검증 대상으로 인정하지 않는다', async () => {
  const f = await fixture(); await writeFile(f.build.archive, 'tampered');
  await expect(readCurrentBuild(f.root)).rejects.toThrow(/archive.*changed/i);
});
it('해시가 없는 과거 metadata는 재빌드를 요구한다', async () => {
  const f = await fixture(); delete f.build.sourceSha256; await f.save();
  await expect(readCurrentBuild(f.root)).rejects.toThrow(/rebuild/i);
});
it('같은 out 내부여도 실행 파일과 archive가 서로 다른 앱이면 거부한다', async () => {
  const f = await fixture();
  f.build.executable = path.join(f.root, 'out/old/NoseView.app/Contents/MacOS/NoseView');
  await mkdir(path.dirname(f.build.executable), { recursive: true }); await writeFile(f.build.executable, 'old executable'); await f.save();
  await expect(readCurrentBuild(f.root)).rejects.toThrow(/same package/i);
});
it('패키지에 포함되는 고지를 바꿔도 다시 빌드해야 한다', async () => {
  const f = await fixture(); await writeFile(path.join(f.root, 'THIRD_PARTY_NOTICES.md'), 'updated notices');
  await expect(readCurrentBuild(f.root)).rejects.toThrow(/source.*changed/i);
});
