// yet another speed dial

// EVENT LISTENERS //

// firefox triggers 'moved' for bookmarks saved to different folder than default
// firefox triggers 'changed' for bookmarks created manually todo: confirm
// chrome triggers 'created' for bookmarks created manually in bookmark mgr
chrome.bookmarks.onMoved.addListener(handleBookmarkChanged);
chrome.bookmarks.onChanged.addListener(handleBookmarkChanged);
chrome.bookmarks.onCreated.addListener(handleBookmarkChanged);
chrome.bookmarks.onRemoved.addListener(handleBookmarkRemoved);
//chrome.runtime.onMessage.addListener(onDone);


// EVENT HANDLERS //

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
    			await getThumbnails(bookmarkUrl)
    			refreshOpen()
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

function handleBookmarkRemoved(id, info) {
	// todo: handle upsert where speed dial folder is deleted
	if (info.node.url && (info.parentId === speedDialId || folderIds.indexOf(info.parentId) !== -1)) {
        chrome.storage.local.remove(info.node.url).catch((err) => {
            console.log(err)
        });
	}
}


// IMAGE FUNCTIONS WOOP

async function getThumbnails(url, options = {quickRefresh: false, forceScreenshot: false}) {

	// cant fetch/parse/format images in service worker: delegate to offscreen document
	await setupOffscreenDocument('offscreen.html');

	return new Promise((resolve, reject) => {
		const onDone = (result) => {
			console.log(result)
	        chrome.runtime.onMessage.removeListener(onDone);
			saveThumbnails(url, result.data.thumbs, result.data.bgColor)
				.then(() => resolve());
	    };

	    chrome.runtime.onMessage.addListener(onDone);

		chrome.runtime.sendMessage({
			target: 'offscreen',
			data: url
		});
	});
}

function saveThumbnails(url, images, bgColor) {
    return new Promise(function(resolve, reject) {
        if (images && images.length) {
            let thumbnails = [];
            chrome.storage.local.get(url)
                .then(result => {
                    if (result[url] && result[url].thumbnails) {
                        thumbnails = result[url].thumbnails;
                    }
                    thumbnails.push(images);
                    thumbnails = thumbnails.flat();
                    chrome.storage.local.set({[url]: {thumbnails, thumbIndex: 0, bgColor}})
                        .then(() => resolve());
                });
        } else {
            resolve();
        }
    });
}

// MESSAGE HANDLERS


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
      justification: 'fetch image for speed dial from webpage'
    });
    await creating;
    creating = null;
  }
}
