const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

function event() {
    return { listeners: [], addListener(callback) { this.listeners.push(callback); } };
}

function mockChrome() {
    const stored = {};
    return {
        stored,
        i18n: { getMessage: (key, substitution) => key + (substitution || '') },
        storage: { onChanged: event(), session: {
            get: async key => key === null ? { ...stored } : Object.fromEntries(
                (Array.isArray(key) ? key : [key]).map(name => [name, stored[name]])),
            set: async values => Object.assign(stored, values),
            remove: async key => { delete stored[key]; },
            getBytesInUse: async key => key ? stored[key]?.bytes || 0
                : Object.values(stored).reduce((sum, value) => sum + (value.bytes || 0), 0)
        } },
        windows: { onFocusChanged: event(), getLastFocused: async () => ({ id: 1, focused: true, type: 'normal' }) },
        tabs: Object.fromEntries(['onCreated', 'onRemoved', 'onUpdated', 'onMoved', 'onAttached',
            'onDetached', 'onActivated', 'onReplaced'].map(name => [name, event()]))
    };
}

test('preview capture: before panel opens, cooldown, privacy, invalidation, queue guard and eviction', async () => {
    const chrome = mockChrome();
    const tab = { id: 7, windowId: 1, active: true, url: 'https://example.com/', status: 'complete' };
    let captures = 0;
    let invalidate = false;
    let scheduledCapture;
    chrome.tabs.query = async () => [tab];
    chrome.tabs.get = async () => tab;
    chrome.tabs.captureVisibleTab = async () => {
        captures++;
        if (invalidate) vm.runInContext('++previewGeneration', context);
        return 'data:image/jpeg;base64,AA==';
    };
    const context = vm.createContext({
        chrome, clearTimeout, Date, Uint8Array, btoa,
        setTimeout(callback, delay) {
            if (delay === 900) {
                scheduledCapture = callback;
                return 0;
            }
            return setTimeout(callback, delay);
        },
        fetch: async () => ({ blob: async () => ({}) }),
        createImageBitmap: async () => ({ width: 1200, height: 800, close() {} }),
        OffscreenCanvas: class {
            constructor(width, height) { this.width = width; this.height = height; }
            getContext() { return { drawImage() {} }; }
            async convertToBlob() { return { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }; }
        }
    });
    vm.runInContext(readFileSync('src/js/tabPreviews.js', 'utf8'), context);
    const capture = () => vm.runInContext('captureTabPreview(previewGeneration)', context);
    tab.incognito = true;
    await capture();
    assert.equal(captures, 0);
    tab.incognito = false;
    assert.deepEqual(chrome.stored, {});
    chrome.tabs.onActivated.listeners[0]({ tabId: tab.id, windowId: tab.windowId });
    chrome.tabs.onUpdated.listeners[0](tab.id, { status: 'complete' }, tab);
    assert.equal(typeof scheduledCapture, 'function');
    await scheduledCapture();
    assert.equal(chrome.stored['tabPreview:7'].url, tab.url);
    await capture();
    assert.equal(captures, 1);
    chrome.tabs.onRemoved.listeners[0](7);
    assert.equal(chrome.stored['tabPreview:7'], undefined);
    invalidate = true;
    await capture();
    assert.equal(chrome.stored['tabPreview:7'], undefined);
    tab.active = false;
    context.expectedTab = { ...tab };
    await assert.rejects(vm.runInContext('captureVisibleWindow(1, undefined, expectedTab)', context), /Tab changed/);
    assert.equal(captures, 2);
    chrome.stored['tabPreview:8'] = { capturedAt: 1, bytes: 4 * 1024 * 1024 };
    chrome.stored['tabPreview:9'] = { capturedAt: 2, bytes: 3 * 1024 * 1024 };
    await vm.runInContext('trimTabPreviews(1000)', context);
    assert.equal(chrome.stored['tabPreview:8'], undefined);
    assert.ok(chrome.stored['tabPreview:9']);
    chrome.tabs.onUpdated.listeners[0](9, { url: 'https://new.example/' }, { active: false });
    assert.equal(chrome.stored['tabPreview:9'], undefined);
});

test('tab list: ordering, filtering, duplicate URLs, activation and independent closure', async () => {
    const chrome = mockChrome();
    const elements = new Map();
    class Element {
        constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.listeners = {}; this.value = ''; }
        setAttribute() {}
        addEventListener(name, callback) { this.listeners[name] = callback; }
        append(...children) { this.children.push(...children); }
        replaceChildren(fragment) { this.children = fragment.children; }
        querySelectorAll(tag) { return this.children.flatMap(child =>
            [...(child.tag === tag ? [child] : []), ...child.querySelectorAll(tag)]); }
    }
    const document = {
        getElementById(id) { if (elements.has(id) === false) elements.set(id, new Element('div')); return elements.get(id); },
        createElement: tag => new Element(tag), createDocumentFragment: () => new Element('fragment'),
        addEventListener() {}, activeElement: null
    };
    const tabs = [
        { id: 1, windowId: 1, index: 0, url: 'chrome-extension://own/index.html' },
        { id: 4, windowId: 2, index: 0, title: 'Other window', url: 'https://other.example/' },
        { id: 3, windowId: 1, index: 2, title: 'Second document', url: 'https://same.example/' },
        { id: 2, windowId: 1, index: 1, title: '<b>First document</b>', url: 'https://same.example/' },
        { id: 5, windowId: 3, index: 0, incognito: true, title: 'Private', url: 'https://private.example/' }
    ];
    chrome.tabs.getCurrent = async () => tabs[0];
    chrome.tabs.query = async () => tabs;
    const actions = [];
    chrome.tabs.update = async (id, options) => actions.push(['activate', id, options.active]);
    chrome.windows.update = async (id, options) => actions.push(['focus', id, options.focused]);
    chrome.tabs.remove = async id => actions.push(['close', id]);
    chrome.stored['tabPreview:2'] = { url: 'https://old.example/', image: 'stale-image' };
    chrome.stored['tabPreview:3'] = { url: tabs[2].url, image: 'current-image' };
    const context = vm.createContext({ chrome, document, URL, setTimeout, clearTimeout });
    vm.runInContext(readFileSync('src/js/openTabs.js', 'utf8'), context);
    await vm.runInContext('refreshOpenTabs()', context);
    const grid = elements.get('openTabsGrid');
    let tiles = grid.children.filter(child => child.className === 'openTab');
    assert.deepEqual(tiles.map(tile => tile.children[0].dataset.tabId), ['2', '3', '4']);
    assert.equal(elements.get('openTabsCount').textContent, '3');
    assert.equal(tiles[0].children[0].children[1].textContent, '<b>First document</b>');
    assert.equal(tiles[0].children[0].children[0].children[0].src, 'icons/icon48.png');
    assert.equal(tiles[1].children[0].children[0].children[0].src, 'current-image');
    await tiles[0].children[0].listeners.click();
    await tiles[0].children[1].listeners.click();
    assert.deepEqual(actions, [['activate', 2, true], ['focus', 1, true], ['close', 2]]);
    elements.get('openTabsSearch').value = 'SECOND';
    await vm.runInContext('refreshOpenTabs()', context);
    tiles = grid.children.filter(child => child.className === 'openTab');
    assert.equal(tiles.length, 1);
    assert.equal(tiles[0].children[0].dataset.tabId, '3');
    elements.get('openTabsSearch').value = 'missing';
    await vm.runInContext('refreshOpenTabs()', context);
    assert.equal(elements.get('openTabsStatus').hidden, false);
    assert.equal(elements.get('openTabsStatus').textContent, 'noMatchingTabs');
});