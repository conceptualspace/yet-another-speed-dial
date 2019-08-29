// yet another speed dial
// copyright 2019 dev@conceptualspace.net
// absolutely no warranty is expressed or implied

'use strict';

let messagePorts = [];
let speedDialId = null;
let settings = null;
let defaults = {
    wallpaper: true,
    wallpaperSrc: 'img/bg.jpg',
    backgroundColor: '#111111',
    largeTiles: true,
    showTitles: true,
    showAddSite: true,
    verticalAlign: true
};
let cache = {};
let ready = false;
let firstRun = true;

function getSpeedDialId() {
    browser.bookmarks.search({title: 'Speed Dial', url: undefined}).then(result => {
        if (result.length && result[0]) {
            speedDialId = result[0].id;
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
        return new URL(origin).origin + path;
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
            .then(() => resolve());
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
                    browser.tabs.captureVisibleTab({format:'jpeg', quality:40})
                        .then(imageUri => {
                            resolve(imageUri);
                        });
                } else {
                    resolve([]);
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
                ctx.drawImage(this, 0, 0, this.width-20, this.height-20, 0, 0, canvas.width, canvas.height);

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

// should only fire when bookmark created via bookmarks manager directly in the speed dial folder
// todo: allow editing URLs from speed dial page
function changeBookmark(id, info) {
    if (info.url) {
        browser.bookmarks.get(id).then(bookmark => {
            if (bookmark[0].parentId === speedDialId) {
                // todo: skip if already in the cache
                getThumbnails(bookmark[0].url).then(() => {
                    pushToCache(bookmark[0].url).then(() => {
                        refreshOpen()
                    })
                })
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
        if (parts[0] === "1" && parts[1] === "3") {
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
    browser.runtime.onInstalled.addListener(handleInstalled);
    // ff triggers 'moved' for bookmarks saved to different folder than default
    browser.bookmarks.onMoved.addListener(updateBookmark);
    browser.bookmarks.onChanged.addListener(changeBookmark);
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

    // todo: runtime.oninstalled
    browser.runtime.setUninstallURL("https://forms.gle/UPvfa1xKZtoHJDeN7");
}

init();
