// yet another speed dial
// copyright 2019 dev@conceptualspace.net
// absolutely no warranty is expressed or implied

'use strict';

// speed dial
const bookmarksContainerParent = document.getElementById('tileContainer');
const bookmarksContainer = document.getElementById('wrap');
const foldersContainer = document.getElementById('folders');
const addFolderButton = document.getElementById('addFolderButton');
const menu = document.getElementById('contextMenu');
const folderMenu = document.getElementById('folderMenu');
const settingsMenu = document.getElementById('settingsMenu');
const modal = document.getElementById('tileModal');
const modalContent = document.getElementById('tileModalContent');

const createDialModal = document.getElementById('createDialModal');
const createDialModalContent = document.getElementById('createDialModalContent');
const createDialModalURL = document.getElementById('createDialModalURL');
const createDialModalSave = document.getElementById('createDialModalSave');

const createFolderModal = document.getElementById('createFolderModal');
const createFolderModalContent = document.getElementById('createFolderModalContent');
const createFolderModalName = document.getElementById('createFolderModalName');
const createFolderModalSave = document.getElementById('createFolderModalSave');

const editFolderModal = document.getElementById('editFolderModal');
const editFolderModalContent = document.getElementById('editFolderModalContent');
const editFolderModalName = document.getElementById('editFolderModalName');
const editFolderModalSave = document.getElementById('editFolderModalSave');

const deleteFolderModal = document.getElementById('deleteFolderModal');
const deleteFolderModalContent = document.getElementById('deleteFolderModalContent');
const deleteFolderModalName = document.getElementById('deleteFolderModalName');
const deleteFolderModalSave = document.getElementById('deleteFolderModalSave');

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
const wallPaperEnabled = document.getElementById("wallpaper");
const previewContainer = document.getElementById("previewContainer");
const largeTilesInput = document.getElementById("largeTiles");
const scaleImagesInput = document.getElementById("scaleImages");
const showTitlesInput = document.getElementById("showTitles");
const showCreateDialInput = document.getElementById("showCreateDial");
const showFoldersInput = document.getElementById("showFolders");
const showClockInput = document.getElementById("showClock");
const showSettingsBtnInput = document.getElementById("showSettingsBtn");
const maxColsInput = document.getElementById("maxcols");
const defaultSortInput = document.getElementById("defaultSort");
//const saveBtn = document.getElementById("saveBtn");
//const settingsToast = document.getElementById("settingsToast");

// clock
const clock = document.getElementById('clock');

const port = "p-" + new Date().getTime();
const tabMessagePort = browser.runtime.connect({name: port});

let cache = null;
let settings = null;
let speedDialId = null;
let sortable = null;
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
const locale = navigator.language;
const imageRatio = 1.54;

const debounce = (func, delay= 500, immediate=false) => {
    let inDebounce
    return function() {
        const context = this
        const args = arguments
        if (immediate && !inDebounce) {
            func.apply(context, args);
        }
        clearTimeout(inDebounce)
        inDebounce = setTimeout(() => func.apply(context, args), delay)
    }
}

// detect clock settings
if (!locale.startsWith("en")) {
    hourCycle = Intl.DateTimeFormat(locale, {hour: 'numeric'}).resolvedOptions().hourCycle;
}

function displayClock() {
    clock.textContent = new Date().toLocaleString('en-US', {hour: 'numeric', minute: 'numeric', hourCycle: hourCycle});
    setTimeout(displayClock, 10000);
}

displayClock();

function getBookmarks(folderId) {
    browser.bookmarks.getChildren(folderId).then(result => {
        if (folderId === speedDialId && !result.length && settings.showFolders) {
            noBookmarks.style.display = 'block';
            addFolderButton.style.display = 'none';
        }
        printBookmarks(result, folderId)
    });
}

function removeBookmark(url) {
    let currentParent = currentFolder ? currentFolder : speedDialId
    browser.bookmarks.search({url})
        .then(bookmarks => {
            let cleanup = bookmarks.length < 2;
            for (let bookmark of bookmarks) {
                if (bookmark.parentId === currentParent) {
                    targetNode.remove();
                    browser.bookmarks.remove(bookmark.id);
                    // if we have duplicates (ex in other folders), keep the image cache, otherwise purge it
                    if (cleanup) {
                        browser.storage.local.remove(url);
                    }
                    // todo -- this only working for root folder?
                    sortable.save();
                }
            }
        })
}

