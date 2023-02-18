// yet another speed dial
// copyright 2019 dev@conceptualspace.net
// absolutely no warranty is expressed or implied

'use strict';

let messagePorts = [];
let speedDialId = null;
let folderIds = [];
let settings = null;
let defaults = {
    wallpaper: true,
    wallpaperSrc: 'img/bg.jpg',
    backgroundColor: '#111111',
    largeTiles: true,
    rememberFolder: false,
    showTitles: true,
    showAddSite: true,
    showFolders: true,
    showSettingsBtn: true,
    showClock: true,
    maxCols: '100',
    defaultSort: 'first',
    textColor: '#ffffff'
};
let cache = {};
let currentFolder = null;
let ready = false;
let firstRun = true;
let tripwire = 0;
let tripwireTimestamp = 0;
const imageRatio = 1.54;

function getSpeedDialId() {
    return new Promise((resolve, reject) => {
        browser.bookmarks.search({title: 'Speed Dial'}).then(result => {
            if (result) {
                for (let bookmark of result) {
                    if (!bookmark.url) {
                        speedDialId = bookmark.id;
                        break;
                    }
                }
            }
            if (speedDialId) {
                browser.bookmarks.getChildren(speedDialId).then(results => {
                    for (let result of results) {
                        if (!result.url && result.title) {
                            folderIds.push(result.id);
                        }
                    }
                })
                resolve()
            } else {
                browser.bookmarks.create({title: 'Speed Dial'}).then(result => {
                    speedDialId = result.id;
                    resolve();
                }, error => {
                    reject(error);
                });
            }
        }, error => {
            reject(error)
        });
    });
}

function createBookmarkFromBrowser(tab) {
    // check for doopz
    let match = false;
    browser.bookmarks.getSubTree(speedDialId).then(node => {
        for (const bookmark of node[0].children) {
            if (tab.url === bookmark.url) {
                match = true;
                break;
            }
        }
        if (!match) {
            browser.bookmarks.create({
                parentId: speedDialId,
                title: tab.title,
                url: tab.url
            })
        }
    });
}

function handleBrowserAction(tab) {
    createBookmarkFromBrowser(tab)
    browser.browserAction.disable(tab.id);
    browser.browserAction.setBadgeText({text:"✅️", tabId:tab.id})
    browser.browserAction.setBadgeBackgroundColor({color: [0, 0, 0, 0]});
}

function onClickHandler(info, tab) {
    if (info.menuItemId === 'addToSpeedDial') {
        createBookmarkFromBrowser(tab)
    }
}

function refreshOpen() {
    for (let port of messagePorts) {
        port.postMessage({refresh:true, cache});
    }
}

function refreshInactive() {
    for (let port of messagePorts) {
        port.postMessage({refreshInactive:true, cache});
    }
}

// convert relative url paths
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
            return url.origin + url.pathname + path;
        }
    }
}

async function getThumbnails(url, options = {quickRefresh: false, forceScreenshot: false}) {

    let images = [];
    let resizedImages = [];
    let title = null;

    images = await fetchImages(url).catch(err => {
        console.log(err);
    })

    resizedImages = await Promise.all(images.map(async (image) => {
        const result = await resizeImage(image).catch(err => {
            console.log(err);
        });
        return result
    }))

    if (!options.quickRefresh) {
        const results = await getScreenshot(url, options.forceScreenshot).catch(err => {
            console.log(err);
        })

        if (results && results.title) {
            title = results.title
        }

        if (results && results.screenshot) {
            const screenshot = await resizeImage(results.screenshot, true).catch(err => {
                console.log(err);
            })
            resizedImages.push(screenshot)
        }
    }

    const thumbs = resizedImages.filter(item => item)

    if (thumbs.length) {
        const bgColor = await getBgColor(thumbs[0])
        cache[url] = [thumbs[0], bgColor];
        await saveThumbnails(url, thumbs, bgColor)
    }

    return title;

}

