import { it, expect } from 'vitest';
import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function markdown(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdown(file));
    else if (entry.name.endsWith('.md')) files.push(file);
  }
  return files;
}
it('AGENTS 입구는 100줄 이내이며 모든 하네스 문서에 링크로 도달할 수 있다', async () => {
  const entry = path.join(root, 'AGENTS.md');
  expect((await readFile(entry, 'utf8')).trimEnd().split('\n').length).toBeLessThanOrEqual(100);
  const required = await markdown(path.join(root, 'docs/harness'));
  const visited = new Set(), queue = [entry, path.join(root, 'README.md')];
  while (queue.length) {
    const file = queue.shift(); if (visited.has(file)) continue; visited.add(file);
    const text = (await readFile(file, 'utf8')).replace(/```[^\n]*\n[\s\S]*?```/g, '');
    for (const match of text.matchAll(/\[[^\]\n]+\]\(([^)\n]+)\)/g)) {
      const target = match[1]; if (/^(?:https?:|#)/.test(target)) continue;
      const resolved = path.resolve(path.dirname(file), decodeURIComponent(target.split('#')[0]));
      // Generated reports/packages are checked after building, not required on
      // a fresh source checkout before the first npm test.
      if (['out', 'outputs', 'qa'].includes(path.relative(root, resolved).split(path.sep)[0])) continue;
      await expect(access(resolved), `${path.relative(root, file)} → ${target}`).resolves.toBeUndefined();
      if (resolved.endsWith('.md')) queue.push(resolved);
    }
  }
  expect(required.filter(file => !visited.has(file))).toEqual([]);
});
