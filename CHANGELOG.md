# Changelog

## 4.0.0

- Rebrand as **Yet Another Speed Dial 2** (maintained fork)
- Nested folder support (create folders inside folders, navigate hierarchy)
- Folder tile drag-and-drop reordering improvements
- Host access for thumbnails is optional (`optional_host_permissions`) and requested on add/refresh instead of required `<all_urls>`
- Fix manual screenshot capture: retry after focusing the popup when background `captureVisibleTab` fails
- Fix refresh-thumbnail capture closing the popup on `about:blank` before the site loads; keep the service worker alive during capture
- Strip scripts/iframes from fetched HTML before offscreen DOMParser (avoids extension CSP errors on sites like ya.ru)
- Prefer generated screenshots as the default tile image when available
- Documentation, attribution, and asset cleanup for the fork
- Add Firefox-compatible `background.scripts` fallback for AMO validation
- Drop Chromium-only `offscreen` permission from the shared manifest; run thumbnail DOM parsing inline on Firefox
- Fix Firefox thumbnail capture: avoid `handleMessages` name clash on the shared event page; await processing so the page stays alive
