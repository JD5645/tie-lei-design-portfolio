const attachmentDialog = document.getElementById('image-dialog');
const attachmentStage = document.getElementById('dialog-stage');
const attachmentImage = document.getElementById('dialog-image');
const attachmentVideo = document.getElementById('dialog-video');
const attachmentSheet = document.getElementById('dialog-sheet');
const attachmentLabel = document.getElementById('dialog-label');
const attachmentOriginal = document.getElementById('dialog-original');
const attachmentPosition = document.getElementById('dialog-position');
const attachmentScale = document.getElementById('dialog-scale');
const previousAttachment = document.getElementById('dialog-prev');
const nextAttachment = document.getElementById('dialog-next');

function projectRelativePath(url) {
  const source = new URL(url, document.baseURI);
  const base = new URL('.', document.baseURI);
  if (source.origin === base.origin && source.pathname.startsWith(base.pathname)) {
    return source.pathname.slice(base.pathname.length);
  }
  return source.pathname.replace(/^\/+/, '');
}

function viewerAssetUrl(url, suffix) {
  const source = new URL(url, document.baseURI);
  const preview = new URL(`assets/viewer/${projectRelativePath(source)}${suffix}`, document.baseURI);
  preview.search = source.search;
  return preview.href;
}

function previewFor(element) {
  const image = element?.querySelector?.('img');
  return image?.currentSrc || image?.src || '';
}

const warmedAttachments = new Set();
function warmAttachment(item) {
  if (!item || item.kind === 'video' || warmedAttachments.has(item.url)) return;
  warmedAttachments.add(item.url);
  if (item.kind === 'sheet') {
    fetch(item.url, { cache: 'force-cache', credentials: 'same-origin' }).catch(() => {});
    return;
  }
  const image = new Image();
  image.decoding = 'async';
  image.src = item.url;
}

function warmOnIntent(element, getItem) {
  let warmed = false;
  const warm = () => {
    if (warmed) return;
    warmed = true;
    warmAttachment(getItem());
  };
  element.addEventListener('pointerenter', warm, { passive: true });
  element.addEventListener('focus', warm, { passive: true });
  element.addEventListener('touchstart', warm, { passive: true, once: true });
}

const pdfPreviews = {
  '01-品牌设计/02-产品图册/产品手册.pdf': { folder: 'catalog', pages: 28, digits: 2 },
  '01-品牌设计/04-购物指南/购物指南.pdf': { folder: 'shopping-guide', pages: 4, digits: 1 },
  '01-品牌设计/05-产品手册/产品手册.pdf': { folder: 'product-manual', pages: 8, digits: 1 },
};

