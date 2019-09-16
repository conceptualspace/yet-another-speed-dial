// yet another speed dial
// copyright 2019 dev@conceptualspace.net
// absolutely no warranty is expressed or implied

'use strict';

// speed dial
const bookmarksContainer = document.getElementById('wrap');
const menu = document.getElementById('contextMenu');
const settingsMenu = document.getElementById('settingsMenu');
const modal = document.getElementById('tileModal');
const modalContent = document.getElementById('tileModalContent');

const createDialModal = document.getElementById('createDialModal');
const createDialModalContent = document.getElementById('createDialModalContent');
const createDialModalURL = document.getElementById('createDialModalURL');
const createDialModalSave = document.getElementById('createDialModalSave');
const toast = document.getElementById('toast');
const toastContent = document.getElementById('toastContent');

const closeModal = document.getElementsByClassName("close");
const modalSave = document.getElementById('modalSave');
const sidenav = document.getElementById("sidenav");
const modalTitle = document.getElementById("modalTitle");
const modalURL = document.getElementById("modalURL");
const modalImgContainer = document.getElementById("modalImgContainer");
const modalImgInput = document.getElementById("modalImgFile");
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
const showCreateDialInput = document.getElementById("showCreateDial");
const verticalAlignInput = document.getElementById("verticalAlign");
const saveBtn = document.getElementById("saveBtn");
const settingsToast = document.getElementById("settingsToast");

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
        if (!result.length && settings.verticalAlign) {
            noBookmarks.style.display = 'block';
        }
        printBookmarks(result)
    });
}

