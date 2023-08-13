// Simple Speed Dial
// absolutely no warranty is expressed or implied

'use strict';

// speed dial
const bookmarksContainerParent = document.getElementById('tileContainer');
const bookmarksContainer = document.getElementById('wrap');
const breadcrumbsContainer = document.getElementById('breadcrumbs');
const foldersContainer = document.getElementById('folders');
const menu = document.getElementById('contextMenu');
const settingsMenu = document.getElementById('settingsMenu');
const modal = document.getElementById('tileModal');
const modalContent = document.getElementById('tileModalContent');

const refreshAllModal = document.getElementById('refreshAllModal');
const refreshAllModalContent = document.getElementById('refreshAllModalContent');
const refreshAllModalSave = document.getElementById('refreshAllModalSave');

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
const textColor_picker = document.getElementById("textColor-picker");
const textColor_picker_wrapper = document.getElementById("textColor-picker-wrapper");
const imgInput = document.getElementById("file");
const imgPreview = document.getElementById("preview");
const previewOverlay = document.getElementById("previewOverlay");
const switchesContainer = document.getElementById("switchesContainer");
const wallPaperEnabled = document.getElementById("wallpaper");
const previewContainer = document.getElementById("previewContainer");
const backgroundColorContainer = document.getElementById("backgroundColorContainer");
const largeTilesInput = document.getElementById("largeTiles");
const rememberFolderInput = document.getElementById("rememberFolder");
const showTitlesInput = document.getElementById("showTitles");
const showClockInput = document.getElementById("showClock");
const showSettingsBtnInput = document.getElementById("showSettingsBtn");
const maxColsInput = document.getElementById("maxcols");
const importExportBtn = document.getElementById("importExportBtn");
const importExportStatus = document.getElementById('statusMessage');
const exportBtn = document.getElementById("exportBtn");
const importFileInput = document.getElementById("importFile");
const importFileLabel = document.getElementById("importFileLabel");
const helpBtn = document.getElementById("help");

// clock
const clock = document.getElementById('clock');

const port = "p-" + new Date().getTime();
let tabMessagePort = null;

let cache = null;
let settings = null;
let speedDialId = null;
let targetTileHref = null;
let targetTileTitle = null;
let targetNode = null;
let targetFolder = null;
let targetFolderName = null;
let targetFolderLink = null;
let folders = [];
let currentFolder = null;
let scrollPos = 0;
let homeFolderTitle = browser.i18n.getMessage('home');
let windowSize = null;
let containerSize = null;
let layoutFolder = false;
let boxes = [];
let hourCycle = 'h12';

let breadcrumbs = [];
let breadcrumbTitles = [];

const locale = navigator.language;
const imageRatio = 1.54;
const helpUrl = 'https://conceptualspace.github.io/yet-another-speed-dial/';

const debounce = (func, delay = 500, immediate = false) => {
    let inDebounce
    return function () {
        const context = this
        const args = arguments
        if (immediate && !inDebounce) {
            func.apply(context, args);
            inDebounce = setTimeout(() => clearTimeout(inDebounce), delay)
        } else {
            clearTimeout(inDebounce)
            inDebounce = setTimeout(() => func.apply(context, args), delay)
        }
    }
}

// detect clock settings
if (!locale.startsWith("en")) {
    hourCycle = Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle;
}

function displayClock() {
    clock.textContent = new Date().toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hourCycle: hourCycle });
    setTimeout(displayClock, 10000);
}

displayClock();

function showFolder(id, title) {

    currentFolder = id;

    if (!title) {
        title = 'how did I get here without a title?';
    }

    if (breadcrumbs.includes(id)) { // navigating back up the folder tree
        breadcrumbs.length = breadcrumbs.indexOf(id) + 1;
        breadcrumbTitles.length = breadcrumbs.indexOf(id) + 1;
    } else { // navigating to sub-folder
        breadcrumbs.push(id);
        breadcrumbTitles.push(title);
    }

    hideSettings();

    refreshBreadcrumbs();
    refreshFolders(id);
    refreshBookmarks(id);
}