function moveBookmark(url, idFrom, idTo) {
    if (url && idFrom && idTo) {
        // the id of the main speed dial page is "wrap"; todo: clean this up
        if (idTo === "wrap") {
            idTo = speedDialId;
        }
        if (idFrom === "wrap") {
            idFrom = speedDialId;
        }
        browser.bookmarks.search({url})
            .then(bookmarks => {
                for (let bookmark of bookmarks) {
                    if (bookmark.parentId === idFrom) {
                        browser.bookmarks.move(bookmark.id, {parentId: idTo})
                        // avoid chaos if there are duplicate bookmarks inside the folder; we're only dragging one so just move one
                        // todo: tiles need to store ids in addition to url..
                        break;
                    }
                }
            });
    }
}

function showFolder(id) {
    hideSettings();
    let folders = document.getElementsByClassName('container');
    for (let folder of folders) {
        if (folder.id === id || (folder.id === 'wrap' && id === speedDialId)) {
            folder.style.display = "flex"
            folder.style.opacity = "0";
            layoutFolder = true;
            // transition between folders. todo more elegant solution
            setTimeout(function () {
                //layoutFolder = id;
                folder.style.opacity = "1";
            }, 20);
        } else {
            folder.style.display = "none";
        }
    }
    // style the active tab
    let folderTitles = document.getElementsByClassName('folderTitle');
    for (let title of folderTitles) {
        if (title.attributes.folderid.value === id) {
            title.classList.add('activeFolder');
        } else {
            title.classList.remove('activeFolder');
        }
    }
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
    browser.storage.local.get(speedDialId)
        .then(result => {
            if (result[speedDialId]) {
                // default setting is now to place new dials in the last position so they dont disrupt the order of dials on the page
                // if the defaultSort setting is set to "first" this behavior is reversed.
                // background: newest last is preferable when speed dial is generally static (easier to find tiles with unchanging position)
                // but ive come to prefer newest first when using YASD for ALL bookmarks (since recently bookmarked sites will now be at the top)
                // TODO: make this a per folder setting
                if (settings.defaultSort && settings.defaultSort === "last") {
                    let savedOrder = result[speedDialId];
                    let currentOrder = sortable.toArray();
                    if (currentOrder.length > savedOrder.length) {
                        let newDials = currentOrder.filter(x => !savedOrder.includes(x));
                        if (newDials.length > 0) {
                            for (let dial of newDials) {
                                savedOrder.splice(-1, 0, dial)
                            }
                        }
                    }
                    sortable.sort(savedOrder);
                } else {
                    sortable.sort(result[speedDialId]);
                }
            }
            animate();
            bookmarksContainer.style.opacity = "1";
            bookmarksContainerParent.scrollTop = scrollPos;
            sortable.save();
        });
}

function printFolderBookmarks() {
    for (let folder of folders) {
        getBookmarks(folder)
    }
}

function folderLink(title, id) {
    let a = document.createElement('a');
    if (id === speedDialId) {
        a.id = "homeFolderLink";
    }
    a.classList.add('tile');
    a.classList.add('folderTitle');
    a.setAttribute('folderId', id);
    let linkText = document.createTextNode(title);
    a.appendChild(linkText);
    //a.href = "#"+bookmark.id;
    a.onclick = function () {
        showFolder(id);
        currentFolder = id;
    };

    // todo: allow dropping directly on folder title?
    a.ondragenter = dragenterHandler;
    a.ondragleave = dragleaveHandler;

    foldersContainer.appendChild(a);
}

function createFolder() {
    hideSettings();
    createFolderModalName.value = '';
    createFolderModalName.focus();
    createFolderModal.style.transform = "translateX(0%)";
    createFolderModal.style.opacity = "1";
    createFolderModalContent.style.transform = "scale(1)";
    createFolderModalContent.style.opacity = "1";
}

function saveFolder() {
    let name = createFolderModalName.value.trim();

    browser.bookmarks.create({
        title: name,
        parentId: speedDialId
    }).then(node => {
        hideModals();
    });
}

