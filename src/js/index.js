// yet another speed dial
// copyright 2019 dev@conceptualspace.net
// absolutely no warranty is expressed or implied

'use strict';

// speed dial
const bookmarksContainer = document.getElementById('wrap');
const menu = document.getElementById('contextMenu');
const settingsMenu = document.getElementById('settingsMenu');
const modal = document.getElementById('tileModal');
const closeModal = document.getElementsByClassName("close")[0];
const modalSave = document.getElementById('modalSave');
const sidenav = document.getElementById("sidenav");
const modalTitle = document.getElementById("modalTitle");
const modalURL = document.getElementById("modalURL");
const modalImgContainer = document.getElementById("modalImgContainer");
const modalImgInput = document.getElementById("modalImgInput");
const noBookmarks = document.getElementById('noBookmarks');

// settings sidebar
const reader = new FileReader();
const color_picker = document.getElementById("color-picker");
const color_picker_wrapper = document.getElementById("color-picker-wrapper");
const imgInput = document.getElementById("file");
const imgPreview = document.getElementById("preview");
const wallPaperEnabled = document.getElementById("wallpaper");
const previewContainer = document.getElementById("previewContainer");
const largeTilesInput = document.getElementById("largeTiles");
const showTitlesInput = document.getElementById("showTitles");
const verticalAlignInput = document.getElementById("verticalAlign");
const saveBtn = document.getElementById("saveBtn");
const toast = document.getElementById("toast");

const port = "p-" + new Date().getTime();
const tabMessagePort = browser.runtime.connect({name:port});

let cache = null;
let settings = null;
let speedDialId = null;
let sortable = null;
let targetTileHref = null;
let targetTileTitle = null;
let targetNode = null;


function getBookmarks(folderId) {
    browser.bookmarks.getChildren(folderId).then(result => {
        if (result.length) {
            printBookmarks(result)
        } else {
            noBookmarks.style.display = 'block';
        }
    });
}

function removeBookmark(url) {
    browser.bookmarks.search({url})
        .then(bookmarks => {
            for (let bookmark of bookmarks) {
                if (bookmark.parentId === speedDialId) {
                    targetNode.style.display = 'none';
                    browser.storage.local.remove(url);
                    browser.bookmarks.remove(bookmark.id);
                }
            }
        })
}

function getThumbs(bookmarkUrl) {
    return browser.storage.local.get(bookmarkUrl)
        .then(result => {
            if (result[bookmarkUrl]) {
                return result[bookmarkUrl];
            }
        });
}

function sort() {
    browser.storage.local.get('sort')
        .then(result => {
            if (result.sort) {
                sortable.sort(result.sort);
            }
        });
}

function printBookmarks(bookmarks) {
    let fragment = document.createDocumentFragment();
    for (let bookmark of bookmarks) {
        let thumbUrl = null;

        if (cache[bookmark.url]) {
            // if the image is a blob:
            //iconURL = URL.createObjectURL(result.icon);
            //iconURL = result.icon;
            thumbUrl = cache[bookmark.url];
        } else {
            thumbUrl = "../img/default.png";
        }
        let a = document.createElement('a');
        a.classList.add('tile');
        a.href = bookmark.url;

        let main = document.createElement('div');
        main.classList.add('tile-main');

        let content = document.createElement('div');
        content.classList.add('tile-content');
        content.style.backgroundImage = "url("+thumbUrl+")";

        let title = document.createElement('div');
        title.classList.add('tile-title');
        if (!settings.showTitles) {
            title.classList.add('hide');
        }
        title.textContent = bookmark.title;

        main.appendChild(content);
        main.appendChild(title);
        a.appendChild(main);
        fragment.appendChild(a);
    }

    bookmarksContainer.appendChild(fragment);
    sort();
    animate();

    bookmarksContainer.style.opacity = "1";
}

function showContextMenu(top, left) {
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.visibility = "visible";
    menu.style.opacity = "1";
}

function showSettingsMenu(top, left) {
    if ((document.body.clientWidth - left) < (settingsMenu.clientWidth + 30)) {
        settingsMenu.style.left = (left - settingsMenu.clientWidth) + 'px';
    } else {
        settingsMenu.style.left = left + 'px';
    }
    if ((document.body.clientHeight - top) < (settingsMenu.clientHeight + 30)) {
        settingsMenu.style.top = (top - settingsMenu.clientHeight) + 'px';
    } else {
        settingsMenu.style.top = top + 'px';
    }
    settingsMenu.style.visibility = "visible";
    settingsMenu.style.opacity = "1";
}