function getThumbs(bookmarkUrl) {
    return browser.storage.local.get(bookmarkUrl)
        .then(result => {
            if (result[bookmarkUrl]) {
                return result[bookmarkUrl];
            }
        });
}

function folderLink(title, id) {
    let a = document.createElement('a');
    if (id === speedDialId) {
        a.id = "homeFolderLink";
        return; // todo come up with a less hacky way to disable home in folder list
    }
    //a.classList.add('tile');
    a.classList.add('folderTitle');
    a.setAttribute('folderId', id);
    let linkText = document.createTextNode(title);
    a.appendChild(linkText);
    //a.href = "#"+bookmark.id;
    a.onclick = function () {
        showFolder(id, title);
        currentFolder = id;
        scrollPos = 0;
        bookmarksContainerParent.scrollTop = scrollPos;
        tabMessagePort.postMessage({ currentFolder: id });
    };

    foldersContainer.appendChild(a);
}

// todo: refactor this and folderLink function to share logic
function breadcrumbLink(title, id, disabled) {

    let a = document.createElement('a');
    if (id === speedDialId) {
        a.id = "homeFolderLink";
    } else { // add separator between breadcrumbs
        let s = document.createElement('span');
        let separator = document.createTextNode('>');
        s.appendChild(separator);
        s.classList.add('folderTitle');
        breadcrumbsContainer.appendChild(s);
    }
    //a.classList.add('tile');
    a.classList.add('folderTitle');
    a.setAttribute('folderId', id);
    let linkText = document.createTextNode(title);
    a.appendChild(linkText);
    //a.href = "#"+bookmark.id;
    if (!disabled) {    // disable leaf node
        a.onclick = function () {
            showFolder(id, title);
            currentFolder = id;
            scrollPos = 0;
            bookmarksContainerParent.scrollTop = scrollPos;
            tabMessagePort.postMessage({ currentFolder: id });
        };
    }

    breadcrumbsContainer.appendChild(a);
}

function refreshBreadcrumbs() {

    breadcrumbsContainer.innerHTML = "";

    if (breadcrumbs.length === 0) { // add home folder
        breadcrumbs.push(speedDialId);
        breadcrumbTitles.push(homeFolderTitle);
    }

    for (let i = 0; i < breadcrumbs.length; i++) {
        breadcrumbLink(breadcrumbTitles[i], breadcrumbs[i], i === breadcrumbs.length - 1 ? true : false);
    }

}

function refreshFolders(parent) {

    foldersContainer.innerHTML = "";

    browser.bookmarks.getChildren(parent).then(children => {
        if (children && children.length) {
            let sortedChildren = children.sort((c1, c2) => (c1.title.localeCompare(c2.title)));
            for (let child of sortedChildren) {
                if (!child.url && child.parentId === parent) {
                    folders.push(child.id);
                    folderLink(child.title, child.id);
                }
            }
        }
    }).catch(err => {
        console.log(err);
    });


}

function refreshBookmarks(parent) {

    bookmarksContainer.innerHTML = "";

    browser.bookmarks.getChildren(parent).then(children => {

        if (children && children.length) {

            let sortedChildren = children.sort((c1, c2) => (c1.title.localeCompare(c2.title)));

            for (let child of sortedChildren) {

                if (child.url && child.parentId === parent && child.url.startsWith("http")) {

                    // restricted to valid url schemes for security reasons -- http and https. see #26
                    // in ff bookmark "separators" can be created that have "data:" as the url.
                    let thumbBg, thumbUrl = null;
                    if (cache[child.url]) {
                        thumbUrl = cache[child.url][0];
                        thumbBg = cache[child.url][1]
                    } else {
                        thumbUrl = "../img/default.png";
                    }
                    let a = document.createElement('a');
                    a.classList.add('tile');
                    a.href = child.url;
                    a.setAttribute('data-id', child.id);

                    let main = document.createElement('div');
                    main.classList.add('tile-main');

                    let content = document.createElement('div');
                    content.classList.add('tile-content');
                    if (thumbBg) {
                        content.style.backgroundImage = `url('${thumbUrl}'), ${thumbBg}`;
                    } else {
                        content.style.backgroundImage = `url('${thumbUrl}')`;
                    }

                    let title = document.createElement('div');
                    title.classList.add('tile-title');
                    if (!settings.showTitles) {
                        title.classList.add('hide');
                    }
                    title.textContent = child.title;

                    main.appendChild(content);
                    main.appendChild(title);
                    a.appendChild(main);

                    bookmarksContainer.appendChild(a);
                }

            }

            bookmarksContainer.style.opacity = "1";

        }
    }).catch(err => {
        console.log(err);
    });

}

