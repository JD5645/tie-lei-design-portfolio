const progress = document.querySelector('.scroll-progress');
let progressFrame = 0;
const updateProgress = () => {
  if (progressFrame) return;
  progressFrame = requestAnimationFrame(() => {
    progressFrame = 0;
    const available = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    progress.style.transform = `scaleX(${Math.min(1, scrollY / available)})`;
  });
};
addEventListener('scroll', updateProgress, { passive: true });
addEventListener('resize', updateProgress);
updateProgress();

// Keyboard actions stay immediate; pointer interactions can use brief motion.
document.addEventListener('keydown', () => { document.documentElement.dataset.input = 'keyboard'; }, { capture: true });
document.addEventListener('pointerdown', () => { document.documentElement.dataset.input = 'pointer'; }, { capture: true });

const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const siteHeader = document.querySelector('.site-header');
function setMobileMenuOpen(open) {
  siteHeader.classList.toggle('menu-open', open);
  mobileMenuToggle.setAttribute('aria-expanded', String(open));
  mobileMenuToggle.textContent = open ? '关闭' : '菜单';
}
mobileMenuToggle.addEventListener('click', () => setMobileMenuOpen(!siteHeader.classList.contains('menu-open')));
for (const link of siteHeader.querySelectorAll('nav a')) link.addEventListener('click', () => setMobileMenuOpen(false));
document.addEventListener('click', event => {
  if (!siteHeader.contains(event.target)) setMobileMenuOpen(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && siteHeader.classList.contains('menu-open')) {
    setMobileMenuOpen(false);
    mobileMenuToggle.focus();
  }
});

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
const archiveCategoryToggle = document.getElementById('archive-category-toggle');
const archiveCategoryOptions = document.getElementById('archive-category-options');
const archiveToolbar = document.querySelector('.archive-toolbar');
function updateArchiveFilterSummary() {
  const category = activeCategory === 'all' ? '' : categoryFilters.find(item => item.dataset.categoryFilter === activeCategory)?.textContent.trim().replace(/^\d+/, '');
  const type = activeFilter === 'all' ? '' : filters.find(item => item.dataset.filter === activeFilter)?.textContent.trim();
  archiveCategoryToggle.querySelector('strong').textContent = category || type ? `筛选：${[category, type].filter(Boolean).join(' · ')}` : '筛选作品：全部';
}
function setArchiveCategoryOpen(open) {
  archiveCategoryOptions.classList.toggle('is-open', open);
  archiveToolbar.classList.toggle('filters-open', open);
  archiveCategoryToggle.setAttribute('aria-expanded', String(open));
  archiveCategoryToggle.querySelector('span').textContent = open ? '收起 −' : '展开 +';
}
archiveCategoryToggle.addEventListener('click', () => setArchiveCategoryOpen(!archiveCategoryOptions.classList.contains('is-open')));
for (const button of categoryFilters) {
  button.addEventListener('click', () => {
    updateArchiveFilterSummary();
    setArchiveCategoryOpen(false);
    if (matchMedia('(max-width: 760px)').matches) archiveCategoryToggle.focus();
  });
}
for (const button of filters) {
  button.addEventListener('click', () => {
    updateArchiveFilterSummary();
    setArchiveCategoryOpen(false);
    if (matchMedia('(max-width: 760px)').matches) archiveCategoryToggle.focus();
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
    updateArchiveFilterSummary();
    setArchiveCategoryOpen(false);
    applyFilter();
  });
}

function makeLoopClone(item, className) {
  const clone = item.cloneNode(true);
  clone.classList.add(className);
  clone.setAttribute('aria-hidden', 'true');
  clone.inert = true;
  for (const image of clone.querySelectorAll('img')) image.loading = 'eager';
  return clone;
}

function loopingScroller(scroller, originals, axis, onChange = () => {}) {
  if (originals.length < 2) return { step: () => {}, getIndex: () => 0, isMoving: () => false };
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
  return { step, getIndex: () => currentIndex, isMoving: () => moving };
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
  track.addEventListener('wheel', event => {
    // Leave native horizontal trackpad gestures to the scrollable track.
    if (Math.abs(event.deltaY) < 1 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const direction = Math.sign(event.deltaY);
    const index = loop.getIndex();
    const atOuterEdge = direction < 0 ? index === 0 : index === slides.length - 1;
    if (!loop.isMoving() && atOuterEdge) return;
    event.preventDefault();
    loop.step(direction);
  }, { passive: false });
}

// Each long page scrolls inside its existing frame. The fades show which
// direction still has content, and keyboard focus can scroll the same frame.
for (const preview of document.querySelectorAll('.long-preview-scroll')) {
  const updateEdges = () => {
    const remaining = preview.scrollHeight - preview.clientHeight;
    preview.classList.toggle('can-scroll-up', preview.scrollTop > 2);
    preview.classList.toggle('can-scroll-down', remaining - preview.scrollTop > 2);
  };
  preview.addEventListener('scroll', updateEdges, { passive: true });
  addEventListener('resize', updateEdges);
  const image = preview.querySelector('img');
  if (image && !image.complete) image.addEventListener('load', updateEdges, { once: true });
  updateEdges();

  const control = preview.closest('.web-reel, .gallery-long .asset-image');
  control?.addEventListener('keydown', event => {
    const step = Math.max(72, preview.clientHeight * .65);
    const limit = Math.max(0, preview.scrollHeight - preview.clientHeight);
    let next;
    if (event.key === 'ArrowDown') next = preview.scrollTop + step;
    else if (event.key === 'ArrowUp') next = preview.scrollTop - step;
    else if (event.key === 'PageDown') next = preview.scrollTop + preview.clientHeight;
    else if (event.key === 'PageUp') next = preview.scrollTop - preview.clientHeight;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = limit;
    else return;
    next = Math.max(0, Math.min(limit, next));
    if (Math.abs(next - preview.scrollTop) < 1) return;
    event.preventDefault();
    preview.scrollTop = next;
  });
}

