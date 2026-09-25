'use strict';

const openTabsPanel = document.getElementById('tabsPanel');
const openTabsButton = document.getElementById('openTabsBtn');
const openTabsSearch = document.getElementById('openTabsSearch');
const openTabsGrid = document.getElementById('openTabsGrid');
const openTabsStatus = document.getElementById('openTabsStatus');
const collapsedTabGroups = new Set();
const tabGroupColors = {
    grey: '#80868b', blue: '#1a73e8', red: '#d93025', yellow: '#f9ab00', green: '#188038',
    pink: '#d01884', purple: '#a142f4', cyan: '#007b83', orange: '#fa903e'
};
let openTabsRevision = 0;
let openTabsRefreshTimer;

openTabsButton.title = chrome.i18n.getMessage('openTabs');
openTabsButton.setAttribute('aria-label', openTabsButton.title);
openTabsSearch.setAttribute('aria-label', chrome.i18n.getMessage('searchTabs'));
document.getElementById('closeTabsBtn').title = chrome.i18n.getMessage('closeTabsPanel');
document.getElementById('closeTabsBtn').setAttribute('aria-label', chrome.i18n.getMessage('closeTabsPanel'));

function hideOpenTabs(restoreFocus = false) {
    openTabsPanel.classList.remove('isOpen');
    openTabsPanel.inert = true;
    openTabsButton.setAttribute('aria-expanded', 'false');
    ++openTabsRevision;
    if (restoreFocus) openTabsButton.focus();
}

openTabsButton.addEventListener('click', () => {
    if (!openTabsPanel.inert) return hideOpenTabs(true);
    hideSettings();
    hideSearch();
    openTabsPanel.inert = false;
    openTabsPanel.classList.add('isOpen');
    openTabsButton.setAttribute('aria-expanded', 'true');
    refreshOpenTabs();
    openTabsSearch.focus();
});
document.getElementById('closeTabsBtn').addEventListener('click', () => hideOpenTabs(true));
openTabsSearch.addEventListener('input', refreshOpenTabs);

function queueOpenTabsRefresh() {
    if (openTabsPanel.inert || document.hidden) return;
    clearTimeout(openTabsRefreshTimer);
    openTabsRefreshTimer = setTimeout(refreshOpenTabs, 100);
}

function isSpeedDialNewTab(tab) {
    try {
        const url = new URL(tab.url);
        url.search = '';
        url.hash = '';
        return url.href === chrome.runtime.getURL('index.html')
            || url.href === 'chrome://newtab/' || url.href === 'chrome://newtab';
    } catch (error) {
        return false;
    }
}

async function refreshOpenTabs() {
    if (openTabsPanel.inert) return;
    const revision = ++openTabsRevision;
    try {
        const [ownTab, allTabs, allGroups] = await Promise.all([
            chrome.tabs.getCurrent(), chrome.tabs.query({ windowType: 'normal' }),
            chrome.tabGroups?.query ? chrome.tabGroups.query({}).catch(() => []) : []
        ]);
        const groups = new Map(allGroups.map(group => [group.id, group]));
        const tabs = allTabs.filter(tab => tab.id !== ownTab?.id && !tab.incognito && !isSpeedDialNewTab(tab))
            .sort((first, second) => (first.windowId !== ownTab?.windowId) - (second.windowId !== ownTab?.windowId)
                || first.windowId - second.windowId || first.index - second.index);
        const query = openTabsSearch.value.trim().toLowerCase();
        const visible = tabs.filter(tab => `${tab.title || ''} ${tab.url || ''}`.toLowerCase().includes(query));
        const stored = await chrome.storage.session.get(visible.map(tab => 'tabPreview:' + tab.id));
        if (revision !== openTabsRevision || openTabsPanel.inert) return;
        const fragment = document.createDocumentFragment();
        const windowIds = [...new Set(tabs.map(tab => tab.windowId))];
        let previousWindow;
        let previousGroup;
        let groupGrid;
        for (const tab of visible) {
            if (windowIds.length > 1 && previousWindow !== tab.windowId) {
                const heading = document.createElement('h2');
                heading.textContent = chrome.i18n.getMessage('tabsWindow', String(windowIds.indexOf(tab.windowId) + 1));
                fragment.append(heading);
            }
            const group = groups.get(tab.groupId);
            if (group && (previousGroup !== group.id || previousWindow !== tab.windowId)) {
                const section = document.createElement('details');
                section.className = 'openTabGroup';
                section.open = !!query || !collapsedTabGroups.has(group.id);
                section.style.setProperty('--tab-group-color', tabGroupColors[group.color] || tabGroupColors.grey);
                const heading = document.createElement('summary');
                heading.dataset.groupId = String(group.id);
                heading.textContent = group.title || chrome.i18n.getMessage('unnamedTabGroup');
                heading.title = heading.textContent;
                groupGrid = document.createElement('div');
                groupGrid.className = 'openTabGroupGrid';
                groupGrid.setAttribute('role', 'list');
                section.append(heading, groupGrid);
                section.addEventListener('toggle', () => {
                    if (query || !section.isConnected) return;
                    if (section.open) collapsedTabGroups.delete(group.id);
                    else collapsedTabGroups.add(group.id);
                });
                fragment.append(section);
            }
            previousWindow = tab.windowId;
            previousGroup = group?.id;
            (group ? groupGrid : fragment).append(buildOpenTab(tab, stored['tabPreview:' + tab.id]));
        }
        const focused = document.activeElement;
        const focusedGroup = focused?.dataset?.groupId;
        const focusIndex = [...openTabsGrid.querySelectorAll('button')].indexOf(focused);
        openTabsGrid.replaceChildren(fragment);
        if (focusedGroup) {
            [...openTabsGrid.querySelectorAll('summary')].find(heading => heading.dataset.groupId === focusedGroup)
                ?.focus({ preventScroll: true });
        } else if (focusIndex >= 0) {
            const buttons = [...openTabsGrid.querySelectorAll('button')];
            const replacement = buttons.find(button => button.dataset.tabId === focused.dataset.tabId
                && button.dataset.action === focused.dataset.action) || buttons[Math.min(focusIndex, buttons.length - 1)];
            (replacement || openTabsSearch).focus({ preventScroll: true });
        }
        document.getElementById('openTabsCount').textContent = String(tabs.length);
        openTabsStatus.hidden = visible.length > 0;
        openTabsStatus.textContent = chrome.i18n.getMessage(query ? 'noMatchingTabs' : 'noOpenTabs');
    } catch (error) {
        if (revision !== openTabsRevision) return;
        openTabsStatus.hidden = false;
        openTabsStatus.textContent = chrome.i18n.getMessage('tabsUnavailable');
    }
}