function refreshThumbnails(url) {
    tabMessagePort.postMessage({ refreshThumbs: true, url });
    toastContent.innerText = ` Capturing images...`;
    toast.style.transform = "translateX(0%)";
}

function refreshAllThumbnails() {
    let urls = [];
    let parent = currentFolder ? currentFolder : speedDialId;

    hideModals();

    browser.bookmarks.getChildren(parent).then(children => {
        if (children && children.length) {
            for (let child of children) {
                if (child.url && (child.url.startsWith('https://') || child.url.startsWith('http://'))) {
                    urls.push(child.url);
                }
            }
            tabMessagePort.postMessage({ refreshAll: true, urls });
            toastContent.innerText = ` Capturing images...`;
            toast.style.transform = "translateX(0%)";
        }
    }).catch(err => {
        console.log(err);
    });
}

function showContextMenu(el, top, left) {
    if ((document.body.clientWidth - left) < (el.clientWidth + 30)) {
        el.style.left = (left - el.clientWidth) + 'px';
    } else {
        el.style.left = left + 'px';
    }
    if ((document.body.clientHeight - top) < (el.clientHeight + 30)) {
        el.style.top = (top - el.clientHeight) + 'px';
    } else {
        el.style.top = top + 'px';
    }
    el.style.visibility = "visible";
    el.style.opacity = "1";
}

function hideMenus() {
    let menus = [menu, settingsMenu]
    for (let el of menus) {
        el.style.visibility = "hidden";
        el.style.opacity = "0";
    }
}

function openSettings() {
    sidenav.style.boxShadow = "0px 2px 8px 0px rgba(0,0,0,0.5)";
    sidenav.style.transform = "translateX(0%)";
}

function hideSettings() {
    sidenav.style.transform = "translateX(100%)";
    sidenav.style.boxShadow = "none";
}

function hideModals() {
    let modals = [modal, refreshAllModal];
    let modalContents = [modalContent, refreshAllModalContent]

    for (let button of document.getElementsByTagName('button')) {
        button.blur();
    }

    for (let input of document.getElementsByTagName('input')) {
        input.blur();
    }

    for (let el of modalContents) {
        el.style.transform = "scale(0.8)";
        el.style.opacity = "0";
    }

    for (let el of modals) {
        el.style.opacity = "0";
        setTimeout(function () {
            el.style.transform = "translateX(100%)";
        }, 160);
    }
}

function modalShowEffect(contentEl, modalEl) {
    modalEl.style.transform = "translateX(0%)";
    modalEl.style.opacity = "1";
    contentEl.style.transform = "scale(1)";
    contentEl.style.opacity = "1";
}

function hideToast() {
    toast.style.transform = "translateX(100%)";
    toastContent.innerText = '';
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
        img.crossOrigin = 'Anonymous';
        img.setAttribute('src', images.thumbnails[index]);
        imgDiv.appendChild(img);
        newCarousel.appendChild(imgDiv);
        for (let [i, image] of images.thumbnails.entries()) {
            if (i !== index) {
                let imgDiv = document.createElement('div');
                let img = document.createElement('img');
                img.crossOrigin = 'Anonymous';
                img.setAttribute('src', image);
                imgDiv.appendChild(img);
                newCarousel.appendChild(imgDiv);
            }
        }
        $('#carousel').flexCarousel({ height: '180px' });
    }
}

