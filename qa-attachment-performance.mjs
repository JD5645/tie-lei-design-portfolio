import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'],
  ['.webp', 'image/webp'], ['.mp4', 'video/mp4'], ['.pdf', 'application/pdf'],
]);
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
    const file = join(root, pathname || 'index.html');
    if (relative(root, file).startsWith('..')) throw new Error('outside root');
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': mimeTypes.get(extname(file).toLowerCase()) || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const serverAddress = server.address();
const localSiteUrl = `http://127.0.0.1:${serverAddress.port}/index.html`;
const siteUrl = process.env.PORTFOLIO_QA_URL || localSiteUrl;
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
  const networkRequests = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Network.requestWillBeSent') networkRequests.push(message.params.request.url);
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
  await send('Page.navigate', { url: siteUrl });
  let pageReady = false;
  for (let attempt = 0; attempt < 160; attempt++) {
    pageReady = await evaluate(`document.readyState === 'complete' && typeof openAttachments === 'function'`);
    if (pageReady) break;
    await sleep(50);
  }
  assert.equal(pageReady, true, 'portfolio scripts should finish loading before attachment QA begins');

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
  await evaluate(`(()=>{
    const anchor=document.querySelector('a[href*="assets/sheets/"]');
    const details=anchor.closest('details');
    if(details) details.open=true;
    document.documentElement.style.scrollBehavior='auto';
    anchor.scrollIntoView({block:'center'});
  })()`);
  await sleep(500);
  const sheetUrlRequestsBeforeClick = networkRequests.filter(url => url.includes('/assets/sheets/f13e24ee82f8f7fb.html'));
  const allSheetRequestsBeforeClick = networkRequests.filter(url => /\/assets\/sheets\/[^/]+\.html(?:\?|$)/.test(url));
  assert.equal(
    sheetUrlRequestsBeforeClick.length,
    1,
    'a spreadsheet near the viewport should be prefetched before click',
  );
  assert.ok(
    allSheetRequestsBeforeClick.length <= 2,
    'near-viewport prefetch should not start a burst of spreadsheet requests',
  );
  const sheetZoomRange = await evaluate(`(async()=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const anchor=document.querySelector('a[href*="assets/sheets/"]');
    anchor.click();
    const frame=document.getElementById('dialog-sheet');
    for(let attempt=0;attempt<120&&!frame.contentDocument?.querySelector('.sheet-nav');attempt++) await wait(25);
    for(let attempt=0;attempt<160&&frame.contentDocument?.documentElement.dataset.sheetViewerReady!=='true';attempt++) await wait(25);
    const scale=document.getElementById('dialog-scale');
    const zoomOut=document.getElementById('dialog-zoom-out');
    const zoomIn=document.getElementById('dialog-zoom-in');
    const fit=document.getElementById('dialog-fit');
    const titleBeforeNavigation=frame.contentDocument.title;
    const locationBeforeNavigation=frame.contentWindow.location.href;
    const runtimeReady=frame.contentDocument.documentElement.dataset.sheetViewerReady==='true';
    const fallbackFragmentUrl=new URL('#sheet-2',frame.contentDocument.baseURI).href;
    frame.contentDocument.documentElement.style.scrollBehavior='auto';
    const navigationTarget=frame.contentDocument.querySelector('#sheet-2');
    const navigatedTargetTopBefore=navigationTarget.getBoundingClientRect().top;
    const navigationScrollBefore=frame.contentWindow.scrollY;
    frame.contentDocument.querySelector('.sheet-nav a[href="#sheet-2"]').click();
    await wait(150);
    const titleAfterNavigation=frame.contentDocument?.title || '';
    const locationAfterNavigation=frame.contentWindow.location.href;
    const navigatedHeading=frame.contentDocument?.querySelector('#sheet-2 h2')?.textContent || '';
    const navigatedTargetTop=frame.contentDocument?.querySelector('#sheet-2')?.getBoundingClientRect().top ?? null;
    const navigationScrollAfter=frame.contentWindow.scrollY;
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
    return {
      defaultScale,minimum,maximum,restored:scale.textContent,
      srcdocLength:frame.srcdoc.length,
      baseHref:frame.contentDocument?.querySelector('base')?.href || '',
      titleBeforeNavigation,titleAfterNavigation,
      locationBeforeNavigation,locationAfterNavigation,
      runtimeReady,fallbackFragmentUrl,
      navigatedHeading,navigatedTargetTopBefore,navigatedTargetTop,
      navigationScrollBefore,navigationScrollAfter,
    };
  })()`);
  assert.ok(sheetZoomRange.srcdocLength > 1000, 'spreadsheet preview should render from cached srcdoc');
  const sheetRuntimeRequests = networkRequests.filter(url => url.includes('/assets/sheet-viewer.js'));
  assert.ok(
    sheetRuntimeRequests.some(url => new URL(url).searchParams.has('v')),
    'embedded spreadsheet previews should request a versioned runtime instead of an immutable stale copy',
  );
  assert.match(
    sheetZoomRange.fallbackFragmentUrl,
    /\/assets\/sheets\/[^/#?]+\.html(?:\?[^#]*)?#sheet-2$/,
    'an early worksheet click should fall back to the same styled sheet document',
  );
  assert.equal(sheetZoomRange.runtimeReady, true, 'spreadsheet navigation should wait for the embedded runtime to be ready');
  assert.equal(
    sheetZoomRange.titleAfterNavigation,
    sheetZoomRange.titleBeforeNavigation,
    'clicking a worksheet tab should keep the styled sheet document loaded',
  );
  assert.equal(
    sheetZoomRange.locationAfterNavigation,
    sheetZoomRange.locationBeforeNavigation,
    'worksheet fragment navigation should stay inside the cached srcdoc',
  );
  assert.equal(sheetZoomRange.navigatedHeading, '01_白膜结构稿', 'worksheet navigation should retain the selected sheet content');
  assert.ok(
    sheetZoomRange.navigationScrollAfter > sheetZoomRange.navigationScrollBefore
      && sheetZoomRange.navigatedTargetTop < sheetZoomRange.navigatedTargetTopBefore,
    'worksheet navigation should scroll toward the selected sheet',
  );
  assert.match(sheetZoomRange.baseHref, /\/assets\/sheets\/[^/#?]+\.html(?:\?.*)?$/, 'spreadsheet srcdoc should use its own document URL as the navigation base');
  const sheetUrlRequestsAfterClick = networkRequests.filter(url => url.includes('/assets/sheets/f13e24ee82f8f7fb.html'));
  assert.equal(sheetUrlRequestsAfterClick.length, 1, 'clicking a prefetched spreadsheet should not request its HTML twice');
  assert.equal(sheetZoomRange.minimum, '10%', 'sheet attachments should stop shrinking at 10%');
  assert.equal(sheetZoomRange.maximum, '200%', 'sheet attachments should stop enlarging at 200%');
  assert.equal(sheetZoomRange.restored, sheetZoomRange.defaultScale, 'sheet Fit should restore its initial scale');

  await evaluate(`document.getElementById('image-dialog').close()`);
  await sleep(80);
  const pdfState = await evaluate(`(async()=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const anchor=document.querySelector('a[data-source="01-品牌设计/04-购物指南/购物指南.pdf"]');
    anchor.click();
    const viewport=document.getElementById('dialog-pdf');
    await wait(100);
    if(!viewport) return {exists:false};
    const pages=[...viewport.querySelectorAll('.dialog-pdf-page')];
    for(let attempt=0;attempt<160&&pages[0]?.dataset.state!=='loaded';attempt++) await wait(50);
    const initialSources=pages.filter(page=>page.querySelector('img')?.getAttribute('src')).length;
    const immediateVisible=!viewport.hidden && pages[0]?.querySelector('img')?.getAttribute('src');
    const scale=document.getElementById('dialog-scale');
    const zoomOut=document.getElementById('dialog-zoom-out');
    const zoomIn=document.getElementById('dialog-zoom-in');
    const fit=document.getElementById('dialog-fit');
    fit.click();
    await wait(30);
    const defaultScale=scale.textContent;
    for(let index=0;index<24;index++) zoomOut.click();
    const minimum=scale.textContent;
    for(let index=0;index<36;index++) zoomIn.click();
    const maximum=scale.textContent;
    fit.click();
    await wait(30);
    for(const page of pages){ viewport.scrollTop=page.offsetTop; viewport.dispatchEvent(new Event('scroll')); await wait(70); }
    viewport.scrollTop=pages[1]?.offsetTop || 0;
    viewport.dispatchEvent(new Event('scroll'));
    await wait(100);
    return {
      exists:true,
      pageCount:pages.length,
      initialSources,
      immediateVisible:Boolean(immediateVisible),
      position:document.getElementById('dialog-position').textContent,
      defaultScale,minimum,maximum,restored:scale.textContent,
      scrollable:viewport.scrollHeight>viewport.clientHeight,
    };
  })()`);
  assert.equal(pdfState.exists, true, 'PDF should open in the continuous document viewport');
  assert.equal(pdfState.pageCount, 4, 'the shopping guide PDF should represent all four pages');
  assert.equal(pdfState.immediateVisible, true, 'the PDF cover should be visible immediately');
  assert.ok(pdfState.initialSources < pdfState.pageCount, 'later PDF pages should not all load immediately');
  assert.equal(pdfState.scrollable, true, 'the PDF viewport should scroll vertically without changing dialog size');
  assert.equal(pdfState.position, '第 2 / 4 页', 'PDF status should track the visible page while scrolling');
  assert.equal(pdfState.minimum, '10%', 'PDF should stop shrinking at 10%');
  assert.equal(pdfState.maximum, '200%', 'PDF should stop enlarging at 200%');
  assert.equal(pdfState.restored, pdfState.defaultScale, 'PDF Fit should restore its initial suitable scale');
} finally {
  try { ws?.close(); } catch {}
  browser.kill();
  browser.unref();
  await sleep(300);
  try { await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 }); } catch {}
  await new Promise(resolve => server.close(resolve));
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