// fetch images
// finds open graph images, apple icons, favicons, and first image of page
function fetchImages(url) {
    return new Promise(function (resolve, reject) {

        const whitelist = [
            "mail.google.com",
            "gmail.com",
            "www.facebook.com",
            "www.reddit.com",
            "twitter.com"
        ];

        const hostname = new URL(url).hostname;

        let images = [];

        // default favicons
        images.push(new URL(url).origin + "/favicon.ico")
        // amazon hack
        if (hostname.includes('amazon')) {
            images.push('img/amazon.com.png');
            // dont fetch other images for the root page
            if (hostname.startsWith('amazon') && hostname.length < 14) {
                resolve(images);
            }
        } else {
            images.push('https://logo.clearbit.com/' + new URL(url).hostname + '?size=256');
        }

        // avoid duplicates and preserve the presedence of images
        function insert(imageUrl) {
            let existingIndex = images.indexOf(imageUrl);
            if (existingIndex === -1) {
                images.unshift(imageUrl);
            } else {
                images.unshift(images.splice(existingIndex, 1)[0])
            }
        }

        if (whitelist.includes(hostname)) {
            resolve(['img/' + hostname + '.png']);
            return;
        } else {
            let xhr = new XMLHttpRequest();
            xhr.open("GET", url);
            // fix for shitty websites, like imdb
            xhr.overrideMimeType("text/html");
            xhr.timeout = 6500; // time in milliseconds
            xhr.responseType = "document";

            xhr.onerror = function (e) {
                //console.log(e);
                resolve(images);
                return;
            };

            xhr.ontimeout = function (e) {
                resolve(images);
                return;
            };

            xhr.onload = function () {

                if (!xhr.responseXML) {
                    return
                }

                // get first image from page
                let firstImage = xhr.responseXML.querySelector('img');
                if (firstImage && firstImage.src) {
                    // filter known problematic images
                    const filters = ['fxxj3ttftm5ltcqnto1o4baovyl', 'nav-sprite-global'];
                    if (!filters.some(element => firstImage.src.includes(element))) {
                        insert(firstImage.src);
                    }
                }

                // amazon images
                let mainImage = xhr.responseXML.querySelector('#main-image-container img');
                if (mainImage && mainImage.src) {
                    // filter for 'look inside' amazon book images; grab the next image
                    if (mainImage.id === 'sitbLogoImg') {
                        let newMainImage = xhr.responseXML.querySelectorAll('#main-image-container img')[1];
                        if (newMainImage && newMainImage.src && newMainImage.id !== 'sitbLogoImg') {
                            insert(newMainImage.src);
                        }
                    } else {
                        insert(mainImage.src);
                    }
                }

                // get apple touch icon
                let appleIcon = xhr.responseXML.querySelector('link[rel="apple-touch-icon"]');
                if (appleIcon && appleIcon.getAttribute('href')) {
                    let imageUrl = convertUrlToAbsolute(url, appleIcon.getAttribute('href'));
                    insert(imageUrl);
                }

                // get large icons
                let sizes = [
                    "512x512",
                    "256x256",
                    "192x192",
                    "180x180",
                    "144x144",
                    "96x96"
                ];
                for (let size of sizes) {
                    let icon = xhr.responseXML.querySelector(`link[rel="icon"][sizes="${size}"]`);
                    if (icon && icon.getAttribute('href')) {
                        let imageUrl = convertUrlToAbsolute(url, icon.getAttribute('href'));
                        insert(imageUrl);
                        break;
                    }
                }

                // get open graph images
                let metas = xhr.responseXML.getElementsByTagName("meta");
                for (let meta of metas) {
                    if (meta.getAttribute("property") === "og:image" && meta.getAttribute("content")) {
                        let imageUrl = convertUrlToAbsolute(url, meta.getAttribute("content"));
                        insert(imageUrl);
                    }
                }

                resolve(images);
                return;

            };

            xhr.send();

        }
    });
}