function rectifyUrl(url) {
    if (url && !url.startsWith('https://') && !url.startsWith('http://')) {
        return 'https://' + url;
    } else {
        return url;
    }
}

function openAllTabs() {
    let folder = currentFolder ? document.getElementById(currentFolder) : document.getElementById('wrap');

    if (folder) {
        let dials = [...folder.getElementsByClassName('tile')];

        dials?.forEach(dial => {
            if (dial.href) {
                browser.tabs.create({
                    url: dial.href,
                    active: false
                });
            }
        });
    }
}

function offscreenCanvasShim(w, h) {
    try {
        return new OffscreenCanvas(w, h);
    } catch (err) {
        // offscreencanvas not supported in ff
        let canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        return canvas;
    }
}

// calculate the bg color of a given image
// todo: punt this to a worker
function getBgColor(image) {
    let imgWidth = image.naturalWidth;
    let imgHeight = image.naturalHeight;
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
    let context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);

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
    return `linear-gradient(to ${direction}, rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3]}) 50%, rgba(${rgbaa[0]},${rgbaa[1]},${rgbaa[2]},${rgbaa[3]}) 50%)`;
}

function saveBookmarkSettings() {
    // todo: cleanup this abomination when im not on drugs
    let title = modalTitle.value;
    let url = targetTileHref;
    let newUrl = rectifyUrl(modalURL.value.trim());
    let selectedImageSrc = null;
    let thumbIndex = 0;
    let imageNodes = document.getElementsByClassName('fc-slide');
    let bgColor = null;

    let customCarousel = document.getElementById('customCarousel');
    if (customCarousel) {
        selectedImageSrc = customCarousel.children[0].src;
        bgColor = getBgColor(customCarousel.children[0]);
        targetNode.children[0].children[0].style.backgroundImage = `url('${selectedImageSrc}'), ${bgColor}`;
        //targetNode.children[0].children[0].style.backgroundColor = bgColor;
        browser.storage.local.get(url)
            .then(result => {
                let thumbnails = [];
                if (result[url]) {
                    thumbnails = result[url].thumbnails;
                    thumbnails.push(selectedImageSrc);
                    thumbIndex = thumbnails.indexOf(selectedImageSrc);
                } else {
                    thumbnails.push(selectedImageSrc);
                    thumbIndex = 0;
                }
                browser.storage.local.set({ [newUrl]: { thumbnails, thumbIndex, bgColor } }).then(result => {
                    tabMessagePort.postMessage({ updateCache: true, url: newUrl, i: thumbIndex });
                    if (title !== targetTileTitle) {
                        updateTitle()
                    }
                });
            });
    } else {
        for (let node of imageNodes) {
            // div with order "2" is the one being displayed by the carousel
            if (node.style.order === '2') {
                // sometimes the carousel puts images inside a <figure class="fc-image"> elem
                if (node.children[0].className === "fc-image") {
                    selectedImageSrc = node.children[0].children[0].src;
                    bgColor = getBgColor(node.children[0].children[0]);
                } else {
                    selectedImageSrc = node.children[0].src;
                    bgColor = getBgColor(node.children[0]);
                }
                // update tile
                targetNode.children[0].children[0].style.backgroundImage = `url('${selectedImageSrc}'), ${bgColor}`;
                //targetNode.children[0].children[0].style.backgroundColor = bgColor;
                break;
            }
        }

        browser.storage.local.get(url)
            .then(result => {
                if (result[url]) {
                    let thumbnails = result[url].thumbnails;
                    thumbIndex = thumbnails.indexOf(selectedImageSrc);
                    if (thumbIndex >= 0) {
                        browser.storage.local.set({ [newUrl]: { thumbnails, thumbIndex, bgColor } }).then(result => {
                            tabMessagePort.postMessage({ updateCache: true, url: newUrl, i: thumbIndex });
                            if (title !== targetTileTitle || url !== newUrl) {
                                updateTitle()
                            }
                        });
                    } else {
                        if (title !== targetTileTitle || url !== newUrl) {
                            updateTitle()
                        }
                    }
                } else {
                    if (title !== targetTileTitle || url !== newUrl) {
                        updateTitle()
                    }
                }
            });
    }

    // find image index
    function updateTitle() {
        // allow ui to respond immediately while bookmark updated
        browser.bookmarks.search({ url })
            .then(bookmarks => {
                if (bookmarks.length <= 1 && (url !== newUrl)) {
                    // cleanup unused thumbnails
                    browser.storage.local.remove(url)
                }
                for (let bookmark of bookmarks) {
                    let currentParent = currentFolder ? currentFolder : speedDialId
                    if (bookmark.parentId === currentParent) {
                        browser.bookmarks.update(bookmark.id, {
                            title,
                            url: newUrl
                        });
                    }

                    if (url !== newUrl && toastContent.innerText === '') {
                        toastContent.innerText = ` Capturing images for ${newUrl}...`;
                        toast.style.transform = "translateX(0%)";
                    }
                }
            })
    }

    hideModals();
}