function getOpenTabFavicon(tab, size = 32) {
    const url = new URL(chrome.runtime.getURL('/_favicon/'));
    if (url.protocol !== 'chrome-extension:' || !tab.url) {
        return tab.favIconUrl || 'icons/icon48.png';
    }
    url.searchParams.set('pageUrl', tab.url);
    url.searchParams.set('size', String(size));
    return url.href;
}

function buildOpenTab(tab, preview) {
    const tile = document.createElement('div');
    tile.className = 'openTab';
    tile.setAttribute('role', 'listitem');
    const activate = document.createElement('button');
    activate.type = 'button';
    activate.className = 'openTabActivate';
    activate.dataset.tabId = String(tab.id);
    activate.dataset.action = 'activate';
    activate.title = `${tab.title || tab.url}\n${tab.url || ''}`;
    const picture = document.createElement('span');
    picture.className = 'openTabPreview';
    const hasPreview = preview?.url === tab.url && preview.image;
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.className = hasPreview ? 'openTabScreenshot' : 'openTabFavicon';
    image.src = hasPreview || getOpenTabFavicon(tab, 64);
    image.onerror = () => { image.onerror = null; image.src = 'icons/icon48.png'; image.className = 'openTabFavicon'; };
    picture.append(image);
    const label = document.createElement('span');
    label.className = 'openTabLabel';
    const favicon = document.createElement('img');
    favicon.className = 'openTabTitleIcon';
    favicon.alt = '';
    favicon.width = 16;
    favicon.height = 16;
    favicon.loading = 'lazy';
    favicon.src = getOpenTabFavicon(tab);
    favicon.onerror = () => { favicon.onerror = null; favicon.src = 'icons/icon48.png'; };
    const title = document.createElement('span');
    title.className = 'openTabTitle';
    title.textContent = tab.title || tab.url;
    const hostname = document.createElement('span');
    hostname.className = 'openTabHost';
    try { hostname.textContent = new URL(tab.url).hostname || tab.url; }
    catch (error) { hostname.textContent = tab.url || ''; }
    label.append(title, hostname);
    const details = document.createElement('span');
    details.className = 'openTabDetails';
    details.append(favicon, label);
    activate.append(picture, details);
    activate.addEventListener('click', async () => {
        try {
            await chrome.tabs.update(tab.id, { active: true });
            await chrome.windows.update(tab.windowId, { focused: true });
        } catch (error) { refreshOpenTabs(); }
    });
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'openTabClose';
    close.innerHTML = '&times;';
    close.dataset.tabId = String(tab.id);
    close.dataset.action = 'close';
    close.title = chrome.i18n.getMessage('closeTab', tab.title || tab.url || '');
    close.setAttribute('aria-label', close.title);
    close.addEventListener('click', () => chrome.tabs.remove(tab.id).catch(refreshOpenTabs));
    tile.append(activate, close);
    return tile;
}

for (const event of [chrome.tabs.onCreated, chrome.tabs.onRemoved, chrome.tabs.onMoved,
    chrome.tabs.onAttached, chrome.tabs.onDetached, chrome.tabs.onActivated, chrome.tabs.onReplaced]) {
    event.addListener(queueOpenTabsRefresh);
}
chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.title || change.url || change.favIconUrl || change.status || change.groupId !== undefined) queueOpenTabsRefresh();
});
if (chrome.tabGroups?.query) {
    for (const event of [chrome.tabGroups.onCreated, chrome.tabGroups.onUpdated,
        chrome.tabGroups.onMoved, chrome.tabGroups.onRemoved]) {
        event.addListener(queueOpenTabsRefresh);
    }
}
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && Object.keys(changes).some(key => key.startsWith('tabPreview:'))) queueOpenTabsRefresh();
});
document.addEventListener('visibilitychange', queueOpenTabsRefresh);