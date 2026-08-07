// yet another speed dial
// copyright 2019 dev@conceptualspace.net
// copyright 2026 antgraf (modifications)
// absolutely no warranty is expressed or implied

'use strict';

importScripts('js/hostPermissions.js');


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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	// Keep the service worker alive until async handlers finish (MV3).
	handleMessages(message)
		.then(() => sendResponse({ ok: true }))
		.catch((err) => {
			console.log(err);
			sendResponse({ ok: false });
		});
	return true;
});
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
			await handleManualRefresh(message.data);
			break;
		case 'refreshAllThumbs':
			await handleRefreshAll(message.data);
			break;
		case 'saveThumbnails':
			await handleOffscreenFetchDone(message.data, message.forcePageReload);
			break;
		case 'toggleBookmarkCreatedListener':
			toggleBookmarkCreatedListener(message.data);
			break;
		case 'getThumbs':
			await handleGetThumbs(message.data);
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
    			getThumbnails(bookmarkUrl, bookmarkId, parentId, {forcePageReload: true});
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
        		// new empty folder: full refresh so it renders correctly whether it's a
        		// top-level folder (a tab) or a nested subfolder (a tile in the current view)
        		refreshOpen()
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

async function handleContextMenuClick(info, tab) {
	if (info.menuItemId === 'addToSpeedDial') {
		// Request before any other await so the user-gesture chain stays valid
		await ensureHostPermission();
		createBookmarkFromContextMenu(tab);
	}
}

async function handleBrowserAction(tab) {
	// if tab is a web page bookmark it to speed dial
	if (tab.url && (tab.url.startsWith('https://') || tab.url.startsWith('http://') || tab.url.startsWith('file://') || tab.url.startsWith('chrome://'))) {
		await ensureHostPermission();
		createBookmarkFromContextMenu(tab);
		chrome.action.setBadgeText({text:"✔", tabId:tab.id})
		chrome.action.setBadgeBackgroundColor({ color: '#13ac4e' }); // Green color
	} else {
		//chrome.tabs.create({ url: "https://github.com/antgraf/yet-another-speed-dial-2" });
	}
}


// MESSAGE HANDLERS //

// Function to enable or disable the bookmarks.onCreated listener
function toggleBookmarkCreatedListener(data) {
    if (data.enable) {
        chrome.bookmarks.onCreated.addListener(handleBookmarkChanged);
    } else {
        chrome.bookmarks.onCreated.removeListener(handleBookmarkChanged);
    }
}

async function handleOffscreenFetchDone(data, forcePageReload) {
	//console.log(data);
	await saveThumbnails(data.url, data.id, data.parentId, data.thumbs, data.bgColor, forcePageReload);
}

let manualRefreshSafetyTimer = null;