// todo: why did i debounce animate but not layout? (because we want tiles to move immediately as manually resizing window)
function layout(force = false) {
    if (force || layoutFolder || containerSize !== getComputedStyle(bookmarksContainer).maxWidth || windowSize !== window.innerWidth) {
        windowSize = window.innerWidth;
        containerSize = getComputedStyle(bookmarksContainer).maxWidth;

        let b = [];

        for (let i = 0; i < boxes.length; i++) {
            let box = boxes[i];
            const lastX = box.x;
            const lastY = box.y;
            // todo: we can make some assumptions to calculate this faster...
            box.x = box.node.offsetLeft;
            box.y = box.node.offsetTop;
            if (lastX !== box.x || lastY !== box.y) {
                const x = box.transform.x + lastX - box.x;
                const y = box.transform.y + lastY - box.y;
                // Tween to 0 to remove the transforms
                TweenMax.set(box.node, { x, y });
                b.push(box.node);
            }
        }
        // layoutFolder true on folder open -- zero duration because we are just setting the positions of the dials, so whenever
        // a resize occurs the animation will start from the right position
        let duration = layoutFolder ? 0 : 0.7;
        TweenMax.staggerTo(b, duration, { x: 0, y: 0, stagger: { amount: 0.2 }, ease });
        layoutFolder = false;
    }
}

function ease(progress) {
    const omega = 12;
    const zeta = 0.8;
    const beta = Math.sqrt(1.0 - zeta * zeta);
    progress = 1 - Math.cos(progress * Math.PI / 2);
    progress = 1 / beta *
        Math.exp(-zeta * omega * progress) *
        Math.sin(beta * omega * progress + Math.atan(beta / zeta));
    return 1 - progress;
}

const animate = debounce(() => {
    let currentParent;
    if (currentFolder && currentFolder !== speedDialId) {
        currentParent = currentFolder
    } else {
        currentParent = "wrap"
    }
    const nodes = document.querySelectorAll(`[id="${currentParent}"] > .tile`);
    const total = nodes.length;

    TweenMax.set(nodes, { lazy: true, x: "+=0" });

    for (let i = 0; i < total; i++) {
        let node = nodes[i];
        const transform = node._gsTransform;
        const x = node.offsetLeft;
        const y = node.offsetTop;
        boxes[i] = { node, transform, x, y };
    }

    layout();

}, 500);

function readURL(input) {
    if (input.files && input.files[0]) {
        reader.readAsDataURL(input.files[0]);
    }
}

