
let speedDialId = null;

function convertUrlToAbsolute(origin, path) {
    // convert relative url paths
    if (path.indexOf('://') > 0 || path.indexOf('//') === 0) {
        return path
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
                // maybe drop icon attribute to pick up apple touch shortcuts and win8 tiles
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
                    .then(resolve());
            });
    });
}


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
            //todo: message the page script to refresh
        })
    }
}

function removeBookmark(id, bookmarkInfo) {
    if (bookmarkInfo.parentId === speedDialId) {
        browser.storage.local.remove(bookmarkInfo.node.url);
        //todo: message the page script to refresh
    }
}

// await browser.storage.local.get(null)


getSpeedDialId();

//browser.bookmarks.onCreated.addListener(updateBookmark);
// ff triggers 'moved' when a folder other than the default is selected. in our case since we use the 'speed dial' folder
// we need to listen for moves not creates

// listen for bookmark being created and capture thumbnail
// requires <all_urls> permission to capture the image without a user gesture
browser.bookmarks.onMoved.addListener(updateBookmark);
browser.bookmarks.onRemoved.addListener(removeBookmark);

// context menu -> "add to speed dial"
function onClickHandler(info, tab) {
    if (info.menuItemId === 'addToSpeedDial') {
        //getScreenshot(tab.url);
        getThumbnails(tab.url);
        browser.bookmarks.create({
            parentId: speedDialId,
            title: tab.title,
            url: tab.url
        });
        // tab.favIconUrl
    }
}

browser.contextMenus.onClicked.addListener(onClickHandler);
browser.contextMenus.create({"title": "Add to Speed Dial", "contexts":['page'], "documentUrlPatterns":['<all_urls>'], "id": "addToSpeedDial"});

browser.runtime.onInstalled.addListener(function() {
    // set defaults
    const defaults = {
        wallpaper: true,
        wallpaperSrc: 'img/bg.jpg',
        backgroundColor: '#111111',
        largeTiles: true,
        showTitles: true,
    };
    // restore any saved settings
    browser.storage.local.get('settings').then(store => {
        let storedSettings = store.settings || {};
        let settings = Object.assign({}, defaults, storedSettings);
        browser.storage.local.set({settings});
    });
});
