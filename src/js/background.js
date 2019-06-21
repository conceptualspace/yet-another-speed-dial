// yet another speed dial
// copyright 2019 dev@conceptualspace.net
// absolutely no warranty is expressed or implied

'use strict';

const defaults = {
    wallpaper: true,
    wallpaperSrc: 'img/bg.jpg',
    backgroundColor: '#111111',
    largeTiles: true,
    showTitles: true,
};

let settings = null;
let speedDialId = null;


function onClickHandler(info, tab) {
    if (info.menuItemId === 'addToSpeedDial') {
        getThumbnails(tab.url);
        browser.bookmarks.create({
            parentId: speedDialId,
            title: tab.title,
            url: tab.url
        });
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

async function getSpeedDialId() {
    let speedDial = await browser.bookmarks.search({title: 'Speed Dial'});
    if (speedDial.length && speedDial[0]) {
        speedDialId = speedDial[0].id
    } else {
        speedDial = await browser.bookmarks.create({title: 'Speed Dial', type: 'folder'});
        speedDialId = speedDial.id;
    }
}

function updateBookmark(id, bookmarkInfo) {
    if (bookmarkInfo.parentId === speedDialId) {
        browser.bookmarks.get(id).then(bookmark => {
            getThumbnails(bookmark[0].url);
            //todo: message page script to refresh
        })
    }
}

function removeBookmark(id, bookmarkInfo) {
    if (bookmarkInfo.parentId === speedDialId) {
        browser.storage.local.remove(bookmarkInfo.node.url);
        //todo: message page script to refresh
    }
}

function init() {
    // ff triggers 'moved' for bookmarks saved to different folder than default
    browser.bookmarks.onMoved.addListener(updateBookmark);
    browser.bookmarks.onRemoved.addListener(removeBookmark);
    browser.contextMenus.onClicked.addListener(onClickHandler);

    // context menu -> "add to speed dial"
    browser.contextMenus.create({"title": "Add to Speed Dial", "contexts":['page'], "documentUrlPatterns":['<all_urls>'], "id": "addToSpeedDial"});

    // set default settings
    browser.storage.local.get('settings').then(store => {
        if (store.settings) {
            settings = Object.assign({}, defaults, store.settings);
        } else {
            settings = defaults;
        }
        browser.storage.local.set({settings}).then(() => {
            // engage
            getSpeedDialId();
        });
    });
}

init();