function resizeBackground(dataURI) {
    return new Promise(function (resolve, reject) {
        let img = new Image();
        img.onload = function () {
            if (this.height > screen.height) {
                let height = screen.height;
                let ratio = height / this.height;
                let width = Math.round(this.width * ratio);

                let canvas = document.createElement('canvas');
                let ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.imageSmoothingEnabled = true;

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(this, 0, 0, width, height);

                // todo: remove this whenever firefox supports webp. in meantime we fallback to jpg for speed
                if (browser.runtime.getBrowserInfo) {
                    const newDataURI = canvas.toDataURL('image/jpeg', 0.8);
                    resolve(newDataURI);
                } else {
                    const newDataURI = canvas.toDataURL('image/webp', 0.87);
                    resolve(newDataURI);
                }
            } else {
                resolve(dataURI);
            }
        };
        img.src = dataURI;
    })
}

function resizeThumb(dataURI) {
    return new Promise(function (resolve, reject) {
        let img = new Image();
        img.onload = function () {
            if (this.height > 256 && this.width > 256) {
                // when im less lazy check use optimal w/h based on image
                // set height to 256 and scale
                let height = 256;
                let ratio = height / this.height;
                let width = Math.round(this.width * ratio);

                let canvas = document.createElement('canvas');
                let ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.imageSmoothingEnabled = true;

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(this, 0, 0, width, height);

                // webp encoding falls back to png on firefox
                const newDataURI = canvas.toDataURL('image/webp', 0.7);
                resolve(newDataURI);
            } else {
                resolve(dataURI);
            }
        };
        img.src = dataURI;
    })
}

