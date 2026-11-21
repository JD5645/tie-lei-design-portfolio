# Attachment document preview implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver fast spreadsheet previews and continuous, vertically scrollable, progressively loaded PDF previews.

**Architecture:** Keep the static HTML/CSS/JavaScript stack. Add a small sheet HTML cache with near-viewport prefetching and a dedicated continuous PDF viewport that consumes the existing generated page images.

**Tech Stack:** HTML, CSS, vanilla JavaScript, browser IntersectionObserver, existing Edge CDP QA scripts.

**Spec:** `docs/superpowers/specs/2026-11-21-attachment-document-preview-design.md`

## Global Constraints

- Keep the existing fixed-size dialog and original-file link.
- Preserve the 10% to 200% attachment zoom range.
- Do not add dependencies or require browser plug-ins.
- Do not change or rename original portfolio files.
- Keep local `file://` opening and Cloudflare Pages deployment working.

## Review Focus

- A fast click before spreadsheet prefetch resolves must reuse one in-flight request and still render.
- Spreadsheet `srcdoc` must resolve its script and original-file links from the sheet URL.
- A 28-page PDF must not request every page immediately.
- PDF page scrolling must not trigger background page scrolling or lose the visible-page indicator.
- Closing or switching attachments during loading must not update the new attachment with stale results.

---

### Task 1: Regression coverage

**Files:**
- Modify: `qa-attachment-performance.mjs`

**Interfaces:**
- Consumes: the production page through the existing Edge CDP harness.
- Produces: assertions for `#dialog-pdf`, page placeholders, sheet cache reuse, and preview timing state.

- [ ] **Step 1: Write failing browser assertions**

Add real interaction checks that open one PDF and one spreadsheet. Assert that the PDF has all page elements in a single viewport, later pages begin unloaded, scrolling changes the visible-page status, and the spreadsheet iframe receives `srcdoc` from one prefetched response.

- [ ] **Step 2: Run the regression test and verify RED**

Run: `node qa-attachment-performance.mjs`

Expected: FAIL because `#dialog-pdf` and cached spreadsheet `srcdoc` do not exist.

### Task 2: Spreadsheet preview cache

**Files:**
- Modify: `viewer.js`
- Modify: `style.css`

**Interfaces:**
- Produces: `warmSheet(url) -> Promise<string>` and iframe `srcdoc` rendering with an injected base URL.

- [ ] **Step 1: Implement a deduplicated sheet HTML cache**

Store one fetch promise per URL, validate the response, inject a base URL, and return the prepared HTML.

- [ ] **Step 2: Prefetch near-viewport sheet cards**

Observe sheet anchors with a generous vertical root margin. Keep pointer, focus, and touch intent warming as a fallback.

- [ ] **Step 3: Render the iframe from cached HTML**

Reuse the same in-flight promise on click, set `srcdoc` when ready, retain the original URL for errors and links, and avoid a second request.

- [ ] **Step 4: Run the focused regression test**

Run: `node qa-attachment-performance.mjs`

Expected: spreadsheet assertions PASS; PDF assertions remain FAIL.

### Task 3: Continuous progressive PDF viewport

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `viewer.js`

**Interfaces:**
- Produces: one PDF attachment item with `pages: Array<{url, preview, page}>`, a `#dialog-pdf` viewport, progressive image loading, PDF scroll and zoom controls.

- [ ] **Step 1: Add the PDF viewport markup and styles**

Add a hidden scroll viewport and document container inside the dialog stage. Style individual pages and loading/error states without changing dialog dimensions.

- [ ] **Step 2: Build one PDF item instead of one item per page**

Create page descriptors from `pdfPreviews`; keep the cover thumbnail on page one and the original PDF URL at the item level.

- [ ] **Step 3: Implement progressive PDF rendering**

Render every page placeholder, show the cover immediately, lazy-load page images using an observer rooted at the PDF viewport, and update the visible-page status while scrolling.

- [ ] **Step 4: Implement PDF scroll, drag, and zoom behavior**

Use ordinary wheel movement for vertical page scrolling, Ctrl or Command plus wheel for pointer-centered zoom, toolbar controls for 10% to 200%, drag to pan, and Fit to restore fit width.

- [ ] **Step 5: Run the focused regression test**

Run: `node qa-attachment-performance.mjs`

Expected: all new spreadsheet and PDF assertions PASS.

### Task 4: Full verification and deployment preparation

**Files:**
- Modify if needed: `README.md`

**Interfaces:**
- Consumes: completed implementation and tests.
- Produces: verified `dist` output and deploy-ready commit.

- [ ] **Step 1: Run syntax and focused checks**

Run: `node --check viewer.js`

Run: `node --check assets/sheet-viewer.js`

Run: `node qa-attachment-performance.mjs`

- [ ] **Step 2: Run the full browser regression suite**

Run: `node qa-local.mjs`

Expected: exit 0 with desktop, mobile, reduced-motion, image, video, PDF, and sheet checks passing.

- [ ] **Step 3: Build the deployable site**

Run: `node build.mjs`

Expected: exit 0 and updated `dist`.

- [ ] **Step 4: Review repository scope**

Run: `git diff --check` and `git status --short`

Expected: only intended source, test, spec, and plan changes plus the user's pre-existing untracked files.
