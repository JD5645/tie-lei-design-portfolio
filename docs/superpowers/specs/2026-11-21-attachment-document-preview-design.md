# Attachment document preview design

## Intent

Speed up spreadsheet previews and make every PDF readable as one continuous document inside the existing fixed-size attachment dialog.

## Goals

- Spreadsheet content should normally be cached before the user clicks a visible card, then render directly from cached HTML.
- PDF previews must include every generated page image in one vertically scrollable document.
- The dialog size, original-file link, drag interaction, mobile layout, reduced-motion behavior, and 10% to 200% zoom limits remain intact.
- First useful content must appear immediately from the existing spreadsheet card state or PDF cover thumbnail while richer content loads.

## Non-goals

- Do not embed or parse the original XLSX or PDF files in the browser.
- Do not add a frontend framework, PDF library, or spreadsheet library.
- Do not rename or replace original portfolio files.
- Do not eagerly download every spreadsheet or every PDF page on initial page load.

## Approaches considered

1. Keep page-by-page PDF navigation and direct iframe loading. This preserves the current code but does not meet the continuous-document requirement and leaves the first-click network delay.
2. Embed original XLSX and PDF files through browser plug-ins. This would transfer files up to roughly 61.5 MB, depends on browser viewers, and is too slow for the target network environment.
3. Use the existing generated HTML and page images progressively. Prefetch spreadsheet HTML only as its card approaches the viewport, render cached HTML through iframe `srcdoc`, show the PDF cover immediately, and lazy-load the remaining generated page images inside a continuous scroller. This is the selected approach because it uses existing assets and minimizes first-click work.

## Interaction design

- Spreadsheet: a near-viewport observer starts one cached fetch per sheet. Clicking uses cached HTML when ready; otherwise it waits for the same in-flight request instead of starting a second request. A base URL is injected so existing links and `sheet-viewer.js` keep working.
- PDF: clicking creates one PDF attachment containing all page descriptors. The dialog shows the cover immediately, replaces it with page one when decoded, and loads later pages only near the PDF viewport.
- PDF wheel movement scrolls the continuous document. Ctrl or Command plus wheel zooms around the pointer. Toolbar minus, plus, and Fit remain available. Pointer drag pans the PDF document.
- PDF status reports the visible page and total page count. The original file remains available from the top-right link.

## Performance and failure behavior

- A spreadsheet fetch is deduplicated by URL and stored as a promise plus resolved HTML.
- `srcdoc` receives a `<base>` element that resolves paths relative to the original sheet URL.
- A spreadsheet network or iframe error shows the existing error state and leaves the original-file link usable.
- PDF page one failure reports an error. Later-page failure leaves a visible per-page retry/error placeholder without hiding already loaded pages.
- Closing or switching attachments disconnects PDF observers and ignores stale asynchronous completions through the existing render version.

## Verification

- A browser regression test must first fail against the current implementation for continuous PDF pages and preloaded spreadsheet HTML.
- The test then verifies immediate PDF cover content, all pages represented, lazy page loading, vertical scrolling, visible-page status, 10% to 200% zoom, Fit restore, spreadsheet near-viewport prefetch, cached `srcdoc`, and no duplicate sheet request.
- Existing attachment, desktop, mobile, build, and JavaScript syntax checks must remain green.
