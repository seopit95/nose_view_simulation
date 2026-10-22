// One-time developer utility: renders our own SVG (not the generated portrait).
// The deliverable already includes PNG, ICO and ICNS; no extra runtime dependency is required.
import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)('/Users/kds_mac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
import { readFile, writeFile } from 'node:fs/promises';
const svg = await readFile('public/assets/app-icon.svg');
const png = await sharp(svg).resize(1024, 1024).png().toBuffer();
await writeFile('public/assets/app-icon.png', png);
const header = Buffer.alloc(16); header.write('icns', 0); header.writeUInt32BE(png.length + 16, 4);
header.write('ic10', 8); header.writeUInt32BE(png.length + 8, 12);
await writeFile('public/assets/app-icon.icns', Buffer.concat([header, png]));
const small = await sharp(svg).resize(256, 256).png().toBuffer();
const ico = Buffer.alloc(22); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(small.length, 14); ico.writeUInt32LE(22, 18);
await writeFile('public/assets/app-icon.ico', Buffer.concat([ico, small]));