class PanZoom {
  constructor(stage, onScale) {
    this.stage = stage;
    this.onScale = onScale;
    this.media = null;
    this.drag = null;
    this.fitMode = true;
    this.scale = 1;
    this.fitScale = 1;
    this.minScale = .1;
    this.maxScale = 2;
    this.x = 0;
    this.y = 0;

    stage.addEventListener('wheel', event => {
      if (!this.media) return;
      event.preventDefault();
      const delta = Math.max(-240, Math.min(240, event.deltaY));
      this.zoomAt(Math.exp(-delta * .0016), event.clientX, event.clientY);
    }, { passive: false });

    stage.addEventListener('pointerdown', event => {
      if (!this.media || event.button !== 0) return;
      if (this.media === attachmentVideo) {
        const bounds = attachmentVideo.getBoundingClientRect();
        if (event.clientY >= bounds.bottom - 52 && event.clientY <= bounds.bottom) return;
      }
      this.drag = { id: event.pointerId, lastX: event.clientX, lastY: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    });
    stage.addEventListener('pointermove', event => {
      const drag = this.drag;
      if (!drag || drag.id !== event.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
      if (!drag.moved) {
        drag.moved = true;
        stage.setPointerCapture(event.pointerId);
        stage.classList.add('is-dragging');
      }
      this.pan(event.clientX - drag.lastX, event.clientY - drag.lastY);
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      event.preventDefault();
    });
    const endDrag = event => {
      if (this.drag?.id !== event.pointerId) return;
      if (this.drag.moved) this.lastDragEnd = performance.now();
      this.drag = null;
      stage.classList.remove('is-dragging');
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('click', event => {
      if (this.media === attachmentVideo && performance.now() - (this.lastDragEnd || 0) < 250) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
    new ResizeObserver(() => {
      if (!this.media) return;
      if (this.fitMode) this.fit();
      else { this.clampPosition(); this.render(); }
    }).observe(stage);
  }

  clear() {
    if (this.media) {
      this.media.style.width = '';
      this.media.style.height = '';
      this.media.style.transform = '';
    }
    this.media = null;
    this.drag = null;
    this.stage.classList.remove('is-dragging');
  }

  use(media, kind) {
    this.clear();
    this.media = media;
    this.kind = kind;
    this.naturalWidth = media === attachmentVideo ? media.videoWidth : media.naturalWidth;
    this.naturalHeight = media === attachmentVideo ? media.videoHeight : media.naturalHeight;
    if (this.naturalWidth && this.naturalHeight) this.fit();
  }

  fit() {
    if (!this.media || !this.naturalWidth || !this.naturalHeight) return;
    const width = Math.max(1, this.stage.clientWidth - 28);
    const height = Math.max(1, this.stage.clientHeight - 28);
    const longPage = this.kind === 'pdf' || this.naturalWidth / this.naturalHeight < .5;
    const suitableScale = longPage ? width / this.naturalWidth : Math.min(width / this.naturalWidth, height / this.naturalHeight);
    this.fitScale = Math.max(this.minScale, Math.min(suitableScale, 1.5, this.maxScale));
    this.scale = this.fitScale;
    this.x = (this.stage.clientWidth - this.naturalWidth * this.scale) / 2;
    this.y = this.naturalHeight * this.scale > this.stage.clientHeight ? 0 : (this.stage.clientHeight - this.naturalHeight * this.scale) / 2;
    this.fitMode = true;
    this.render();
  }

  zoomAt(factor, clientX, clientY) {
    if (!this.media) return;
    const next = Math.max(this.minScale, Math.min(this.maxScale, this.scale * factor));
    if (Math.abs(next - this.scale) < .0001) return;
    const bounds = this.stage.getBoundingClientRect();
    const pointerX = clientX - bounds.left;
    const pointerY = clientY - bounds.top;
    const imageX = (pointerX - this.x) / this.scale;
    const imageY = (pointerY - this.y) / this.scale;
    this.scale = next;
    this.x = pointerX - imageX * next;
    this.y = pointerY - imageY * next;
    this.fitMode = false;
    this.clampPosition();
    this.render();
  }

  pan(dx, dy) {
    if (!this.media) return;
    this.x += dx;
    this.y += dy;
    this.clampPosition();
    this.render();
  }

  clampPosition() {
    const width = this.naturalWidth * this.scale;
    const height = this.naturalHeight * this.scale;
    this.x = width <= this.stage.clientWidth ? (this.stage.clientWidth - width) / 2 : Math.max(this.stage.clientWidth - width, Math.min(0, this.x));
    this.y = height <= this.stage.clientHeight ? (this.stage.clientHeight - height) / 2 : Math.max(this.stage.clientHeight - height, Math.min(0, this.y));
  }

  render() {
    if (!this.media) return;
    this.media.style.width = `${this.naturalWidth * this.scale}px`;
    this.media.style.height = `${this.naturalHeight * this.scale}px`;
    this.media.style.transform = `translate3d(${this.x}px, ${this.y}px, 0)`;
    this.onScale(this.scale);
  }
}

const panZoom = new PanZoom(attachmentStage, scale => { attachmentScale.textContent = `${Math.round(scale * 100)}%`; });
let attachmentItems = [];
let attachmentIndex = 0;
let renderVersion = 0;
let closingTimer;
let closingEnd;

function openAttachments(items, index = 0) {
  attachmentItems = items;
  attachmentIndex = index;
  if (!attachmentDialog.open) attachmentDialog.showModal();
  renderAttachment();
}

function renderAttachment() {
  const item = attachmentItems[attachmentIndex];
  if (!item) return;
  const version = ++renderVersion;
  const previousKind = attachmentDialog.dataset.kind;
  const retainedPdfPage = previousKind === 'pdf' && !attachmentImage.hidden ? attachmentImage.src : '';
  attachmentDialog.dataset.kind = item.kind;
  attachmentLabel.textContent = item.label;
  attachmentOriginal.href = item.original || item.url;
  attachmentPosition.textContent = attachmentItems.length > 1 ? `${attachmentIndex + 1} / ${attachmentItems.length}` : item.kind === 'sheet' ? '表格预览' : item.kind === 'video' ? '视频预览' : '作品预览';
  previousAttachment.disabled = attachmentItems.length < 2;
  nextAttachment.disabled = attachmentItems.length < 2;
  panZoom.clear();
  attachmentStage.dataset.loading = 'true';
  attachmentStage.dataset.error = '';
  attachmentImage.hidden = true;
  attachmentVideo.hidden = true;
  attachmentSheet.hidden = true;
  attachmentVideo.pause();
  attachmentVideo.removeAttribute('src');
  attachmentVideo.removeAttribute('poster');
  attachmentVideo.load();
  if (attachmentSheet.getAttribute('src')) attachmentSheet.removeAttribute('src');

  if (item.kind === 'sheet') {
    attachmentScale.textContent = '100%';
    attachmentSheet.hidden = false;
    attachmentSheet.onload = () => { if (version === renderVersion) attachmentStage.dataset.loading = ''; };
    attachmentSheet.onerror = () => { if (version === renderVersion) attachmentStage.dataset.error = '表格预览无法加载'; };
    attachmentSheet.src = item.url;
    return;
  }
  if (item.kind === 'video') {
    const showVideo = () => {
      if (version !== renderVersion) return;
      attachmentImage.hidden = true;
      attachmentVideo.hidden = false;
      attachmentStage.dataset.loading = '';
      panZoom.use(attachmentVideo, 'video');
    };
    if (item.poster) {
      attachmentStage.dataset.loading = 'preview';
      attachmentImage.hidden = false;
      attachmentImage.alt = `${item.label} 视频封面`;
      let posterReady = false;
      const fitPoster = () => {
        if (posterReady || version !== renderVersion || !attachmentImage.naturalWidth) return;
        posterReady = true;
        panZoom.use(attachmentImage, 'image');
      };
      attachmentImage.onload = fitPoster;
      attachmentImage.src = item.poster;
      if (attachmentImage.complete) queueMicrotask(fitPoster);
    } else {
      attachmentVideo.hidden = false;
    }
    attachmentVideo.onloadedmetadata = () => {
      showVideo();
    };
    attachmentVideo.onerror = () => {
      if (version !== renderVersion) return;
      attachmentStage.dataset.loading = '';
      if (!item.poster) attachmentStage.dataset.error = '视频无法加载';
    };
    attachmentVideo.src = item.url;
    attachmentVideo.load();
    return;
  }

  attachmentImage.hidden = false;
  attachmentImage.alt = item.label;
  const placeholder = item.preview || (item.kind === 'pdf' ? retainedPdfPage : '');
  let visibleLoad = 0;
  const showVisibleSource = (url, final) => {
    const load = ++visibleLoad;
    let ready = false;
    const fitLoadedImage = () => {
      if (ready || version !== renderVersion || load !== visibleLoad || !attachmentImage.naturalWidth) return;
      ready = true;
      if (final) attachmentStage.dataset.loading = '';
      panZoom.use(attachmentImage, item.kind);
    };
    attachmentImage.onload = fitLoadedImage;
    attachmentImage.onerror = () => {};
    attachmentImage.src = url;
    if (attachmentImage.complete) queueMicrotask(fitLoadedImage);
  };

  if (placeholder) {
    attachmentStage.dataset.loading = 'preview';
    showVisibleSource(placeholder, false);
  }

  const loadFinal = (url, fallback = '') => {
    const loader = new Image();
    loader.decoding = 'async';
    loader.onload = async () => {
      try { await loader.decode(); } catch {}
      if (version === renderVersion) showVisibleSource(loader.src, true);
    };
    loader.onerror = () => {
      if (fallback && fallback !== url) {
        loadFinal(fallback);
        return;
      }
      if (version !== renderVersion) return;
      attachmentStage.dataset.loading = '';
      if (!placeholder) attachmentStage.dataset.error = '图片无法加载';
    };
    loader.src = url;
  };
  loadFinal(item.url, item.fallback);
}

function stepAttachment(delta) {
  if (attachmentItems.length < 2) return;
  attachmentIndex = (attachmentIndex + delta + attachmentItems.length) % attachmentItems.length;
  renderAttachment();
}

function closeAttachment() {
  if (!attachmentDialog.open || closingTimer) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.input === 'keyboard') {
    attachmentDialog.close();
    return;
  }
  attachmentDialog.classList.add('is-closing');
  const finish = () => {
    clearTimeout(closingTimer);
    closingTimer = undefined;
    attachmentDialog.removeEventListener('transitionend', onEnd);
    closingEnd = undefined;
    if (attachmentDialog.open) attachmentDialog.close();
  };
  const onEnd = event => { if (event.target === attachmentDialog && event.propertyName === 'opacity') finish(); };
  closingEnd = onEnd;
  attachmentDialog.addEventListener('transitionend', onEnd);
  closingTimer = setTimeout(finish, 300);
}

attachmentDialog.addEventListener('close', () => {
  clearTimeout(closingTimer);
  closingTimer = undefined;
  if (closingEnd) attachmentDialog.removeEventListener('transitionend', closingEnd);
  closingEnd = undefined;
  attachmentDialog.classList.remove('is-closing');
  ++renderVersion;
  panZoom.clear();
  attachmentVideo.pause();
  attachmentVideo.removeAttribute('src');
  attachmentVideo.removeAttribute('poster');
  attachmentVideo.load();
  attachmentImage.removeAttribute('src');
  attachmentSheet.removeAttribute('src');
});
attachmentDialog.addEventListener('click', event => { if (event.target === attachmentDialog) closeAttachment(); });
document.getElementById('dialog-close').addEventListener('click', closeAttachment);
previousAttachment.addEventListener('click', () => stepAttachment(-1));
nextAttachment.addEventListener('click', () => stepAttachment(1));
document.getElementById('dialog-fit').addEventListener('click', () => {
  if (attachmentDialog.dataset.kind === 'sheet') attachmentSheet.contentWindow?.postMessage({ type: 'portfolio-sheet-control', action: 'fit' }, '*');
  else panZoom.fit();
});
for (const [id, factor] of [['dialog-zoom-out', 1 / 1.2], ['dialog-zoom-in', 1.2]]) {
  document.getElementById(id).addEventListener('click', () => {
    if (attachmentDialog.dataset.kind === 'sheet') attachmentSheet.contentWindow?.postMessage({ type: 'portfolio-sheet-control', action: 'zoom', factor }, '*');
    else {
      const bounds = attachmentStage.getBoundingClientRect();
      panZoom.zoomAt(factor, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    }
  });
}
addEventListener('message', event => {
  if (event.source !== attachmentSheet.contentWindow) return;
  if (event.data?.type === 'portfolio-sheet-scale') attachmentScale.textContent = `${Math.round(event.data.scale * 100)}%`;
  if (event.data?.type === 'portfolio-sheet-close') closeAttachment();
});
document.addEventListener('keydown', event => {
  if (!attachmentDialog.open || attachmentDialog.dataset.kind === 'video' || attachmentDialog.dataset.kind === 'sheet') return;
  if (event.key === 'ArrowLeft') { event.preventDefault(); stepAttachment(-1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); stepAttachment(1); }
});

const allImageButtons = [...document.querySelectorAll('.asset-image[data-full]')];
const imageItem = (url, label, original = url, preview = '') => ({
  kind: 'image',
  url: viewerAssetUrl(url, '.webp'),
  fallback: url,
  label,
  original,
  preview,
});
for (const button of allImageButtons) {
  const itemForButton = () => imageItem(button.dataset.full, button.dataset.label, button.dataset.full, previewFor(button));
  warmOnIntent(button, itemForButton);
  button.addEventListener('click', () => {
    const gallery = button.closest('[data-dialog-gallery]');
    if (gallery) {
      const galleryButtons = [...gallery.querySelectorAll('.asset-image[data-dialog-index]')];
      const items = JSON.parse(gallery.dataset.dialogGallery).map((item, index) => {
        const sourceButton = galleryButtons.find(candidate => Number(candidate.dataset.dialogIndex) === index);
        return imageItem(item.url, item.label, item.url, previewFor(sourceButton));
      });
      openAttachments(items, Number(button.dataset.dialogIndex));
      return;
    }
    const buttons = allImageButtons.filter(candidate => !candidate.closest('[hidden]'));
    openAttachments(buttons.map(candidate => imageItem(
      candidate.dataset.full,
      candidate.dataset.label,
      candidate.dataset.full,
      previewFor(candidate),
    )), buttons.indexOf(button));
  });
}

const brandReels = [...document.querySelectorAll('[data-motion-reel]')];
for (const [index, reel] of brandReels.entries()) {
  warmOnIntent(reel, () => imageItem(reel.href, reel.dataset.label, reel.href, previewFor(reel)));
  reel.addEventListener('click', event => {
    event.preventDefault();
    openAttachments(brandReels.map(candidate => imageItem(
      candidate.href,
      candidate.dataset.label,
      candidate.href,
      previewFor(candidate),
    )), index);
  });
}

function labelFor(anchor) {
  if (anchor.dataset.source) return anchor.dataset.source.split('/').at(-1);
  const label = anchor.getAttribute('aria-label');
  if (label) return label.replace(/^(打开视频|打开作品|在线预览|打开原文件)：?/, '');
  return decodeURIComponent(new URL(anchor.href).pathname.split('/').at(-1));
}

for (const anchor of document.querySelectorAll('a[href]')) {
  if (anchor.closest('dialog') || anchor.matches('[data-motion-reel]')) continue;
  const pathname = new URL(anchor.href).pathname.toLowerCase();
  let item;
  if (/\.(jpe?g|png|gif|webp|avif)$/.test(pathname)) {
    item = imageItem(anchor.href, labelFor(anchor), anchor.href, previewFor(anchor));
  } else if (pathname.endsWith('.pdf')) {
    const preview = pdfPreviews[anchor.dataset.source];
    if (!preview) continue;
    const cover = previewFor(anchor);
    const items = Array.from({ length: preview.pages }, (_, index) => ({
      kind: 'pdf',
      url: `assets/pdf-pages/${preview.folder}/page-${String(index + 1).padStart(preview.digits, '0')}.jpg`,
      label: `${labelFor(anchor)} · 第 ${index + 1} 页`,
      original: anchor.href,
      preview: index === 0 ? cover : '',
    }));
    warmOnIntent(anchor, () => items[0]);
    anchor.addEventListener('click', event => { event.preventDefault(); openAttachments(items); });
    continue;
  } else if (/\.(mp4|webm)$/.test(pathname)) {
    const container = anchor.closest('figure,article');
    const poster = container?.querySelector('video[poster]')?.poster || container?.querySelector('.featured-video-poster')?.src;
    item = {
      kind: 'video',
      url: viewerAssetUrl(anchor.href, '.preview.mp4'),
      label: labelFor(anchor),
      original: anchor.href,
      poster,
    };
  } else if (pathname.includes('/assets/sheets/') && pathname.endsWith('.html')) {
    const original = anchor.dataset.source
      ? new URL(anchor.dataset.source.split('/').map(encodeURIComponent).join('/'), document.baseURI).href
      : anchor.href;
    item = { kind: 'sheet', url: anchor.href, label: labelFor(anchor), original };
  }
  if (item) {
    warmOnIntent(anchor, () => item);
    anchor.addEventListener('click', event => { event.preventDefault(); openAttachments([item]); });
  }
}