function saveThumbnails(url, images, bgColor) {
    return new Promise(function(resolve, reject) {
        if (images && images.length) {
            let thumbnails = [];
            browser.storage.local.get(url)
                .then(result => {
                    if (result[url] && result[url].thumbnails) {
                        thumbnails = result[url].thumbnails;
                    }
                    thumbnails.push(images);
                    thumbnails = thumbnails.flat();
                    browser.storage.local.set({[url]: {thumbnails, thumbIndex: 0, bgColor}})
                        .then(() => resolve());
                });
        } else {
            resolve();
        }
    });
}


function getScreenshot(url, forceScreenshot = false) {

    return new Promise(async function(resolve, reject) {

        const targetTab = await browser.tabs.query({
            windowId: browser.windows.WINDOW_ID_CURRENT,
            url: url.split('#')[0] // tabs.query doesn't match fragment identifiers :/
        }).catch(err => {
            console.log(err);
        })

        if (targetTab && targetTab.length && targetTab[0].active) {
            const title = targetTab.title ? targetTab.title : '';
            const screenshot = await browser.tabs.captureVisibleTab().catch(err => {
                console.log(err);
            })

            resolve({screenshot, title});

        } else {

            const activeTab = await browser.tabs.query({
                windowId: browser.windows.WINDOW_ID_CURRENT,
                active: true
            }).catch(err => {
                console.log(err);
            })

            if (targetTab && targetTab.length && targetTab[0].url === url) {
                await browser.tabs.update(targetTab[0].id, {active: true}).catch(err => {
                    // todo: could be a race condition here
                    console.log(err);
                });
                const title = targetTab.title ? targetTab.title : '';
                const screenshot = await browser.tabs.captureVisibleTab().catch(err => {
                    console.log(err);
                })
                if (activeTab && activeTab.length) {
                    // restore the tab that was active before (not required in ff)
                    browser.tabs.update(activeTab[0].id, {active: true}).catch(err => {
                        console.log(err);
                    })
                }
                resolve({screenshot, title});

            } else if ((tripwire < 2 && Date.now() - tripwireTimestamp > 3500) || forceScreenshot) {

                async function handleUpdated(tabId, changeInfo, tabInfo) {
                    if (changeInfo.status === "complete" && tabId === tab.id) {

                        // screencapture on chrome requires tab to be active
                        if (!browser.runtime.getBrowserInfo) {
                            const updatedTab = await browser.tabs.update(tabId, {active: true}).catch(err => {
                                console.log(err);
                            })
                        }

                        setTimeout(async function () {

                            const title = tabInfo.title ? tabInfo.title : '';
                            let screenshot;

                            // screencapture on chrome requires tab to be active
                            if (!browser.runtime.getBrowserInfo) {
                                screenshot = await browser.tabs.captureVisibleTab().catch(err => {
                                    console.log(err);
                                })
                            } else {
                                screenshot = await browser.tabs.captureTab(tabId).catch(err => {
                                    console.log(err);
                                })
                            }

                            browser.tabs.onUpdated.removeListener(handleUpdated);

                            if (activeTab && activeTab.length) {
                                // restore the tab that was active before (not required in ff)
                                browser.tabs.update(activeTab[0].id, {active: true}).catch(err => {
                                    console.log(err);
                                })
                            }

                            if (timer) {
                                clearTimeout(timer);
                            }

                            browser.tabs.remove(tabId).catch(err => {
                                console.log(err)
                            })

                            resolve({screenshot, title});
                        }, 1000);
                    }
                }

                browser.tabs.onUpdated.addListener(handleUpdated);

                const tab = await browser.tabs.create({
                    active: false,
                    url
                }).catch(err => {
                    console.log(err);
                    resolve();
                    return
                })

                // timeout for site to load
                let timer = setTimeout(async function () {
                    browser.tabs.onUpdated.removeListener(handleUpdated);
                    browser.tabs.remove(tab.id).catch(err => {
                        console.log(err)
                    })
                    resolve();
                }, 10000)

            } else {
                resolve();
            }
        }
    });

}