function hideMenus() {
    menu.style.visibility = "hidden";
    menu.style.opacity = "0";
    settingsMenu.style.visibility = "hidden";
    settingsMenu.style.opacity = "0";
}

function openSettings() {
    sidenav.style.transform = "translateX(0%)";
    //sidenav.style.boxShadow ="0px 2px 8px 0px rgba(0,0,0,0.5)";
}

function hideSettings() {
    sidenav.style.transform = "translateX(100%)";
    //sidenav.style.boxShadow = "none";
}

function hideModal() {
    modal.style.display = "none";
}

async function buildModal(url, title) {
    // nuke any previous modal
    let carousel = document.getElementById("carousel");
    if (carousel) {
        modalImgContainer.removeChild(carousel);
    }

    let newCarousel = document.createElement('div');
    newCarousel.setAttribute('id', 'carousel');
    modalImgContainer.appendChild(newCarousel);

    //let createdCarousel = document.getElementById('carousel');
    modalTitle.value = title;
    modalURL.value = url;
    let images = await getThumbs(url);
    if (images && images.thumbnails.length) {
        // clunky af
        // todo: support adding a custom image
        let index = images.thumbIndex;
        let imgDiv = document.createElement('div');
        let img = document.createElement('img');
        img.setAttribute('src', images.thumbnails[index]);
        imgDiv.appendChild(img);
        newCarousel.appendChild(imgDiv);
        for (let [i, image] of images.thumbnails.entries()) {
            if (i !== index) {
                let imgDiv = document.createElement('div');
                let img = document.createElement('img');
                img.setAttribute('src', image);
                imgDiv.appendChild(img);
                newCarousel.appendChild(imgDiv);
            }
        }
        $('#carousel').flexCarousel({height: '180px'});
    }
}

function saveBookmarkSettings() {
    let title = modalTitle.value;
    let url = modalURL.value;
    let selectedImageSrc = null;
    let thumbIndex = 0;
    let imageNodes = document.getElementsByClassName('fc-slide');
    for (let node of imageNodes) {
        // div with order "2" is the one being displayed by the carousel
        if (node.style.order === '2') {
            // sometimes the carousel puts images inside a <figure class="fc-image"> elem
            if (node.children[0].className === "fc-image") {
                selectedImageSrc = node.children[0].children[0].src;
            } else {
                selectedImageSrc = node.children[0].src;
            }
            // update tile
            targetNode.children[0].children[0].style.backgroundImage = `url('${selectedImageSrc}')`;
            break;
        }
    }
    // find image index
    if (title !== targetTileTitle) {
        targetNode.children[0].children[1].textContent = title;
        // sortable ids changed so rewrite to storage
        let order = sortable.toArray();
        browser.storage.local.set({"sort":order});
        browser.bookmarks.search({url})
        .then(bookmark => {
            browser.bookmarks.update(bookmark[0].id, {
                title
            });
        })
    }

    browser.storage.local.get(url)
        .then(result => {
            if (result[url]) {
                let thumbnails = result[url].thumbnails;
                thumbIndex = thumbnails.indexOf(selectedImageSrc);
                if (thumbIndex >= 0) {
                    browser.storage.local.set({[url]:{thumbnails, thumbIndex}}).then(result => {
                        tabMessagePort.postMessage({updateCache: true, url, i:thumbIndex});
                    });
                }
            }
            hideModal();
        });
}

