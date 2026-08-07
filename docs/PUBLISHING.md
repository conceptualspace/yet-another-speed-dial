# Publishing Yet Another Speed Dial 2

Store submissions must be done from your developer accounts. This repo is prepared for first publish as **new listings** (do not try to update the original author’s items).

## Package

A release zip is built from `src/` (manifest at zip root):

```powershell
New-Item -ItemType Directory -Force dist | Out-Null
if (Test-Path dist\yasd2-4.0.0.zip) { Remove-Item dist\yasd2-4.0.0.zip }
Compress-Archive -Path src\* -DestinationPath dist\yasd2-4.0.0.zip
```

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
2. Submit a new add-on; upload `dist/yasd2-4.0.0.zip`
3. Confirm `browser_specific_settings.gecko.id` is `yet-another-speed-dial-2@antgraf`
4. Paste privacy policy URL + listing text
5. After approval, put the AMO URL into README badges

## Chrome Web Store

1. Pay the one-time developer fee if needed: https://chrome.google.com/webstore/devconsole
2. **Add new item** (new ID — do not update `imohnlganmafcmidafklgkgfgaagiohn`)
3. Upload the zip; complete privacy practices (bookmarks, storage, host permissions for thumbnails)
4. Single purpose: new tab / bookmark speed dial
5. After publish, update README badge with the new item ID URL

Brave / Vivaldi / Opera Chromium users can install from the Chrome listing (optional separate Opera addons listing later).

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
