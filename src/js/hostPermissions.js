// yet another speed dial
// copyright 2026 antgraf
// absolutely no warranty is expressed or implied

'use strict';

const YASD_HOST_PERMISSION = { origins: ['<all_urls>'] };

async function hasHostPermission() {
    return chrome.permissions.contains(YASD_HOST_PERMISSION);
}

/**
 * Request broad host access for thumbnail fetch / screenshots.
 * Must run from a user gesture to show the browser prompt.
 * If already granted, resolves true with no UI.
 */
async function ensureHostPermission() {
    try {
        return await chrome.permissions.request(YASD_HOST_PERMISSION);
    } catch (err) {
        console.warn('Host permission request failed:', err);
        return false;
    }
}