async function handleManualRefresh(data) {
    // Fallback so the NTP "Capturing..." toast never sticks if offscreen never calls back
    if (manualRefreshSafetyTimer) {
        clearTimeout(manualRefreshSafetyTimer);
    }
    manualRefreshSafetyTimer = setTimeout(() => {
        manualRefreshSafetyTimer = null;
        refreshOpen();
    }, 90000);

    try {
        if (data.url && (data.url.startsWith('https://') || data.url.startsWith('http://') || data.url.startsWith('file://') || data.url.startsWith('chrome://'))) {
            await chrome.storage.local.remove(data.url);
            const started = await getThumbnails(data.url, data.id, data.parentId, {forceScreenshot: true, forcePageReload: true});
            if (!started) {
                refreshOpen();
            }
            // On success, saveThumbnails → refreshOpen clears the toast and safety timer
            return;
        }
        refreshOpen();
    } catch (err) {
        console.log('Manual refresh failed:', err?.message || err);
        refreshOpen();
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isHttpLikeUrl(url) {
    return typeof url === 'string' && (
        url.startsWith('http://') ||
        url.startsWith('https://') ||
        url.startsWith('file://') ||
        url.startsWith('chrome://')
    );
}

/**
 * Wait until the tab has finished loading the real target page.
 * Important: windows.create often starts at about:blank with status "complete" —
 * resolving on that leaves us capturing/closing before the site renders.
 */
function waitForTabComplete(tabId, expectedUrl, timeoutMs = 15000) {
    return new Promise((resolve) => {
        let settled = false;

        const isReady = (tab) => {
            if (!tab || tab.status !== 'complete') {
                return false;
            }
            const current = tab.url || '';
            // Ignore the intermediate blank document Chrome uses before navigation
            if (!current || current === 'about:blank') {
                return false;
            }
            return isHttpLikeUrl(current);
        };

        const finish = () => {
            if (settled) return;
            settled = true;
            chrome.tabs.onUpdated.removeListener(onUpdated);
            clearTimeout(timer);
            resolve();
        };

        const onUpdated = (updatedTabId, changeInfo) => {
            if (updatedTabId !== tabId) return;
            if (changeInfo.status === 'complete' || changeInfo.url) {
                chrome.tabs.get(tabId).then((tab) => {
                    if (isReady(tab)) finish();
                }).catch(() => {});
            }
        };

        const timer = setTimeout(finish, timeoutMs);
        chrome.tabs.onUpdated.addListener(onUpdated);

        chrome.tabs.get(tabId).then((tab) => {
            if (isReady(tab)) finish();
        }).catch(() => {});
    });
}

async function tryCaptureVisibleTab(windowId) {
    try {
        const screenshot = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
        if (typeof screenshot === 'string' && screenshot.startsWith('data:image/')) {
            return screenshot;
        }
    } catch (err) {
        console.log('Error capturing screenshot:', err?.message || err);
    }
    return null;
}

/**
 * Open the URL in a temporary popup, capture a screenshot, then close it.
 * Opens focused — Chrome often refuses captureVisibleTab on background windows,
 * and the refresh UI already shows a "Capturing..." toast.
 */
async function capturePopupScreenshot(url) {
    let popup = null;

    try {
        popup = await chrome.windows.create({
            url,
            focused: true,
            width: 1280,
            height: 720,
            type: 'popup'
        });

        if (!popup?.tabs?.length) {
            // tabs may be missing momentarily; try querying by window id
            const tabs = popup?.id != null
                ? await chrome.tabs.query({ windowId: popup.id })
                : [];
            if (!tabs.length) {
                return null;
            }
            popup.tabs = tabs;
        }

        const tabId = popup.tabs[0].id;
        await chrome.tabs.update(tabId, { muted: true, active: true }).catch(() => {});

        await waitForTabComplete(tabId, url);
        // Allow paint / lazy content after load
        await sleep(2000);

        let screenshot = await tryCaptureVisibleTab(popup.id);

        if (!screenshot) {
            // Ensure focus and retry once
            await chrome.windows.update(popup.id, { focused: true }).catch(() => {});
            await sleep(400);
            screenshot = await tryCaptureVisibleTab(popup.id);
        }

        return screenshot;
    } catch (err) {
        console.log('Error capturing popup screenshot:', err?.message || err);
        return null;
    } finally {
        if (popup?.id != null) {
            await chrome.windows.remove(popup.id).catch(() => {});
        }
    }
}

async function handleRefreshAll(data) {
    async function refreshBatch(bookmarks, index = 0, retries = 2) {
        const batchSize = 200;
        const delay = 10000;
        const batch = bookmarks.slice(index, index + batchSize);
    
        if (batch.length) {
            try {
                await Promise.all(batch.map(bookmark => getThumbnails(bookmark.url, bookmark.id, bookmark.parentId, { quickRefresh: true })));
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

    // check for doopz
	if (speedDialId) {
		let match = false;
		chrome.bookmarks.getSubTree(speedDialId).then(node => {
			for (const bookmark of node[0].children) {
				if (tab.url === bookmark.url) {
					match = true;
					break;
				}
			}
			if (!match) {
				chrome.bookmarks.create({
					parentId: speedDialId,
					title: tab.title,
					url: tab.url
				})
			}
		});
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
        if (isPreviousVersion(details.previousVersion, '3.12.3')) {
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

async function getThumbnails(url, id, parentId, options = {quickRefresh: false, forceScreenshot: false, forcePageReload: false}) {

	if(!url || !id) {
		console.log("getThumbnails: missing url or id")
		return false
	}

	// Thumbnail fetch / captureVisibleTab need host access; grant is optional and prompted on user gesture
	if (!(await hasHostPermission())) {
		console.log("getThumbnails: host permission not granted, skipping")
		return false
	}
    
    let screenshot = null;
    
    if (options.forceScreenshot) {
        // Force popup screenshot for manual refresh
        screenshot = await capturePopupScreenshot(url);
    } else {
        // take screenshot if applicable (current active tab)
        try {
            const tabs = await chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT, active: true });

            if (tabs && tabs.length && tabs[0].url === url) {
                screenshot = await chrome.tabs.captureVisibleTab({ format: 'png' });
            }
        } catch (err) {
            // Don't abort page-image fetch if live capture fails
            console.log('Error capturing active tab:', err?.message || err);
        }
    }

	// cant parse images from dom in service worker: delegate to offscreen document
	await setupOffscreenDocument('offscreen.html');

	try {
		// Do not await offscreen completion here — its async listener would hold this
		// call open, and awaiting a round-trip saveThumbnails message can deadlock MV3.
		chrome.runtime.sendMessage({
			target: 'offscreen',
			data: {
				url,
				id,
				parentId,
				screenshot,
				quickRefresh: options.quickRefresh,
				forcePageReload: options.forcePageReload,
			}
		}).catch((err) => {
			console.log('Failed to message offscreen document:', err?.message || err);
			if (options.forcePageReload) {
				refreshOpen();
			}
		});
	} catch (err) {
		console.log('Failed to message offscreen document:', err?.message || err);
		return false;
	}

	return true;
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
    if (manualRefreshSafetyTimer) {
        clearTimeout(manualRefreshSafetyTimer);
        manualRefreshSafetyTimer = null;
    }
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
    creating = chrome.offscreen.createDocument({
      url: path,
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: 'parse document for image tags to use as thumbnail'
    });
    await creating;
    creating = null;
  }
}
