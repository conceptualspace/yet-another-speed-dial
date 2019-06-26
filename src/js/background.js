// yet another speed dial
// copyright 2019 dev@conceptualspace.net
// absolutely no warranty is expressed or implied

'use strict';

let messagePort = null;
let speedDialId = null;
let settings = null;
let defaults = {
    wallpaper: true,
    wallpaperSrc: 'img/bg.jpg',
    backgroundColor: '#111111',
    largeTiles: true,
    showTitles: true,
    verticalAlign: false
};
let cache = {};
let ready = false;
let firstRun = true;

function getSpeedDialId() {
    browser.bookmarks.search({title: 'Speed Dial'}).then(result => {
        if (result.length && result[0]) {
            speedDialId = result[0].id;
        } else {
            browser.bookmarks.create({title: 'Speed Dial', type: 'folder'}).then(result => {
                speedDialId = result.id;
            });
        }
        ready = true;
        if (messagePort && firstRun) {
            firstRun = false;
            messagePort.postMessage({ready, cache, settings, speedDialId});
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
                }).then(response => {
                    getThumbnails(tab.url).then(() => {
                        pushToCache(tab.url).then(() => refreshOpen())
                    });
                });
            }
        });
    }
}

function refreshOpen() {
    let speedDialOpen = false;
    browser.tabs.query({currentWindow: true}).then(tabs => {
        for (let tab of tabs) {
            if (tab.title === "Speed Dial") {
                speedDialOpen = true;
                break;
            }
        }
        if (speedDialOpen) {
            messagePort.postMessage({refresh:true, cache});
        }
    });
}

// convert relative url paths
function convertUrlToAbsolute(origin, path) {
    if (path.indexOf('://') > 0) {
        return path
    } else if (path.indexOf('//') === 0) {
        return 'https:' + path;
    } else {
        return new URL(origin).origin + path;
    }
}

function getThumbnails(url) {
    return new Promise(function(resolve, reject) {
        getOgImage(url)
            .then(result => saveThumbnails(url, result))
            .then(() => getScreenshot(url))
            .then(result => saveThumbnails(url, result))
            .then(() => resolve());
    });
}

function getOgImage(url) {
    return new Promise(function(resolve, reject) {
        // tracking protection hack. use local resource instead
        let whitelist = [
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
                if (meta.getAttribute("property") === "og:image") {
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
        // make sure we are capturing the right thing
        // in firefox we could get the tab by url and then capture it, but doesnt work in chrome: browser.tabs.query({url})
        browser.tabs.query({active: true, windowId: browser.windows.WINDOW_ID_CURRENT})
            .then(tabs => browser.tabs.get(tabs[0].id))
            .then(tab => {
                if (tab.url === url) {
                    browser.tabs.captureVisibleTab()
                        .then(imageUri => {
                            resolve(imageUri);
                        });
                } else {
                    resolve([]);
                }
            });
    });
}

function updateBookmark(id, bookmarkInfo) {
    console.log("bookmark updated");
    if (bookmarkInfo.parentId === speedDialId) {
        browser.bookmarks.get(id).then(bookmark => {
            getThumbnails(bookmark[0].url).then(() => {
                pushToCache(bookmark[0].url).then(() => {
                    refreshOpen()
                })
            })
        })
    }
}

function removeBookmark(id, bookmarkInfo) {
    if (bookmarkInfo.parentId === speedDialId) {
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

function connected(p) {
    messagePort = p;
    messagePort.onMessage.addListener(function(m) {
        if (m.getCache) {
            if (ready && speedDialId) {
                messagePort.postMessage({ready, cache, settings, speedDialId});
            } else {
                messagePort.postMessage({ready:false});
            }
        }
        else if (m.updateCache) {
            pushToCache(m.url, m.i);
        }
        else if (m.updateSettings) {
            updateSettings();
        }

    });
}

function init() {
    browser.runtime.onConnect.addListener(connected);
    // ff triggers 'moved' for bookmarks saved to different folder than default
    browser.bookmarks.onMoved.addListener(updateBookmark);
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
                if (e[0] !== "settings" && e[0] !== "sort") {
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
}

init();
