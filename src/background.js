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

async function handleManualRefresh(data) {
    if (data.url && (data.url.startsWith('https://') || data.url.startsWith('http://') || data.url.startsWith('file://') || data.url.startsWith('chrome://'))) {
        await chrome.storage.local.remove(data.url);
        await getThumbnails(data.url, data.id, data.parentId, {forceScreenshot: true, forcePageReload: true});
    }
}

const capturePopupScreenshot = (url) => {
  // firefox: use tabs.captureTab to grab any tab regardless of visibility, and
  // place the popup window off-screen so it never disrupts the user. unlike
  // 'minimized', a normal-state offscreen window keeps rendering so the page
  // actually paints before capture.

  return new Promise((resolve) => {
    let finished = false;
    chrome.windows.create({
        url: url,
        focused: false,
        width: 1280,
        height: 720,
        left: -2000,
        top: -2000,
        type: 'popup'
      }).then((popup) => {
        if (!popup.tabs || !popup.tabs.length) {
          chrome.windows.remove(popup.id)
          return resolve(null)
        }

        const tabId = popup.tabs[0].id
        let loadingInterval;

        const cleanup = (result = null) => {
            if (finished) return;
            finished = true;

            clearInterval(loadingInterval);
            clearTimeout(timeout);

            chrome.windows.remove(popup.id).catch(() => {});
            resolve(result);
        };

        chrome.tabs.update(tabId, {
          muted: true
        })

        const timeout = setTimeout(() => {
          cleanup();
        }, 10000)

        loadingInterval = setInterval(() => {
          chrome.tabs.get(tabId).then((tab) => {
            'complete' === tab.status &&
              (clearInterval(loadingInterval),
              setTimeout(() => {
                // delay to let page render
                chrome.tabs
                  .captureTab(tabId)
                  .then((screenshot) => {
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
		return
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

	// parse images from dom directly in the background page (firefox MV3)
	const { thumbs, bgColor } = await processThumbnails({
		url,
		id,
		parentId,
		screenshot,
		quickRefresh: options.quickRefresh,
	});

	await saveThumbnails(url, id, parentId, thumbs, bgColor, options.forcePageReload);
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


// THUMBNAIL PROCESSING (inlined from offscreen.js for firefox MV3) //

const imageRatio = 1.54;

function offscreenCanvasShim(w=1, h=1) {
    try {
        return new OffscreenCanvas(w, h);
    } catch (err) {
        // offscreencanvas not supported in ff
        let canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        return canvas;
    }
}

async function processThumbnails({ url, id, parentId, screenshot, quickRefresh }) {
    let resizedImages = [];
    let thumbs = [];
    let bgColor = null;

    let images = await fetchImages(url, quickRefresh).catch(err => {
        console.log(err);
    });

    if (images && images.length) {
        resizedImages = await Promise.all(images.map(async (image) => {
            const result = await resizeImage(image).catch(err => {
                console.log(err);
            });
            return result;
        }));
    }

    let processedScreenshot = null;
    if (screenshot) {
        // screenshot is handled separately to remove scrollbars
        processedScreenshot = await resizeImage(screenshot, true).catch(err => {
            console.log(err);
        });
    }

    if (resizedImages && resizedImages.length) {
        // If we have a screenshot, reserve the last spot for it and only take 4 webpage images
        const maxWebpageImages = processedScreenshot ? 5 : 6;
        thumbs = resizedImages.filter(item => item).slice(0, maxWebpageImages);

        // Always add the screenshot as the last image if available
        if (processedScreenshot) {
            thumbs.push(processedScreenshot);
        }
    } else if (processedScreenshot) {
        // No webpage images, but we have a screenshot
        thumbs = [processedScreenshot];
    }

    if (thumbs.length) {
        bgColor = await getBgColor(thumbs[0]);
    }

    return { thumbs, bgColor };
}

function convertUrlToAbsolute(origin, path) {
    if (path.indexOf('://') > 0) {
        return path
    } else if (path.indexOf('//') === 0) {
        return 'https:' + path;
    } else {
        let url = new URL(origin);
        if (path.slice(0,1) === "/") {
            return url.origin + path;
        } else {
            if (url.pathname.slice(-1) !== "/") {
                url.pathname = url.pathname + "/";
            }
            return new URL(path, origin).href;
        }
    }
}

function colorsAreSimilar(color1, color2, tolerance = 2) {
    return Math.abs(color1[0] - color2[0]) <= tolerance &&
           Math.abs(color1[1] - color2[1]) <= tolerance &&
           Math.abs(color1[2] - color2[2]) <= tolerance &&
           Math.abs(color1[3] - color2[3]) <= tolerance;
}

async function fetchImageAsDataURI(imageUrl) {
    if (imageUrl.startsWith('data:')) return imageUrl;
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error('Fetch failed');
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        return null;
    }
}

function getBgColor(image) {
    // todo: ensure this is performant
    // todo: ensure our similar color counting is accurate, same as index
    return new Promise(function(resolve, reject) {
        let img = new Image();
        img.onload = function () {
            let imgWidth = img.naturalWidth;
            let imgHeight = img.naturalHeight;
            let canvas = offscreenCanvasShim(imgWidth, imgHeight);
            let context = canvas.getContext('2d', {willReadFrequently:true});
            context.drawImage(img, 0, 0);

            let totalPixels = 0;
            let avgColor = [0, 0, 0, 0];
            let colorCounts = [];
            let hasTransparentPixel = false;

            // background color algorithm
            // think the results are best when sampling 2 pixels deep from the edges
            // 1px gives bad results from image artifacts, more than 2px means we average away any natural framing/background in the image

            // Sample the top and bottom edges
            for (let x = 0; x < imgWidth; x += 2) { // Sample every other pixel
                for (let y = 0; y < 2; y++) {
                    let pixelTop = context.getImageData(x, y, 1, 1).data;
                    let pixelBottom = context.getImageData(x, imgHeight - 1 - y, 1, 1).data;
                    avgColor[0] += pixelTop[0] + pixelBottom[0];
                    avgColor[1] += pixelTop[1] + pixelBottom[1];
                    avgColor[2] += pixelTop[2] + pixelBottom[2];
                    avgColor[3] += pixelTop[3] + pixelBottom[3];
                    totalPixels += 2;
                    if (pixelTop[3] < 255 || pixelBottom[3] < 255) {
                        hasTransparentPixel = true;
                    }

                    let found = false;
                    for (let colorCount of colorCounts) {
                        if (colorsAreSimilar(colorCount.color, pixelTop)) {
                            colorCount.count++;
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        colorCounts.push({ color: pixelTop, count: 1 });
                    }

                    found = false;
                    for (let colorCount of colorCounts) {
                        if (colorsAreSimilar(colorCount.color, pixelBottom)) {
                            colorCount.count++;
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        colorCounts.push({ color: pixelBottom, count: 1 });
                    }
                }
            }

            // Sample the left and right edges
            for (let y = 2; y < imgHeight - 2; y += 2) { // Sample every other pixel
                for (let x = 0; x < 2; x++) {
                    let pixelLeft = context.getImageData(x, y, 1, 1).data;
                    let pixelRight = context.getImageData(imgWidth - 1 - x, y, 1, 1).data;
                    avgColor[0] += pixelLeft[0] + pixelRight[0];
                    avgColor[1] += pixelLeft[1] + pixelRight[1];
                    avgColor[2] += pixelLeft[2] + pixelRight[2];
                    avgColor[3] += pixelLeft[3] + pixelRight[3];
                    totalPixels += 2;
                    if (pixelLeft[3] < 255 || pixelRight[3] < 255) {
                        hasTransparentPixel = true;
                    }

                    let found = false;
                    for (let colorCount of colorCounts) {
                        if (colorsAreSimilar(colorCount.color, pixelLeft)) {
                            colorCount.count++;
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        colorCounts.push({ color: pixelLeft, count: 1 });
                    }

                    found = false;
                    for (let colorCount of colorCounts) {
                        if (colorsAreSimilar(colorCount.color, pixelRight)) {
                            colorCount.count++;
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        colorCounts.push({ color: pixelRight, count: 1 });
                    }
                }
            }

            avgColor = avgColor.map(color => color / totalPixels);
            avgColor[3] = avgColor[3] / 255; // Normalize alpha value

            let mostCommonColor = null;
            let maxCount = 0;
            for (let colorCount of colorCounts) {
                if (colorCount.count > maxCount) {
                    maxCount = colorCount.count;
                    mostCommonColor = colorCount.color;
                }
            }

            // todo: clean this up - set background and color separately

            if (maxCount > totalPixels / 2) {
                mostCommonColor[3] = mostCommonColor[3] / 255; // Normalize alpha value
                resolve(`linear-gradient(to bottom, rgba(${mostCommonColor[0]},${mostCommonColor[1]},${mostCommonColor[2]},${mostCommonColor[3]}) 50%, rgba(${mostCommonColor[0]},${mostCommonColor[1]},${mostCommonColor[2]},${mostCommonColor[3]}) 50%)`);
            } else {
                if (hasTransparentPixel) {
                    avgColor[3] = 0; // Make the gradient transparent if any pixel is transparent
                }
                resolve(`linear-gradient(to bottom, rgba(${avgColor[0]},${avgColor[1]},${avgColor[2]},${avgColor[3]}) 50%, rgba(${avgColor[0]},${avgColor[1]},${avgColor[2]},${avgColor[3]}) 50%)`);
            }
        };
        img.onerror = function() {
            resolve();
        };
        img.crossOrigin = "Anonymous";
        img.src = image;
    });
}

function resizeImage(image, screenshot = false, isFallback = false) {
    return new Promise((resolve, reject) => {
        if (!image || !image.length) {
            return resolve();
        }

        const targetWidth = 256;
        const targetHeight = 144;
        const targetRatio = targetWidth / targetHeight;
        const tolerance = 0.25;

        // we dont need to resize svgs
        if (image.startsWith('data:image/svg+xml')) {
            return resolve(image);
        }

        // if we only have a reference, store as image. todo: just fetch the svg instead
        if (image.endsWith('.svg')) {
            const img = new Image();

            img.onerror = async (event) => {
                if (!isFallback && !image.startsWith('data:')) {
                    const dataUri = await fetchImageAsDataURI(image).catch(() => null);
                    if (dataUri) {
                        const result = await resizeImage(dataUri, screenshot, true);
                        return resolve(result);
                    }
                }
                resolve();
            };

            img.onload = function() {
                let canvas = document.createElement('canvas');
                let ctx = canvas.getContext('2d');

                // Set canvas to target size for SVGs
                canvas.width = targetWidth;
                canvas.height = targetHeight;

                // Draw SVG centered and scaled to fit
                let scale = Math.min(targetWidth / this.width, targetHeight / this.height);
                let x = (targetWidth - this.width * scale) / 2;
                let y = (targetHeight - this.height * scale) / 2;

                ctx.drawImage(this, x, y, this.width * scale, this.height * scale);

                const newDataURI = canvas.toDataURL('image/webp', 0.9);
                resolve(newDataURI);
            };

            img.src = image;
            return;
        }

        const img = new Image();

        img.onerror = async (event) => {
            if (!isFallback && !image.startsWith('data:')) {
                const dataUri = await fetchImageAsDataURI(image).catch(() => null);
                if (dataUri) {
                    const result = await resizeImage(dataUri, screenshot, true);
                    return resolve(result);
                }
            }
            resolve();
        };

        img.onload = function () {
            let sWidth = this.naturalWidth || this.width;
            let sHeight = this.naturalHeight || this.height;

            // resize any image > target size
            if (sWidth >= targetWidth || sHeight >= (targetHeight - 22)) {

                let nocrop = false;

                if (screenshot) {
                    sWidth -= 17;
                    sHeight -= 17;
                }

                const sRatio = sWidth / sHeight;
                let canvas = document.createElement('canvas');
                let ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";

                let sX = 0, sY = 0, dWidth = targetWidth, dHeight = targetHeight;

                if (screenshot) {
                    if (sRatio > targetRatio) {
                        // Wider than target, crop sides
                        const newWidth = sHeight * targetRatio;
                        sX = (sWidth - newWidth) / 2;
                        sWidth = newWidth;
                    } else {
                        // Taller than target, crop from top (by adjusting sHeight)
                        sHeight = sWidth / targetRatio;
                    }
                } else if (sRatio < targetRatio && sRatio > (targetRatio - tolerance)) {
                    // if image aspect ratio is very close to the speed dial aspect ratio crop it to fit
                    // todo: maybe we can do this programmatically with css imagefit so we dont overly crop images when user wants square format

                    // Aspect is narrower, crop top and bottom
                    let naturalHeight = targetWidth / sRatio;
                    let crop = (naturalHeight - targetHeight) / 2;
                    sY = crop;
                    sHeight -= 2 * crop;
                } else if (sRatio > targetRatio && sRatio < (targetRatio + tolerance)) {
                    // Aspect is wider, crop sides
                    let naturalWidth = targetHeight * sRatio;
                    let crop = (naturalWidth - targetWidth) / 2;
                    sX = crop;
                    sWidth -= 2 * crop;
                } else {
                    nocrop = true;
                    // image is not close to our target ratio. rescale to a max width/height of 256px without cropping
                    if (sWidth > sHeight) {
                        dHeight = Math.round(targetWidth / sRatio);
                        dWidth = targetWidth;
                    } else {
                        dWidth = Math.round(targetHeight * sRatio);
                        dHeight = targetHeight;
                    }
                }

                canvas.width = dWidth;
                canvas.height = dHeight;
                if (nocrop) {
                    ctx.drawImage(this, sX, sY, dWidth, dHeight);
                } else {
                    ctx.drawImage(this, sX, sY, sWidth, sHeight, 0, 0, dWidth, dHeight);
                }

                const newDataURI = canvas.toDataURL('image/webp', 0.9);
                resolve(newDataURI);
            } else if (sHeight >= 96 || sWidth >= 96) {
                resolve(image);
            } else {
                // discard images < 96px
                resolve();
            }
        };

        img.crossOrigin = "Anonymous";
        img.src = image;
    });
}

function extractBackgroundImages(cssText) {
    const backgroundImages = [];
    const regex = /background(?:-image)?:\s*url\(["']?(.*?)["']?\)/g;

    let match;
    while ((match = regex.exec(cssText)) !== null) {
        backgroundImages.push(match[1]); // Extracted URL
    }

    return backgroundImages;
}

async function fetchImages(url, quickRefresh) {

    if (url.startsWith('file://')) {
        return ['img/file.png'];
    }
    if (url.startsWith('chrome://')) {
        return ['img/widget.png'];
    }

    const whitelist = [
        "mail.google.com",
        "gmail.com",
        "chromewebstore.google.com",
        "twitter.com"
    ];

    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    let images = [];

    // default favicons
    images.push(urlObj.origin + "/favicon.ico")

    // amazon hack
    if (hostname.includes('amazon')) {
        images.push('img/amazon.com.png');
        // dont fetch other images for the root page
        if (hostname.startsWith('amazon') && hostname.length < 14) {
            return(images);
        }
    } else {
        images.push(`https://cdn.brandfetch.io/domain/${hostname}/w/256/h/256/logo/fallback/404/?c=key`);
        images.push(`https://cdn.brandfetch.io/domain/${hostname}/w/256/h/256/icon/fallback/404/?c=key`);
    }

    // avoid duplicates and preserve the precedence of images
    function insert(imageUrl) {
        let existingIndex = images.indexOf(imageUrl);
        if (existingIndex !== -1) {
            images.splice(existingIndex, 1);
        }
        images.unshift(imageUrl);
    }

    if (whitelist.includes(hostname)) {
        return(['img/' + hostname + '.png']);
    } else {

         // Set up fetch timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), quickRefresh ? 3000 : 4000);

        try {
            // allows og images to work, with creds they are behind js
            const omitDomains = ['facebook.com', 'github.com'];
            const credentials = omitDomains.some(domain => hostname.endsWith(domain)) ? 'omit' : 'same-origin'; // should be include bro?

            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                credentials,
                signal: controller.signal
            });

            clearTimeout(timeoutId); // Clear timeout if fetch completes in time

            // Update URL to the final redirected URL for proper relative URL resolution
            const finalUrl = response.url;
            if (finalUrl !== url) {
                //console.log(`[fetchImages] URL redirected from ${url} to ${finalUrl}`);
                url = finalUrl; // Update the base URL for relative URL conversion
            }

            if (!response.ok) {
                return(images);
            }

            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');

            // check for svg logo and convert to data url
            let svgElements = doc.querySelectorAll('svg');
            for (let svg of svgElements) {
                // heuristic to find relevant svg (logo class or large size)
                let isLogo = svg.getAttribute('aria-label')?.toLowerCase().includes(hostname.split('.')[0]) ||
                        svg.getAttribute('class')?.toLowerCase().includes('logo') ||
                        svg.id?.toLowerCase().includes('logo') ||
                        (svg.getAttribute('role') === 'img' && svg.getAttribute('width') && parseInt(svg.getAttribute('width')) >= 96);
                if (isLogo) {
                    try {
                        // Convert SVG to data URL
                        let svgString = new XMLSerializer().serializeToString(svg);
                        let svgDataUrl = 'data:image/svg+xml;base64,' + btoa(svgString);
                        images.push(svgDataUrl);
                        break; // take the first svg logo we find
                    } catch (svgError) {
                        console.warn(`[fetchImages] Error processing SVG:`, svgError);
                    }
                }
            }

            // get first image from page
            let firstImage = doc.querySelector('img');
            if (firstImage && firstImage.src) {
                // filter known problematic images
                const filters = ['fxxj3ttftm5ltcqnto1o4baovyl', 'nav-sprite-global'];
                if (!filters.some(element => firstImage.src.includes(element))) {
                    let imageUrl = convertUrlToAbsolute(url, firstImage.getAttribute('src')); // can't use .src directly in offscreen doc
                    insert(imageUrl);
                }
            }

            // amazon images
            let mainImage = doc.querySelector('#main-image-container img');
            if (mainImage && mainImage.src) {
                // filter for 'look inside' amazon book images; grab the next image
                if (mainImage.id === 'sitbLogoImg') {
                    let newMainImage = doc.querySelectorAll('#main-image-container img')[1];
                    if (newMainImage && newMainImage.src && newMainImage.id !== 'sitbLogoImg') {
                        insert(newMainImage.src);
                    }
                } else {
                    insert(mainImage.src);
                }
            }

            // icon sizes
            let sizes = [
                "512x512",
                "256x256",
                "192x192",
                "180x180",
                "144x144",
                "96x96"
            ];

            // get apple touch icon
            let appleIcon = doc.querySelector('link[rel="apple-touch-icon"]');
            if (appleIcon && appleIcon.getAttribute('href')) {
                let imageUrl = convertUrlToAbsolute(url, appleIcon.getAttribute('href'));
                insert(imageUrl);
            }

            // get x-icon
            let xIcon = doc.querySelector('link[rel="icon"]');
            if (xIcon && xIcon.getAttribute('href')) {
                let imageUrl = convertUrlToAbsolute(url, xIcon.getAttribute('href'));
                insert(imageUrl);
            }

            // get large apple touch icon
            for (let size of sizes) {
                let appleIcon = doc.querySelector(`link[rel="apple-touch-icon"][sizes="${size}"]`);
                if (appleIcon && appleIcon.getAttribute('href')) {
                    let imageUrl = convertUrlToAbsolute(url, appleIcon.getAttribute('href'));
                    insert(imageUrl);
                    break;
                }
            }

            // get large x-icon
            for (let size of sizes) {
                let icon = doc.querySelector(`link[rel="icon"][sizes="${size}"]`);
                if (icon && icon.getAttribute('href')) {
                    let imageUrl = convertUrlToAbsolute(url, icon.getAttribute('href'));
                    insert(imageUrl);
                    break;
                }
            }

            // get structured data images (schema.org microdata)
            let structuredImages = doc.querySelectorAll('meta[itemprop="image"]');
            for (let meta of structuredImages) {
                let content = meta.getAttribute('content');
                if (content) {
                    let imageUrl = convertUrlToAbsolute(url, content);
                    insert(imageUrl);
                }
            }

            // get open graph images
            let metas = doc.getElementsByTagName("meta");
            for (let meta of metas) {
                if (meta.getAttribute("property") === "og:image" && meta.getAttribute("content")) {
                    let imageUrl = convertUrlToAbsolute(url, meta.getAttribute("content"));
                    insert(imageUrl);
                }
            }

            // if we havent had much luck with images, lets check the manifest and style sheets
            // we dont do so during a quick refresh to avoid fetching extra resources
            if (images.length < 5 && !quickRefresh) {
                // web application manifest icon
                let manifestLink = doc.querySelector('link[rel="manifest"]');
                if (manifestLink && manifestLink.getAttribute('href')) {
                    try {
                        let manifestUrl = convertUrlToAbsolute(url, manifestLink.getAttribute('href'));
                        const manifestResponse = await fetch(manifestUrl, {
                            signal: controller.signal
                        });
                        if (manifestResponse.ok) {
                            const manifest = await manifestResponse.json();
                            if (manifest.icons && Array.isArray(manifest.icons)) {
                                // Sort icons by size (largest first) and get the best ones
                                const sortedIcons = manifest.icons
                                    .filter(icon => icon.src) // Only icons with src
                                    .sort((a, b) => {
                                        // Extract numeric size for comparison
                                        const getSizeValue = (sizes) => {
                                            if (!sizes) return 0;
                                            const match = sizes.match(/(\d+)x(\d+)/);
                                            return match ? parseInt(match[1]) * parseInt(match[2]) : 0;
                                        };
                                        return getSizeValue(b.sizes) - getSizeValue(a.sizes);
                                    });
                                // take the largest
                                if (sortedIcons.length > 0) {
                                    let iconUrl = convertUrlToAbsolute(manifestUrl, sortedIcons[0].src);
                                    images.push(iconUrl);
                                }
                            }
                        }
                    } catch (manifestError) {
                        console.warn(`[fetchImages] Error fetching manifest:`, manifestError);
                    }
                }

                const stylesheetLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))
                .map(stylesheet => convertUrlToAbsolute(url, stylesheet.getAttribute('href')));

                for (const sheetUrl of stylesheetLinks) {
                    try {
                        const cssResponse = await fetch(sheetUrl, {
                            signal: controller.signal
                        });
                        if (!cssResponse.ok) throw new Error(`failed to fetch css`);
                        const cssText = await cssResponse.text();
                        const cssImages = extractBackgroundImages(cssText)
                            .filter(image => /logo|icon|splash|hero|main/i.test(image)); // heuristic filter for icon

                        if (cssImages.length) {
                            // todo: fix the absolute url conversion -- i think urls that jump a couple of levels are busted
                            cssImages.forEach(cssImage => {
                                images.push(convertUrlToAbsolute(sheetUrl, cssImage));
                            });
                        }

                    } catch (err) {
                        console.warn(`Could not fetch stylesheet: ${sheetUrl}`, err);
                    }
                }
            }

            return images;

        } catch (error) {
            //console.log("fetch error: ", error)
            // return the images we have:
            return images;
        } finally {
            clearTimeout(timeoutId); // Ensure timeout is cleared in case of early exit
        }
    }
}
