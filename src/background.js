// yet another speed dial
// copyright 2019 dev@conceptualspace.net
// absolutely no warranty is expressed or implied

'use strict';

const THUMBNAIL_SOURCE = Object.freeze({
    AUTO: 'auto',
    FRESH_POPUP: 'fresh-popup',
    NETWORK: 'network'
});
const MAX_LIVE_IMAGE_CANDIDATES = 16;
const PENDING_TAB_SOURCE_TTL = 10000;
const THUMBNAIL_JOB_TTL = 45000;
const pendingTabSources = new Map();
const activeThumbnailJobs = new Map();
let thumbnailJobSequence = 0;


// LIVE PAGE EXTRACTION //

function normalizePageUrl(url) {
    try {
        const normalized = new URL(url);
        normalized.hash = '';
        return normalized.href;
    } catch (err) {
        return null;
    }
}

function canInspectPageUrl(url) {
    try {
        const protocol = new URL(url).protocol;
        return protocol === 'http:' || protocol === 'https:';
    } catch (err) {
        return false;
    }
}

// This function is serialized by chrome.scripting and runs in the page. Keep it
// self-contained: it cannot close over values from the service worker.
function collectLivePageSnapshot(maxCandidates) {
    const candidates = [];
    const seen = new Set();
    const baseUrl = document.baseURI;

    function toAbsoluteUrl(value) {
        if (!value) return null;

        try {
            const absoluteUrl = new URL(value, baseUrl);
            if (absoluteUrl.protocol === 'http:' || absoluteUrl.protocol === 'https:') {
                return absoluteUrl.href;
            }
            if (absoluteUrl.protocol === 'data:' && absoluteUrl.href.startsWith('data:image/')) {
                return absoluteUrl.href;
            }
        } catch (err) {
            return null;
        }

        return null;
    }

    function addCandidate(value) {
        if (candidates.length >= maxCandidates) return;

        const imageUrl = toAbsoluteUrl(value);
        if (!imageUrl || imageUrl.length > 500000 || seen.has(imageUrl)) return;
        seen.add(imageUrl);
        candidates.push(imageUrl);
    }

    function getLinkSize(link) {
        const sizes = link.getAttribute('sizes') || '';
        let largest = 0;
        for (const size of sizes.matchAll(/(\d+)x(\d+)/gi)) {
            largest = Math.max(largest, Number(size[1]) * Number(size[2]));
        }
        return largest;
    }

    for (const meta of document.querySelectorAll('meta[property="og:image"], meta[name="og:image"]')) {
        addCandidate(meta.getAttribute('content'));
    }

    for (const meta of document.querySelectorAll('meta[itemprop="image"]')) {
        addCandidate(meta.getAttribute('content'));
    }

    const iconLinks = Array.from(document.querySelectorAll('link[rel~="apple-touch-icon"], link[rel~="icon"]'));
    iconLinks.sort((a, b) => getLinkSize(b) - getLinkSize(a));
    for (const icon of iconLinks) {
        addCandidate(icon.getAttribute('href'));
    }

    const amazonImages = Array.from(document.querySelectorAll('#main-image-container img'));
    const amazonImage = amazonImages.find(image => image.id !== 'sitbLogoImg');
    if (amazonImage) {
        addCandidate(amazonImage.currentSrc || amazonImage.src);
    }

    const meaningfulImages = Array.from(document.images)
        .filter(image => {
            const source = image.currentSrc || image.src || '';
            const filtered = source.includes('fxxj3ttftm5ltcqnto1o4baovyl') || source.includes('nav-sprite-global');
            return !filtered && image.complete && image.naturalWidth >= 64 && image.naturalHeight >= 64;
        })
        .map(image => {
            const rect = image.getBoundingClientRect();
            const visible = rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
            return {
                image,
                score: (visible ? 100000000 : 0) + (rect.width * rect.height) + (image.naturalWidth * image.naturalHeight)
            };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);

    for (const item of meaningfulImages) {
        addCandidate(item.image.currentSrc || item.image.src);
    }

    const hostnameParts = location.hostname.split('.');
    const hostnameLabel = (hostnameParts.length >= 2 ? hostnameParts[hostnameParts.length - 2] : hostnameParts[0]).toLowerCase();
    for (const svg of document.querySelectorAll('svg')) {
        const label = (svg.getAttribute('aria-label') || '').toLowerCase();
        const className = (svg.getAttribute('class') || '').toLowerCase();
        const id = (svg.id || '').toLowerCase();
        const width = Number.parseInt(svg.getAttribute('width') || '0', 10);
        if (!label.includes(hostnameLabel) && !className.includes('logo') && !id.includes('logo') && width < 96) continue;

        try {
            const svgText = new XMLSerializer().serializeToString(svg);
            addCandidate(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`);
        } catch (err) {
            // Ignore SVGs that cannot be serialized.
        }
        break;
    }

    if (candidates.length < maxCandidates) {
        let inspected = 0;
        let backgroundCount = 0;
        for (const element of document.querySelectorAll('body *')) {
            if (inspected++ >= 600 || backgroundCount >= 4 || candidates.length >= maxCandidates) break;

            const rect = element.getBoundingClientRect();
            if (rect.width < 64 || rect.height < 64 || rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) continue;

            const backgroundImage = getComputedStyle(element).backgroundImage;
            if (!backgroundImage || backgroundImage === 'none') continue;
            for (const match of backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
                const previousLength = candidates.length;
                addCandidate(match[1]);
                if (candidates.length > previousLength) backgroundCount++;
                if (backgroundCount >= 4 || candidates.length >= maxCandidates) break;
            }
        }
    }

    const manifestLink = document.querySelector('link[rel="manifest"]');
    return {
        documentUrl: location.href,
        candidates,
        manifestUrl: manifestLink ? toAbsoluteUrl(manifestLink.getAttribute('href')) : null
    };
}

async function extractLivePageSnapshot(tabId, expectedUrl, allowRedirect = false) {
    if (!chrome.scripting || typeof chrome.scripting.executeScript !== 'function' || !canInspectPageUrl(expectedUrl)) {
        return null;
    }

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId, allFrames: false },
            func: collectLivePageSnapshot,
            args: [MAX_LIVE_IMAGE_CANDIDATES]
        });
        const snapshot = results && results[0] ? results[0].result : null;
        if (!snapshot || !Array.isArray(snapshot.candidates) || !snapshot.documentUrl) return null;

        if (!allowRedirect && normalizePageUrl(snapshot.documentUrl) !== normalizePageUrl(expectedUrl)) {
            return null;
        }

        return snapshot;
    } catch (err) {
        console.warn('Unable to inspect live page for thumbnails:', err);
        return null;
    }
}

async function findMatchingTab(url) {
    const normalizedUrl = normalizePageUrl(url);
    if (!normalizedUrl) return null;

    const tabs = await chrome.tabs.query({});
    const matches = tabs.filter(tab => tab.id && normalizePageUrl(tab.url) === normalizedUrl);
    matches.sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        if (a.status !== b.status) return a.status === 'complete' ? -1 : 1;
        return (b.lastAccessed || 0) - (a.lastAccessed || 0);
    });
    return matches[0] || null;
}

function rememberPendingTabSource(tab) {
    const key = normalizePageUrl(tab && tab.url);
    if (!key || !tab.id) return;
    const source = { tabId: tab.id, createdAt: Date.now() };
    pendingTabSources.set(key, source);
    setTimeout(() => {
        if (pendingTabSources.get(key) === source) pendingTabSources.delete(key);
    }, PENDING_TAB_SOURCE_TTL);
}

function clearPendingTabSource(url) {
    const key = normalizePageUrl(url);
    if (key) pendingTabSources.delete(key);
}

function consumePendingTabSource(url) {
    const key = normalizePageUrl(url);
    if (!key) return null;

    const pending = pendingTabSources.get(key);
    pendingTabSources.delete(key);
    if (!pending || Date.now() - pending.createdAt > PENDING_TAB_SOURCE_TTL) return null;
    return pending.tabId;
}

function beginThumbnailJob(url, deduplicate) {
    const key = normalizePageUrl(url) || url;
    const existing = activeThumbnailJobs.get(key);
    if (deduplicate && existing && Date.now() - existing.startedAt < THUMBNAIL_JOB_TTL) {
        return null;
    }
    if (existing) activeThumbnailJobs.delete(key);

    const job = {
        id: `${Date.now()}-${++thumbnailJobSequence}`,
        key,
        deduplicate,
        startedAt: Date.now()
    };
    if (deduplicate) {
        activeThumbnailJobs.set(key, job);
        setTimeout(() => {
            if (activeThumbnailJobs.get(key) === job) activeThumbnailJobs.delete(key);
        }, THUMBNAIL_JOB_TTL);
    }
    return job;
}

function completeThumbnailJob(url, jobId) {
    if (!jobId) return;

    const key = normalizePageUrl(url) || url;
    const current = activeThumbnailJobs.get(key);
    if (current && current.id === jobId) activeThumbnailJobs.delete(key);
}

async function captureTabScreenshot(tabId, expectedUrl) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab.active || normalizePageUrl(tab.url) !== normalizePageUrl(expectedUrl)) return null;
        return await chrome.tabs.captureVisibleTab(tab.windowId);
    } catch (err) {
        console.warn('Unable to capture live tab screenshot:', err);
        return null;
    }
}


// EVENT LISTENERS //

// firefox triggers 'moved' for bookmarks saved to different folder than default
// firefox triggers 'changed' for bookmarks created manually todo: confirm
// chrome triggers 'created' for bookmarks created manually in bookmark mgr
chrome.bookmarks.onMoved.addListener(handleBookmarkChanged);
chrome.bookmarks.onChanged.addListener(handleBookmarkChanged);
chrome.bookmarks.onCreated.addListener(handleBookmarkChanged);
chrome.bookmarks.onRemoved.addListener(handleBookmarkRemoved);

chrome.action.onClicked.addListener(handleBrowserAction);
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

chrome.runtime.onMessage.addListener(handleMessages);
chrome.runtime.onInstalled.addListener(handleInstalled);

// Add tab listeners for Opera and browsers that don't support chrome_url_overrides
if (isOpera()) { chrome.tabs.onCreated.addListener(handleTabCreated); }


// EVENT HANDLERS //

async function handleMessages(message) {
	// Return early if this message isn't meant for the worker
	if (message.target !== 'background') {
	  return;
	}
  
	// Dispatch the message to an appropriate handler.
	switch (message.type) {
		case 'refreshThumbs':
			handleManualRefresh(message.data);
			break;
		case 'refreshAllThumbs':
			handleRefreshAll(message.data);
			break;
		case 'saveThumbnails':
			handleOffscreenFetchDone(message.data, message.forcePageReload);
			break;
		case 'toggleBookmarkCreatedListener':
			toggleBookmarkCreatedListener(message.data);
			break;
		case 'getThumbs':
			handleGetThumbs(message.data);
			break;
		default:
			console.warn(`Unexpected message type received: '${message.type}'.`);
			break;
	}
}

async function handleGetThumbs(data, batchSize = 50) {
    let bookmarks = data.filter(bookmark => bookmark.url?.startsWith("http") || bookmark.url?.startsWith("file:") || bookmark.url?.startsWith("chrome:"));

    if (!bookmarks.length) return;

    // Fetch all thumbnails in batches
    for (let i = 0; i < bookmarks.length; i += batchSize) {
        let batch = bookmarks.slice(i, i + batchSize);

        // Get multiple URLs at once
        let urls = batch.map(bookmark => bookmark.url);
        let results = await chrome.storage.local.get(urls);

        let thumbs = batch
            .map(bookmark => {
                let storedData = results[bookmark.url];
                if (!storedData) return null;

                return {
                    id: bookmark.id,
                    parentId: bookmark.parentId,
                    url: bookmark.url,
                    thumbnail: storedData.thumbnails[storedData.thumbIndex || 0],
                    bgColor: storedData.bgColor
                };
            })
            .filter(thumb => thumb !== null); // Remove nulls if some bookmarks have no stored data

        if (thumbs.length) {
            chrome.runtime.sendMessage({
                target: 'newtab',
                type: 'thumbBatch',
                data: thumbs
            });
        }

		// todo: maybe replace this with a message port so we dont blast every tab
    	// Short delay to avoid overwhelming message passing
    	await new Promise(resolve => setTimeout(resolve, 5));
    }
}

async function handleBookmarkChanged(id, info) {
	// bookmark was just reordered; noop
	if (info && !info.url && !info.title && info.parentId === info.oldParentId) {
		return
	}

	// info may only contain "changed" info -- 
	// ex. it may not contain url for moves, just old and new folder ids
    // so we always "get" the bookmark to access all its info
    const bookmark = await chrome.bookmarks.get(id)

    // todo: filter changes that arent in the speed dial or subfolder, like moving site out of speed dial
    // todo: debounce the message to any open tabs to rerender or debounce render side?

    if (bookmark[0].url) {
    	const bookmarkUrl = bookmark[0].url
		const bookmarkId = bookmark[0].id
		const parentId = bookmark[0].parentId
    	if (bookmarkUrl !== "data:" && bookmarkUrl !== "about:blank") {
    		const bookmarkData = await chrome.storage.local.get(bookmarkUrl)
    		if (bookmarkData[bookmarkUrl]) {
    			// a pre-existing bookmark is being modified; dont fetch new thumbnails
    			refreshOpen();
    		} else {
    			// new bookmark needs images
                const tabId = consumePendingTabSource(bookmarkUrl);
                await getThumbnails(bookmarkUrl, bookmarkId, parentId, {
                    source: THUMBNAIL_SOURCE.AUTO,
                    tabId,
                    forcePageReload: true
                });
    		}
    	}
    } else {
    	// folder
    	if (bookmark[0].title === "New Folder") {
    		// firefox creates a placeholder for the folder when created via bookmark manager
            return
    	} else if (info && info.title && Object.keys(info).length === 1) {
	        // folder is just being renamed
			//refreshOpen()
			reloadFolders()
	        return
        } else {
        	// folderIds.push(id); todo: chrome.storage.local.set({ folderIds });
        	// new folder
        	// recurse through the folder and get thumbnails
        	const children = await chrome.bookmarks.getChildren(id);
        	if (children.length) {
        		for (let child of children) {
        			handleBookmarkChanged(child.id)
        		}
        	} else {
        		reloadFolders()
        	}
        }
    }
}

async function handleBookmarkRemoved(id, info) {
	// todo: handle upsert where speed dial folder is deleted
	//if (info.node.url && (info.parentId === speedDialId || folderIds.indexOf(info.parentId) !== -1)) {
	if (info.node.url) {
		// remove the thumbnail from local storage if no other bookmarks share this URL
		const others = await chrome.bookmarks.search({ url: info.node.url });
		if (others.length === 0) {
			await chrome.storage.local.remove(info.node.url).catch((err) => {
				console.log(err)
			});
		}
	} else if (info.node.title !== "Speed Dial" && info.node.title !== "New Folder") {
		// folder removed, refresh the tab?
		//refreshOpen()
	}
	// todo: janky when we delete from the ui so disabled for now -- should only refresh inactive dial tabs, if they exist...
	//refreshOpen();
}

function handleContextMenuClick(info, tab) {
	if (info.menuItemId === 'addToSpeedDial') {
        createBookmarkFromContextMenu(tab)
    }
}

function handleBrowserAction(tab) {
	// if tab is a web page bookmark it to speed dial
	if (tab.url && (tab.url.startsWith('https://') || tab.url.startsWith('http://') || tab.url.startsWith('file://') || tab.url.startsWith('chrome://'))) {
		createBookmarkFromContextMenu(tab);
		chrome.action.setBadgeText({text:"✔", tabId:tab.id})
		chrome.action.setBadgeBackgroundColor({ color: '#13ac4e' }); // Green color
	} else {
		//chrome.tabs.create({ url: "https://github.com/conceptualspace/yet-another-speed-dial" });
	}
}


// MESSAGE HANDLERS //

// Function to enable or disable the bookmarks.onCreated listener
function toggleBookmarkCreatedListener(data) {
	chrome.bookmarks.onCreated.removeListener(handleBookmarkChanged);
    if (data.enable) {
        chrome.bookmarks.onCreated.addListener(handleBookmarkChanged);
    }
}

async function handleOffscreenFetchDone(data, forcePageReload) {
    try {
        await saveThumbnails(data.url, data.id, data.parentId, data.thumbs, data.bgColor, forcePageReload);
    } catch (err) {
        console.error('Unable to save thumbnails:', err);
    } finally {
        completeThumbnailJob(data.url, data.jobId);
    }
}

async function handleManualRefresh(data) {
    if (data.url && (data.url.startsWith('https://') || data.url.startsWith('http://') || data.url.startsWith('file://') || data.url.startsWith('chrome://'))) {
        await chrome.storage.local.remove(data.url);
        await getThumbnails(data.url, data.id, data.parentId, {
            source: THUMBNAIL_SOURCE.FRESH_POPUP,
            deduplicate: false,
            forcePageReload: true
        });
    }
}

const capturePopupPage = (url) => new Promise(resolve => {
    let popupId = null;
    let tabId = null;
    let loadingInterval = null;
    let renderTimer = null;
    let focusTimer = null;
    let timeoutTimer = null;
    let finished = false;
    let captureStarted = false;

    const cleanup = (result = { screenshot: null, pageSnapshot: null }) => {
        if (finished) return;
        finished = true;
        clearInterval(loadingInterval);
        clearTimeout(renderTimer);
        clearTimeout(focusTimer);
        clearTimeout(timeoutTimer);
        if (popupId !== null) chrome.windows.remove(popupId).catch(() => {});
        resolve(result);
    };

    chrome.windows.create({
        url,
        focused: false,
        width: 1,
        height: 1,
        left: 0,
        top: 0,
        type: 'popup'
    }).then(popup => {
        popupId = popup.id;
        if (!popup.tabs || !popup.tabs.length) {
            cleanup();
            return;
        }

        tabId = popup.tabs[0].id;
        chrome.tabs.update(tabId, { muted: true, active: true }).catch(() => {});
        chrome.windows.update(popupId, {
            focused: false,
            width: 1280,
            height: 720,
            left: 0,
            top: 0
        }).catch(() => {});

        timeoutTimer = setTimeout(cleanup, 10000);
        focusTimer = setTimeout(() => {
            if (!finished) {
                chrome.windows.update(popupId, { focused: true }).catch(() => {});
            }
        }, 5000);

        loadingInterval = setInterval(async () => {
            if (captureStarted || finished) return;

            try {
                const tab = await chrome.tabs.get(tabId);
                if (tab.status !== 'complete') return;
                captureStarted = true;
                clearInterval(loadingInterval);
                renderTimer = setTimeout(async () => {
                    const pageSnapshot = await extractLivePageSnapshot(tabId, url, true);
                    if (finished) return;
                    let screenshot = await chrome.tabs.captureVisibleTab(popupId).catch(() => null);
                    if (!screenshot && !finished) {
                        await chrome.windows.update(popupId, { focused: true }).catch(() => {});
                        if (finished) return;
                        screenshot = await chrome.tabs.captureVisibleTab(popupId).catch(() => null);
                    }
                    cleanup({ screenshot, pageSnapshot });
                }, 2000);
            } catch (err) {
                cleanup();
            }
        }, 200);
    }).catch(err => {
        console.warn('Unable to open thumbnail capture popup:', err);
        cleanup();
    });
});

async function handleRefreshAll(data) {
    async function refreshBatch(bookmarks, index = 0, retries = 2) {
        const batchSize = 200;
        const delay = 10000;
        const batch = bookmarks.slice(index, index + batchSize);
    
        if (batch.length) {
            try {
                await Promise.all(batch.map(bookmark => getThumbnails(bookmark.url, bookmark.id, bookmark.parentId, {
                    source: THUMBNAIL_SOURCE.NETWORK,
                    deduplicate: false,
                    quickRefresh: true
                })));
                // todo show progress in UI
                // todo: we might need to refactor this to promises or timers so the worker doesnt kill the process with a batch scheduled
                setTimeout(() => refreshBatch(bookmarks, index + batchSize, retries), delay);
            } catch (err) {
                console.log(err);
                if (retries > 0) {
                    //console.log(`Retrying batch at index ${index}...`);
                    setTimeout(() => refreshBatch(bookmarks, index, retries - 1), delay);
                } else {
                    //console.log(`Failed to refresh batch at index ${index} after multiple attempts.`);
                    setTimeout(() => refreshBatch(bookmarks, index + batchSize, retries), delay);
                }
            }
        } else {
            //refreshOpen(); // not needed here it happens when thumbnails are saved
        }
    }

    const urlsToRemove = data.bookmarks.map(bookmark => bookmark.url);
    await chrome.storage.local.remove(urlsToRemove).catch((err) => {
        console.log(err);
    });
    refreshBatch(data.bookmarks);
}

async function createBookmarkFromContextMenu(tab) {
	// get the speed dial folder id
	let speedDialId = null;
	const bookmarks = await chrome.bookmarks.search({ title: 'Speed Dial' })
	if (bookmarks && bookmarks.length) {
		for (let bookmark of bookmarks) {
			if (!bookmark.url) {
				speedDialId = bookmark.id;
				break;
			}
		}
	}

    if (!speedDialId) return;

    try {
        const node = await chrome.bookmarks.getSubTree(speedDialId);
        const match = node[0].children.some(bookmark => tab.url === bookmark.url);
        if (match) return;

        rememberPendingTabSource(tab);
        await chrome.bookmarks.create({
            parentId: speedDialId,
            title: tab.title,
            url: tab.url
        });
    } catch (err) {
        clearPendingTabSource(tab.url);
        console.error('Unable to add bookmark to Speed Dial:', err);
    }
}


// LIFECYCLE METHODS //

function isPreviousVersion(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na !== nb) return na < nb;
    }
    return false;
}

async function handleInstalled(details) {
    if (details.reason === "install") {
        // set uninstall URL
        chrome.runtime.setUninstallURL("https://forms.gle/6vJPx6eaMV5xuxQk9");
        // todo: detect existing speed dial folder
    } else if (details.reason === 'update') {
        // perform any migrations here...
        await runMigrations(details.previousVersion);

        // manually specify the version to show release notes for
        if (isPreviousVersion(details.previousVersion, '3.14.1')) {
            // Check if user wants to see release notes
            try {
                const result = await chrome.storage.sync.get('showReleaseNotes');
                // Default to true if setting doesn't exist (first time users)
                const shouldShowReleaseNotes = result.showReleaseNotes !== false;
                
                if (shouldShowReleaseNotes) {
                    const url = chrome.runtime.getURL("updated.html");
                    chrome.tabs.create({ url });
                }
            } catch (error) {
                console.error('Error checking showReleaseNotes setting:', error);
                // Default behavior: show the page if there's an error
                const url = chrome.runtime.getURL("updated.html");
                chrome.tabs.create({ url });
            }
        }
    }

    try {
        // remove existing menus to avoid issues with previous versions
        await chrome.contextMenus.removeAll();

        // create context menu
         chrome.contextMenus.create({
            title: "Add to Speed Dial",
            contexts: ["page"],
            documentUrlPatterns: ["https://*/*", "http://*/*", "file://*/*", "chrome://*/*"],
            id: "addToSpeedDial",
        });
    } catch (error) {
        console.log("Error managing context menus:", error.message);
    }
}


// MIGRATION FUNCTIONS //

async function runMigrations(previousVersion) {
    if (isPreviousVersion(previousVersion, '3.11')) {
        await migrateDialSizes();
    }
}

async function migrateDialSizes() {
    try {
        const result = await chrome.storage.local.get('settings');

         if (result.settings && result.settings.migrationVersion && 
            !isPreviousVersion(result.settings.migrationVersion, '3.11.0')) {
            return;
        }
        
        if (result.settings && result.settings.dialSize) {
            const dialSizeMigrationMap = {
                'xxx-small': 'xx-small',
                'xx-small': 'x-small',
                'x-small': 'small',
                'small': 'medium',
                'medium': 'large',
                'large': 'x-large',
                'x-large': 'xx-large'
            };
            
            if (dialSizeMigrationMap[result.settings.dialSize]) {
                console.log(`Migrating dial size from '${result.settings.dialSize}' to '${dialSizeMigrationMap[result.settings.dialSize]}' (v3.11.0)`);
                result.settings.dialSize = dialSizeMigrationMap[result.settings.dialSize];
                result.settings.migrationVersion = '3.11.0';
                await chrome.storage.local.set({ settings: result.settings });
            }
        }
    } catch (error) {
        console.error('Error during dial size migration:', error);
    }
}


// THUMBNAIL FUNCTIONS //

async function getThumbnails(url, id, parentId, options = {}) {

	if(!url || !id) {
		console.log("getThumbnails: missing url or id")
		return
	}

    const source = options.source || THUMBNAIL_SOURCE.AUTO;
    const deduplicate = options.deduplicate !== false;
    const job = beginThumbnailJob(url, deduplicate);
    if (!job) return;

    try {
        let screenshot = null;
        let pageSnapshot = null;

        if (source === THUMBNAIL_SOURCE.FRESH_POPUP) {
            const popupResult = await capturePopupPage(url);
            screenshot = popupResult.screenshot;
            pageSnapshot = popupResult.pageSnapshot;
        } else if (source === THUMBNAIL_SOURCE.AUTO) {
            let tab = null;
            if (options.tabId) {
                tab = await chrome.tabs.get(options.tabId).catch(() => null);
            } else {
                tab = await findMatchingTab(url);
            }

            if (tab && normalizePageUrl(tab.url) === normalizePageUrl(url)) {
                pageSnapshot = await extractLivePageSnapshot(tab.id, url);
                screenshot = await captureTabScreenshot(tab.id, url);
            }
        }

        await setupOffscreenDocument('offscreen.html');
        await chrome.runtime.sendMessage({
            target: 'offscreen',
            data: {
                url,
                id,
                parentId,
                jobId: job.id,
                screenshot,
                pageSnapshot,
                quickRefresh: options.quickRefresh,
                forcePageReload: options.forcePageReload
            }
        });
    } catch (err) {
        completeThumbnailJob(url, job.id);
        console.error('Unable to collect thumbnails:', err);
    }
}

async function saveThumbnails(url, id, parentId, images, bgColor, forcePageReload=false) {
	if (images && images.length) {
		let thumbnails = [];
		let result = await chrome.storage.local.get(url)
		if (result[url] && result[url].thumbnails) {
			thumbnails = result[url].thumbnails;
		}
		thumbnails.push(images);
		thumbnails = thumbnails.flat();
		await chrome.storage.local.set({[url]: {thumbnails, thumbIndex: 0, bgColor}})
	}
	// refresh open new tab page
	if (forcePageReload) {
		// we have new sites, reload the page
		refreshOpen();
	} else {
		// just update existing images
		chrome.runtime.sendMessage({
			target: 'newtab',
			type: 'thumbBatch',
			data: [{
				id,
				parentId,
				url,
				thumbnail: images[0],
				bgColor
			}]
		});
	}
}

function refreshOpen() {
    chrome.runtime.sendMessage({
		target: 'newtab',
		data: {refresh:true}
	});
}

function reloadFolders() {
	chrome.runtime.sendMessage({
		target: 'newtab',
		data: {reloadFolders:true}
	});
}


// UTILS

// Handle new tab creation for Opera browser
async function handleTabCreated(tab) {
    if (tab && tab.pendingUrl && tab.pendingUrl.startsWith('chrome://startpageshared/')) {
        chrome.tabs.update(tab.id, { 
            url: chrome.runtime.getURL('index.html') 
        });
    } else if (tab && tab.url && tab.url.startsWith('opera://startpageshared/')) {
        chrome.tabs.update(tab.id, { 
            url: chrome.runtime.getURL('index.html') 
        });
    }
}

function isOpera() {
    // navigator.userAgent.includes('OPR') || navigator.userAgent.includes('Opera/');
    return navigator.userAgent.includes('OPR') || navigator.userAgent.includes('Opera/');
}

// offscreen document setup
let creating; // A global promise to avoid concurrency issues
async function setupOffscreenDocument(path) {
  // Check all windows controlled by the service worker to see if one
  // of them is the offscreen document with the given path
  const offscreenUrl = chrome.runtime.getURL(path);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    return;
  }

  // create offscreen document
  if (creating) {
    await creating;
  } else {
	try {
	  creating = chrome.offscreen.createDocument({
		url: path,
		reasons: [chrome.offscreen.Reason.DOM_PARSER],
		justification: 'parse document for image tags to use as thumbnail'
	  });
	  await creating;
	} finally {
	  creating = null;
	}
  }
}