function removeBookmark(url) {
    browser.bookmarks.search({url})
        .then(bookmarks => {
            for (let bookmark of bookmarks) {
                if (bookmark.parentId === speedDialId) {
                    targetNode.remove();
                    browser.bookmarks.remove(bookmark.id);
                    browser.storage.local.remove(url);
                    sortable.save();
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
    if (bookmarks) {
        for (let bookmark of bookmarks) {
            // todo: support folders
            if (bookmark.url) {
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
                content.style.backgroundImage = "url(" + thumbUrl + ")";

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
        }
    }

    // new dial button
    let a = document.createElement('a');
    a.classList.add('tile', 'createDial');
    a.onclick = function() {
        buildCreateDialModal();
        createDialModal.style.transform = "translateX(0%)";
        createDialModal.style.opacity = "1";
        createDialModalContent.style.transform = "scale(1)";
        createDialModalContent.style.opacity = "1";
    };
    let main = document.createElement('div');
    main.classList.add('tile-main');
    let content = document.createElement('div');
    content.classList.add('tile-content', 'createDial-content');
    main.appendChild(content);
    a.appendChild(main);
    fragment.appendChild(a);

    bookmarksContainer.appendChild(fragment);
    sort();
    bookmarksContainer.style.opacity = "1";
    animate();
}

function showContextMenu(top, left) {
    if ((document.body.clientWidth - left) < (menu.clientWidth + 30)) {
        menu.style.left = (left - menu.clientWidth) + 'px';
    } else {
        menu.style.left = left + 'px';
    }
    if ((document.body.clientHeight - top) < (menu.clientHeight + 30)) {
        menu.style.top = (top - menu.clientHeight) + 'px';
    } else {
        menu.style.top = top + 'px';
    }
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
    sidenav.style.boxShadow ="0px 2px 8px 0px rgba(0,0,0,0.5)";
    sidenav.style.transform = "translateX(0%)";
}

function hideSettings() {
    sidenav.style.transform = "translateX(100%)";
    sidenav.style.boxShadow = "none";
}

function hideModal() {
    modalContent.style.transform = "scale(0.8)";
    modalContent.style.opacity = "0";
    modal.style.opacity = "0";

    createDialModalContent.style.transform = "scale(0.8)";
    createDialModalContent.style.opacity = "0";
    createDialModal.style.opacity = "0";

    setTimeout(function() {
        modal.style.transform = "translateX(100%)";
        createDialModal.style.transform = "translateX(100%)";
    }, 160);

    //modalContent.style.transform = "scale(0.8)";
}

function hideToast() {
    toast.style.transform = "translateX(100%)";
    toastContent.innerText = '';
}

function buildCreateDialModal() {
    createDialModalURL.value = '';
    createDialModalURL.focus();
}

async function buildModal(url, title) {
    // nuke any previous modal
    let carousel = document.getElementById("carousel");
    if (carousel) {
        modalImgContainer.removeChild(carousel);
    }

    let customCarousel = document.getElementById("customCarousel");
    if (customCarousel) {
        modalImgContainer.removeChild(customCarousel);
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

function createDial() {
    let url = createDialModalURL.value.trim();

    if ( !url.startsWith('https://') && !url.startsWith('http://') ) {
        url = 'https://' + url;
    }

    browser.bookmarks.create({
        title: url,
        url: url
    }).then(node => {
        browser.bookmarks.move(node.id, {parentId: speedDialId}).then(() => {
            hideModal();
            toastContent.innerText = ` Capturing images for ${url}...`;
            toast.style.transform = "translateX(0%)";
        }, reason => {
            console.error(reason);
        });
    });
}

function saveBookmarkSettings() {
    let title = modalTitle.value;
    let url = modalURL.value;
    let selectedImageSrc = null;
    let thumbIndex = 0;
    let imageNodes = document.getElementsByClassName('fc-slide');

    let customCarousel = document.getElementById('customCarousel');
    if (customCarousel) {
        selectedImageSrc = customCarousel.children[0].src;
        targetNode.children[0].children[0].style.backgroundImage = `url('${selectedImageSrc}')`;
        browser.storage.local.get(url)
            .then(result => {
                if (result[url]) {
                    let thumbnails = result[url].thumbnails;
                    thumbnails.push(selectedImageSrc);
                    thumbIndex = thumbnails.indexOf(selectedImageSrc);
                    browser.storage.local.set({[url]: {thumbnails, thumbIndex}}).then(result => {
                        tabMessagePort.postMessage({updateCache: true, url, i: thumbIndex});
                    });
                }
            });
    } else {
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
            });
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

    hideModal();
}

function animate() {
    //var inputs = document.querySelectorAll("input");
    const nodes  = document.querySelectorAll(".tile");
    const observerConfig = { attributes: false, childList: true, subtree: false };
    const total  = nodes.length;
    const time   = 0.9;
    const omega  = 12;
    const zeta   = 0.9;
    let dirty  = true;
    let boxes  = [];

    for (let i = 0; i < total; i++) {
        let node   = nodes[i];
        TweenLite.set(node, { x: "+=0" });
        const transform = node._gsTransform;
        const x = node.offsetLeft;
        const y = node.offsetTop;
        boxes[i] = { node, transform, x, y };
    }

    window.addEventListener("resize", () => { dirty = true; });
    const observer = new MutationObserver(() => { dirty = true; });
    observer.observe(bookmarksContainer, observerConfig);

    TweenLite.ticker.addEventListener("tick", () => dirty && layout());

    layout();

    function layout() {
        dirty = false;

        for (let i = 0; i < total; i++) {
            let box = boxes[i];
            const lastX = box.x;
            const lastY = box.y;
            box.x = box.node.offsetLeft;
            box.y = box.node.offsetTop;
            if (lastX !== box.x || lastY !== box.y) {
                const x = box.transform.x + lastX - box.x;
                const y = box.transform.y + lastY - box.y;
                // Tween to 0 to remove the transforms
                TweenLite.set(box.node, { x, y });
                TweenLite.to(box.node, time, { x: 0, y: 0, ease });
            }
        }
    }

    function ease(progress) {
        const beta  = Math.sqrt(1.0 - zeta * zeta);
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

function resizeThumb(dataURI){
    return new Promise(function(resolve, reject) {
        let img = new Image();
        img.onload = function() {
            if (this.height > 256 && this.width > 256) {
                // when im less lazy check use optimal w/h based on image
                // set height to 256 and scale
                let height = 256;
                let ratio = height / this.height;
                let width = Math.round(this.width * ratio);

                let canvas = document.createElement('canvas');
                let ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(this, 0, 0, width, height);

                const newDataURI = canvas.toDataURL('image/jpeg', 0.86);
                resolve(newDataURI);
            } else {
                resolve(dataURI);
            }
        };
        img.src = dataURI;
    })
}

function readImage(input) {
    return new Promise(function(resolve, reject) {
        let filereader = new FileReader();
        filereader.onload = function(e) {
            resolve(e.target.result);
        };
        if (input.files && input.files[0]) {
            filereader.readAsDataURL(input.files[0]);
        }
    });
}

//todo: deletability yo
function addImage(image) {
    let carousel = document.getElementById('carousel');
    if (carousel) {
        carousel.style.display = "none";
        let customCarousel = document.getElementById('customCarousel');
        if (customCarousel) {
            customCarousel.remove();
        }
        customCarousel = document.createElement('div');
        customCarousel.setAttribute('id', 'customCarousel');
        customCarousel.style.height = "180px";

        let preview = document.createElement('img');
        preview.style.height = '100%';
        preview.style.width = '100%';
        preview.style.objectFit = 'contain';
        preview.setAttribute('src', image);

        customCarousel.appendChild(preview);
        modalImgContainer.appendChild(customCarousel);
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
        // todo: performance: use the bg preview image from the settings nav rather than using a constructor
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
        // apply settings to speed dial
        if (settings.verticalAlign) {
            document.documentElement.style.setProperty('--vertical-align', 'safe center');
        } else {
            document.documentElement.style.setProperty('--vertical-align', 'start');
        }

        if (settings.wallpaper && settings.wallpaperSrc) {
            // perf hack for default gradient bg image. user selected images are data URIs
            if (settings.wallpaperSrc.length < 65) {
                document.body.style.background = `linear-gradient(135deg, #4387a2, #5b268d)`;
                document.documentElement.style.setProperty('--color', '#ffffff');
            } else {
                document.body.style.background = `url("${settings.wallpaperSrc}") no-repeat top center fixed`;
                document.body.style.backgroundSize = 'cover';
                // dynamically set text color based on background
                // todo: confirm this is performant
                getAverageRGB(settings.wallpaperSrc).then(rgb => {
                    let textColor = contrast(rgb);
                    document.documentElement.style.setProperty('--color', textColor);
                });
            }
        } else {
            document.body.style.background = settings.backgroundColor;
            let textColor = contrast(hexToRgb(settings.backgroundColor));
            document.documentElement.style.setProperty('--color', textColor);
        }

        if (!settings.showTitles) {
            document.documentElement.style.setProperty('--title-opacity', '0');
        } else {
            document.documentElement.style.setProperty('--title-opacity', '1');
        }

        if (!settings.showAddSite) {
            document.documentElement.style.setProperty('--create-dial-display', 'none');
        } else {
            document.documentElement.style.setProperty('--create-dial-display', 'block');
        }

        if (browser.runtime.getBrowserInfo) {
            document.documentElement.style.setProperty('--chrome-display', 'none');
        } else {
            document.documentElement.style.setProperty('--chrome-display', 'block');
        }


        resolve();

        // populate settings nav
        wallPaperEnabled.checked = settings.wallpaper;
        color_picker.value = settings.backgroundColor;
        color_picker_wrapper.style.backgroundColor = settings.backgroundColor;
        showTitlesInput.checked = settings.showTitles;
        showCreateDialInput.checked = settings.showAddSite;
        largeTilesInput.checked = settings.largeTiles;
        verticalAlignInput.checked = settings.verticalAlign;

        if (settings.wallpaperSrc) {
            imgPreview.setAttribute('src', settings.wallpaperSrc);
            imgPreview.style.display = 'block';
        }
        if (settings.wallpaper) {
            previewContainer.style.display = 'flex';
        }

    });
}

function saveSettings() {
    settings.wallpaper = wallPaperEnabled.checked;
    settings.wallpaperSrc = imgPreview.src;
    settings.backgroundColor = color_picker.value;
    settings.showTitles = showTitlesInput.checked;
    settings.showAddSite = showCreateDialInput.checked;
    settings.largeTiles = largeTilesInput.checked;
    settings.verticalAlign = verticalAlignInput.checked;

    browser.storage.local.set({settings})
        .then(()=> {
            settingsToast.style.opacity = "1";
            setTimeout(function() {
                settingsToast.style.opacity = "0";
            }, 3500);
            applySettings();
            tabMessagePort.postMessage({updateSettings: true});
        });
}

// override context menu
document.addEventListener( "contextmenu", function(e) {
    e.preventDefault();
    // prevent settings from being opened and immediately hidden when right-clicking the gear icon
    if (e.target.id === 'settingsDiv') {
        return;
    }
    hideSettings();
    if (e.target.className === 'tile-content') {
        targetNode = e.target.parentElement.parentElement;
        targetTileHref = e.target.parentElement.parentElement.href;
        targetTileTitle = e.target.nextElementSibling.innerText;
        showContextMenu(e.pageY, e.pageX);
        return false;
    } else if (e.target.className === 'container' || e.target.className === 'default-content') {
        showSettingsMenu(e.pageY, e.pageX);
        return false;
    }
});

// todo: tidy this up
window.addEventListener("click", e => {
    if (typeof e.target.className === 'string' && e.target.className.indexOf('settingsCtl') >= 0) {
        return;
    } if (e.target.className === 'tile-content' || e.target.className === 'tile-title') {
        return;
    }
    e.preventDefault();
});

// listen for menu item
window.addEventListener("mousedown", e => {
    hideMenus();
    if (e.target.type === 'text') {
        return
    }
    if (e.target.className.baseVal === 'gear') {
        openSettings();
        return;
    }
    switch (e.target.className) {
        case 'default-content':
        case 'tile-content':
        case 'tile-title':
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
                    modal.style.transform = "translateX(0%)";
                    modal.style.opacity = "1";
                    modalContent.style.transform = "scale(1)";
                    modalContent.style.opacity = "1";
                    break;
                case 'delete':
                    removeBookmark(targetTileHref);
                    break;
            }
            break;
        default:
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
createDialModalSave.addEventListener("click", createDial);

for(let button of closeModal) {
    button.onclick = function(e) {
        e.preventDefault();
        hideModal();
    };
}

modalTitle.addEventListener('keydown', e => {
    if (e.code === "Enter") {
        e.preventDefault();
        saveBookmarkSettings();
    }
});

createDialModalURL.addEventListener('keydown', e => {
    if (e.code === "Enter") {
        e.preventDefault();
        createDial();
    }
});

modalImgInput.onchange = function() {
    readImage(this).then(image => {
        resizeThumb(image).then(resizedImage => {
            addImage(resizedImage);
        })
    });
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
            hideToast();
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
        filter: ".createDial",
        onMove:function (evt) {
            if (evt.related) {
                return !evt.related.classList.contains('createDial');
            }
        },
        store: {
            set: function(sortable) {
                let order = sortable.toArray();
                browser.storage.local.set({"sort":order});
            }
        }
    });
}

init();
