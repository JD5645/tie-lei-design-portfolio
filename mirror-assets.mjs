import { readFile, mkdir, stat, writeFile, rename, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const root = dirname(fileURLToPath(import.meta.url));
const origin = 'https://tie-lei-portfolio-2026.pages.dev/';
const html = await readFile(join(root, 'index.html'), 'utf8');
const css = await readFile(join(root, 'style.css'), 'utf8');
const references = new Map();

function addReference(raw, base = origin) {
  if (!raw || raw.startsWith('#') || raw.startsWith('mailto:')) return;
  const url = new URL(raw, base);
  if (url.origin !== new URL(origin).origin || url.pathname === '/') return;
  const decoded = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const destination = resolve(root, decoded);
  if (!destination.startsWith(root + sep)) throw new Error(`Unsafe path: ${decoded}`);
  if (['index.html', 'style.css', 'app.js'].includes(decoded)) return;
  references.set(decoded, { source: url.href, destination });
}

for (const match of html.matchAll(/\b(?:src|href|poster|data-full)\s*=\s*"([^"]+)"/g)) {
  addReference(match[1].replaceAll('&amp;', '&'));
}
for (const match of html.matchAll(/data-dialog-gallery="([^"]+)"/g)) {
  const json = match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&');
  for (const item of JSON.parse(json)) addReference(item.url);
}
for (const match of css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)) addReference(match[1]);

// Spreadsheet preview pages link to their editable source files, which the
// portfolio index does not reference directly.
for (const [path, info] of [...references]) {
  if (!path.startsWith('assets/sheets/') || !path.endsWith('.html')) continue;
  let preview;
  try { preview = await readFile(info.destination, 'utf8'); }
  catch { continue; }
  for (const match of preview.matchAll(/\b(?:src|href|poster)\s*=\s*"([^"]+)"/g)) {
    addReference(match[1].replaceAll('&amp;', '&'), info.source);
  }
}

const entries = [...references.entries()].map(([path, info]) => ({ path, ...info }));
await writeFile(join(root, 'asset-manifest.json'), JSON.stringify(entries.map(({ path, source }) => ({ path, source })), null, 2));
const types = Object.groupBy(entries, ({ path }) => path.split('.').at(-1).toLowerCase());
console.log(`Found ${entries.length} unique local assets: ${Object.entries(types).map(([ext, items]) => `${ext} ${items.length}`).join(', ')}`);
if (process.argv.includes('--list')) process.exit(0);

let done = 0;
let skipped = 0;
const failures = [];
const queue = [...entries];

async function download(entry) {
  try {
    if ((await stat(entry.destination)).size > 0) { skipped++; return; }
  } catch { /* file is missing */ }
  await mkdir(dirname(entry.destination), { recursive: true });
  for (let attempt = 1; attempt <= 3; attempt++) {
    const temp = `${entry.destination}.part`;
    try {
      const response = await fetch(entry.source, { signal: AbortSignal.timeout(180_000) });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(temp));
      await rename(temp, entry.destination);
      return;
    } catch (error) {
      await rm(temp, { force: true });
      if (attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
}

async function worker() {
  while (queue.length) {
    const entry = queue.shift();
    try { await download(entry); }
    catch (error) { failures.push({ path: entry.path, error: String(error) }); }
    done++;
    if (done % 20 === 0 || done === entries.length) console.log(`Processed ${done}/${entries.length}; failures ${failures.length}`);
  }
}

await Promise.all(Array.from({ length: 6 }, worker));
for (const entry of entries) {
  if (!entry.path.startsWith('assets/sheets/') || !entry.path.endsWith('.html')) continue;
  const preview = await readFile(entry.destination, 'utf8');
  const local = preview.replace(/href="(?:\.\.\/){4}([^"]+\.xlsx(?:\?[^"]*)?)"/g, 'href="../../$1"');
  if (local !== preview) await writeFile(entry.destination, local, 'utf8');
}
await writeFile(join(root, 'download-failures.json'), JSON.stringify(failures, null, 2));
console.log(`Complete. Downloaded ${done - skipped - failures.length}; already present ${skipped}; failures ${failures.length}.`);
if (failures.length) process.exitCode = 1;
