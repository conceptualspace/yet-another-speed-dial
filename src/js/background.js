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
    showTitles: true,
    showAddSite: true,
    showFolders: true,
    showSettingsBtn: true,
    showClock: true,
};
let cache = {};
let ready = false;
let firstRun = true;

function getSpeedDialId() {
    browser.bookmarks.search({title: 'Speed Dial', url: undefined}).then(result => {
        if (result.length && result[0]) {
            speedDialId = result[0].id;
            // get subfolder ids
            browser.bookmarks.getChildren(speedDialId).then(results => {
                for (let result of results) {
                    if (!result.url && result.dateGroupModified) {
                        folderIds.push(result.id);
                    }
                }
            })

        } else {
            browser.bookmarks.create({title: 'Speed Dial'}).then(result => {
                speedDialId = result.id;
            });
        }
        ready = true;
        if (messagePorts.length && firstRun) {
            firstRun = false;
            messagePorts[0].postMessage({ready, cache, settings, speedDialId});
        }
    });
}

function onClickHandler(info, tab) {
    if (info.menuItemId === 'addToSpeedDial') {
        // avoid duplicates
        browser.bookmarks.search({url: tab.url}).then(result => {
            if (!result.length) {
                browser.bookmarks.create({
                    parentId: speedDialId,
                    title: tab.title,
                    url: tab.url
                })
            }
        });
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

function getThumbnails(url) {
    return new Promise(function(resolve, reject) {
        getOgImage(url)
            .then(result => saveThumbnails(url, result))
            .then(() => getScreenshot(url))
            .then(result => resizeThumb(result))
            .then(result => saveThumbnails(url, result))
            .then(() => getLogo(url))
            .then(result => saveThumbnails(url, result))
            .then(() => resolve())
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
            console.log(e);
            resolve();
        };
        xhr.onload = function () {
            let images = [];
            // get open graph images
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
            }, reason => {
                console.log(reason);
            });
        };
        xhr.open("GET", url);
        xhr.responseType = "document";
        xhr.send();
    });
}

function saveThumbnails(url, images) {
    return new Promise(function(resolve, reject) {
        let thumbnails = [];
        browser.storage.local.get(url)
            .then(result => {
                if (result[url] && result[url].thumbnails) {
                    thumbnails = result[url].thumbnails;
                }
                if (images) {
                    thumbnails.push(images);
                }
                thumbnails = thumbnails.flat();
                browser.storage.local.set({[url]:{thumbnails, thumbIndex: 0}})
                    .then(() => resolve());
            });
    });
}

// requires <all_urls> permission to capture image without a user gesture
function getScreenshot(url) {
    return new Promise(function(resolve, reject) {
        // capture from an existing tab if its open
        browser.tabs.query({active: true, windowId: browser.windows.WINDOW_ID_CURRENT})
            .then(tabs => browser.tabs.get(tabs[0].id))
            .then(tab => {
                if (tab.url === url) {
                    browser.tabs.captureVisibleTab()
                        .then(imageUri => {
                            resolve(imageUri);
                        });
                } else {
                    // open tab, capture screenshot, and close
                    // todo: complete loaded status sometimes !== actually loaded
                    let tabID = null;
                    function handleUpdatedTab(tabId, changeInfo, tabInfo) {
                        if (tabId === tabID && changeInfo.status === "complete") {
                            // workaround for chrome, which can only capture the active tab
                            if (!browser.runtime.getBrowserInfo) {
                                browser.tabs.update(tabID, {active:true}).then(tab => {
                                    setTimeout(function() {
                                        browser.tabs.captureVisibleTab().then(imageUri => {
                                            browser.tabs.onUpdated.removeListener(handleUpdatedTab);
                                            browser.tabs.remove(tabID);
                                            resolve(imageUri);
                                        }, (error) => {
                                            console.log(error);
                                        });
                                    }, 1000);
                                })
                            } else {
                                setTimeout(function() {
                                    browser.tabs.captureTab(tabID).then(imageUri => {
                                        browser.tabs.onUpdated.removeListener(handleUpdatedTab);
                                        browser.tabs.remove(tabID);
                                        resolve(imageUri);
                                    });
                                }, 1000);
                            }
                        }
                    }
                    browser.tabs.onUpdated.addListener(handleUpdatedTab);

                    browser.tabs.create({url, active:false}).then(tab => {
                        tabID = tab.id;
                        // todo: tab can be hidden in ff. not currently supported in chrome
                        //browser.tabs.hide(tabID);
                    });
                }
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
                resolve([]);
            }
        });
    });
}

