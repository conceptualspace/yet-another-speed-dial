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
        runtime: { getURL: path => new URL(path, 'chrome-extension://test/').href },
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
        if (invalidate) chrome.tabs.onRemoved.listeners[0](tab.id);
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
    const originalCapture = scheduledCapture;
    chrome.tabs.onRemoved.listeners[0](99);
    assert.notEqual(scheduledCapture, originalCapture);
    await originalCapture();
    assert.equal(captures, 0);
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

test('tab panel context menus stay native without changing the bookmark menu', () => {
    const source = readFileSync('src/js/index.js', 'utf8');
    const start = source.indexOf('document.addEventListener("contextmenu"');
    const end = source.indexOf('// todo: tidy this up', start);
    assert.ok(start >= 0 && end > start);
    let handler;
    let prevented = 0;
    let hidden = 0;
    let menusShown = 0;
    const document = { body: {}, addEventListener(name, callback) { handler = callback; } };
    const context = vm.createContext({
        document,
        hideSettings() { hidden++; },
        settingsMenu: {},
        showContextMenu() { menusShown++; }
    });
    vm.runInContext(source.slice(start, end), context);
    for (const target of [
        { id: 'openTabsSearch', type: 'search' },
        { className: 'openTabTitle' },
        { id: 'tabsPanel' }
    ]) {
        target.closest = selector => selector === '#tabsPanel' ? {} : null;
        handler({ target, preventDefault() { prevented++; } });
    }
    assert.equal(prevented, 0);
    assert.equal(hidden, 0);
    assert.equal(menusShown, 0);
    document.body.closest = () => null;
    handler({ target: document.body, pageX: 10, pageY: 20, preventDefault() { prevented++; } });
    assert.equal(prevented, 1);
    assert.equal(hidden, 1);
    assert.equal(menusShown, 1);
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
        { id: 1, windowId: 1, index: 0, url: 'chrome-extension://test/index.html' },
        { id: 4, windowId: 2, index: 0, title: 'Other window', url: 'https://other.example/' },
        { id: 3, windowId: 1, index: 2, title: 'Second document', url: 'https://same.example/', favIconUrl: 'https://same.example/favicon.ico' },
        { id: 2, windowId: 1, index: 1, title: '<b>First document</b>', url: 'https://same.example/' },
        { id: 5, windowId: 3, index: 0, incognito: true, title: 'Private', url: 'https://private.example/' },
        { id: 6, windowId: 1, index: 3, url: 'chrome-extension://test/index.html' },
        { id: 7, windowId: 2, index: 1, url: 'chrome-extension://test/index.html?folder=123' },
        { id: 8, windowId: 4, index: 0, url: 'chrome-extension://test/index.html#folder-123' },
        { id: 9, windowId: 4, index: 1, url: 'chrome-extension://test/index.html?folder=123#folder-123' },
        { id: 10, windowId: 4, index: 2, url: 'chrome://newtab/' },
        { id: 11, windowId: 4, index: 3, url: 'chrome://newtab/?folder=123#folder-123' },
        { id: 12, windowId: 4, index: 4, url: 'chrome://newtab' }
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
    assert.equal(grid.children.filter(child => child.tag === 'h2').length, 2);
    const firstDetails = tiles[0].children[0].children[1];
    const firstLabel = firstDetails.children[0];
    assert.equal(firstDetails.className, 'openTabDetails');
    assert.equal(firstLabel.className, 'openTabLabel');
    assert.equal(firstLabel.children[1].textContent, '<b>First document</b>');
    assert.equal(firstDetails.children[1].className, 'openTabHost');
    assert.equal(firstDetails.children[1].textContent, 'same.example');
    const titleIcon = tiles[1].children[0].children[1].children[0].children[0];
    const faviconUrl = new URL(titleIcon.src);
    assert.equal(faviconUrl.protocol, 'chrome-extension:');
    assert.equal(faviconUrl.host, 'test');
    assert.equal(faviconUrl.pathname, '/_favicon/');
    assert.equal(faviconUrl.searchParams.get('pageUrl'), 'https://same.example/');
    assert.equal(faviconUrl.searchParams.get('size'), '32');
    assert.equal(firstLabel.children[0].src, titleIcon.src);
    assert.equal(titleIcon.alt, '');
    assert.equal(titleIcon.width, 16);
    assert.equal(titleIcon.height, 16);
    titleIcon.onerror();
    assert.equal(titleIcon.src, 'icons/icon48.png');
    assert.equal(titleIcon.onerror, null);
    const placeholder = tiles[0].children[0].children[0].children[0];
    const placeholderUrl = new URL(placeholder.src);
    assert.equal(placeholderUrl.searchParams.get('pageUrl'), 'https://same.example/');
    assert.equal(placeholderUrl.searchParams.get('size'), '64');
    placeholder.onerror();
    assert.equal(placeholder.src, 'icons/icon48.png');
    assert.equal(placeholder.onerror, null);
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

    for (const url of ['chrome-extension://other/index.html', 'chrome-extension://test/updated.html',
        'chrome-extension://test/index.html.backup', 'chrome://settings/', 'chrome://newtab/other',
        'chrome://newtab-other/', 'https://newtab/', 'https://example.com/index.html', undefined]) {
        context.candidateTab = { url };
        assert.equal(vm.runInContext('isSpeedDialNewTab(candidateTab)', context), false);
    }
    elements.get('openTabsSearch').value = '';
    chrome.tabs.query = async () => tabs.filter(tab => tab.id === 1 || tab.id >= 6);
    await vm.runInContext('refreshOpenTabs()', context);
    assert.equal(grid.children.length, 0);
    assert.equal(elements.get('openTabsCount').textContent, '0');
    assert.equal(elements.get('openTabsStatus').textContent, 'noOpenTabs');

    context.faviconTab = { url: 'https://example.com/?first=1&next=2#section', favIconUrl: 'https://example.com/icon.png' };
    const encodedUrl = new URL(vm.runInContext('getOpenTabFavicon(faviconTab)', context));
    assert.equal(encodedUrl.searchParams.get('pageUrl'), context.faviconTab.url);
    chrome.runtime.getURL = path => new URL(path, 'moz-extension://test/').href;
    context.candidateTab = { url: 'moz-extension://test/index.html?folder=123#folder-123' };
    assert.equal(vm.runInContext('isSpeedDialNewTab(candidateTab)', context), true);
    context.candidateTab = { url: 'moz-extension://other/index.html' };
    assert.equal(vm.runInContext('isSpeedDialNewTab(candidateTab)', context), false);
    assert.equal(vm.runInContext('getOpenTabFavicon(faviconTab)', context), context.faviconTab.favIconUrl);
    assert.equal(vm.runInContext('getOpenTabFavicon({})', context), 'icons/icon48.png');
    const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'));
    assert.ok(manifest.permissions.includes('favicon'));
});