// downscale image
function resizeImage(image, screenshot=false) {
    return new Promise(function (resolve, reject) {
        if (image && image.length) {
            let img = new Image();

            img.onerror = function(event) {
                resolve();
            }

            img.onload = function () {

                let sWidth = this.width;
                let sHeight = this.height;

                if (sHeight > 256 || sWidth > 256) {

                    let canvas = document.createElement('canvas');
                    let ctx = canvas.getContext('2d', { willReadFrequently: true });
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = "high";

                    const maxSize = 256;
                    const maxWidth = Math.round(256 * imageRatio);

                    const sRatio = sWidth / sHeight

                    let sX = 0;
                    let sY = 0;
                    let dX = 0;
                    let dY = 0;
                    let dWidth = sWidth;
                    let dHeight = sHeight;

                    // remove scrollbars from screenshots
                    if (screenshot) {
                        sWidth = sWidth - 17;
                        sHeight = sHeight - 17;
                    }

                    // if image aspect ratio is very close to the speed dial aspect ratio crop it to fit
                    if (sRatio < imageRatio && sRatio > (imageRatio - 0.2)) {
                        // aspect is narrower, crop top and bottom
                        let naturalHeight = maxWidth / sRatio
                        let crop = ( naturalHeight - maxSize )
                        sY = crop / 2; // take equal amounts from each side
                        sHeight = sHeight - crop;
                        dHeight = maxSize;
                        dWidth = Math.round(maxSize * imageRatio)
                    } else if (sRatio > imageRatio && sRatio < (imageRatio + 0.2)) {
                        // aspect is wider, crop sides to fit
                        let naturalWidth = maxSize * sRatio
                        let crop = ( naturalWidth - maxWidth )
                        sX = crop / 2;
                        sWidth = sWidth - crop;
                        dWidth = maxSize;
                        dHeight = Math.round(maxSize / imageRatio)
                    } else if (sWidth > sHeight) {
                        // rescale to max width of 256px
                        let ratio = maxSize / sWidth;
                        dHeight = Math.round(sHeight * ratio);
                        dWidth = maxSize;
                    } else {
                        // rescale to max height of 256px
                        let ratio = maxSize / sHeight;
                        dWidth = Math.round(sWidth * ratio);
                        dHeight = maxSize;
                    }

                    canvas.width = dWidth;
                    canvas.height = dHeight;

                    //console.log(sX, sY, sWidth, sHeight, dX, dY, dWidth, dHeight);
                    ctx.drawImage(this, sX, sY, sWidth, sHeight, dX, dY, dWidth, dHeight)

                    const newDataURI = canvas.toDataURL('image/webp', 0.94);
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
        } else {
            resolve();
        }
    });
}

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

// calculate the bg color of a given image
// samples the second pixel from the top left and the second pixel from either the top-right or bottom-left
// depending on whether the image is narrow or wide
// todo: punt this to a worker
// todo: export functions resused in index.js
function getBgColor(image) {
    return new Promise(function(resolve, reject) {
        let img = new Image();
        img.onload = function () {
            let imgWidth = img.naturalWidth;
            let imgHeight = img.naturalHeight;
            let sx, sy, sw, sh, direction;

            if ((imgWidth / imgHeight) > imageRatio) {
                // image is wide; sample top and bottom
                sy = imgHeight - 2
                sx = 2;
                sw = 1
                sh = -1
                direction = 'bottom'

            } else {
                // sample left and right
                sx = imgWidth - 2
                sy = 2;
                sw = -1
                sh = -1
                direction = 'right'
            }

            let rgba = [0, 0, 0, 0];
            let rgbaa = [0, 0, 0, 0];
            let canvas = offscreenCanvasShim(imgWidth, imgHeight);
            // {willReadFrequently:true} readback optimization improves perf for getImageData and toDataURL
            // todo add to other contexts
            let context = canvas.getContext('2d', {willReadFrequently:true});
            context.drawImage(img, 0, 0);

            // get the top left pixel, cheap and easy
            // todo: if its equally performant, sample all corners and return the mode?
            let pixelA = context.getImageData(1, 1, 2, 2);
            rgba[0] = pixelA.data[0];
            rgba[1] = pixelA.data[1];
            rgba[2] = pixelA.data[2];
            rgba[3] = pixelA.data[3] / 255; // imageData alpha value is 0..255 instead of 0..1

            let pixelB = context.getImageData(sx, sy, sw, sh);
            rgbaa[0] = pixelB.data[0];
            rgbaa[1] = pixelB.data[1];
            rgbaa[2] = pixelB.data[2];
            rgbaa[3] = pixelB.data[3] / 255; // imageData alpha value is 0..255 instead of 0..1

            // if part of the edge is transparent, make whole bg transparent
            if ((rgba[3]) < 0.9 || rgbaa[3] < 0.9) {
                rgba[3] = 0
                rgbaa[3] = 0
            }

            //return rgba;
            //console.log(direction, rgba, rgbaa);
            resolve(`linear-gradient(to ${direction}, rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3]}) 50%, rgba(${rgbaa[0]},${rgbaa[1]},${rgbaa[2]},${rgbaa[3]}) 50%)`);
        }
        img.onerror = function() {
            resolve();
        };
        img.crossOrigin = "Anonymous";
        img.src = image
    });
}

function removeBookmark(id, bookmarkInfo) {
    if (id === speedDialId) {
        // the speed dial folder was removed for some reason... refresh it
        speedDialId = null;
        getSpeedDialId().then(() => {
            if (messagePorts.length) {
               messagePorts[0].postMessage({reset:true, cache, speedDialId});
            }
        }, error => {
            console.log(error);
        });
    } else if (bookmarkInfo.node.url && (bookmarkInfo.parentId === speedDialId || folderIds.indexOf(bookmarkInfo.parentId) !== -1)) {
        browser.storage.local.remove(bookmarkInfo.node.url).catch((err) => {
            console.log(err)
        });
    }
}

function pushToCache(url, i=0) {
    return new Promise(function(resolve, reject) {
        browser.storage.local.get(url).then(result => {
            if (result[url]) {
                cache[url] = [result[url].thumbnails[i], result[url].bgColor];
            }
            resolve();
        });
    });
}

function updateSettings() {
    browser.storage.local.get('settings').then(result => {
        settings = Object.assign({}, defaults, result.settings);
    });
}

// todo: test behavior on chrome
function moved(id, info) {
    // todo: refresh background tabs
    if (info && !info.url && !info.title &&  info.parentId === info.oldParentId) {
        // bookmark was just reordered, dont need to refresh
        // todo: catch resorting done via bookmarks manager
        return
    }
    changeBookmark(id, info);
}

function changed(id, info) {
    changeBookmark(id, info);
}

function created(id, info) {
    changeBookmark(id, info);
}

function manualRefresh(url) {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
        tripwire++
        browser.storage.local.remove(url).then(() => {
            getThumbnails(url, {forceScreenshot: true}).then(() => {
                refreshOpen()
                tripwire--;
                tripwireTimestamp = Date.now();
            })
        })
    }
}

function handleImport() {
    browser.storage.local.get().then(result => {
        if (result) {
            // handle case where current version may have new settings not present in export
            if (result.settings) {
                settings = Object.assign({}, defaults, result.settings);
            } else {
                settings = defaults;
            }
            const entries = Object.entries(result);
            for (let e of entries) {
                //console.log(e);
                // todo: filter folder ids
                if (e[0] !== "settings" && e[1].thumbnails) {
                    let index = e[1].thumbIndex;
                    cache[e[0]] = [e[1].thumbnails[index], e[1].bgColor];
                }
            }
        }
        for (let port of messagePorts) {
            port.postMessage({imported: true, cache, settings});
        }
    });
}

function refreshBatch(urls, index = 0) {
    // avoid too many connections
    let batchSize = 200;
    let batch = urls.slice(index, index+batchSize);

    if (batch.length) {
        Promise.all(batch.map(url =>
            getThumbnails(url, {quickRefresh: true})
        )).then(() => {
            // todo show progress in UI
            // console.log(Math.round((index / urls.length)*100) + "%")
            refreshBatch(urls, index+batchSize)
        }).catch((err) => {
            console.log(err);
        })
    } else {
        refreshOpen()
    }
}

async function refreshAll(urls) {
    for (let url of urls) {
        await browser.storage.local.remove(url).catch((err) => {
            console.log(err)
        });
    }
    refreshBatch(urls)
}

function changeBookmark(id, info) {
    // info may only contain "changed" info -- ex. it may not contain url for moves, just old and new folder ids
    // so we always "get" the bookmark to access all its info
    browser.bookmarks.get(id).then(bookmark => {
        // only interested in speed dial and its subfolders
        if (bookmark[0].parentId === speedDialId || folderIds.indexOf(bookmark[0].parentId) !== -1) {
            // catch a batch of edits (ex sync or import) where we dont want the browser to go haywire with open tabs..
            tripwire++

            if (bookmark[0].url) {
                if (bookmark[0].url !== "data:" && bookmark[0].url !== "about:blank") {
                    browser.storage.local.get(bookmark[0].url).then(result => {
                        if (result[bookmark[0].url]) {
                            // a pre-existing bookmark is being modified; dont fetch new thumbnails
                            // todo: broken with folders -- doesnt allow same site to have separate images in 2 folders.. who cares
                            // todo: there might be a race condition here for bookmarks created via context menu
                            refreshOpen();
                            tripwire--;
                            tripwireTimestamp = Date.now();
                        } else {
                            getThumbnails(bookmark[0].url).then((fetchedTitle) => {
                                if (fetchedTitle && fetchedTitle !== '' && fetchedTitle !== bookmark[0].title) {
                                    browser.bookmarks.update(id, {
                                        title: fetchedTitle
                                    });
                                    // updating the bookmark title will trigger changebookmark to rerun and refresh above
                                } else {
                                    refreshOpen()
                                }
                                tripwire--;
                                tripwireTimestamp = Date.now();
                            })
                        }
                    });
                }
            } else {
                // folder
                // todo: support manual import of other folder: other folder wont have thumbs for individual sites
                //  but only triggers the change listener for the folder
                if (bookmark[0].title === "New Folder") {
                    // firefox creates a placeholder for the folder when created via bookmark manager
                    return
                }
                if (info && info.title && Object.keys(info).length === 1) {
                    // folder is just being renamed
                    refreshOpen()
                    return
                }

                // new folder
                folderIds.push(id);
                // recurse through the folder and get thumbnails
                browser.bookmarks.getChildren(id).then(children => {
                    if (children.length) {
                        for (let child of children) {
                            changeBookmark(child.id)
                        }
                    } else {
                        refreshOpen()
                    }
                    tripwire--;
                    tripwireTimestamp = Date.now();
                })
            }
        } else if (bookmark[0] && bookmark[0].url && ( info.oldParentId === speedDialId || folderIds.indexOf(info.oldParentId) !== -1) ) {
            // handle yasd bookmarks that are moved outside of yasd but not deleted
            //console.log(bookmark, info)
            browser.storage.local.remove(bookmark[0].url).catch((err) => {
                console.log(err)
            });
        }
    });
}

function connected(p) {
    messagePorts.push(p);
    p.onMessage.addListener(function(m) {
        if (m.getCache) {
            if (ready && speedDialId) {
                p.postMessage({ready, cache, settings, speedDialId, currentFolder});
            } else {
                p.postMessage({ready:false});
            }
        }
        else if (m.refreshThumbs) {
            manualRefresh(m.url)
        }
        else if (m.refreshAll) {
            refreshAll(m.urls)
        }
        // todo: reset not enabled in the ui
        else if (m.reset) {
            // save current settings
            let settings = null;
            browser.storage.local.get('settings').then(result => {
                if (result && result.settings) {
                    settings = result.settings
                }
                // clear local storage
                browser.storage.local.clear().then(() => {
                    // restore settings
                    if (settings) {
                        browser.storage.local.set({settings})
                    }
                    // fetch new images
                    //refreshBatch(m.urls)
                })
            })
        }
        else if (m.refreshInactive) {
            refreshInactive();
        }
        else if (m.updateCache) {
            pushToCache(m.url, m.i);
        }
        else if (m.updateSettings) {
            updateSettings();
        } else if (m.handleImport) {
            handleImport();
        }
        else if (m.currentFolder) {
            currentFolder = m.currentFolder;
        }
    });
    p.onDisconnect.addListener(function(p) {
        let i = messagePorts.indexOf(p);
        messagePorts.splice(i, 1);
    });

    browser.browserAction.disable(p.sender.tab.id);
}

function handleInstalled(details) {
    if (details.reason === "install") {
        // set uninstall URL
        browser.runtime.setUninstallURL("https://forms.gle/6vJPx6eaMV5xuxQk9");
        // todo: detect existing speed dial folder
    } else if (details.reason === 'update') {
        // perform any migrations here...
        if (details.previousVersion && details.previousVersion < '2.0.0') {
            const url = chrome.runtime.getURL("updated.html");
            chrome.tabs.create({ url, active: false });
            migrate().catch(err => {
                console.log(err)
            });
        }
    }
}

async function migrate() {
    // v1.15 -> v2.0 migration
    // use native ordering within the bookmarks manager rather than maintaining a separate ordered list in storage
    console.log("v2.0 migration started...");
    let storage = await browser.storage.local.get();
    let settings = storage.settings;
    // < v1.16 sort state was saved with a key 'folder id' and value [bookmark ids]
    let folders = Object.entries(storage).filter(value => (!value[0].startsWith('http') && value[0] !== 'settings'));
    for (let folder of folders) {
        let bookmarks = settings && settings.defaultSort === 'first' ? folder[1].reverse() : folder[1];
        for (let [index, bookmark] of bookmarks.entries()) {
            if (bookmark && bookmark !== '1wv') {
                await browser.bookmarks.move(bookmark, {index})
            }
        }
    }
    // cleanup old sortable list
    for (let folder of folders) {
        await browser.storage.local.remove(folder[0])
    }
    console.log("migration complete!");
}

function init() {
    browser.runtime.onConnect.addListener(connected);
    // ff triggers 'moved' for bookmarks saved to different folder than default
    browser.bookmarks.onMoved.addListener(moved);
    // ff triggers 'changed' for bookmarks created manually? todo: confirm
    browser.bookmarks.onChanged.addListener(changed);
    // chrome triggers oncreated for bookmarks created manually in bookmark mgr. todo: make sure this doesnt hurt ff
    browser.bookmarks.onCreated.addListener(created);
    browser.bookmarks.onRemoved.addListener(removeBookmark);
    browser.contextMenus.onClicked.addListener(onClickHandler);

    browser.browserAction.onClicked.addListener(handleBrowserAction);

    // build a thumbnail cache of url:thumbUrl pairs
    browser.storage.local.get().then(result => {
        if (result) {
            if (result.settings) {
                settings = Object.assign({}, defaults, result.settings);
            } else {
                settings = defaults;
            }
            const entries = Object.entries(result);
            for (let e of entries) {
                //console.log(e);
                // todo: filter folder ids
                if (e[0] !== "settings" && e[1].thumbnails) {
                    let index = e[1].thumbIndex;
                    cache[e[0]] = [e[1].thumbnails[index], e[1].bgColor];
                }
            }
        }
        getSpeedDialId().then(() => {
            ready = true;
            if (messagePorts.length && firstRun) {
                firstRun = false;
                messagePorts[0].postMessage({ready, cache, settings, speedDialId});
            }
        }, error => {
            console.log(error);
        });
    });

    // context menu -> "add to speed dial"
    browser.contextMenus.create({
        "title": "Add to Speed Dial",
        "contexts":['page'],
        "documentUrlPatterns":['<all_urls>'],
        "id": "addToSpeedDial"
    });

    browser.runtime.onInstalled.addListener(handleInstalled);
}


init();
