const progress = document.querySelector('.scroll-progress');
const updateProgress = () => {
  const available = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  progress.style.width = `${Math.min(100, scrollY / available * 100)}%`;
};
addEventListener('scroll', updateProgress, { passive: true });
addEventListener('resize', updateProgress);
updateProgress();

const searchInput = document.getElementById('asset-search');
const filters = [...document.querySelectorAll('[data-filter]')];
const categoryFilters = [...document.querySelectorAll('[data-category-filter]')];
const cards = [...document.querySelectorAll('.asset-card[data-source]')];
const groups = [...document.querySelectorAll('[data-group]')];
const chapters = [...document.querySelectorAll('[data-chapter]')];
const resultCount = document.getElementById('result-count');
const emptyState = document.getElementById('empty-state');
let activeFilter = 'all';
let activeCategory = 'all';

function applyFilter() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  let visible = 0;
  for (const card of cards) {
    const matchType = activeFilter === 'all' || card.dataset.type === activeFilter;
    const matchCategory = activeCategory === 'all' || card.dataset.category === activeCategory;
    const matchText = !query || card.dataset.search.toLocaleLowerCase().includes(query);
    card.hidden = !(matchType && matchCategory && matchText);
    if (!card.hidden) visible++;
  }
  for (const group of groups) group.hidden = !group.querySelector('.asset-card:not([hidden])');
  if (query) for (const group of document.querySelectorAll('details.archive-collapsible:not([hidden])')) group.open = true;
  for (const chapter of chapters) chapter.hidden = !chapter.querySelector('[data-group]:not([hidden])');
  resultCount.textContent = `显示 ${visible} 个作品`;
  emptyState.hidden = visible !== 0;
}

searchInput.addEventListener('input', applyFilter);
for (const button of filters) {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    for (const item of filters) {
      const isActive = item === button;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-pressed', String(isActive));
    }
    applyFilter();
  });
}
for (const button of categoryFilters) {
  button.addEventListener('click', () => {
    activeCategory = button.dataset.categoryFilter;
    for (const item of categoryFilters) {
      const isActive = item === button;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-pressed', String(isActive));
    }
    applyFilter();
  });
}
for (const link of document.querySelectorAll('a[href^="#chapter-"]')) {
  link.addEventListener('click', () => {
    if (activeFilter === 'all' && activeCategory === 'all' && !searchInput.value) return;
    searchInput.value = '';
    activeFilter = 'all';
    activeCategory = 'all';
    for (const item of filters) {
      const isActive = item.dataset.filter === 'all';
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-pressed', String(isActive));
    }
    for (const item of categoryFilters) {
      const isActive = item.dataset.categoryFilter === 'all';
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-pressed', String(isActive));
    }
    applyFilter();
  });
}

const dialog = document.getElementById('image-dialog');
const dialogImage = document.getElementById('dialog-image');
const dialogLabel = document.getElementById('dialog-label');
const dialogOriginal = document.getElementById('dialog-original');
const dialogPosition = document.getElementById('dialog-position');
const allImageButtons = [...document.querySelectorAll('.asset-image[data-full]')];
let currentIndex = -1;
let activeGallery = null;

function visibleImageButtons() {
  return allImageButtons.filter(button => !button.closest('[hidden]'));
}

function renderDialogImage(source, label, position, total) {
  dialogImage.src = source;
  dialogImage.alt = label;
  dialogLabel.textContent = label;
  dialogOriginal.href = source;
  dialogPosition.textContent = `${position} / ${total}`;
  if (!dialog.open) dialog.showModal();
}

function showImage(button) {
  const gallery = button.closest('[data-dialog-gallery]');
  if (gallery) {
    activeGallery = JSON.parse(gallery.dataset.dialogGallery);
    currentIndex = Number(button.dataset.dialogIndex);
    const item = activeGallery[currentIndex];
    renderDialogImage(item.url, item.label, currentIndex + 1, activeGallery.length);
    return;
  }
  activeGallery = null;
  const buttons = visibleImageButtons();
  currentIndex = buttons.indexOf(button);
  renderDialogImage(button.dataset.full, button.dataset.label, currentIndex + 1, buttons.length);
}

