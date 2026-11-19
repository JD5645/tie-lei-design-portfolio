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
    this.maxScale = 6;
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
    this.fitScale = Math.min(longPage ? width / this.naturalWidth : Math.min(width / this.naturalWidth, height / this.naturalHeight), 1.5);
    this.minScale = Math.max(.03, this.fitScale * .35);
    this.maxScale = Math.max(2, Math.min(6, this.fitScale * 6));
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
  attachmentDialog.dataset.kind = item.kind;
  attachmentLabel.textContent = item.label;
  attachmentOriginal.href = item.original || item.url;
  attachmentPosition.textContent = attachmentItems.length > 1 ? `${attachmentIndex + 1} / ${attachmentItems.length}` : item.kind === 'sheet' ? '表格预览' : item.kind === 'video' ? '视频预览' : '作品预览';
  previousAttachment.disabled = attachmentItems.length < 2;
  nextAttachment.disabled = attachmentItems.length < 2;
  panZoom.clear();
  attachmentStage.dataset.loading = item.kind === 'sheet' ? '' : 'true';
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
    attachmentSheet.src = item.url;
    return;
  }
  if (item.kind === 'video') {
    attachmentVideo.hidden = false;
    if (item.poster) attachmentVideo.poster = item.poster;
    attachmentVideo.onloadedmetadata = () => {
      if (version !== renderVersion) return;
      attachmentStage.dataset.loading = '';
      panZoom.use(attachmentVideo, 'video');
    };
    attachmentVideo.onerror = () => { if (version === renderVersion) attachmentStage.dataset.error = '视频无法加载'; };
    attachmentVideo.src = item.url;
    attachmentVideo.load();
    return;
  }
  attachmentImage.hidden = false;
  attachmentImage.alt = item.label;
  const fitLoadedImage = () => {
    if (version !== renderVersion) return;
    attachmentStage.dataset.loading = '';
    panZoom.use(attachmentImage, item.kind);
  };
  attachmentImage.onload = fitLoadedImage;
  attachmentImage.onerror = () => { if (version === renderVersion) attachmentStage.dataset.error = '图片无法加载'; };
  attachmentImage.src = item.url;
  if (attachmentImage.complete && attachmentImage.naturalWidth) fitLoadedImage();
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
const imageItem = (url, label, original = url) => ({ kind: 'image', url, label, original });
for (const button of allImageButtons) {
  button.addEventListener('click', () => {
    const gallery = button.closest('[data-dialog-gallery]');
    if (gallery) {
      const items = JSON.parse(gallery.dataset.dialogGallery).map(item => imageItem(item.url, item.label));
      openAttachments(items, Number(button.dataset.dialogIndex));
      return;
    }
    const buttons = allImageButtons.filter(candidate => !candidate.closest('[hidden]'));
    openAttachments(buttons.map(candidate => imageItem(candidate.dataset.full, candidate.dataset.label)), buttons.indexOf(button));
  });
}

const brandReels = [...document.querySelectorAll('[data-motion-reel]')];
for (const [index, reel] of brandReels.entries()) {
  reel.addEventListener('click', event => {
    event.preventDefault();
    openAttachments(brandReels.map(candidate => imageItem(candidate.href, candidate.dataset.label)), index);
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
    item = imageItem(anchor.href, labelFor(anchor));
  } else if (pathname.endsWith('.pdf')) {
    const preview = pdfPreviews[anchor.dataset.source];
    if (!preview) continue;
    const items = Array.from({ length: preview.pages }, (_, index) => ({
      kind: 'pdf',
      url: `assets/pdf-pages/${preview.folder}/page-${String(index + 1).padStart(preview.digits, '0')}.jpg`,
      label: `${labelFor(anchor)} · 第 ${index + 1} 页`,
      original: anchor.href,
    }));
    anchor.addEventListener('click', event => { event.preventDefault(); openAttachments(items); });
    continue;
  } else if (/\.(mp4|webm)$/.test(pathname)) {
    const container = anchor.closest('figure,article');
    const poster = container?.querySelector('video[poster]')?.poster || container?.querySelector('.featured-video-poster')?.src;
    item = { kind: 'video', url: anchor.href, label: labelFor(anchor), original: anchor.href, poster };
  } else if (pathname.includes('/assets/sheets/') && pathname.endsWith('.html')) {
    const original = anchor.dataset.source
      ? new URL(anchor.dataset.source.split('/').map(encodeURIComponent).join('/'), document.baseURI).href
      : anchor.href;
    item = { kind: 'sheet', url: anchor.href, label: labelFor(anchor), original };
  }
  if (item) anchor.addEventListener('click', event => { event.preventDefault(); openAttachments([item]); });
}