function animate() {
    var inputs = document.querySelectorAll("input");
    var nodes  = document.querySelectorAll(".tile");
    var total  = nodes.length;
    var dirty  = true;
    var time   = 0.9;
    var omega  = 12;
    var zeta   = 0.9;
    var boxes  = [];

    for (var i = 0; i < total; i++) {
        var node   = nodes[i];
        TweenLite.set(node, { x: "+=0" });
        var transform = node._gsTransform;
        var x = node.offsetLeft;
        var y = node.offsetTop;
        boxes[i] = { node, transform, x, y };
    }

    window.addEventListener("resize", () => { dirty = true; });
    TweenLite.ticker.addEventListener("tick", () => dirty && layout());

    layout();

    function layout() {
        dirty = false;

        for (var i = 0; i < total; i++) {
            var box = boxes[i];
            var lastX = box.x;
            var lastY = box.y;
            box.x = box.node.offsetLeft;
            box.y = box.node.offsetTop;
            if (lastX !== box.x || lastY !== box.y) {
                var x = box.transform.x + lastX - box.x;
                var y = box.transform.y + lastY - box.y;
                // Tween to 0 to remove the transforms
                TweenLite.set(box.node, { x, y });
                TweenLite.to(box.node, time, { x: 0, y: 0, ease });
            }
        }
    }

    function ease(progress) {
        var beta  = Math.sqrt(1.0 - zeta * zeta);
        progress = 1 - Math.cos(progress * Math.PI / 2);
        progress = 1 / beta *
            Math.exp(-zeta * omega * progress) *
            Math.sin( beta * omega * progress + Math.atan(beta / zeta));
        return 1 - progress;
    }

}

function readURL(input) {
    if (input.files && input.files[0]) {
        reader.readAsDataURL(input.files[0]);
    }
}

function hexToRgb(color) {
    let colors = color.replace("#", "").match(/.{2}/g);
    return colors.map(c => parseInt("0x"+c));
}

// given a color, return whether white or black has the most contrast
// approximates w3c accessibility algorithm
function contrast(rgb) {
    let srgb = [];
    rgb.forEach(function(c, i) {
        c = c / 255;
        if (c <= 0.03928) {
            c = c/12.92
        } else {
            c = Math.pow((c + 0.055) / 1.055, 2.4);
        }
        srgb[i] = c
    });
    let l = ((0.2126 * srgb[0]) + (0.7152 * srgb[1]) + (0.0722 * srgb[2]));
    if (l > 0.179) {
        return '#000000'
    } else {
        return '#ffffff'
    }
}

function getAverageRGB(imgPath) {
    return new Promise(function(resolve, reject) {
        let img = new Image();
        img.onload = function () {
            let blockSize = 5; // only visit every 5 pixels
            let canvas = document.createElement('canvas');
            let context = canvas.getContext && canvas.getContext('2d');
            let data, width, height;
            let i = -4;
            let length;
            let rgb = [0,0,0];
            let count = 0;

            height = canvas.height = img.naturalHeight || img.offsetHeight || img.height;
            width = canvas.width = img.naturalWidth || img.offsetWidth || img.width;

            context.drawImage(img, 0, 0);
            data = context.getImageData(0, 0, width, height);
            length = data.data.length;

            while ((i += blockSize * 4) < length) {
                ++count;
                rgb[0] += data.data[i];
                rgb[1] += data.data[i + 1];
                rgb[2] += data.data[i + 2];
            }

            rgb[0] = ~~(rgb[0] / count);
            rgb[1] = ~~(rgb[1] / count);
            rgb[2] = ~~(rgb[2] / count);

            resolve(rgb);
        };
        img.src = imgPath;
    });
}

function applySettings() {
    return new Promise(function(resolve, reject) {
        // populate settings nav
        wallPaperEnabled.checked = settings.wallpaper;
        color_picker.value = settings.backgroundColor;
        color_picker_wrapper.style.backgroundColor = settings.backgroundColor;
        showTitlesInput.checked = settings.showTitles;
        largeTilesInput.checked = settings.largeTiles;
        verticalAlignInput.checked = settings.verticalAlign;

        if (settings.wallpaperSrc) {
            imgPreview.setAttribute('src', settings.wallpaperSrc);
            imgPreview.style.display = 'block';
        }
        if (settings.wallpaper) {
            previewContainer.style.display = 'flex';
        }

        // apply settings to speed dial
        if (!settings.showTitles) {
            document.documentElement.style.setProperty('--title-opacity', '0');
        } else {
            document.documentElement.style.setProperty('--title-opacity', '1');
        }

        if (settings.wallpaper && settings.wallpaperSrc) {
            document.body.style.background = `url("${settings.wallpaperSrc}") no-repeat top center fixed`;
            document.body.style.backgroundSize = 'cover';
            // dynamically set text color based on background
            // todo: confirm this is performant
            getAverageRGB(settings.wallpaperSrc).then(rgb => {
                let textColor = contrast(rgb);
                document.documentElement.style.setProperty('--color', textColor);
            });
        } else {
            document.body.style.background = settings.backgroundColor;
            let textColor = contrast(hexToRgb(settings.backgroundColor));
            document.documentElement.style.setProperty('--color', textColor);
        }

        if (settings.verticalAlign) {
            document.documentElement.style.setProperty('--vertical-align', 'center');
            document.documentElement.style.setProperty('--top-padding', '0');
        } else {
            document.documentElement.style.setProperty('--vertical-align', 'start');
            document.documentElement.style.setProperty('--top-padding', '50px');
        }

        resolve();
    });
}

