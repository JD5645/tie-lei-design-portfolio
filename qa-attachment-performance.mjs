import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = await mkdtemp(join(tmpdir(), 'portfolio-attachment-perf-'));
const browser = spawn(edge, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore', windowsHide: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  let port;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
      break;
    } catch {
      await sleep(100);
    }
  }
  if (!port) throw new Error('Edge did not start remote debugging');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find(item => item.type === 'page');
  if (!target) throw new Error('No browser page target');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const handlers = pending.get(message.id);
    pending.delete(message.id);
    message.error ? handlers.reject(new Error(message.error.message)) : handlers.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['*SFD004-*'] });
  await send('Page.navigate', { url: pathToFileURL(join(root, 'index.html')).href });
  await sleep(1000);

  const immediateImage = await evaluate(`(async()=>{
    const button=document.querySelector('.hero-open.asset-image');
    const thumbnail=button.querySelector('img').currentSrc || button.querySelector('img').src;
    button.click();
    await new Promise(resolve=>setTimeout(resolve,80));
    const image=document.getElementById('dialog-image');
    return {open:document.getElementById('image-dialog').open,thumbnail,src:image.src,hidden:image.hidden};
  })()`);
  assert.equal(immediateImage.open, true, 'clicking an attachment should open the viewer');
  assert.equal(immediateImage.hidden, false, 'the progressive preview should be visible immediately');
  assert.equal(
    immediateImage.src,
    immediateImage.thumbnail,
    'the viewer should keep the already-loaded thumbnail visible while the large preview is unavailable',
  );

  await evaluate(`document.getElementById('image-dialog').close()`);
  await sleep(80);
  await send('Network.setBlockedURLs', { urls: [] });
  const zoomRange = await evaluate(`(async()=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const reel=document.querySelector('[data-motion-reel]');
    reel.click();
    for(let attempt=0;attempt<120&&document.getElementById('dialog-stage').dataset.loading;attempt++) await wait(25);
    const scale=document.getElementById('dialog-scale');
    const zoomOut=document.getElementById('dialog-zoom-out');
    const zoomIn=document.getElementById('dialog-zoom-in');
    const fit=document.getElementById('dialog-fit');
    fit.click();
    const defaultScale=scale.textContent;
    for(let index=0;index<24;index++) zoomOut.click();
    const minimum=scale.textContent;
    for(let index=0;index<36;index++) zoomIn.click();
    const maximum=scale.textContent;
    fit.click();
    return {defaultScale,minimum,maximum,restored:scale.textContent};
  })()`);
  assert.equal(zoomRange.minimum, '10%', 'all attachments should stop shrinking at 10%');
  assert.equal(zoomRange.maximum, '200%', 'all attachments should stop enlarging at 200%');
  assert.equal(zoomRange.restored, zoomRange.defaultScale, 'Fit should restore the initial suitable scale');

  await evaluate(`document.getElementById('image-dialog').close()`);
  await sleep(80);
  const videoState = await evaluate(`(async()=>{
    const anchor=[...document.querySelectorAll('a[href]')].find(item=>new URL(item.href).pathname.endsWith('.mp4'));
    anchor.click();
    await new Promise(resolve=>setTimeout(resolve,80));
    return {
      src:document.getElementById('dialog-video').src,
      original:document.getElementById('dialog-original').href,
    };
  })()`);
  assert.match(videoState.src, /\/assets\/viewer\/.+\.preview\.mp4$/, 'video viewer should use the lightweight fast-start copy');
  assert.doesNotMatch(videoState.original, /\/assets\/viewer\//, 'Open original should still link to the source video');

  await evaluate(`document.getElementById('image-dialog').close()`);
  await sleep(80);
  const sheetZoomRange = await evaluate(`(async()=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const anchor=document.querySelector('a[href*="assets/sheets/"]');
    anchor.click();
    const frame=document.getElementById('dialog-sheet');
    for(let attempt=0;attempt<120&&!frame.contentDocument?.body;attempt++) await wait(25);
    const scale=document.getElementById('dialog-scale');
    const zoomOut=document.getElementById('dialog-zoom-out');
    const zoomIn=document.getElementById('dialog-zoom-in');
    const fit=document.getElementById('dialog-fit');
    fit.click();
    await wait(50);
    const defaultScale=scale.textContent;
    for(let index=0;index<24;index++){zoomOut.click();await wait(5)}
    await wait(80);
    const minimum=scale.textContent;
    for(let index=0;index<36;index++){zoomIn.click();await wait(5)}
    await wait(80);
    const maximum=scale.textContent;
    fit.click();
    await wait(50);
    return {defaultScale,minimum,maximum,restored:scale.textContent};
  })()`);
  assert.equal(sheetZoomRange.minimum, '10%', 'sheet attachments should stop shrinking at 10%');
  assert.equal(sheetZoomRange.maximum, '200%', 'sheet attachments should stop enlarging at 200%');
  assert.equal(sheetZoomRange.restored, sheetZoomRange.defaultScale, 'sheet Fit should restore its initial scale');
} finally {
  try { ws?.close(); } catch {}
  browser.kill();
  browser.unref();
  await sleep(300);
  try { await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 }); } catch {}
}

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const sourceDirectories = ['01-品牌设计', '02-AIGC', '03-主图、A+设计', '04-建模、渲染', '05-其他设计'];
const sourceImages = [];
const sourceVideos = [];

async function collect(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (imageExtensions.has(extname(entry.name).toLowerCase())) sourceImages.push(path);
    else if (extname(entry.name).toLowerCase() === '.mp4') sourceVideos.push(path);
  }
}
for (const directory of sourceDirectories) await collect(join(root, directory));

for (const source of sourceImages) {
  const rel = relative(root, source);
  const preview = join(root, 'assets', 'viewer', `${rel}.webp`);
  const [sourceInfo, previewInfo] = await Promise.all([stat(source), stat(preview)]);
  if (sourceInfo.size > 256 * 1024) {
    assert.ok(previewInfo.size < sourceInfo.size, `preview should be smaller than source: ${rel}`);
  }
}
for (const source of sourceVideos) {
  const rel = relative(root, source);
  const preview = join(root, 'assets', 'viewer', `${rel}.preview.mp4`);
  const [sourceInfo, previewInfo] = await Promise.all([stat(source), stat(preview)]);
  assert.ok(previewInfo.size < sourceInfo.size * 0.55, `video preview should be at least 45% smaller: ${rel}`);
}

console.log(`Attachment performance QA passed: ${sourceImages.length} image previews, ${sourceVideos.length} video previews.`);
