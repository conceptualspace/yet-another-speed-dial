// yet another speed dial
// copyright 2019 dev@conceptualspace.net
// absolutely no warranty is expressed or implied

'use strict';


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

const REFRESH_ALL_SMALL_FOLDER_LIMIT = 75;
const REFRESH_ALL_LARGE_FOLDER_LIMIT = 500;
const REFRESH_ALL_RESPONSE_GRACE_MS = 9000;
const pendingThumbnailRequests = new Map();


// EVENT HANDLERS //

async function handleMessages(message) {
	// Return early if this message isn't meant for the worker
	if (message.target !== 'background') {
	  return;
	}
  
	// Dispatch the message to an appropriate handler.
	switch (message.type) {
		case 'refreshThumbs':
            handleManualRefresh(message.data).catch(err => console.log(err));
			break;
		case 'refreshAllThumbs':
            handleRefreshAll(message.data).catch(err => console.log(err));
			break;
		case 'saveThumbnails':
            handleOffscreenFetchDone(message.data, message.forcePageReload).catch(err => console.log(err));
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
    if (data.enable) {
        chrome.bookmarks.onCreated.addListener(handleBookmarkChanged);
    } else {
        chrome.bookmarks.onCreated.removeListener(handleBookmarkChanged);
    }
}

async function handleOffscreenFetchDone(data, forcePageReload) {
	//console.log(data);
    let saved = false;

    try {
        saved = await saveThumbnails(data.url, data.id, data.parentId, data.thumbs, data.bgColor, forcePageReload);
    } catch (err) {
        console.log(err);
    }

    const request = data.requestId ? pendingThumbnailRequests.get(data.requestId) : null;

    if (request) {
        clearTimeout(request.timeoutId);
        pendingThumbnailRequests.delete(data.requestId);
        request.resolve({
            ok: saved,
            url: data.url,
            id: data.id,
            parentId: data.parentId
        });
    }
}

async function handleManualRefresh(data) {
    if (data.url && (data.url.startsWith('https://') || data.url.startsWith('http://') || data.url.startsWith('file://') || data.url.startsWith('chrome://'))) {
        await getThumbnails(data.url, data.id, data.parentId, {forceScreenshot: true, forcePageReload: true});
    }
}

const capturePopupScreenshot = (url) => {
  
  return new Promise((resolve, reject) => {
    let finished = false;
    chrome.windows.create({
        url: url,
        focused: false,
        width: 1,
        height: 1,
        left: 0,
        top: 0,
        type: 'popup'
      }).then((popup) => {
        if (!popup.tabs || !popup.tabs.length) {
          chrome.windows.remove(popup.id)
          return resolve(null)
        }

        const tabId = popup.tabs[0].id
        let loadingInterval;
        let hasScreenshot = false;

        const cleanup = (result = null) => {
            if (finished) return;
            finished = true;

            clearInterval(loadingInterval);
            clearTimeout(focusTimeout);
            clearTimeout(timeout);

            chrome.windows.remove(popup.id).catch(() => {});
            resolve(result);
        };
        
        chrome.tabs.update(tabId, {
          muted: true,
          active: true
        })
        chrome.windows.update(popup.id, {
          focused: false,
          width: 1280,
          height: 720,
          left: 0,
          top: 0
        })

        const timeout = setTimeout(() => {
          cleanup();
        }, 10000)

        // Focus window after 5s if we don't have a screenshot yet
        const focusTimeout = setTimeout(() => {
          if (!hasScreenshot && !finished) {
            chrome.windows.update(popup.id, { focused: true });
          }
        }, 5000);

        loadingInterval = setInterval(() => {
          chrome.tabs.get(tabId).then((tab) => {
            'complete' === tab.status &&
              (clearInterval(loadingInterval),
              setTimeout(() => {
                // delay to let page render
                chrome.tabs
                  .captureVisibleTab(popup.id)
                  .then((screenshot) => {
                    hasScreenshot = true;
                    cleanup(screenshot);
                  })
                  .catch(() => {
                    console.log("Error capturing screenshot");
                    cleanup();
                  })
              }, 2000))
          })
        }, 200)
      })
  })
}

function getRefreshAllTuning(bookmarkCount) {
    if (bookmarkCount <= REFRESH_ALL_SMALL_FOLDER_LIMIT) {
        return { concurrency: 8, fetchTimeoutMs: 6000 };
    }

    if (bookmarkCount <= REFRESH_ALL_LARGE_FOLDER_LIMIT) {
        return { concurrency: 16, fetchTimeoutMs: 4500 };
    }

    return { concurrency: 24, fetchTimeoutMs: 3000 };
}

async function runRefreshAllQueue(bookmarks, concurrency, worker) {
    let nextIndex = 0;

    async function runWorker() {
        while (nextIndex < bookmarks.length) {
            const bookmark = bookmarks[nextIndex++];
            await worker(bookmark);
        }
    }

    const workerCount = Math.min(concurrency, bookmarks.length);
    await Promise.all(Array.from({ length: workerCount }, runWorker));
}

async function handleRefreshAll(data) {
    const bookmarks = data.bookmarks || [];
    if (!bookmarks.length) return;

    const tuning = getRefreshAllTuning(bookmarks.length);
    let failed = 0;

    await runRefreshAllQueue(bookmarks, tuning.concurrency, async bookmark => {
        const result = await getThumbnails(bookmark.url, bookmark.id, bookmark.parentId, {
            quickRefresh: true,
            fetchTimeoutMs: tuning.fetchTimeoutMs,
            requestTimeoutMs: tuning.fetchTimeoutMs + REFRESH_ALL_RESPONSE_GRACE_MS
        }).catch(err => {
            console.log(err);
            return { ok: false };
        });

        if (!result || !result.ok) {
            failed++;
        }
    });

    if (failed) {
        console.log(`Refresh all thumbnails: ${failed} of ${bookmarks.length} dials did not produce a new thumbnail.`);
    }
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

function createThumbnailRequestId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function getThumbnails(url, id, parentId, options = {quickRefresh: false, forceScreenshot: false, forcePageReload: false}) {

	if(!url || !id) {
		console.log("getThumbnails: missing url or id")
        return { ok: false, reason: 'missing-data', url, id, parentId };
	}
    
    let screenshot = null;
    
    if (options.forceScreenshot) {
        // Force popup screenshot for manual refresh
        screenshot = await capturePopupScreenshot(url);
    } else {
        // take screenshot if applicable (current active tab)
        const tabs = await chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT, active: true })
        
        if (tabs && tabs.length && tabs[0].url === url) {
            screenshot = await chrome.tabs.captureVisibleTab()
        }
    }

	// cant parse images from dom in service worker: delegate to offscreen document
	await setupOffscreenDocument('offscreen.html');

    const requestId = createThumbnailRequestId();
    const requestTimeoutMs = options.requestTimeoutMs || 15000;
    let resolveRequest;
    const responsePromise = new Promise(resolve => {
        resolveRequest = resolve;
        const timeoutId = setTimeout(() => {
            pendingThumbnailRequests.delete(requestId);
            resolve({ ok: false, reason: 'timeout', url, id, parentId });
        }, requestTimeoutMs);

        pendingThumbnailRequests.set(requestId, { resolve, timeoutId });
    });

    chrome.runtime.sendMessage({
        target: 'offscreen',
        data: {
            requestId,
            url,
            id,
            parentId,
            screenshot,
            quickRefresh: options.quickRefresh,
            forcePageReload: options.forcePageReload,
            fetchTimeoutMs: options.fetchTimeoutMs,
        }
    }).catch(err => {
        if (err?.message && err.message.includes('message port closed')) return;

        const request = pendingThumbnailRequests.get(requestId);
        if (request) {
            clearTimeout(request.timeoutId);
            pendingThumbnailRequests.delete(requestId);
        }
        console.log(err);
        resolveRequest({ ok: false, reason: 'send-failed', url, id, parentId });
    });

    return responsePromise;
}

async function saveThumbnails(url, id, parentId, images, bgColor, forcePageReload=false) {
    if (!images || !images.length) {
        return false;
    }

    const thumbnails = images.flat();
    await chrome.storage.local.set({[url]: {thumbnails, thumbIndex: 0, bgColor}})

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

    return true;
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
    creating = chrome.offscreen.createDocument({
      url: path,
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: 'parse document for image tags to use as thumbnail'
    });
    await creating;
    creating = null;
  }
}
