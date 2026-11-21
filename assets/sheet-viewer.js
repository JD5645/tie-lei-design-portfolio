// Embedded sheet previews keep their text and links usable while supporting
// the same wheel-to-zoom and drag-to-pan controls as image attachments.
if (window.parent !== window) {
  let scale = 1;
  let drag = null;
  const clamp = value => Math.max(.1, Math.min(2, value));
  const report = () => parent.postMessage({ type: 'portfolio-sheet-scale', scale }, '*');
  document.querySelector('.top nav a[href*="index.html#"]')?.addEventListener('click', event => {
    event.preventDefault();
    parent.postMessage({ type: 'portfolio-sheet-close' }, '*');
  });
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor) return;
    const fragment = anchor.getAttribute('href');
    if (!fragment || fragment === '#') return;
    let target;
    try { target = document.getElementById(decodeURIComponent(fragment.slice(1))); }
    catch { return; }
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ block: 'start' });
  });

  function setScale(next, clientX = innerWidth / 2, clientY = innerHeight / 2) {
    next = clamp(next);
    if (Math.abs(next - scale) < .001) return;
    const contentX = (scrollX + clientX) / scale;
    const contentY = (scrollY + clientY) / scale;
    scale = next;
    document.body.style.zoom = String(scale);
    requestAnimationFrame(() => scrollTo(contentX * scale - clientX, contentY * scale - clientY));
    report();
  }

  addEventListener('wheel', event => {
    event.preventDefault();
    const delta = Math.max(-240, Math.min(240, event.deltaY));
    setScale(scale * Math.exp(-delta * .0016), event.clientX, event.clientY);
  }, { passive: false, capture: true });

  document.documentElement.style.touchAction = 'none';
  addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.altKey || event.target.closest('a,button,input,textarea,select,[contenteditable]')) return;
    event.preventDefault();
    const table = event.target.closest('.table-scroll');
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      table,
      left: table ? table.scrollLeft : scrollX,
      top: table ? table.scrollTop : scrollY,
      moved: false,
    };
  });
  addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      document.documentElement.style.userSelect = 'none';
      getSelection()?.removeAllRanges();
      document.documentElement.setPointerCapture(event.pointerId);
    }
    if (drag.table) {
      drag.table.scrollLeft = drag.left - dx;
      drag.table.scrollTop = drag.top - dy;
    } else scrollTo(drag.left - dx, drag.top - dy);
    event.preventDefault();
  });
  const endDrag = event => {
    if (drag?.id !== event.pointerId) return;
    drag = null;
    document.documentElement.style.userSelect = '';
    if (document.documentElement.hasPointerCapture(event.pointerId)) document.documentElement.releasePointerCapture(event.pointerId);
  };
  addEventListener('pointerup', endDrag);
  addEventListener('pointercancel', endDrag);

  addEventListener('message', event => {
    if (event.source !== parent || event.data?.type !== 'portfolio-sheet-control') return;
    if (event.data.action === 'fit') {
      setScale(1);
      requestAnimationFrame(() => {
        scrollTo(0, 0);
        document.querySelectorAll('.table-scroll').forEach(table => { table.scrollTop = 0; table.scrollLeft = 0; });
      });
    }
    if (event.data.action === 'zoom') setScale(scale * event.data.factor);
    report();
  });
  addEventListener('load', report);
  report();
}
