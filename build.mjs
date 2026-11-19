import { cp, copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, 'dist');
const directories = [
  'assets',
  '01-品牌设计',
  '02-AIGC',
  '03-主图、A+设计',
  '04-建模、渲染',
  '05-其他设计',
];
const files = ['index.html', 'style.css', 'app.js', 'viewer.js', '_headers'];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const directory of directories) {
  await cp(join(root, directory), join(output, directory), { recursive: true });
}
for (const file of files) {
  await copyFile(join(root, file), join(output, file));
}

console.log(`Built ${output}`);
