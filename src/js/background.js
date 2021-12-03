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
    scaleImages: false,
    showTitles: true,
    showAddSite: true,
    showFolders: true,
    showSettingsBtn: true,
    showClock: true,
    maxCols: '100',
    defaultSort: 'last',
    textColor: '#ffffff'
};
let cache = {};
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
                        if (!result.url && result.dateGroupModified) {
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

function getThumbnails(url, manualRefresh=false) {
    let thumbnails = [];
    let fetchedTitle = '';
    let bgColor = null;
    return new Promise(function(resolve, reject) {
        getOgImage(url)
            .then(function(images) {
                if (images) {
                    for (let image of images) {
                        image && thumbnails.push(image);
                    }
                }
                return getScreenshot(url, manualRefresh)
            })
            .then(function(result) {
                if (result) {
                    if (result.title) {
                        fetchedTitle = result.title
                    }
                    if (result.screenshot) {
                        return resizeThumb(result.screenshot)
                    }
                }
            })
            .then(function(result) {
                if (result) {
                    thumbnails.push(result);
                }
                return getLogo(url)
            })
            .then(function(result) {
                if (result) {
                    thumbnails.push(result);
                }
                return getBgColor(thumbnails[0])
            })
            .then(function(result) {
                if (result) {
                    bgColor = result;
                }
                return saveThumbnails(url, thumbnails, bgColor)
            })
            .then(() => resolve(fetchedTitle))
            .catch(error => console.log(error));
    });
}

function getOgImage(url) {
    return new Promise(function(resolve, reject) {
        // tracking protection hack. use local resource instead
        let whitelist = [
            "mail.google.com",
            "gmail.com",
            "www.facebook.com",
            "www.reddit.com",
            "twitter.com"
        ];
        let hostname = new URL(url).hostname;
        if (whitelist.includes(hostname)) {
            resolve(['img/'+hostname+'.png']);
            return;
        }

        let xhr = new XMLHttpRequest();
        xhr.onerror = function(e) {
            //console.log(e);
            resolve([]);
        };
        xhr.onload = function () {
            let images = [];
            // get open graph images
            if (!xhr.responseXML) {
                resolve([]);
                return
            }
            let metas = xhr.responseXML.getElementsByTagName("meta");
            for (let meta of metas) {
                if (meta.getAttribute("property") === "og:image" && meta.getAttribute("content")) {
                    let imageUrl = convertUrlToAbsolute(url, meta.getAttribute("content"));
                    images.push(imageUrl)
                }
            }
            // get large icons
            let sizes = [
                "192x192",
                "180x180",
                "144x144",
                "96x96"
            ];
            for (let size of sizes) {
                let icon = xhr.responseXML.querySelector(`link[rel="icon"][sizes="${size}"]`);
                if (icon) {
                    let imageUrl = convertUrlToAbsolute(url, icon.getAttribute('href'));
                    images.push(imageUrl);
                    break;
                }
            }
            // get apple touch icon
            let appleIcon = xhr.responseXML.querySelector('link[rel="apple-touch-icon"]');
            if (appleIcon) {
                let imageUrl = convertUrlToAbsolute(url, appleIcon.getAttribute('href'));
                images.push(imageUrl);
            }
            // get large favicon
            let favicon = new URL(url).origin + "/favicon.ico";
            fetch(new Request(favicon)).then(response => {
                if (response.status === 200) {
                    let icon = new Image();
                    icon.onerror = function() {
                        resolve(images);
                    };
                    icon.onload = function() {
                        if (this.height >= 96) {
                            images.push(favicon);
                        }
                        resolve(images);
                    };
                    icon.src = favicon;
                } else {
                    resolve(images);
                }
            }, err => {
                console.log(err);
                resolve([]);
            });
        };
        xhr.open("GET", url);
        xhr.responseType = "document";
        // fix for shitty websites, like imdb
        xhr.overrideMimeType("text/html");
        xhr.send();
    });
}

function saveThumbnails(url, images, bgColor) {
    return new Promise(function(resolve, reject) {
        let thumbnails = [];
        browser.storage.local.get(url)
            .then(result => {
                if (result[url] && result[url].thumbnails) {
                    thumbnails = result[url].thumbnails;
                }
                if (images && images.length) {
                    thumbnails.push(images);
                }
                thumbnails = thumbnails.flat();
                browser.storage.local.set({[url]:{thumbnails, thumbIndex: 0, bgColor}})
                    .then(() => resolve());
            });
    });
}

// requires <all_urls> permission to capture image without a user gesture
function getScreenshot(url, manualRefresh=false) {
    return new Promise(function(resolve, reject) {
        // capture from an existing tab if its open
        browser.tabs.query({active: true, windowId: browser.windows.WINDOW_ID_CURRENT})
            .then(tabs => {
                if (tabs && tabs[0]) {
                    return browser.tabs.get(tabs[0].id)
                } else {
                    // todo: restructure this
                    resolve([])
                }
            })
            .then(tab => {
                if (tab.url === url) {
                    let fetchedTitle = tab.title ? tab.title : '';
                    browser.tabs.captureVisibleTab()
                        .then(imageUri => {
                            resolve({screenshot: imageUri, title: fetchedTitle});
                        });
                } else if ( ( tripwire < 2 && Date.now() - tripwireTimestamp > 3000 ) || manualRefresh) {
                    // open tab, capture screenshot, and close
                    // todo: complete loaded status sometimes !== actually loaded
                    let tabID = null;
                    function handleUpdatedTab(tabId, changeInfo, tabInfo) {
                        if (tabId === tabID && changeInfo.status === "complete") {
                            let fetchedTitle = tabInfo.title ? tabInfo.title : '';
                            // workaround for chrome, which can only capture the active tab
                            if (!browser.runtime.getBrowserInfo) {
                                browser.tabs.update(tabID, {active:true}).then(tab => {
                                    setTimeout(function() {
                                        browser.tabs.captureVisibleTab().then(imageUri => {
                                            browser.tabs.onUpdated.removeListener(handleUpdatedTab);
                                            browser.tabs.remove(tabID);
                                            resolve({screenshot: imageUri, title: fetchedTitle});
                                        }, (err) => {
                                            console.log(err)
                                            // carry on like it aint no tang
                                            resolve(null);
                                        });
                                    }, 1240);
                                })
                            } else {
                                setTimeout(function() {
                                    browser.tabs.captureTab(tabID).then(imageUri => {
                                        browser.tabs.onUpdated.removeListener(handleUpdatedTab);
                                        browser.tabs.remove(tabID);
                                        resolve({screenshot: imageUri, title: fetchedTitle});
                                    }, (err) => {
                                        console.log(err);
                                        resolve(null);
                                    });
                                }, 1240);
                            }
                        }
                    }
                    browser.tabs.onUpdated.addListener(handleUpdatedTab);

                    browser.tabs.create({url, active:false}).then(tab => {
                        tabID = tab.id;
                        // timeout for site to load
                        // todo: add a cancel button to UI
                        let timer = setTimeout(function() {
                            browser.tabs.get(tabID).then(tab => {
                                browser.tabs.onUpdated.removeListener(handleUpdatedTab);
                                browser.tabs.remove(tabID);
                                resolve([])
                            }, (err) => {
                                if (timer) clearTimeout(timer);
                                // tab was already closed, we all good
                            });
                        }, 15000)
                    });
                } else {
                    resolve(null);
                }
            }, (err) => {
                console.log(err);
            });
    });
}

function getLogo(url) {
    return new Promise(function(resolve, reject) {
        // todo: setting to enable/disable this?
        let logoUrl = 'https://logo.clearbit.com/' + new URL(url).hostname + '?size=200';
        fetch(new Request(logoUrl)).then(response => {
            if (response.status === 200) {
                resolve(logoUrl);
            } else {
                resolve(null);
            }
        });
    });
}

function resizeThumb(dataURI) {
    return new Promise(function(resolve, reject) {
        if (dataURI && dataURI.length) {
            let img = new Image();
            img.onload = function () {
                if (this.height > 512 && this.width > 512) {

                    let canvas = document.createElement('canvas');
                    let ctx = canvas.getContext('2d');
                    let canvas2 = document.createElement('canvas');
                    let ctx2 = canvas2.getContext('2d', {willReadFrequently:true});
                    ctx2.imageSmoothingEnabled = true;
                    ctx2.imageSmoothingQuality = "high";

                    // first pass: crop scrollbars, blur filter as an approximation for resampling
                    canvas.width = this.width - 20;
                    canvas.height = this.height - 20;
                    ctx.filter = `blur(1px)`;
                    ctx.drawImage(this, 0, 0, this.width - 18, this.height - 18, 0, 0, canvas.width, canvas.height);

                    // second pass: downscale to target size
                    let height = 256;
                    let ratio = height / this.height;
                    let width = Math.round(this.width * ratio);

                    canvas2.width = width;
                    canvas2.height = height;

                    ctx2.drawImage(canvas, 0, 0, width, height);

                    const newDataURI = canvas2.toDataURL('image/webp');
                    resolve(newDataURI);
                } else {
                    resolve(dataURI);
                }
            };
            img.src = dataURI;
        } else {
            resolve([]);
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
// todo: punt this to a worker
// todo: export functions resused in index.js
function getBgColor(image) {
    return new Promise(function(resolve, reject) {
        let img = new Image();
        img.onload = function () {
            let imgWidth = img.naturalWidth;
            let imgHeight = img.naturalHeight;
            let sx, sy, direction;

            if ((imgWidth / imgHeight) > imageRatio) {
                // image is wide; sample top and bottom
                sy = imgHeight - 1
                sx = 0;
                direction = 'bottom'

            } else {
                // sample left and right
                sx = imgWidth - 1
                sy = 0;
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
            // todo: if its equally performant, sample all corners and return the mode
            let pixelA = context.getImageData(0, 0, 1, 1);
            rgba[0] = pixelA.data[0];
            rgba[1] = pixelA.data[1];
            rgba[2] = pixelA.data[2];
            rgba[3] = pixelA.data[3] / 255; // imageData alpha value is 0..255 instead of 0..1

            let pixelB = context.getImageData(sx, sy, 1, 1);
            rgbaa[0] = pixelB.data[0];
            rgbaa[1] = pixelB.data[1];
            rgbaa[2] = pixelB.data[2];
            rgbaa[3] = pixelB.data[3] / 255; // imageData alpha value is 0..255 instead of 0..1

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
    //console.log("onMoved", info);
    changeBookmark(id, info);
}

function changed(id, info) {
    //console.log("onChanged", info);
    changeBookmark(id, info);
}

function created(id, info) {
    //console.log("onCreated", info);
    changeBookmark(id, info);
}

function manualRefresh(url) {
    browser.storage.local.remove(url).then(() => {
        getThumbnails(url, true).then(() => {
            pushToCache(url).then(() => {
                refreshOpen()
            })
        })
    })
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
                                pushToCache(bookmark[0].url).then(() => {
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
                p.postMessage({ready, cache, settings, speedDialId});
            } else {
                p.postMessage({ready:false});
            }
        }
        else if (m.refreshThumbs) {
            manualRefresh(m.url)
        }
        else if (m.updateCache) {
            pushToCache(m.url, m.i);
        }
        else if (m.updateSettings) {
            updateSettings();
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

        //todo: detect existing speed dial folder
    } else if (details.reason === 'update') {
        // perform any migrations here...
        if (details.previousVersion && details.previousVersion === '1.14.8') {
            const url = chrome.runtime.getURL("updated.html");
            chrome.tabs.create({ url, active: false });
        }
    }
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