function stepImage(delta) {
  if (activeGallery) {
    currentIndex = (currentIndex + delta + activeGallery.length) % activeGallery.length;
    const item = activeGallery[currentIndex];
    renderDialogImage(item.url, item.label, currentIndex + 1, activeGallery.length);
    return;
  }
  const buttons = visibleImageButtons();
  if (!buttons.length) return;
  const next = (currentIndex + delta + buttons.length) % buttons.length;
  showImage(buttons[next]);
}

for (const button of allImageButtons) button.addEventListener('click', () => showImage(button));
document.getElementById('dialog-close').addEventListener('click', () => dialog.close());
document.getElementById('dialog-prev').addEventListener('click', () => stepImage(-1));
document.getElementById('dialog-next').addEventListener('click', () => stepImage(1));
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
document.addEventListener('keydown', event => {
  if (!dialog.open) return;
  if (event.key === 'ArrowLeft') stepImage(-1);
  if (event.key === 'ArrowRight') stepImage(1);
});

function makeLoopClone(item, className) {
  const clone = item.cloneNode(true);
  clone.classList.add(className);
  clone.setAttribute('aria-hidden', 'true');
  clone.inert = true;
  for (const image of clone.querySelectorAll('img')) image.loading = 'eager';
  return clone;
}

function loopingScroller(scroller, originals, axis, onChange = () => {}) {
  if (originals.length < 2) return { step: () => {} };
  const cloneClass = axis === 'x' ? 'portfolio-slide-clone' : 'rail-item-clone';
  const before = makeLoopClone(originals.at(-1), cloneClass);
  const after = makeLoopClone(originals[0], cloneClass);
  scroller.prepend(before);
  scroller.append(after);
  const items = [before, ...originals, after];
  const offset = axis === 'x' ? 'scrollLeft' : 'scrollTop';
  const coordinate = axis === 'x' ? 'left' : 'top';
  const size = axis === 'x' ? 'clientWidth' : 'clientHeight';
  let currentIndex = 0;
  let moving = false;
  let idleTimer;
  const position = item => item.getBoundingClientRect()[coordinate]
    - scroller.getBoundingClientRect()[coordinate] + scroller[offset]
    - (scroller[size] - item[size]) / 2;
  const nearest = () => items.reduce((best, item, index) =>
    Math.abs(position(item) - scroller[offset]) < Math.abs(position(items[best]) - scroller[offset]) ? index : best, 0);
  const logicalIndex = index => index === 0 ? originals.length - 1 : index === items.length - 1 ? 0 : index - 1;
  const update = () => {
    currentIndex = logicalIndex(nearest());
    onChange(currentIndex);
  };
  const jumpTo = item => {
    scroller.style.scrollSnapType = 'none';
    scroller.scrollTo({ [coordinate]: position(item), behavior: 'instant' });
    scroller.style.scrollSnapType = '';
  };
  const settle = () => {
    clearTimeout(idleTimer);
    const index = nearest();
    if (index === 0) jumpTo(originals.at(-1));
    else if (index === items.length - 1) jumpTo(originals[0]);
    moving = false;
    update();
  };
  const step = direction => {
    if (moving) return;
    const target = nearest() + direction;
    if (target < 0 || target >= items.length) return;
    moving = true;
    scroller.scrollTo({ [coordinate]: position(items[target]), behavior: 'smooth' });
  };
  scroller.addEventListener('scroll', () => {
    update();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(settle, 140);
  }, { passive: true });
  scroller.addEventListener('scrollend', settle);
  addEventListener('resize', () => requestAnimationFrame(() => jumpTo(originals[currentIndex])));
  jumpTo(originals[0]);
  update();
  return { step };
}

