# Publishing Yet Another Speed Dial 2

Store submissions must be done from your developer accounts. This repo is prepared for first publish as **new listings** (do not try to update the original author’s items).

## Package

Release zips are built from `src/` (manifest at zip root). Firefox and Chrome need different packages:

- Chromium needs `offscreen` + `background.service_worker` + `js/chromeOffscreen.js`
- Firefox needs `background.scripts` only, and must **not** ship Chrome-only offscreen APIs (AMO warns on them)

From the repo root:

```powershell
pwsh -File scripts/pack-firefox.ps1
pwsh -File scripts/pack-chrome.ps1
```

Outputs (version taken from `src/manifest.json`):

- `dist/yasd2-<version>-firefox.zip`
- `dist/yasd2-<version>-chrome.zip`

Staging folders `dist/firefox-src` and `dist/chrome-src` are also written. For local Chrome unpacked testing, load `dist/chrome-src` after packing (it already includes the `offscreen` permission).

AMO may still warn about `innerHTML` inside vendored `js/lib/*` (jQuery, Coloris); those are expected and non-blocking.

Privacy policy URL for store forms (GitHub Pages from `/docs`):

- https://antgraf.github.io/yet-another-speed-dial-2/privacy.html

(Pages is configured on this repo; the URL goes live after `docs/` is on the default branch.)

## Listing copy (draft)

**Name:** Yet Another Speed Dial 2

**Short description:** Modern privacy-friendly speed dial / new tab page with nested folders. Unofficial maintained fork of Yet Another Speed Dial.

**Long description (outline):**

- Customizable new tab speed dial using native bookmarks (syncs with the browser)
- Nested folders, custom images, search, sorting
- No ads or trackers
- Unofficial fork of Conceptualspace’s Yet Another Speed Dial — not the original store listing
- If you already use the original extension, disable one of them (both override new tab)

**Screenshots to upload:**

- `assets/screenshot.png`
- `assets/screenshot-nested-folders.png`
- Chrome promo tiles: `assets/promo-*.png` (regenerate later if branding looks outdated)

## Firefox (AMO)

1. Create / sign in at https://addons.mozilla.org/developers/
2. Submit a new add-on; upload `dist/yasd2-4.0.0-firefox.zip`
3. Confirm `browser_specific_settings.gecko.id` is `yet-another-speed-dial-2@antgraf`
4. Confirm `gecko.data_collection_permissions.required` is `["none"]` (AMO requires this for new listings; matches the privacy policy — no analytics/backend)
5. Paste privacy policy URL + listing text
6. Paste **Notes to Reviewer** (below). Leave the optional source-code upload empty unless AMO asks — this package is readable source (no minify/bundle of first-party code).
7. After approval, put the AMO URL into README badges

### Notes to Reviewer (Firefox) — paste-ready

AMO’s “Notes to Reviewer” field asks about build processes and [source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/). Separate source is only required when the uploaded package is hard to read (minifiers, webpack, etc.). For YASD2, the zip is `src/` with Chrome-only bits stripped.

```
No minification or bundling of first-party code. The uploaded package is the readable source under src/, packaged with scripts/pack-firefox.ps1 (copy src → strip Chrome-only offscreen/service_worker). Reviewers can treat the XPI contents as the source.

Third-party libraries under js/lib/ are unmodified upstream vendor builds (jQuery, Sortable, TweenMax, Coloris, flexCarousel, browser-polyfill). AMO may flag innerHTML in those vendor files; that is expected and not used for remote code execution.

This is an unofficial maintained fork of Yet Another Speed Dial (Conceptualspace). It stores dials as ordinary browser bookmarks, uses optional host permissions only for thumbnail fetch/capture when the user grants them, and collects no analytics (data_collection_permissions: none).

Repo: https://github.com/antgraf/yet-another-speed-dial-2
```

## Chrome Web Store

