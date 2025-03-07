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
		  handleOffscreenFetchDone(message.data);
		break;
	  default:
		console.warn(`Unexpected message type received: '${message.type}'.`);
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
    	if (bookmarkUrl !== "data:" && bookmarkUrl !== "about:blank") {
    		const bookmarkData = await chrome.storage.local.get(bookmarkUrl)
    		if (bookmarkData[bookmarkUrl]) {
    			// a pre-existing bookmark is being modified; dont fetch new thumbnails
    			// todo: improve the ghetto local storage -- this implementation doesnt allow same site to have separate images in 2 folders.. who cares
    			refreshOpen();
    		} else {
    			// this bookmark needs images
    			getThumbnails(bookmarkUrl)
    		}
    	}
    } else {
    	// folder
    	if (bookmark[0].title === "New Folder") {
    		// firefox creates a placeholder for the folder when created via bookmark manager
            return
    	} else if (info && info.title && Object.keys(info).length === 1) {
	        // folder is just being renamed
	        refreshOpen()
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
        		refreshOpen()
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
	}
	// todo: janky when we delete from the ui so disabled for now -- should only refresh inactive dial tabs, if they exist...
	//refreshOpen();
}


// MESSAGE HANDLERS //

async function handleOffscreenFetchDone(data) {
	//console.log(data);
	let thumbs = data.thumbs;

	// take screenshot if applicable
	const tabs = await chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT, active: true })
	
	if (tabs && tabs.length && tabs[0].url === data.url) {
		const screenshot = await chrome.tabs.captureVisibleTab()
		thumbs.push(screenshot)
	}

	saveThumbnails(data.url, thumbs, data.bgColor)
}

function handleManualRefresh(data) {
    if (data.url && (data.url.startsWith('https://') || data.url.startsWith('http://'))) {
        chrome.storage.local.remove(data.url).then(() => {
            getThumbnails(data.url, {forceScreenshot: true}).then(() => {
                //refreshOpen()
            })
        })
    }
}

async function handleRefreshAll(data) {
	async function refreshBatch(urls, index = 0, retries = 3) {
		const batchSize = 200;
		const delay = 1000; // 1 second delay between batches
		const batch = urls.slice(index, index + batchSize);
	
		if (batch.length) {
			try {
				await Promise.all(batch.map(url => getThumbnails(url, { quickRefresh: true })));
				// todo show progress in UI
				// console.log(Math.round((index / urls.length) * 100) + "%");
				setTimeout(() => refreshBatch(urls, index + batchSize, retries), delay);
			} catch (err) {
				console.log(err);
				if (retries > 0) {
					console.log(`Retrying batch at index ${index}...`);
					setTimeout(() => refreshBatch(urls, index, retries - 1), delay);
				} else {
					console.log(`Failed to refresh batch at index ${index} after multiple attempts.`);
					setTimeout(() => refreshBatch(urls, index + batchSize, retries), delay);
				}
			}
		} else {
			refreshOpen();
		}
	}

	for (let url of data.urls) {
        await chrome.storage.local.remove(url).catch((err) => {
            console.log(err)
        });
    }
	refreshBatch(data.urls)
}


// LIFECYCLE METHODS //

function handleInstalled(details) {
    if (details.reason === "install") {
        // set uninstall URL
        chrome.runtime.setUninstallURL("https://forms.gle/6vJPx6eaMV5xuxQk9");
        // todo: detect existing speed dial folder
    } else if (details.reason === 'update') {
        // perform any migrations here...
    }
}


// THUMBNAIL FUNCTIONS //

async function getThumbnails(url, options = {quickRefresh: false, forceScreenshot: false}) {
	// cant fetch/parse/format images in service worker: delegate to offscreen document
	await setupOffscreenDocument('offscreen.html');

	chrome.runtime.sendMessage({
		target: 'offscreen',
		data: url
	});
}

async function saveThumbnails(url, images, bgColor) {
	if (images && images.length) {
		let thumbnails = [];
		let result = await chrome.storage.local.get(url)
		if (result[url] && result[url].thumbnails) {
			thumbnails = result[url].thumbnails;
		}
		thumbnails.push(images);
		thumbnails = thumbnails.flat();
		await chrome.storage.local.set({[url]: {thumbnails, thumbIndex: 0, bgColor}})
		refreshOpen()
	}
}

function refreshOpen() {
    chrome.runtime.sendMessage({
		target: 'newtab',
		data: {refresh:true}
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