function readImage(input) {
    return new Promise(function (resolve, reject) {
        let filereader = new FileReader();
        filereader.onload = function (e) {
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

function applySettings() {
    return new Promise(function (resolve, reject) {
        // apply settings to speed dial

        if (settings.wallpaper && settings.wallpaperSrc) {
            // perf hack for default gradient bg image. user selected images are data URIs
            if (settings.wallpaperSrc.length < 65) {
                document.body.style.background = `linear-gradient(135deg, #4387a2, #5b268d)`;
            } else {
                document.body.style.background = `url("${settings.wallpaperSrc}") no-repeat top center fixed`;
                document.body.style.backgroundSize = 'cover';
            }
        } else {
            document.body.style.background = settings.backgroundColor;
        }

        if (settings.textColor) {
            document.documentElement.style.setProperty('--color', settings.textColor);
        }

        /*
        if (settings.scaleImages) {
            document.documentElement.style.setProperty('--image-scaling', 'contain');
            //document.documentElement.style.setProperty('--image-width', '140px');
        } else {
            document.documentElement.style.setProperty('--image-scaling', 'cover');
            //document.documentElement.style.setProperty('--image-width', '188px');
        }
        */

        if (settings.maxCols && settings.maxCols !== "100") {
            document.documentElement.style.setProperty('--columns', settings.maxCols * 220 + "px")
            layout();
        } else {
            document.documentElement.style.setProperty('--columns', '100%')
            layout();
        }

        if (settings.showFolders) {
            document.documentElement.style.setProperty('--show-folders', 'inline');
        } else {
            document.documentElement.style.setProperty('--show-folders', 'none');
        }

        if (settings.showClock) {
            clock.style.setProperty('--clock', 'block');
        } else {
            clock.style.setProperty('--clock', 'none');
        }

        if (settings.showSettingsBtn) {
            settingsBtn.style.setProperty('--settings', 'block');
        } else {
            settingsBtn.style.setProperty('--settings', 'none');
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


        resolve();

        // populate settings nav
        wallPaperEnabled.checked = settings.wallpaper;
        color_picker.value = settings.backgroundColor;
        color_picker_wrapper.style.backgroundColor = settings.backgroundColor;
        textColor_picker.value = settings.textColor;
        textColor_picker_wrapper.style.backgroundColor = settings.textColor;
        showTitlesInput.checked = settings.showTitles;
        largeTilesInput.checked = settings.largeTiles;
        showClockInput.checked = settings.showClock;
        showSettingsBtnInput.checked = settings.showSettingsBtn;
        maxColsInput.value = settings.maxCols;
        rememberFolderInput.checked = settings.rememberFolder;

        if (settings.wallpaperSrc) {
            imgPreview.setAttribute('src', settings.wallpaperSrc);
            //imgPreview.style.display = 'block';
            imgPreview.onload = function (e) {
                if (settings.wallpaper) {
                    backgroundColorContainer.style.display = "none";
                    previewContainer.style.opacity = '1';
                    switchesContainer.style.transform = "translateY(0)";

                    //backgroundColorContainer.style.display = 'none';
                } else {
                    backgroundColorContainer.style.display = "flex";
                    previewContainer.style.opacity = '0';
                    switchesContainer.style.transform = `translateY(-${previewContainer.offsetHeight}px)`;
                }
            }
            imgPreview.onerror = function (e) {
                // reset to default on error with user image
                settings.wallpaperSrc = 'img/bg.jpg';
                imgPreview.setAttribute('src', settings.wallpaperSrc);
                browser.storage.local.set({ settings });
            }
        }

    });
}

function saveSettings() {
    settings.wallpaper = wallPaperEnabled.checked;
    settings.wallpaperSrc = imgPreview.src;
    settings.backgroundColor = color_picker.value;
    settings.textColor = textColor_picker.value;
    settings.showTitles = showTitlesInput.checked;
    settings.largeTiles = largeTilesInput.checked;
    settings.showClock = showClock.checked;
    settings.showSettingsBtn = showSettingsBtn.checked;
    settings.maxCols = maxColsInput.value;
    settings.rememberFolder = rememberFolderInput.checked;

    applySettings();

    browser.storage.local.set({ settings })
        .then(() => {
            /*
            settingsToast.style.opacity = "1";
            setTimeout(function () {
                settingsToast.style.opacity = "0";
            }, 3500);
             */

            tabMessagePort.postMessage({ updateSettings: true });
        });
}

// override context menu
document.addEventListener("contextmenu", function (e) {
    if (e.target.type === 'text' && (e.target.id === 'modalTitle' || e.target.id === 'modalURL' || e.target.id === 'createDialModalURL')) {
        return;
    }
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
        showContextMenu(menu, e.pageY, e.pageX);
        return false;
    } else if (e.target.className === 'folders' || e.target.className === 'container' || e.target.className === 'tileContainer' || e.target.className === 'default-content' || e.target.className === 'default-content helpText') {
        showContextMenu(settingsMenu, e.pageY, e.pageX);
        return false;
    }
});

// todo: tidy this up
window.addEventListener("click", e => {
    if (typeof e.target.className === 'string' && e.target.className.indexOf('settingsCtl') >= 0) {
        return;
    }
    if (e.target.className === 'tile-content' || e.target.className === 'tile-title') {
        return;
    }
    e.preventDefault();
});

// listen for menu item
window.addEventListener("mousedown", e => {
    hideMenus();
    if (e.target.type === 'text' || e.target.id === 'maxcols') {
        return
    }
    if (e.target.className.baseVal === 'gear') {
        openSettings();
        return;
    }
    switch (e.target.className) {
        // todo: invert this
        case 'default-content':
        case 'default-content helpText':
        case 'tile-content':
        case 'tile-title':
        case 'container':
        case 'tileContainer':
        case 'folders':
            hideSettings();
            break;
        case 'modal':
            hideModals();
            break;
        case 'menu-option':
            switch (e.target.id) {
                case 'openSettings':
                    openSettings();
                    break;
                case 'newTab':
                    browser.tabs.create({ url: targetTileHref });
                    break;
                case 'newWin':
                    browser.windows.create({ "url": targetTileHref });
                    break;
                case 'newPrivate':
                    browser.windows.create({ "url": targetTileHref, "incognito": true });
                    break;
                case 'openAll':
                    openAllTabs();
                    break;
                case 'edit':
                    buildModal(targetTileHref, targetTileTitle).then(() => {
                        modalShowEffect(modalContent, modal);
                    });
                    break;
                case 'refresh':
                    refreshThumbnails(targetTileHref);
                    break;
                case 'refreshAll':
                    modalShowEffect(refreshAllModalContent, refreshAllModal);
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
        hideModals();
    }
});

modalSave.addEventListener("click", saveBookmarkSettings);
refreshAllModalSave.addEventListener("click", refreshAllThumbnails);

for (let button of closeModal) {
    button.onclick = function (e) {
        e.preventDefault();
        hideModals();
    };
}

modalTitle.addEventListener('keydown', e => {
    if (e.code === "Enter") {
        e.preventDefault();
        saveBookmarkSettings();
    }
});

modalURL.addEventListener('keydown', e => {
    if (e.code === "Enter") {
        e.preventDefault();
        saveBookmarkSettings();
    }
});

modalImgInput.onchange = function () {
    readImage(this).then(image => {
        resizeThumb(image).then(resizedImage => {
            addImage(resizedImage);
        })
    });
};


maxColsInput.oninput = function (e) {
    saveSettings()
}

wallPaperEnabled.oninput = function (e) {
    saveSettings()
}

color_picker.onchange = function () {
    color_picker_wrapper.style.backgroundColor = color_picker.value;
    saveSettings()
};

textColor_picker.onchange = function () {
    textColor_picker_wrapper.style.backgroundColor = textColor_picker.value;
    if (settings.textColor !== textColor_picker.value) {
        saveSettings()
    }
};

showTitlesInput.oninput = function (e) {
    saveSettings()
}

showClockInput.oninput = function (e) {
    saveSettings()
}

rememberFolderInput.oninput = function (e) {
    saveSettings()
}

showSettingsBtnInput.oninput = function (e) {
    saveSettings()
}

reader.onload = function (e) {
    resizeBackground(e.target.result).then(imagedata => {
        imgPreview.setAttribute('src', imagedata);
        imgPreview.style.display = 'block';
        saveSettings()
    })
};

imgInput.onchange = function () {
    readURL(this);
};

previewOverlay.onclick = function () {
    imgInput.click();
}

helpBtn.onclick = function () {
    browser.tabs.create({ url: helpUrl });
}

const processRefresh = debounce(() => {
    scrollPos = bookmarksContainerParent.scrollTop;
    noBookmarks.style.display = 'none';
    addFolderButton.style.display = 'inline';
    showFolder(speedDialId, homeFolderTitle)
}, 650, true);

function init() {
    tabMessagePort = browser.runtime.connect({ name: port });

    document.querySelectorAll('[data-locale]').forEach(elem => {
        elem.innerText = browser.i18n.getMessage(elem.dataset.locale)
    })

    tabMessagePort.onMessage.addListener(function (m) {
        if (m.ready) {
            cache = m.cache;
            settings = m.settings;
            speedDialId = m.speedDialId;
            currentFolder = m.currentFolder;
            applySettings().then(() => showFolder(speedDialId, homeFolderTitle));
        } else if (m.refresh) {
            //console.log(cache, m.cache);
            cache = m.cache;
            hideToast();
            processRefresh();
        } else if (m.refreshInactive) {
            browser.tabs.getCurrent().then(tab => {
                if (!tab.active) {
                    folders = [];
                    foldersContainer.innerHTML = "";
                    cache = m.cache;
                    hideToast();
                    processRefresh();
                }
            })
        } else if (m.reset) {
            cache = m.cache;
            speedDialId = m.speedDialId;
            hideToast();
            processRefresh();

        } else if (m.imported) {
            cache = m.cache;
            settings = m.settings;
            applySettings().then(() => processRefresh());
        }
    });

    tabMessagePort.onDisconnect.addListener(obj => {
        if (browser.runtime.lastError) {
            console.log(browser.runtime.lastError.message);
        }
    })

    tabMessagePort.postMessage({ getCache: true });

    sidenav.style.display = "flex";

    window.onresize = layout;

}

init();

// TODO - fix open all
// TODO - add setting for root folder
// TODO - find dead code