function resizeThumb(dataURI) {
    return new Promise(function(resolve, reject) {
        if (!dataURI.length) {
            resolve([]);
            return;
        }
        let img = new Image();
        img.onload = function() {
            if (this.height > 512 && this.width > 512) {

                let canvas = document.createElement('canvas');
                let ctx = canvas.getContext('2d');
                let canvas2 = document.createElement('canvas');
                let ctx2 = canvas2.getContext('2d');
                ctx2.imageSmoothingEnabled = true;
                ctx2.imageSmoothingQuality = "high";

                // first pass: crop scrollbars, blur filter as an approximation for resampling
                canvas.width = this.width-20;
                canvas.height = this.height-20;
                ctx.filter = `blur(1px)`;
                ctx.drawImage(this, 0, 0, this.width-18, this.height-18, 0, 0, canvas.width, canvas.height);

                // second pass: downscale to target size
                let height = 256;
                let ratio = height / this.height;
                let width = Math.round(this.width * ratio);

                canvas2.width = width;
                canvas2.height = height;

                ctx2.drawImage(canvas,0, 0, width, height);

                const newDataURI = canvas2.toDataURL('image/jpeg', 0.86);
                resolve(newDataURI);
            } else {
                resolve(dataURI);
            }
        };
        img.src = dataURI;
    });
}

function updateBookmark(id, bookmarkInfo) {
    console.log('updateBookmark');
    // only runs for speed dial
    if (bookmarkInfo.parentId === speedDialId || folderIds.indexOf(bookmarkInfo.parentId) !== -1 ) {
        browser.bookmarks.get(id).then(bookmark => {
            console.log(bookmark);
            getThumbnails(bookmark[0].url).then(() => {
                pushToCache(bookmark[0].url).then(() => {
                    refreshOpen()
                })
            })
        })
    }
}

function removeBookmark(id, bookmarkInfo) {
    if (bookmarkInfo.url && (bookmarkInfo.parentId === speedDialId || folderIds.indexOf(bookmarkInfo.parentId) !== -1)) {
        browser.storage.local.remove(bookmarkInfo.node.url)
    }
}

function pushToCache(url, i=0) {
    return new Promise(function(resolve, reject) {
        browser.storage.local.get(url).then(result => {
            if (result[url]) {
                cache[url] = result[url].thumbnails[i];
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

// should only fire when bookmark created via bookmarks manager directly in the speed dial folder
// todo: allow editing URLs from speed dial page
// todo: something f'd up with getthumbnails
function changeBookmark(id, info) {
    if (info.url && info.url !== "data:") {
        browser.bookmarks.get(id).then(bookmark => {
            // confirm we are only mucking with speed dial bookmarks
            if (bookmark[0].parentId === speedDialId || folderIds.indexOf(bookmark[0].parentId) !== -1) {
                browser.storage.local.get(bookmark[0].url).then(result => {
                    if (result[bookmark[0].url]) {
                        // a pre-existing bookmark is being modified; dont fetch new thumbnails
                        // todo: broken with folders -- doesnt allow same site in 2 folders..
                        // todo: there might be a race condition here for bookmarks created via context menu
                        refreshOpen();
                    } else {
                        getThumbnails(bookmark[0].url).then(() => {
                            pushToCache(bookmark[0].url).then(() => {
                                refreshOpen()
                            })
                        })
                    }
                });
            }
        });
    } else if (!info.url) {
        browser.bookmarks.get(id).then(bookmark => {
            if (bookmark[0].parentId === speedDialId) {
                refreshOpen()
            }
        });
    }
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
}

// migration from v1.3.x -> v1.4.x
// pushes the 'add site' button to the end of any existing dials
function handleInstalled(details) {
    if (details.reason === 'update') {
        let parts = details.previousVersion.split('.');
        if (parts[0] === "1" && (parts[1] === "3" || parts[1] === "4")) {
            browser.storage.local.get('sort').then(result => {
                if (result.sort) {
                    let sort = result.sort;
                    sort.push(sort.splice(sort.indexOf("1wv"), 1)[0]);
                    browser.storage.local.set({sort})
                }
            });
        }
    }
}

function init() {
    browser.runtime.onConnect.addListener(connected);
    // ff triggers 'moved' for bookmarks saved to different folder than default
    browser.bookmarks.onMoved.addListener(updateBookmark);
    // ff triggers 'changed' for bookmarks created manually? todo: confirm
    browser.bookmarks.onChanged.addListener(changeBookmark);
    // chrome triggers oncreated for bookmarks created manually in bookmark mgr. todo: make sure this doesnt hurt ff
    browser.bookmarks.onCreated.addListener(changeBookmark);
    browser.bookmarks.onRemoved.addListener(removeBookmark);
    browser.contextMenus.onClicked.addListener(onClickHandler);

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
                // todo: filter folder ids
                if (e[0] !== "settings" && e[1].thumbnails) {
                    let index = e[1].thumbIndex;
                    cache[e[0]] = e[1].thumbnails[index];
                }
            }
        }
        getSpeedDialId();
    });

    // context menu -> "add to speed dial"
    browser.contextMenus.create({
        "title": "Add to Speed Dial",
        "contexts":['page'],
        "documentUrlPatterns":['<all_urls>'],
        "id": "addToSpeedDial"
    });

    // todo: runtime.oninstalled
    browser.runtime.setUninstallURL("https://forms.gle/UPvfa1xKZtoHJDeN7");
}

browser.runtime.onInstalled.addListener(handleInstalled);

init();
