import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const file = join(root, 'index.html');
let html = await readFile(file, 'utf8');

function replaceOnce(before, after, label) {
  const first = html.indexOf(before);
  if (first < 0 || html.indexOf(before, first + before.length) >= 0) throw new Error(`Expected one ${label}`);
  html = html.replace(before, after);
}

const header = html.match(/<header class="site-header" id="top">[\s\S]*?<\/header>/)?.[0];
if (!header) throw new Error('Header not found');
replaceOnce(header, `<header class="site-header" id="top"><a class="brand-name" href="#top">帖磊 <span>/</span> TIE LEI</a><span class="site-label">VISUAL DESIGN PORTFOLIO · 2026</span><nav aria-label="主导航"><a href="#selected">精选</a><a href="#archive">全部作品</a><div class="mobile-nav-extra" id="mobile-nav-extra"><a href="#about">关于</a><a href="#contact">联系</a></div></nav><button class="mobile-menu-toggle" id="mobile-menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-nav-extra">菜单</button></header>`, 'header');

replaceOnce('三张完整网页长图，以交替方向的连续放映，展示 KADRIE 从首页到产品叙事的视觉系统。', '三张品牌网页以关键画面呈现视觉系统。点击封面查看完整长图；桌面端可手动播放预览。', 'brand description');
replaceOnce('<button id="reel-toggle" type="button" aria-pressed="false">暂停放映 Ⅱ</button>', '<button id="reel-toggle" type="button" aria-pressed="false">播放长图预览 ▶</button>', 'brand reel control');

let reelNumber = 0;
html = html.replace(/<a class="web-reel[^\"]*"[\s\S]*?<\/a>/g, anchor => {
  reelNumber++;
  if (!anchor.endsWith('</span></a>')) throw new Error(`Unexpected brand reel ${reelNumber}`);
  const number = String(reelNumber).padStart(2, '0');
  return anchor.replace(/<\/span><\/a>$/, `</span><span class="reel-static-caption"><strong>品牌网页 ${number}</strong><span>查看完整长图 ↗</span></span></a>`);
});
if (reelNumber !== 3) throw new Error(`Expected three brand reels, found ${reelNumber}`);

replaceOnce('图片保持原比例，点击可查看原图。视频可播放，PDF 与表格可直接打开。', '图片可放大，视频与文件可打开。', 'archive help text');
replaceOnce('<div class="category-filter-row"><span>项目分类</span><div class="category-filters"', '<div class="category-filter-row"><span>项目分类</span><button type="button" class="archive-category-toggle" id="archive-category-toggle" aria-expanded="false" aria-controls="archive-category-options archive-type-options"><strong>筛选作品：全部</strong><span>展开 +</span></button><div class="category-filters" id="archive-category-options"', 'archive category filter');
replaceOnce('<div class="type-filters" role="group"', '<div class="type-filters" id="archive-type-options" role="group"', 'archive type filter');
replaceOnce('<div class="package-grid">', '<div class="package-section-label"><span>包装设计 · 印刷展开图</span><small>点击查看完整设计稿 ↗</small></div><div class="package-grid">', 'packaging presentation');

await writeFile(file, html, 'utf8');
console.log('Updated local HTML: mobile navigation, static brand covers, compact category filter and packaging context.');
