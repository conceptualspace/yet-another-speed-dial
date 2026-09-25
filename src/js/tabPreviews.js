'use strict';

let captureQueue = Promise.resolve();
let lastWindowCapture = 0;
let previewTimer;
let previewGeneration = 0;
const TAB_PREVIEW_PREFIX = 'tabPreview:';

function captureVisibleWindow(windowId, options, expectedTab) {
    const capture = captureQueue.then(async () => {
        const delay = Math.max(0, 650 - (Date.now() - lastWindowCapture));
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        if (expectedTab) {
            const current = await chrome.tabs.get(expectedTab.id);
            if (!current.active || current.windowId !== expectedTab.windowId || current.url !== expectedTab.url) {
                throw new Error('Tab changed before capture');
            }
        }
        lastWindowCapture = Date.now();
        return chrome.tabs.captureVisibleTab(windowId, options);
    });
    captureQueue = capture.catch(() => {});
    return capture;
}

function scheduleTabPreview() {
    clearTimeout(previewTimer);
    const generation = ++previewGeneration;
    previewTimer = setTimeout(() => captureTabPreview(generation).catch(() => {}), 900);
}

async function captureTabPreview(generation) {
    if (generation !== previewGeneration) return;
    const window = await chrome.windows.getLastFocused();
    if (!window.focused || window.type !== 'normal') return;
    const [tab] = await chrome.tabs.query({ active: true, windowId: window.id });
    if (!tab || tab.incognito || tab.discarded || tab.status !== 'complete' || !/^https?:/.test(tab.url)) return;
    const key = TAB_PREVIEW_PREFIX + tab.id;
    const previous = (await chrome.storage.session.get(key))[key];
    if (previous?.url === tab.url && Date.now() - previous.capturedAt < 10000) return;

    const screenshot = await captureVisibleWindow(tab.windowId, { format: 'jpeg', quality: 80 }, tab);
    const bitmap = await createImageBitmap(await (await fetch(screenshot)).blob());
    const canvas = new OffscreenCanvas(440, 248);
    const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
    canvas.getContext('2d').drawImage(bitmap, (canvas.width - bitmap.width * scale) / 2, 0,
        bitmap.width * scale, bitmap.height * scale);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const image = 'data:image/webp;base64,' + btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
    const current = await chrome.tabs.get(tab.id);
    if (generation !== previewGeneration || !current.active || current.url !== tab.url) return;

    await trimTabPreviews(image.length * 2);
    if (generation !== previewGeneration) return;
    await chrome.storage.session.set({ [key]: { url: tab.url, image, capturedAt: Date.now() } });
}

async function trimTabPreviews(incomingBytes) {
    const budget = 6 * 1024 * 1024;
    let used = await chrome.storage.session.getBytesInUse(null);
    if (used + incomingBytes <= budget) return;
    const stored = await chrome.storage.session.get(null);
    const entries = Object.entries(stored).filter(([key]) => key.startsWith(TAB_PREVIEW_PREFIX))
        .sort((first, second) => first[1].capturedAt - second[1].capturedAt);
    for (const [key] of entries) {
        const size = await chrome.storage.session.getBytesInUse(key);
        await chrome.storage.session.remove(key);
        used -= size;
        if (used + incomingBytes <= budget) break;
    }
}

chrome.tabs.onActivated.addListener(scheduleTabPreview);
chrome.windows.onFocusChanged.addListener(scheduleTabPreview);
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (change.url || change.status === 'loading') {
        chrome.storage.session.remove(TAB_PREVIEW_PREFIX + tabId).catch(() => {});
    }
    if (tab.active && (change.url || change.status)) scheduleTabPreview();
});
chrome.tabs.onRemoved.addListener(tabId => {
    scheduleTabPreview();
    chrome.storage.session.remove(TAB_PREVIEW_PREFIX + tabId).catch(() => {});
});