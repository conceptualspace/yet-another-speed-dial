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
    let bookmarks = data.filter(bookmark => bookmark.url?.startsWith("http"));

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
		// remove the thumbnail from local storage
		await chrome.storage.local.remove(info.node.url).catch((err) => {
			console.log(err)
		});
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
	if (tab.url && (tab.url.startsWith('https://') || tab.url.startsWith('http://'))) {
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
	saveThumbnails(data.url, data.id, data.parentId, data.thumbs, data.bgColor, forcePageReload);
}

function handleManualRefresh(data) {
    if (data.url && (data.url.startsWith('https://') || data.url.startsWith('http://'))) {
        chrome.storage.local.remove(data.url).then(() => {
            getThumbnails(data.url, data.id, data.parentId, {forceScreenshot: true}).then(() => {
                //refreshOpen()
            })
        })
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

    for (let bookmark of data.bookmarks) {
        await chrome.storage.local.remove(bookmark.url).catch((err) => {
            console.log(err);
        });
    }
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

async function handleInstalled(details) {
    if (details.reason === "install") {
        // set uninstall URL
        chrome.runtime.setUninstallURL("https://forms.gle/6vJPx6eaMV5xuxQk9");
        // todo: detect existing speed dial folder
    } else if (details.reason === 'update') {
        if (details.previousVersion < '3.3') {
            const url = chrome.runtime.getURL("updated.html");
            chrome.tabs.create({ url });
        }
        // perform any migrations here...
    }

    try {
        // remove existing menus to avoid issues with previous versions
        await chrome.contextMenus.removeAll();

        // create context menu
         chrome.contextMenus.create({
            title: "Add to Speed Dial",
            contexts: ["page"],
            documentUrlPatterns: ["https://*/*", "http://*/*"],
            id: "addToSpeedDial",
        });
    } catch (error) {
        console.log("Error managing context menus:", error.message);
    }
}


// THUMBNAIL FUNCTIONS //

async function getThumbnails(url, id, parentId, options = {quickRefresh: false, forceScreenshot: false, forcePageReload: false}) {

	if(!url || !id) {
		console.log("getThumbnails: missing url or id")
		return
	}
    // take screenshot if applicable
    let screenshot = null;
	const tabs = await chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT, active: true })
	
	if (tabs && tabs.length && tabs[0].url === url) {
		screenshot = await chrome.tabs.captureVisibleTab()
	}

	// cant parse images from dom in service worker: delegate to offscreen document
	await setupOffscreenDocument('offscreen.html');

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
	});
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