function saveSettings() {
    settings.wallpaper = wallPaperEnabled.checked;
    settings.wallpaperSrc = imgPreview.src;
    settings.backgroundColor = color_picker.value;
    settings.showTitles = showTitlesInput.checked;
    settings.largeTiles = largeTilesInput.checked;
    settings.verticalAlign = verticalAlignInput.checked;

    browser.storage.local.set({settings})
        .then(()=> {
            toast.style.opacity = "1";
            setTimeout(function() {
                toast.style.opacity = "0";
            }, 3500);
            applySettings();
            tabMessagePort.postMessage({updateSettings: true});
        });
}

// override context menu
document.addEventListener( "contextmenu", function(e) {
    e.preventDefault();
    hideSettings();
    if (e.target.className === 'tile-content') {
        targetNode = e.target.parentElement.parentElement;
        targetTileHref = e.target.parentElement.parentElement.href;
        targetTileTitle = e.target.nextElementSibling.innerText;
        showContextMenu(e.pageY, e.pageX);
        return false;
    } else if (e.target.className === 'container') {
        showSettingsMenu(e.pageY, e.pageX);
        return false;
    }
});

// listen for menu item
window.addEventListener("click", e => {
    hideMenus();
    switch (e.target.className) {
        case 'tile-content':
        case 'tile-title':
            hideSettings();
            break;
        case 'container':
            hideSettings();
            break;
        case 'modal':
            hideModal();
            break;
        case 'menu-option':
            switch (e.target.id) {
                case 'openSettings':
                    openSettings();
                    break;
                case 'newTab':
                    browser.tabs.create({url:targetTileHref});
                    break;
                case 'newWin':
                    browser.windows.create({"url": targetTileHref});
                    break;
                case 'newPrivate':
                    browser.windows.create({"url": targetTileHref, "incognito": true});
                    break;
                case 'edit':
                    buildModal(targetTileHref, targetTileTitle);
                    modal.style.display = "flex";
                    break;
                case 'delete':
                    removeBookmark(targetTileHref);
                    break;
            }
            break;
        default:
            if (typeof e.target.className === 'string' && e.target.className.indexOf('settingsCtl') >= 0) {
                return;
            }
            e.preventDefault();
    }

});

window.addEventListener("keydown", event => {
    if (event.code === "Escape") {
        hideMenus();
        hideModal();
    }
});

modalSave.addEventListener("click", saveBookmarkSettings);

closeModal.onclick = function(e) {
    e.preventDefault();
    hideModal();
};

color_picker.onchange = function() {
    color_picker_wrapper.style.backgroundColor = color_picker.value;
};

reader.onload = function (e) {
    imgPreview.setAttribute('src', e.target.result);
    imgPreview.style.display = 'block';
};

imgInput.onchange = function() {
    readURL(this);
};

saveBtn.onclick = function() {
    saveSettings();
};

wallPaperEnabled.onchange = function() {
    if (this.checked) {
        previewContainer.style.display = "flex";
    } else {
        previewContainer.style.display = "none";
    }
};

function init() {

    tabMessagePort.onMessage.addListener(function(m) {
        if (m.ready) {
            cache = m.cache;
            settings = m.settings;
            speedDialId = m.speedDialId;
            applySettings().then(() => getBookmarks(speedDialId));
        } else if (m.refresh) {
            cache = m.cache;
            noBookmarks.style.display = 'none';
            bookmarksContainer.innerHTML = "";
            getBookmarks(speedDialId)
        }
    });

    tabMessagePort.postMessage({getCache: true});

    sortable = new Sortable(bookmarksContainer, {
        animation: 160,
        ghostClass: 'selected',
        dragClass: 'dragging',
        store: {
            set: function(sortable) {
                let order = sortable.toArray();
                browser.storage.local.set({"sort":order});
            }
        }
    });
}

init();
