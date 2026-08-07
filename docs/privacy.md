# Privacy Policy — Yet Another Speed Dial 2

**Last updated:** 2026-08-07

Yet Another Speed Dial 2 (“the extension”) is a browser new-tab / speed-dial extension. This page describes what data it uses.

## Summary

- No accounts, no analytics, no ads, no trackers.
- Your speed dials are stored as ordinary browser bookmarks.
- Settings and thumbnail images are stored locally in the browser (and may sync via the browser’s own sync if you enable it).
- The extension does not sell or share personal data with third parties.

## Data the extension uses

### Bookmarks

The extension reads and writes bookmarks in a Speed Dial folder so tiles can be created, edited, reordered, and organized into folders (including nested folders). Bookmark data stays in your browser (and your browser vendor’s sync, if enabled).

### Settings and thumbnails

Appearance settings and cached thumbnail images are stored using the browser’s extension storage APIs (`storage` / `unlimitedStorage`). This data remains on your device unless your browser syncs extension data.

### Network access

To build or refresh thumbnails, the extension may request pages or images from the sites you add. Host access is optional and requested when you add a dial or refresh thumbnails. Those requests go to the sites themselves (or their CDNs), not to a YASD2 backend. There is no YASD2 server collecting browsing data. Without granting access, dials still work; automatic thumbnail capture is skipped.

### Tabs and context menus

Permissions for tabs and context menus are used so you can add the current page to the speed dial and open tiles in new tabs/windows as expected.

## What we do not collect

- No usage analytics
- No advertising identifiers
- No personal profiles on a YASD2 server (there is none)

## Children

The extension is not directed at children and does not knowingly collect personal information from children.

## Changes

If this policy changes, the date at the top of this page will be updated. Material changes will also be noted in the repository changelog when practical.

## Contact

Questions about this policy or the fork: open an issue at  
https://github.com/antgraf/yet-another-speed-dial-2/issues

## Attribution

Yet Another Speed Dial 2 is an unofficial maintained fork of [Yet Another Speed Dial](https://github.com/conceptualspace/yet-another-speed-dial) by Conceptualspace.