1. Pay the one-time developer fee if needed: https://chrome.google.com/webstore/devconsole
2. **Add new item** (new ID — do not update `imohnlganmafcmidafklgkgfgaagiohn`)
3. Upload `dist/yasd2-4.0.0-chrome.zip`; complete Privacy practices (paste the fields below)
4. **Settings:** enter and verify the publisher contact email
5. Certify data usage complies with Developer Program Policies (checkbox on Privacy practices)
6. After publish, update README badge with the new item ID URL

Brave / Vivaldi / Opera Chromium users can install from the Chrome listing (optional separate Opera addons listing later).

### Privacy practices (Chrome) — paste-ready

Privacy policy URL: https://antgraf.github.io/yet-another-speed-dial-2/privacy.html

**Single purpose description**

```
Provides a customizable new tab speed dial page that displays and manages sites as bookmarks (including nested folders), with local thumbnail caching and appearance settings. No unrelated features.
```

**Permission justifications**

`bookmarks`

```
Required to read and write the user's Speed Dial bookmarks folder so tiles can be created, edited, reordered, deleted, and organized into folders (including nested folders). Speed dials are stored as ordinary browser bookmarks so they sync with the browser when the user enables bookmark sync.
```

`contextMenus`

```
Adds a right-click "Add to Speed Dial" menu item on web pages so users can bookmark the current page into their speed dial without opening the new tab page first.
```

`optional_host_permission` (`<all_urls>`)

```
Requested at runtime when the user adds a dial or refreshes thumbnails (toolbar button, context menu, new-tab UI). Used to fetch Open Graph / page images and related assets from sites the user has added, and to captureVisibleTab for screenshots. Requests go only to those sites (or their CDNs); there is no YASD2 backend. Broad optional host access is needed because users can add any URL. The extension works without it (dials still save); automatic thumbnails require the user to grant access.
```

`offscreen` (Chrome package only)

```
Manifest V3 service workers cannot parse DOM. An offscreen document (reason: DOM_PARSER) fetches and parses bookmarked pages to extract images/metadata used as thumbnails, without opening visible tabs for every refresh. Firefox uses a background event page instead and does not declare this permission.
```

`storage`

```
Stores user appearance/settings and cached thumbnail image data locally via chrome.storage so the new tab page stays fast and settings persist across sessions. Data stays in the browser unless the user enables browser sync of extension data.
```

`tabs`

```
Used to open dials in new or current tabs, capture a screenshot of the active/popup tab when generating a thumbnail, and (on Opera) redirect the start page to the extension new tab UI. Not used to read or transmit browsing history.
```

`unlimitedStorage`

```
Thumbnail caches (especially user-uploaded or multi-image dials) can exceed the default extension storage quota. unlimitedStorage allows reliable local caching of those images without eviction; data remains on-device.
```

**Remote code**

Select: **No, I am not using remote code.**

Optional note if a text field still appears:

```
This extension does not execute remote code. All JavaScript is bundled in the package (including vendor libraries under js/lib/). Network fetch is used only to retrieve page HTML/images for thumbnail generation, not to download or run scripts.
```

**Data usage / certification**

- Does not sell user data to third parties
- Does not use or transfer user data for purposes unrelated to the single purpose
- Does not use or transfer user data to determine creditworthiness / for lending
- Certify compliance with Developer Program Policies (required checkbox)

User data disclosure (typical for this extension): bookmarks and website content (for thumbnails) are used only locally to provide the speed dial; no account, analytics, or YASD2 server.

## Microsoft Edge Add-ons

1. https://partner.microsoft.com/dashboard/microsoftedge/overview
2. New submission with the same zip and listing text
3. Edge assigns its own extension ID

## After all three are live

1. Replace the “Store listings coming soon” note in `README.md` with badge links (assets already in `assets/badges/`)
2. Tag `v4.0.0` on GitHub and attach the zip
3. Bump `version` in `src/manifest.json` for each subsequent release

## Upstream

Keep the original as a second remote to pull fixes:

```powershell
git remote add upstream https://github.com/conceptualspace/yet-another-speed-dial.git
git fetch upstream
```