const rail = document.getElementById('commerce-rail');
const railLoop = loopingScroller(rail, [...rail.querySelectorAll('.rail-item')], 'y');
for (const button of document.querySelectorAll('[data-rail-step]')) {
  button.addEventListener('click', () => railLoop.step(Number(button.dataset.railStep)));
}
rail.tabIndex = 0;
rail.setAttribute('aria-label', '橙色沙发主图，可上下滑动');
rail.addEventListener('keydown', event => {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();
  railLoop.step(event.key === 'ArrowDown' ? 1 : -1);
});

const animatedPreview = document.querySelector('.featured-video-animation');
if (animatedPreview) {
  const frame = animatedPreview.closest('.featured-video-frame');
  const revealPreview = () => frame.classList.add('image-ready');
  if (animatedPreview.complete && animatedPreview.naturalWidth) revealPreview();
  else animatedPreview.addEventListener('load', revealPreview, { once: true });
  animatedPreview.addEventListener('error', () => frame.classList.remove('image-ready'));
}

for (const carousel of document.querySelectorAll('[data-carousel]')) {
  const track = carousel.querySelector('[data-carousel-track]');
  const slides = [...track.querySelectorAll('.portfolio-slide')];
  const current = carousel.querySelector('[data-carousel-current]');
  const previous = carousel.querySelector('[data-carousel-step="-1"]');
  const next = carousel.querySelector('[data-carousel-step="1"]');
  const loop = loopingScroller(track, slides, 'x', index => {
    current.textContent = String(index + 1).padStart(2, '0');
  });
  previous.disabled = false;
  next.disabled = false;
  previous.addEventListener('click', () => loop.step(-1));
  next.addEventListener('click', () => loop.step(1));
  track.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    loop.step(event.key === 'ArrowRight' ? 1 : -1);
  });
}

if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const reelObserver = new IntersectionObserver(entries => {
    for (const entry of entries) entry.target.classList.toggle('playing', entry.isIntersecting);
  }, { threshold: .15 });
  for (const reel of document.querySelectorAll('[data-motion-reel]')) reelObserver.observe(reel);
}

const reelToggle = document.getElementById('reel-toggle');
reelToggle.addEventListener('click', () => {
  const paused = document.querySelector('.brand-reels').classList.toggle('motion-paused');
  reelToggle.textContent = paused ? '继续放映 ▶' : '暂停放映 Ⅱ';
  reelToggle.setAttribute('aria-pressed', String(paused));
});

const webDialog = document.getElementById('web-dialog');
const webDialogStage = document.getElementById('web-dialog-stage');
const webDialogImage = document.getElementById('web-dialog-image');
const webDialogZoom = document.getElementById('web-dialog-zoom');
const webDialogOriginal = document.getElementById('web-dialog-original');
for (const reel of document.querySelectorAll('[data-motion-reel]')) {
  reel.addEventListener('click', event => {
    event.preventDefault();
    webDialogImage.src = reel.href;
    webDialogOriginal.href = reel.href;
    document.getElementById('web-dialog-label').textContent = reel.dataset.label;
    webDialog.classList.remove('zoomed');
    webDialogZoom.setAttribute('aria-pressed', 'false');
    webDialogZoom.textContent = '放大 100%';
    webDialog.showModal();
    webDialogStage.scrollTop = 0;
    webDialogStage.scrollLeft = 0;
  });
}
webDialogZoom.addEventListener('click', () => {
  const zoomed = webDialog.classList.toggle('zoomed');
  webDialogZoom.setAttribute('aria-pressed', String(zoomed));
  webDialogZoom.textContent = zoomed ? '适应窗口' : '放大 100%';
  webDialogStage.scrollLeft = 0;
});
document.getElementById('web-dialog-close').addEventListener('click', () => webDialog.close());
webDialog.addEventListener('click', event => { if (event.target === webDialog) webDialog.close(); });
webDialog.addEventListener('close', () => { webDialogImage.removeAttribute('src'); });