function editFolder() {
    browser.bookmarks.update(targetFolder, {
        title: editFolderModalName.value.trim()
    }).then(node => {
        hideModals();
    });
}

function refreshThumbnails(url) {
    tabMessagePort.postMessage({refreshThumbs: true, url});
    toastContent.innerText = ` Capturing images...`;
    toast.style.transform = "translateX(0%)";
}

function removeFolder() {
    browser.bookmarks.removeTree(targetFolder).then(() => {
        hideModals();
        targetFolderLink.remove();
        folders.splice(folders.indexOf(targetFolder), 1);
        if (!folders.length) {
            document.getElementById('homeFolderLink').remove();
        }
        if (document.getElementById(targetFolder).style.display === 'flex') {
            showFolder(speedDialId);
        }
        document.getElementById(targetFolder).remove();
    });
}

// assumes 'bookmarks' param is content of a folder (from getBookmarks)
function printBookmarks(bookmarks, parentId) {
    let fragment = document.createDocumentFragment();

    //let folderContainer = document.createElement('div');
    //folderContainer.id = parentId;
    //document.body.append(div)

    if (bookmarks) {
        for (let bookmark of bookmarks) {
            // folders
            // ignore subfolders for now
            if (!bookmark.url && bookmark.dateGroupModified && bookmark.parentId === speedDialId) {
                // setup "tabs" folder header links
                if (!folders.length) {
                    folderLink(homeFolderTitle, speedDialId)
                }
                if (folders.indexOf(bookmark.id) === -1) {
                    folders.push(bookmark.id);
                    folderLink(bookmark.title, bookmark.id)
                } else {
                    if (bookmark.id === targetFolder && targetFolderName !== bookmark.title) {
                        targetFolderLink.textContent = bookmark.title;
                    }
                }

            } else if (bookmark.url && bookmark.url.startsWith("http")) {
                // restricted to valid url schemes for security reasons -- http and https. see #26
                // in ff bookmark "separators" can be created that have "data:" as the url.
                let thumbBg, thumbUrl = null;
                if (cache[bookmark.url]) {
                    // if the image is a blob:
                    //iconURL = URL.createObjectURL(result.icon);
                    //iconURL = result.icon;
                    thumbUrl = cache[bookmark.url][0];
                    thumbBg = cache[bookmark.url][1]
                } else {
                    thumbUrl = "../img/default.png";
                }
                let a = document.createElement('a');
                a.classList.add('tile');
                a.href = bookmark.url;
                a.setAttribute('data-id', bookmark.id);

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
    a.onclick = function () {
        hideSettings();
        buildCreateDialModal(parentId);
        modalShowEffect(createDialModalContent, createDialModal);
    };
    let main = document.createElement('div');
    main.classList.add('tile-main');
    let content = document.createElement('div');
    content.classList.add('tile-content', 'createDial-content');
    main.appendChild(content);
    a.appendChild(main);
    fragment.appendChild(a);

    // root speed dial dir
    if (parentId === speedDialId) {
        // populate folders divs
        if (folders.length) {
            printFolderBookmarks();
        }

        bookmarksContainer.appendChild(fragment);

        // todo: clean this up, restore sort when we remove migration
        // preserve sorting from 1.5 versions
        //migrate();

        sort();
        // we take care of this as part of "sort" fn now..
        //bookmarksContainer.style.opacity = "1";

    } else {
        // build a folder "tab"
        if (!document.getElementById(parentId)) {
            let folderContainer = document.createElement('div');
            folderContainer.id = parentId;
            folderContainer.classList.add('container');
            folderContainer.style.display = 'none';
            folderContainer.style.opacity = "1";
            //document.body.append(folderContainer);
            bookmarksContainerParent.append(folderContainer);
        }

        let folderContainerEl = document.getElementById(parentId);

        // folder sorting..
        // todo: this is fubar
        let sortable = new Sortable(folderContainerEl, {
            group: 'shared',
            animation: 160,
            ghostClass: 'selected',
            dragClass: 'dragging',
            filter: ".createDial",
            delay: 500, // fixes #40
            delayOnTouchOnly: true,
            onMove: onMoveHandler,
            onEnd: onEndHandler,
            store: {
                set: function (sortable) {
                    let order = sortable.toArray();
                    browser.storage.local.set({[parentId]: order});
                }
            }
        });

        // append bookmarks to container
        folderContainerEl.appendChild(fragment);

        // sort
        browser.storage.local.get(parentId)
            .then(result => {
                if (result[parentId]) {
                    sortable.sort(result[parentId]);
                    animate();
                    bookmarksContainerParent.scrollTop = scrollPos;
                    sortable.save();
                }
            });
        //
    }
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
    let menus = [menu, settingsMenu, folderMenu]
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
    let modals = [modal, createDialModal, createFolderModal, editFolderModal, deleteFolderModal];
    let modalContents = [modalContent, createDialModalContent, createFolderModalContent, editFolderModalContent, deleteFolderModalContent]

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

function buildCreateDialModal(parentId) {
    createDialModalURL.value = '';
    createDialModalURL.parentId = parentId ? parentId : speedDialId;
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
        $('#carousel').flexCarousel({height: '180px'});
    }
}

function rectifyUrl(url) {
    if (url && !url.startsWith('https://') && !url.startsWith('http://')) {
        return 'https://' + url;
    } else {
        return url;
    }
}

function createDial() {
    let url = rectifyUrl(createDialModalURL.value.trim());

    browser.bookmarks.create({
        title: url,
        url: url,
        parentId: createDialModalURL.parentId
    }).then(node => {
        hideModals();
        toastContent.innerText = ` Capturing images for ${url}...`;
        toast.style.transform = "translateX(0%)";
    });
}

function offscreenCanvasShim(w, h) {
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
function getBgColor(image) {
    let imgWidth = image.naturalWidth;
    let imgHeight = image.naturalHeight;
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
    context.drawImage(image, 0, 0);

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
                    browser.storage.local.set({[newUrl]: {thumbnails, thumbIndex, bgColor}}).then(result => {
                        tabMessagePort.postMessage({updateCache: true, url: newUrl, i: thumbIndex});
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
                        browser.storage.local.set({[newUrl]: {thumbnails, thumbIndex, bgColor}}).then(result => {
                            tabMessagePort.postMessage({updateCache: true, url: newUrl, i: thumbIndex});
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
        //targetNode.children[0].children[1].textContent = title;
        // sortable ids changed so rewrite to storage
        //let order = sortable.toArray();
        //browser.storage.local.set({"sort":order});
        // todo: temp hack to match all until we start using bookmark ids
        browser.bookmarks.search({url})
            .then(bookmarks => {
                if (bookmarks.length <= 1 && ( url !== newUrl) ) {
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

// todo: maybe refactor this in gsap 3
const animate = debounce(() => {
    //var inputs = document.querySelectorAll("input");
    const nodes = document.querySelectorAll(".tile");
    //const observerConfig = { attributes: false, childList: true, subtree: false };
    const total = nodes.length;
    //const time = 0.9;
    const omega = 12;
    const zeta = 0.8;
    //let boxes = [];
    //let windowSize = window.innerWidth;

    TweenLite.set(nodes, {lazy: true, x: "+=0"});

    for (let i = 0; i < total; i++) {
        let node = nodes[i];
        const transform = node._gsTransform;
        const x = node.offsetLeft;
        const y = node.offsetTop;
        boxes[i] = {node, transform, x, y};
    }

    //const observer = new MutationObserver(() => { dirty = true; });
    //observer.observe(bookmarksContainer, observerConfig);

    // todo: move this
    // todo: why did i debounce animate but not layout? (because we want tiles to move immediately as manually resizing window)
    // TweenLite.ticker.addEventListener("tick", layout);
    window.onresize = layout;

    layout();

    function layout() {
        if (layoutFolder || containerSize !== getComputedStyle(bookmarksContainer).maxWidth || windowSize !== window.innerWidth) {
            windowSize = window.innerWidth;
            containerSize = getComputedStyle(bookmarksContainer).maxWidth;

            for (let i = 0; i < total; i++) {
                let box = boxes[i];
                let randTime;
                const lastX = box.x;
                const lastY = box.y;
                box.x = box.node.offsetLeft;
                box.y = box.node.offsetTop;
                if (lastX !== box.x || lastY !== box.y) {
                    const x = box.transform.x + lastX - box.x;
                    const y = box.transform.y + lastY - box.y;
                    if (layoutFolder) {
                        // folder opened -- zero duration because we are just setting the positions of the dials, so whenever
                        // a resize occurs the animation will start from the right position
                        randTime = 0;
                    } else {
                        randTime = ((i / (total * 2)) + 0.6).toFixed(1);
                    }
                    // Tween to 0 to remove the transforms
                    TweenLite.set(box.node, {x, y});
                    TweenLite.to(box.node, randTime, {x: 0, y: 0, ease});
                }
            }
            layoutFolder = false;
        }
    }

    function ease(progress) {
        const beta = Math.sqrt(1.0 - zeta * zeta);
        progress = 1 - Math.cos(progress * Math.PI / 2);
        progress = 1 / beta *
            Math.exp(-zeta * omega * progress) *
            Math.sin(beta * omega * progress + Math.atan(beta / zeta));
        return 1 - progress;
    }

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
                let ctx = canvas.getContext('2d', {willReadFrequently:true});
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
                let ctx = canvas.getContext('2d', {willReadFrequently:true});
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

function hexToRgb(color) {
    let colors = color.replace("#", "").match(/.{2}/g);
    return colors.map(c => parseInt("0x" + c));
}

// given a color, return whether white or black has the most contrast
// approximates w3c accessibility algorithm
function contrast(rgb) {
    let srgb = [];
    rgb.forEach(function (c, i) {
        c = c / 255;
        if (c <= 0.03928) {
            c = c / 12.92
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
    return new Promise(function (resolve, reject) {
        // todo: performance: use the bg preview image from the settings nav rather than using a constructor
        let img = new Image();
        img.onload = function () {
            let blockSize = 5; // only visit every 5 pixels
            let canvas = document.createElement('canvas');
            let context = canvas.getContext && canvas.getContext('2d');
            let data, width, height;
            let i = -4;
            let length;
            let rgb = [0, 0, 0];
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

        if (settings.scaleImages) {
            document.documentElement.style.setProperty('--image-scaling', 'contain');
            //document.documentElement.style.setProperty('--image-width', '140px');
        } else {
            document.documentElement.style.setProperty('--image-scaling', 'cover');
            //document.documentElement.style.setProperty('--image-width', '188px');
        }

        if (settings.maxCols && settings.maxCols !== "100") {
            document.documentElement.style.setProperty('--columns', settings.maxCols * 220 + "px")
        } else {
            document.documentElement.style.setProperty('--columns', '100%')
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
        showCreateDialInput.checked = settings.showAddSite;
        largeTilesInput.checked = settings.largeTiles;
        scaleImagesInput.checked = settings.scaleImages;
        showFoldersInput.checked = settings.showFolders;
        showClockInput.checked = settings.showClock;
        showSettingsBtnInput.checked = settings.showSettingsBtn;
        maxColsInput.value = settings.maxCols;
        defaultSortInput.value = settings.defaultSort;

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
    settings.textColor = textColor_picker.value;
    settings.showTitles = showTitlesInput.checked;
    settings.showAddSite = showCreateDialInput.checked;
    settings.largeTiles = largeTilesInput.checked;
    settings.scaleImages = scaleImagesInput.checked;
    settings.showFolders = showFoldersInput.checked;
    settings.showClock = showClock.checked;
    settings.showSettingsBtn = showSettingsBtn.checked;
    settings.maxCols = maxColsInput.value;
    settings.defaultSort = defaultSortInput.value;

    applySettings();

    browser.storage.local.set({settings})
        .then(() => {
            /*
            settingsToast.style.opacity = "1";
            setTimeout(function () {
                settingsToast.style.opacity = "0";
            }, 3500);
             */

            tabMessagePort.postMessage({updateSettings: true});
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
    } else if (e.target.classList.contains('folderTitle') && e.target.id !== "homeFolderLink") {
        targetFolderLink = e.target;
        targetFolder = e.target.attributes.folderId.nodeValue;
        targetFolderName = e.target.textContent;
        showContextMenu(folderMenu, e.pageY, e.pageX);
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
    if (e.target.type === 'text' || e.target.id === 'maxcols' || e.target.id === 'defaultSort') {
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
                    browser.tabs.create({url: targetTileHref});
                    break;
                case 'newWin':
                    browser.windows.create({"url": targetTileHref});
                    break;
                case 'newPrivate':
                    browser.windows.create({"url": targetTileHref, "incognito": true});
                    break;
                case 'edit':
                    buildModal(targetTileHref, targetTileTitle).then(() => {
                        modalShowEffect(modalContent, modal);
                    });
                    break;
                case 'refresh':
                    refreshThumbnails(targetTileHref);
                    break;
                case 'delete':
                    removeBookmark(targetTileHref);
                    break;
                case 'editFolder':
                    //buildFolderModal(targetFolder, targetFolderName);
                    editFolderModalName.value = targetFolderName;
                    modalShowEffect(editFolderModalContent, editFolderModal);
                    break;
                case 'deleteFolder':
                    deleteFolderModalName.textContent = targetFolderName;
                    modalShowEffect(deleteFolderModalContent, deleteFolderModal);
                    break;
                case 'newDial':
                    // prevent default required to stop focus from leaving the modal input
                    e.preventDefault();
                    buildCreateDialModal(currentFolder);
                    modalShowEffect(createDialModalContent, createDialModal);
                    break;
                case 'newFolder':
                    e.preventDefault();
                    createFolder();
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
createDialModalSave.addEventListener("click", createDial);
addFolderButton.addEventListener("click", createFolder);
createFolderModalSave.addEventListener("click", saveFolder)
editFolderModalSave.addEventListener("click", editFolder)
deleteFolderModalSave.addEventListener("click", removeFolder);

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

createDialModalURL.addEventListener('keydown', e => {
    if (e.code === "Enter") {
        e.preventDefault();
        createDial();
    }
});

modalImgInput.onchange = function () {
    readImage(this).then(image => {
        resizeThumb(image).then(resizedImage => {
            addImage(resizedImage);
        })
    });
};

maxColsInput.oninput = function(e) {
    saveSettings()
}

defaultSortInput.oninput = function(e) {
    saveSettings()
}

wallPaperEnabled.oninput = function(e) {
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

showTitlesInput.oninput = function(e) {
    saveSettings()
}

scaleImagesInput.oninput = function(e) {
    saveSettings()
}

showCreateDialInput.oninput = function(e) {
    saveSettings()
}

showFoldersInput.oninput = function(e) {
    saveSettings()
}

showClockInput.oninput = function(e) {
    saveSettings()
}

showSettingsBtnInput.oninput = function(e) {
    saveSettings()
}

reader.onload = function (e) {
    resizeBackground(e.target.result).then(imagedata => {
        imgPreview.setAttribute('src', imagedata);
        imgPreview.style.display = 'block';
        // dynamically set text color based on background
        /*
        getAverageRGB(imagedata).then(rgb => {
            let textColor = contrast(rgb);
            settings.textColor = textColor
            document.documentElement.style.setProperty('--color', textColor);
        });
         */
        saveSettings()
    })
};

imgInput.onchange = function () {
    readURL(this);
};


wallPaperEnabled.onchange = function () {
    if (this.checked) {
        previewContainer.style.display = "flex";
    } else {
        previewContainer.style.display = "none";
    }
};

// native handlers for folder tab target
function dragenterHandler(ev) {
    // temporary fix for firefox < v92
    // firefox returns a text node instead of an element
    if (ev.target.nodeType === 3) {
        if (ev.target.parentElement.classList.contains("folderTitle")) {
            // avoid repaints
            if (currentFolder !== ev.target.parentElement.attributes.folderid.value) {
                currentFolder = ev.target.parentElement.attributes.folderid.value;
                showFolder(currentFolder)
            }
        }
    }
    else if (ev.target.classList.contains("folderTitle")) {
        // avoid repaints
        // todo replace style changes with class;
        if (currentFolder !== ev.target.attributes.folderid.value) {
            ev.target.style.padding = "20px";
            ev.target.style.outline = "2px dashed white";
            currentFolder = ev.target.attributes.folderid.value;
            showFolder(currentFolder)
        }
    }
}

function dragleaveHandler(ev) {
    // temporary fix for firefox < v92
    if (ev.target.nodeType === 3) {
        return
    }
     else if (ev.target.classList.contains("folderTitle")) {
        ev.target.style.padding = "0";
        ev.target.style.outline = "none";
    }
}

// Sortable helper fns
function onMoveHandler(evt) {
    if (evt.related) {
        if (evt.to.children.length > 1) {
            // when no bookmarks are present we keep the createdial enabled so we have a drop target for dials dragged into folder
            return !evt.related.classList.contains('createDial');
        } else {
            // force new dial to drop before add dial button
            evt.to.prepend(evt.dragged);
            return false;
        }
    }
}

function onEndHandler(evt) {
    // catch dials moving between folders
    if (evt.clone.href) {
        if (evt.from.id !== evt.to.id) {
            // sortable's drop position matches the dom's drop target
            if (evt.to.id === evt.originalEvent.target.id) {
                moveBookmark(evt.clone.href, evt.from.id, evt.to.id)
            } else {
                // sortable's position doesn't match the dom's drop target
                // this may happen if the tile is dragged over a sortable list but then ultimately dropped somewhere else
                // for example directly on the folder name, or directly onto the new dial button. so use the currentFolder as the target
                moveBookmark(evt.clone.href, evt.from.id, currentFolder)
            }
        } else if (evt.from.id !== currentFolder) {
            // occurs when there is no sortable target -- for example dropping the dial onto the folder name
            // or some space of the page outside the sortable container element
            moveBookmark(evt.clone.href, evt.from.id, currentFolder)
        }
    }
}

const processRefresh = debounce(() => {
    // prevent page scroll on refresh
    // react where are you...
    scrollPos = bookmarksContainerParent.scrollTop;
    bookmarksContainer.style.opacity = "0";
    noBookmarks.style.display = 'none';
    addFolderButton.style.display = 'inline';
    bookmarksContainer.innerHTML = "";
    for (let folder of folders) {
        document.getElementById(folder).innerHTML = "";
    }
    getBookmarks(speedDialId)
}, 650, true);

// v1.x -> 1.6
// 1.6 uses bookmark id to sort, 1.5 used default SortableJS algorithm
// todo replace with index from bookmark objects
function migrate() {
    browser.storage.local.get("sort").then(result => {
        if (result && result.sort) {

            console.log("upgrading to v1.6...");

            let idsMapped = {};
            let idsSorted = [];
            let tiles = document.getElementsByClassName("tile");
            for (let tile of tiles) {
                if (tile.href) {
                    let str = tile.tagName + tile.className + tile.src + tile.href + tile.textContent,
                        i = str.length,
                        sum = 0;
                    while (i--) {
                        sum += str.charCodeAt(i);
                    }
                    let oldSortId = sum.toString(36);
                    idsMapped[oldSortId] = tile.getAttribute("data-id");
                }
            }

            idsMapped["1wv"] = "1wv";

            for (let item of result.sort) {
                if (idsMapped[item]) {
                    idsSorted.push(idsMapped[item]);
                }
            }
            sortable.sort([idsSorted]);
            browser.storage.local.set({[speedDialId]: idsSorted}).then(setItem => {
                browser.storage.local.remove("sort");
                sort();
                // upgrade complete;
            });
        } else {
            sort();
        }
    });
}

function init() {

    document.querySelectorAll('[data-locale]').forEach(elem => {
        elem.innerText = browser.i18n.getMessage(elem.dataset.locale)
    })

    tabMessagePort.onMessage.addListener(function (m) {
        if (m.ready) {
            cache = m.cache;
            settings = m.settings;
            speedDialId = m.speedDialId;
            applySettings().then(() => getBookmarks(speedDialId));
        } else if (m.refresh) {
            cache = m.cache;
            hideToast();
            processRefresh();
        }
    });

    tabMessagePort.postMessage({getCache: true});

    sortable = new Sortable(bookmarksContainer, {
        //todo: forceFallback:true seems to work way better on chrome on *linux* (no dif on win/mac)
        group: 'shared',
        animation: 160,
        ghostClass: 'selected',
        dragClass: 'dragging', // todo: confirm this only applies when forceFallback is used
        filter: ".createDial",
        delay: 500, // fixes #40
        delayOnTouchOnly: true,
        // todo: copy same onmove logic from folders
        onMove: onMoveHandler,
        onEnd: onEndHandler,
        store: {
            set: function (sortable) {
                let order = sortable.toArray();
                browser.storage.local.set({[speedDialId]: order});
            }
        }
    });


}

init();
