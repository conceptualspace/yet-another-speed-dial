// yet another speed dial
// copyright 2019 dev@conceptualspace.net
// absolutely no warranty is expressed or implied

'use strict';

// initialize Coloris color picker
// outputs hex #RRGGBBAA
Coloris({
    themeMode: 'dark',
    alpha: true,
    forceAlpha: true,
    formatToggle: false,
    showInput: false,
    cancelButton: true,
    closeButton: true,
    closeLabel: 'OK',
});

// speed dial
const bookmarksContainerParent = document.getElementById('tileContainer');
const bookmarksContainer = bookmarksContainerParent
const foldersContainer = document.getElementById('folders');
const addFolderButton = document.getElementById('addFolderButton');

// Dial sizing is emitted here as concrete px values rather than as inherited
// CSS custom properties (var()). The FLIP reflow loop writes `transform` to each
// moving tile every frame; if tile width/height/margin resolved from var(), each
// of those per-frame style recalcs would re-resolve the variables for every tile
// -- the dominant cost when many tiles animate at once (e.g. a dial-size change
// moves them all simultaneously). Concrete values keep the per-frame recalc cheap.
const dialSizeStyleEl = document.createElement('style');
dialSizeStyleEl.id = 'dialSizeStyles';
document.head.appendChild(dialSizeStyleEl);
const menu = document.getElementById('contextMenu');
const folderMenu = document.getElementById('folderMenu');
const settingsMenu = document.getElementById('settingsMenu');
const openAllFolderGroup = document.getElementById('openAllFolderGroup');
const supportsTabGroups = typeof chrome.tabs.group === 'function';
const modal = document.getElementById('tileModal');
const modalContent = document.getElementById('tileModalContent');

if (!supportsTabGroups) {
    openAllFolderGroup.style.display = 'none';
}

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

const importExportModal = document.getElementById('importExportModal');
const importExportModalContent = document.getElementById('importExportModalContent');

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
const modalImgBtn = document.getElementById("modalImgBtn");
const modalBtnContainer = document.getElementById("modalBtnContainer");
const modalImgUrlBtn = document.getElementById("modalImgUrlBtn");
const imageUrlContainer = document.getElementById("imageUrlContainer");
const modalImageURLInput = document.getElementById("modalImageURLInput");
const closeImgUrlBtn = document.getElementById("closeImgUrlBtn");
const fetchImageButton = document.getElementById("fetchImageButton");
const modalBgColorPickerInput = document.getElementById("modalBgColorPickerInput");
const modalBgColorPickerBtn = document.getElementById("modalBgColorPickerBtn");
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
const showCreateDialInput = document.getElementById("showCreateDial");
const showFoldersInput = document.getElementById("showFolders");
const showClockInput = document.getElementById("showClock");
const showSettingsBtnInput = document.getElementById("showSettingsBtn");
const showSearchBtnInput = document.getElementById("showSearchBtn");
const maxColsInput = document.getElementById("maxcols");
const defaultSortInput = document.getElementById("defaultSort");
const importExportBtn = document.getElementById("importExportBtn");
const importExportStatus = document.getElementById('statusMessage');
const exportBtn = document.getElementById("exportBtn");
const importFileInput = document.getElementById("importFile");
const importFileLabel = document.getElementById("importFileLabel");
const helpBtn = document.getElementById("help");
const resetSettingsBtn = document.getElementById("resetSettingsBtn");
const dialSizeInput = document.getElementById("dialSize");
const dialRatioInput = document.getElementById("dialRatio");
const folderStyleInput = document.getElementById("folderStyle");

const searchInput = document.getElementById('searchInput');
const searchContainer = document.getElementById('searchContainer');
const searchBtn = document.getElementById('searchBtn');

// clock
const clock = document.getElementById('clock');

const port = "p-" + new Date().getTime();
let tabMessagePort = null;

chrome.runtime.onMessage.addListener(handleMessages);

let cache = {};
let settings = null;
const DEFAULT_WALLPAPER_SRC = 'img/bg.jpg';
let wallpaperSrc = DEFAULT_WALLPAPER_SRC;
let speedDialId = null;
let sortable = null;
let folderNavTimeout = null;
let folderDialDropTarget = null;
let folderDialDropTimer = null;
let folderDialDropTracking = null;
let targetTileHref = null;
let targetTileId = null;
let targetTileParentId = null;
let targetTileTitle = null;
let targetNode = null;
let targetFolder = null;
let targetFolderName = null;
let targetFolderLink = null;
let folders = [];
let currentFolder = null;
let pendingFolderId = null;
let folderNodeMap = new Map();
let rootFolderIds = [];
let speedDialRootNode = null;
let thumbnailPreviewElements = new Map();
let scrollPos = 0;
let homeFolderTitle = chrome.i18n.getMessage('home');
const capturingImagesMessage = ' ' + chrome.i18n.getMessage('capturingImages');
// tile reflow (FLIP) animation state. The motion runs on the compositor via the
// Web Animations API: each relayout does a single main-thread pass (read resting
// positions, invert, then hand off the transform keyframes). Viewport culling
// limits animation and style work for large folders.
let resizeFlipScheduled = false;     // rAF throttle for resize-driven FLIP
let resizeSettleTimer = null;        // fires the staggered settle wave once a drag goes idle
let flipAnimationCleanupTimer = null;
const RESIZE_SETTLE_DELAY = 80;      // ms of resize quiet before the settle wave plays. This tunes
                                     // responsiveness only; if resizing resumes, flipHold adopts
                                     // the in-flight animation and returns to the pinned state.
const flipPrevRects = new Map();     // node -> last resting {left, top} in tileContainer content coords
const flipHoldPins = new Map();      // node -> {dx, dy} currently applied during a resize hold
const flipAnimations = new Map();    // node -> active WAAPI Animation
let flipHoldAnchor = null;           // scroll anchor frozen for an in-progress resize hold
let flipPrevContainerTop = null;     // tileContainer's screen top for the layout stored in
                                     // flipPrevRects. Content coords subtract the container top,
                                     // so a shift of the whole tileContainer (folders header
                                     // wrapping to more/fewer lines) is otherwise invisible to
                                     // FLIP and snaps; tracking it lets that shift animate too.
// todo: reenable this someday; unreliable in testing on linux
//const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const FLIP_DURATION = 420;           // ms; compositor transition duration
const FLIP_EASING = 'cubic-bezier(0.34, 1.3, 0.5, 1)'; // back-out: quick settle with a slight bounce
const FLIP_MARGIN = 300;             // px of viewport slack; tiles outside it snap (no anim)
const FLIP_STAGGER_WINDOW = 360;     // ms; total spread of the stagger wave, distributed
                                     // evenly across however many tiles are animating
const FLIP_STAGGER_LIMIT = 1000;      // large sets animate together to avoid hundreds of delayed
                                     // animations (the same cutoff used by the old GSAP path)
const SORTABLE_ANIMATION = 160;      // ms; Sortable's drag-shuffle animation. flipPrevRects is
                                     // re-synced after this settles on a same-folder reorder.
const FOLDER_DIAL_DROP_DELAY = 120;
const FOLDER_DIAL_MOVE_EVENTS = 'PointerEvent' in window ? ['pointermove'] : ['mousemove', 'touchmove'];
const FOLDER_HISTORY_STATE_KEY = 'yasdFolderId';
const TITLE_TOGGLE_FLIP_DURATION = 300;
const TITLE_TOGGLE_STAGGER_WINDOW = 0;
let hourCycle = 'h12';
const locale = navigator.language;
const imageRatio = 1.54;
const helpUrl = 'https://conceptualspace.github.io/yet-another-speed-dial/';
let isToastVisible = false;

let folderIds = [];

let defaults = {
    wallpaper: true,
    backgroundColor: '#111111',
    largeTiles: true,
    rememberFolder: false,
    showTitles: true,
    showAddSite: true,
    showFolders: true,
    showSettingsBtn: true,
    showClock: false,
    showSearchBtn: true,
    maxCols: '100',
    defaultSort: 'first',
    textColor: '#ffffff',
    dialSize: 'large',
    dialRatio: 'wide',
    folderStyle: 'tabs',
    currentFolder: null,
};

// Create an invisible overlay to absorb outside clicks when Coloris is open
const colorisOverlay = document.createElement('div');
colorisOverlay.className = 'coloris-overlay';
colorisOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999;display:none;';
document.body.appendChild(colorisOverlay);

document.querySelectorAll('.settingsCtl[data-coloris]').forEach(picker => {
    picker.addEventListener('open', () => colorisOverlay.style.display = 'block');
    // Using a timeout so the overlay stays for the full click cycle (mouseup/click)
    // before disappearing, absorbing the entire pointer interaction.
    picker.addEventListener('close', () => setTimeout(() => colorisOverlay.style.display = 'none', 100));
});

const debounce = (func, delay = 500, immediate = false) => {
    let inDebounce
    return function () {
        const context = this
        const args = arguments
        if (immediate && !inDebounce) {
            func.apply(context, args);
            inDebounce = setTimeout(() => {
                inDebounce = null;
            }, delay)
        } else {
            clearTimeout(inDebounce)
            inDebounce = setTimeout(() => {
                inDebounce = null;
                func.apply(context, args);
            }, delay)
        }
    }
}

let filterHideTimer = null;
let filterShowRaf = null;
let filterGen = 0;

function updateSearchIconPosition() {
    // No longer needed - flexbox handles positioning automatically
    // This function is kept for compatibility in case it's called elsewhere
}

// detect clock settings
hourCycle = Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle;

function displayClock() {
    clock.textContent = new Date().toLocaleString(locale, { hour: 'numeric', minute: 'numeric', hourCycle: hourCycle });
    setTimeout(displayClock, 10000);
}

displayClock();

function getBookmarks(folderId) {
    chrome.bookmarks.getChildren(folderId).then(result => {
        if (folderId === speedDialId && !result.length && settings.showFolders) {
            //noBookmarks.style.display = 'block';
            addFolderButton.style.display = 'none';
        }
        printBookmarks(result, folderId)
    }, error => {
        console.log(error);
    });
}

function isSupportedDial(bookmark) {
    return bookmark.url?.startsWith("http") || bookmark.url?.startsWith("file:") || bookmark.url?.startsWith("chrome:");
}

async function prepareFolderPreviews(children) {
    const previewFolders = children.filter(child => !child.url);

    for (const folder of previewFolders) {
        const folderChildren = folder.children || [];
        const displayOrder = settings.defaultSort === "first" ? [...folderChildren].reverse() : folderChildren;
        folder.previewDials = displayOrder.filter(isSupportedDial).slice(0, 4);
    }

    const previewUrls = [...new Set(previewFolders.flatMap(folder => folder.previewDials.map(dial => dial.url)))];
    const storedThumbnails = previewUrls.length ? await chrome.storage.local.get(previewUrls) : {};

    for (const folder of previewFolders) {
        for (const dial of folder.previewDials) {
            const storedData = storedThumbnails[dial.url];
            dial.previewThumbnail = getSelectedThumbnail(storedData);
            dial.previewColor = storedData?.bgColor;
        }
    }
}

function unregisterThumbnailPreviews(container) {
    container.querySelectorAll('[data-thumbnail-id]').forEach(preview => {
        const previewElements = thumbnailPreviewElements.get(preview.dataset.thumbnailId);
        previewElements?.delete(preview);
        if (!previewElements?.size) {
            thumbnailPreviewElements.delete(preview.dataset.thumbnailId);
        }
    });
}

function removeFolderContainer(container) {
    unregisterThumbnailPreviews(container);
    Sortable.get(container)?.destroy();
    container.remove();
}

async function buildDialPages(speedDialId, currentFolderId) {

    const [rootNode] = await chrome.bookmarks.getSubTree(speedDialId);
    speedDialRootNode = rootNode;
    const children = rootNode.children || [];
    if (!children.length) {
        // new install
        addFolderButton.style.display = 'none';
        searchBtn.style.display = 'none';
        printNewSetup();
        return;
    }

    const directFolders = children.filter(folder => !folder.url);
    const folders = [...directFolders];

    folderNodeMap = new Map();
    folderIds = [];
    rootFolderIds = directFolders.map(folder => folder.id);

    function collectFolders(nodes) {
        for (const node of nodes) {
            if (node.url) continue;
            folderNodeMap.set(node.id, node);
            folderIds.push(node.id);
            collectFolders(node.children || []);
        }
    }

    collectFolders(children);

    // Include speedDial folder
    folders.push({ id: speedDialId, title: homeFolderTitle, index: -1 });

    // sort folders
    folders.sort((a, b) => {
        return (a.index || 0) - (b.index || 0);
    });

    if (currentFolderId !== speedDialId && !folderNodeMap.has(currentFolderId)) {
        currentFolderId = speedDialId;
        currentFolder = speedDialId;
        settings.currentFolder = speedDialId;
        chrome.storage.local.set({ settings });
    }

    if (settings.folderStyle !== 'dials' && currentFolderId !== speedDialId && !rootFolderIds.includes(currentFolderId)) {
        currentFolderId = speedDialId;
        currentFolder = speedDialId;
        settings.currentFolder = speedDialId;
        chrome.storage.local.set({ settings });
    }

    buildFolderHeader(folders, currentFolderId);

    const currentNode = currentFolderId === speedDialId ? rootNode : folderNodeMap.get(currentFolderId);

    if (settings.folderStyle === 'dials') {
        bookmarksContainerParent.querySelectorAll('.container').forEach(container => {
            if (container.id !== currentFolderId) {
                removeFolderContainer(container);
            }
        });

        await prepareFolderPreviews(currentNode?.children || []);
        await printBookmarks(currentNode?.children || [], currentFolderId);
        bookmarksContainerParent.scrollTop = scrollPos;
        setFolderHistoryState(currentFolderId, 'replace');
        return;
    }

    const renderFolders = [rootNode, ...directFolders];
    const renderFolderIds = new Set(renderFolders.map(folder => folder.id));

    bookmarksContainerParent.querySelectorAll('.container').forEach(container => {
        if (!renderFolderIds.has(container.id)) {
            removeFolderContainer(container);
        }
    });

    if (currentNode) {
        await printBookmarks(currentNode.children || [], currentFolderId);
    }

    for (const folder of renderFolders) {
        if (folder.id !== currentFolderId) {
            await printBookmarks(folder.children || [], folder.id);
        }
    }
}

async function buildFolderPages(speedDialId) {
    async function getChildren(folderId) {
        return await chrome.bookmarks.getChildren(folderId);
    }

    const children = await getChildren(speedDialId);
    if (!children.length) {
        // new install
        addFolderButton.style.display = 'none';
        searchBtn.style.display = 'none';
        printNewSetup();
        return;
    }

    const folders = children.filter(folder => !folder.url);

    // Include speedDial folder
    folders.push({ id: speedDialId, title: homeFolderTitle, index: -1 });

    // sort folders
    folders.sort((a, b) => {
        return (a.index || 0) - (b.index || 0);
    });

    buildFolderHeader(folders, currentFolder);

    return
}


function removeBookmark(url) {
    let id = targetNode.dataset.id;
    // animate removal
    targetNode.style.display = "none";
    flip();
    // remove dial
    targetNode.remove();
    // nb: cache cleanup is handled by handleBookmarkRemoved in background script
    chrome.bookmarks.remove(id).catch(err => {
        console.log(err);
    });
}

function moveFolder(id, oldIndex, newIndex, newSiblingId) {
    let options = {};

    function move(id, options) {
        chrome.bookmarks.move(id, options).then(result => {
            //tabMessagePort.postMessage({ refreshInactive: true })
        }).catch(err => {
            console.log(err);
        })
    }

    if (newSiblingId && newSiblingId !== -1) {
        chrome.bookmarks.get(newSiblingId).then(result => {
            if (oldIndex >= newIndex) {
                options.index = Math.max(0, result[0].index);
            } else {
                options.index = Math.max(0, result[0].index - 1);
                // chrome-only off by 1 bug when moving a bookmark forward
                if (!chrome.runtime.getBrowserInfo) {
                    options.index++;
                }
            }
            move(id, options);
        }).catch(err => {
            console.log(err);
        })
    } else {
        move(id, options);
    }
}

function moveBookmark(id, fromParentId, toParentId, oldIndex, newIndex, newSiblingId) {
    let options = {}

    function move(id, options) {
        chrome.bookmarks.move(id, options).then(result => {
            //tabMessagePort.postMessage({ refreshInactive: true });
        }).catch(err => {
            console.log(err);
        });
    }

    if ((toParentId && fromParentId) && toParentId !== fromParentId) {
        options.parentId = toParentId;
    }

    // todo: refactor
    if (settings.defaultSort === "first") {
        if (newSiblingId && newSiblingId !== -1) {
            chrome.bookmarks.get(newSiblingId).then(result => {
                if (toParentId === fromParentId && oldIndex >= newIndex) {
                    options.index = Math.max(0, result[0].index);
                    // chrome-only off by 1 bug when moving a bookmark forward
                    if (!chrome.runtime.getBrowserInfo) {
                        options.index++;
                    }
                } else {
                    options.index = Math.max(0, result[0].index + 1);
                }
                move(id, options);
            }).catch(err => {
                console.log(err);
            })
        } else {
            if (!newSiblingId) {
                options.index = 0;
            }
            move(id, options);
        }
    } else {
        if (newSiblingId && newSiblingId !== -1) {
            chrome.bookmarks.get(newSiblingId).then(result => {
                if (toParentId !== fromParentId || oldIndex >= newIndex) {
                    options.index = Math.max(0, result[0].index);
                } else {
                    options.index = Math.max(0, result[0].index - 1);
                    // chrome-only off by 1 bug when moving a bookmark forward
                    if (!chrome.runtime.getBrowserInfo) {
                        options.index++;
                    }
                }
                move(id, options);
            }).catch(err => {
                console.log(err);
            })
        } else {
            move(id, options);
        }
    }
}

function showFolder(id) {
    hideSettings();
    let folders = document.getElementsByClassName('container');
    for (let folder of folders) {
        if (folder.id === id) {
            folder.style.display = "flex"
            folder.style.opacity = "0";
            // transition between folders. todo more elegant solution
            setTimeout(function () {
                folder.style.opacity = "1";
                scheduleFlip()
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

const THUMBNAIL_CANDIDATES_KEY_PREFIX = 'thumbnailCandidates:';

function getThumbnailCandidatesKey(url) {
    return `${THUMBNAIL_CANDIDATES_KEY_PREFIX}${url}`;
}

function getThumbnailStorageKeys(url) {
    return [url, getThumbnailCandidatesKey(url)];
}

function getSelectedThumbnail(storedData) {
    if (!storedData) return null;
    if (storedData.thumbnail) return storedData.thumbnail;

    const thumbIndex = Number.isInteger(storedData.thumbIndex) ? storedData.thumbIndex : 0;
    return storedData.thumbnails?.[thumbIndex] || null;
}

function getThumbs(bookmarkUrl) {
    const candidatesKey = getThumbnailCandidatesKey(bookmarkUrl);

    return chrome.storage.local.get([bookmarkUrl, candidatesKey])
        .then(result => {
            const storedData = result[bookmarkUrl];
            if (!storedData) return;
            if (!storedData.thumbnail) return storedData;

            const candidates = result[candidatesKey]?.thumbnails || [];
            return {
                thumbnails: [...new Set([storedData.thumbnail, ...candidates])],
                thumbIndex: 0,
                bgColor: storedData.bgColor
            };
        });
}

function printFolderBookmarks() {
    for (let folder of folders) {
        getBookmarks(folder)
    }
}

function updateFolderBreadcrumb(id) {
    if (settings.folderStyle !== 'dials') return;

    foldersContainer.querySelectorAll('.folderBreadcrumbSeparator, .folderBreadcrumbLink, .folderBreadcrumbCurrent')
        .forEach(element => element.remove());

    if (id === speedDialId) return;

    const path = [];
    let folder = folderNodeMap.get(id);
    while (folder && folder.id !== speedDialId) {
        path.unshift(folder);
        folder = folderNodeMap.get(folder.parentId);
    }

    path.forEach((pathFolder, index) => {
        let separator = document.createElement('span');
        separator.classList.add('folderBreadcrumbSeparator');
        separator.setAttribute('aria-hidden', 'true');
        separator.textContent = '›';
        foldersContainer.appendChild(separator);

        if (index === path.length - 1) {
            let current = document.createElement('span');
            current.classList.add('folderBreadcrumbCurrent');
            current.setAttribute('folderId', pathFolder.id);
            current.setAttribute('aria-current', 'page');
            current.textContent = pathFolder.title;
            foldersContainer.appendChild(current);
        } else {
            let link = document.createElement('a');
            link.classList.add('folderBreadcrumbLink');
            link.setAttribute('folderId', pathFolder.id);
            link.textContent = pathFolder.title;
            link.onclick = function () {
                openFolder(pathFolder.id);
            };
            foldersContainer.appendChild(link);
        }
    });
}

function buildFolderHeader(folderNodes, currentFolderId) {
    foldersContainer.innerHTML = '';
    if (!folderNodes || folderNodes.length <= 1) return;

    if (settings.folderStyle === 'dials') {
        const homeFolder = folderNodes.find(folder => folder.id === speedDialId);
        folderLink(homeFolder.title, homeFolder.id);
        updateFolderBreadcrumb(currentFolderId);
        return;
    }

    for (let folder of folderNodes) {
        folderLink(folder.title, folder.id);
    }
}

function setFolderHistoryState(id, mode) {
    if (settings.folderStyle !== 'dials') return;

    const state = { ...(history.state || {}), [FOLDER_HISTORY_STATE_KEY]: id };
    if (mode === 'replace') {
        history.replaceState(state, '');
    } else if (mode === 'push') {
        history.pushState(state, '');
    }
}

async function openFolder(id, { historyMode = 'push' } = {}) {
    // ignore a slower in-flight navigation once a newer folder has been requested
    pendingFolderId = id;
    const folderChanged = id !== currentFolder;

    if (settings.folderStyle === 'dials' && !document.getElementById(id)) {
        const folder = id === speedDialId ? speedDialRootNode : folderNodeMap.get(id);
        if (!folder) return;

        await prepareFolderPreviews(folder.children || []);
        if (pendingFolderId !== id) return;

        await printBookmarks(folder.children || [], id);
        if (pendingFolderId !== id) return;
    }

    showFolder(id);
    currentFolder = id;
    scrollPos = 0;
    bookmarksContainerParent.scrollTop = scrollPos;
    updateFolderBreadcrumb(id);

    if (settings.folderStyle === 'dials') {
        bookmarksContainerParent.querySelectorAll('.container').forEach(container => {
            if (container.id !== id) {
                removeFolderContainer(container);
            }
        });
    }

    settings.currentFolder = id;
    if (settings.rememberFolder) {
        chrome.storage.local.set({ settings });
    }

    if (historyMode === 'replace' || (historyMode === 'push' && folderChanged)) {
        setFolderHistoryState(id, historyMode);
    }
}

function handleFolderHistoryNavigation(event) {
    if (settings?.folderStyle !== 'dials') return;

    const historyFolderId = event.state?.[FOLDER_HISTORY_STATE_KEY];
    if (!historyFolderId) return;

    const folderId = historyFolderId === speedDialId || folderNodeMap.has(historyFolderId)
        ? historyFolderId
        : speedDialId;
    openFolder(folderId, { historyMode: null });
}

function folderLink(title, id) {
    let a = document.createElement('a');
    if (id === speedDialId) {
        a.id = "homeFolderLink";
    }
    //a.classList.add('tile');
    a.classList.add('folderTitle');
    a.setAttribute('folderId', id);
    let linkText = document.createTextNode(title);
    a.appendChild(linkText);
    //a.href = "#"+bookmark.id;
    a.onclick = function () {
        openFolder(id);
    };

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

    if (name.length) {
        chrome.bookmarks.create({
            title: name,
            parentId: settings.folderStyle === 'dials' ? (currentFolder || speedDialId) : speedDialId
        }).then(node => {
            hideModals();
        });
    } else {
        hideModals();
    }
}

function editFolder() {
    let title = editFolderModalName.value.trim();
    chrome.bookmarks.update(targetFolder, {
        title
    }).then(node => {
        hideModals();
    }).catch(err => {
        console.log(err);
    });
}

function refreshThumbnails(url, id, parentId) {
    showToast(capturingImagesMessage)
    // gives the ui time to animate before blocking the process with the bg work
    setTimeout(() => {
        chrome.runtime.sendMessage({ target: 'background', type: 'refreshThumbs', data: { url, id, parentId } });
    }, 200);
}

function removeFolder() {
    const parentId = folderNodeMap.get(targetFolder)?.parentId || speedDialId;

    chrome.bookmarks.removeTree(targetFolder).then(() => {
        hideModals();
        targetFolderLink?.remove();
        document.getElementById(targetFolder)?.remove();
        folders.splice(folders.indexOf(targetFolder), 1);
        if (!folders.length) {
            //document.getElementById('homeFolderLink').remove();
            // todo: better manager this state
        }

        if (currentFolder === targetFolder) {
            openFolder(parentId, { historyMode: 'replace' });
        }

        processRefresh();
    });
}

function getChildren(folderId) {
    return new Promise((resolve, reject) => {
        chrome.bookmarks.getChildren(folderId).then(children => {
            resolve(children);
        });
    });
}

function refreshAllThumbnails() {
    let bookmarks = [];
    let parent = currentFolder ? currentFolder : speedDialId;

    hideModals();

    chrome.bookmarks.getChildren(parent).then(children => {
        if (children && children.length) {
            for (let child of children) {
                if (child.url && (child.url.startsWith('https://') || child.url.startsWith('http://') || child.url.startsWith('file://') || child.url.startsWith('chrome://'))) {
                    //urls.push(child.url);
                    // push an object with the url and the id
                    bookmarks.push({ url: child.url, id: child.id, parentId: child.parentId });
                }
            }
        }
        // gate on actual bookmark tiles; a folder of only sub-folders has no thumbs to capture
        if (bookmarks.length) {
            //tabMessagePort.postMessage({refreshAll: true, urls});
            showToast(capturingImagesMessage)
            // gives the ui time to animate before blocking the process with the bg work
            setTimeout(() => {
                chrome.runtime.sendMessage({ target: 'background', type: 'refreshAllThumbs', data: { bookmarks } });
            }, 200);
        }
    }).catch(err => {
        console.log(err);
    });
}

// capture thumbs for imported dials
function refreshImportedThumbnails(nodes) {
    let bookmarks = (nodes || [])
        .filter(node => node && node.url && (node.url.startsWith('https://') || node.url.startsWith('http://') || node.url.startsWith('file://') || node.url.startsWith('chrome://')))
        .map(node => ({ url: node.url, id: node.id, parentId: node.parentId }));

    if (!bookmarks.length) return;

    showToast(capturingImagesMessage)

    setTimeout(() => {
        chrome.runtime.sendMessage({ target: 'background', type: 'refreshAllThumbs', data: { bookmarks } });
    }, 200);
}


// assumes 'bookmarks' param is content of a folder (from getBookmarks)
function batchInsert(parent, fragment, batchSize = 100, onComplete) {
    const nodes = Array.from(fragment.childNodes);
    let index = 0;

    return new Promise(resolve => {
        function insertBatch() {
            let slice = nodes.slice(index, index + batchSize);
            parent.append(...slice);
            index += batchSize;

            if (index < nodes.length) {
                requestAnimationFrame(insertBatch);
            } else if (onComplete) {
                requestAnimationFrame(() => {
                    onComplete();
                    resolve();
                });
            } else {
                resolve();
            }
        }

        insertBatch();
    });
}

async function printNewSetup() {
    console.log("new install")
    let fragment = document.createDocumentFragment();

    // Ensure the container exists
    let folderContainerEl = document.getElementById(speedDialId);
    if (!folderContainerEl) {
        folderContainerEl = document.createElement('div');
        folderContainerEl.id = speedDialId;
        folderContainerEl.classList.add('container');
        folderContainerEl.style.display = currentFolder === speedDialId ? 'flex' : 'none';
        // Show the container immediately without the opacity fade; the welcome card
        // runs its own entrance animation. required for smooth backdrop filter
        folderContainerEl.style.opacity = "1";

        if (currentFolder === speedDialId) {
            document.querySelector(`[folderid="${currentFolder}"]`)?.classList.add('activeFolder');
        }
        bookmarksContainerParent.append(folderContainerEl);
    }

    const featureIcons = [
        // add bookmarks (star)
        '<svg class="welcome-feature-icon" xmlns="http://www.w3.org/2000/svg" height="22" viewBox="0 -960 960 960" width="22" fill="currentColor"><path d="m354-287 126-76 126 77-33-144 111-96-146-13-58-136-58 135-146 13 111 97-33 143ZM233-120l65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Z"/></svg>',
        // organize into folders
        '<svg class="welcome-feature-icon" xmlns="http://www.w3.org/2000/svg" height="22" viewBox="0 -960 960 960" width="22" fill="currentColor"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H447l-80-80H160v480Zm0 0v-480 480Z"/></svg>',
        // edit / rearrange
        '<svg class="welcome-feature-icon" xmlns="http://www.w3.org/2000/svg" height="22" viewBox="0 -960 960 960" width="22" fill="currentColor"><path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"/></svg>'
    ];

    const noBookmarksDiv = document.createElement('div');
    noBookmarksDiv.className = 'default-content';
    noBookmarksDiv.id = 'noBookmarks';
    noBookmarksDiv.innerHTML = `
        <div class="welcome-card">
            <svg class="welcome-logo" viewBox="0 0 128 128" width="72" height="72" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
                <rect class="welcome-logo-tile" style="--i:0" x="5" y="6" width="40" height="40" rx="3"/>
                <rect class="welcome-logo-tile" style="--i:1" x="83" y="6" width="40" height="40" rx="3"/>
                <rect class="welcome-logo-tile" style="--i:2" x="44" y="44" width="40" height="40" rx="3"/>
                <rect class="welcome-logo-tile" style="--i:3" x="5" y="82" width="40" height="40" rx="3"/>
            </svg>
            <h1 class="welcome-title"><span>${chrome.i18n.getMessage('newInstallTitleLine1')}</span><span>${chrome.i18n.getMessage('newInstallTitleLine2')}</span></h1>
            <ul class="welcome-features">
                <li class="welcome-feature">${featureIcons[0]}<span>${chrome.i18n.getMessage('newInstall2')}</span></li>
                <li class="welcome-feature">${featureIcons[1]}<span>${chrome.i18n.getMessage('newInstall3')}</span></li>
                <li class="welcome-feature">${featureIcons[2]}<span>${chrome.i18n.getMessage('newInstall4')}</span></li>
            </ul>
            <div class="cta-container">
                <button id="splashAddDial" class="welcome-cta welcome-cta--primary" type="button">
                    <svg xmlns="http://www.w3.org/2000/svg" height="22" viewBox="0 -960 960 960" width="22" fill="currentColor"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>
                    <span>${chrome.i18n.getMessage('newInstallAddSite')}</span>
                </button>
                <button id="splashImport" class="welcome-cta welcome-cta--secondary" type="button">
                    <svg xmlns="http://www.w3.org/2000/svg" height="22" viewBox="0 -960 960 960" width="22" fill="currentColor"><path d="M260-160q-91 0-155.5-63T40-377q0-78 47-139t123-78q25-92 100-149t170-57q117 0 198.5 81.5T760-520q69 8 114.5 59.5T920-340q0 75-52.5 127.5T740-160H520q-33 0-56.5-23.5T440-240v-206l-64 62-56-56 160-160 160 160-56 56-64-62v206h220q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-80q0-83-58.5-141.5T480-720q-83 0-141.5 58.5T280-520h-20q-58 0-99 41t-41 99q0 58 41 99t99 41h100v80H260Zm220-280Z"/></svg>
                    <span>${chrome.i18n.getMessage('newInstallImport')}</span>
                </button>
            </div>
        </div>
    `;

    fragment.appendChild(noBookmarksDiv);

    // Optimize container update using batch insert
    folderContainerEl.textContent = ''; // Clears old content efficiently
    folderContainerEl.append(fragment);

    bookmarksContainerParent.scrollTop = scrollPos;
}

function createNewDialButton(parentId) {
    let aNewDial = document.createElement('a');
    aNewDial.classList.add('tile', 'createDial');
    aNewDial.onclick = () => {
        hideSettings();
        buildCreateDialModal(parentId);
        modalShowEffect(createDialModalContent, createDialModal);
    };

    let main = document.createElement('div');
    main.classList.add('tile-main');

    let content = document.createElement('div');
    content.classList.add('tile-content', 'createDial-content');
    main.appendChild(content);
    aNewDial.appendChild(main);

    return aNewDial;
}

async function printBookmarks(bookmarks, parentId) {
    let fragment = document.createDocumentFragment();

    // Collect URLs for batch thumbnail fetching
    //let urls = bookmarks.filter(b => b.url?.startsWith("http")).map(b => b.url);

    // lets message the background script to do it  
    
    // reverse the bookmarks if settings.defaultSort === "first")
    if (settings.defaultSort === "first") {
        bookmarks = [...bookmarks].reverse();
    }
    if (settings.folderStyle === 'dials') {
        bookmarks = [
            ...bookmarks.filter(bookmark => !bookmark.url),
            ...bookmarks.filter(bookmark => bookmark.url)
        ];
    }
    chrome.runtime.sendMessage({target: 'background', type: 'getThumbs', data: bookmarks})
    //let thumbnails = await chrome.storage.local.get(urls);

    // Process bookmarks
    if (bookmarks) {
        for (let bookmark of bookmarks) {
            if (!bookmark.url && bookmark.title) {
                if (settings.folderStyle !== 'dials') continue;

                let a = document.createElement('a');
                a.classList.add('tile', 'folderDial');
                a.setAttribute('data-id', bookmark.id);
                a.setAttribute('data-type', 'folder');
                a.onclick = function () {
                    openFolder(bookmark.id);
                };

                let main = document.createElement('div');
                main.classList.add('tile-main');

                let content = document.createElement('div');
                content.classList.add('tile-content', 'folderDial-content');
                content.setAttribute('data-preview-count', bookmark.previewDials?.length ?? 0);

                for (const previewDial of (bookmark.previewDials || [])) {
                    let preview = document.createElement('div');
                    preview.classList.add('folderDial-preview');
                    preview.setAttribute('data-thumbnail-id', previewDial.id);
                    if (!thumbnailPreviewElements.has(previewDial.id)) {
                        thumbnailPreviewElements.set(previewDial.id, new Set());
                    }
                    thumbnailPreviewElements.get(previewDial.id).add(preview);
                    preview.style.backgroundColor = previewDial.previewColor || 'rgba(255, 255, 255, 0.12)';
                    if (previewDial.previewThumbnail) {
                        preview.style.backgroundImage = `url('${previewDial.previewThumbnail}')`;
                    }
                    content.appendChild(preview);
                }

                const placeholderCount = 4 - (bookmark.previewDials?.length ?? 0);
                for (let index = 0; index < placeholderCount; index++) {
                    let placeholder = document.createElement('div');
                    placeholder.classList.add('folderDial-preview', 'folderDial-preview--placeholder');
                    content.appendChild(placeholder);
                }

                let title = document.createElement('div');
                title.classList.add('tile-title', 'folderDial-title');
                if (!settings.showTitles) {
                    title.classList.add('hide');
                }
                let titleText = document.createElement('span');
                titleText.classList.add('folderDial-titleText');
                titleText.textContent = bookmark.title;
                title.appendChild(titleText);

                main.append(content, title);
                a.appendChild(main);
                fragment.appendChild(a);
                continue;
            }

            if (isSupportedDial(bookmark)) {
                //let images = thumbnails[bookmark.url] || {};
                //let thumbUrl = images.thumbnails?.[images.thumbIndex] || null;
                //let thumbBg = images.bgColor || null;

                let a = document.createElement('a');
                a.classList.add('tile');
                a.href = bookmark.url;
                a.setAttribute('data-id', bookmark.id);
                if (settings.folderStyle === 'dials') {
                    a.draggable = false;
                }

                let main = document.createElement('div');
                main.classList.add('tile-main');

                let content = document.createElement('div');
                content.id = bookmark.id;
                content.classList.add('tile-content');
                //content.style.backgroundImage = thumbBg ? `url('${thumbUrl}'), ${thumbBg}` : '';
                //content.style.backgroundColor = thumbBg ? '' : 'rgba(255, 255, 255, 0.5)';
                content.style.backgroundColor =  'rgba(255, 255, 255, 0.5)';

                let title = document.createElement('div');
                title.classList.add('tile-title');
                if (!settings.showTitles) {
                    title.classList.add('hide');
                }
                title.textContent = bookmark.title;

                main.append(content, title);
                a.appendChild(main);
                fragment.appendChild(a);
            }
        }
    }

    let newDialButton = createNewDialButton(parentId);

    if (settings.defaultSort !== "first") {
        fragment.appendChild(newDialButton);
    } else {
        fragment.insertBefore(newDialButton, fragment.firstChild);
    }

    // Ensure the container exists
    let folderContainerEl = document.getElementById(parentId);
    if (!folderContainerEl) {
        folderContainerEl = document.createElement('div');
        folderContainerEl.id = parentId;
        folderContainerEl.classList.add('container');
        folderContainerEl.style.display = currentFolder === parentId ? 'flex' : 'none';
        //folderContainerEl.style.opacity = settings.rememberFolder && currentFolder === parentId ? '0' : '1';
        folderContainerEl.style.opacity = "0";

        if (currentFolder === parentId) {
            setTimeout(() => {
                folderContainerEl.style.opacity = "1";
                scheduleFlip();
            }, 20);
            document.querySelector(`[folderid="${currentFolder}"]`)?.classList.add('activeFolder');
        }
        bookmarksContainerParent.append(folderContainerEl);
    }

    // Destroy any previous Sortable instance to avoid duplicate event handlers after refresh
    let existingSortable = Sortable.get(folderContainerEl);
    if (existingSortable) {
        existingSortable.destroy();
    }

    // Sortable configuration
    new Sortable(folderContainerEl, {
        group: 'shared',
        animation: SORTABLE_ANIMATION,
        forceFallback: settings.folderStyle === 'dials',
        fallbackTolerance: 4,
        ghostClass: 'selected',
        dragClass: 'dragging',
        filter: ".createDial",
        delay: 500,
        delayOnTouchOnly: true,
        onStart: onStartHandler,
        onMove: onMoveHandler,
        onEnd: onEndHandler
    });

    // Sorting optimization (this is done now?)
    /*
    if (settings.defaultSort === "first") {
        Array.from(fragment.childNodes).reverse().forEach(node => fragment.appendChild(node));
    }
        */

    // Optimize container update using batch insert
    unregisterThumbnailPreviews(folderContainerEl);
    folderContainerEl.textContent = ''; // todo: is this even required here? would innerHTML = '' be preferable?
    const insertionComplete = batchInsert(folderContainerEl, fragment);
    if (parentId === currentFolder) {
        await insertionComplete;
    }

    bookmarksContainerParent.scrollTop = scrollPos;
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
    let modals = [modal, createDialModal, createFolderModal, editFolderModal, deleteFolderModal, refreshAllModal, importExportModal];
    let modalContents = [modalContent, createDialModalContent, createFolderModalContent, editFolderModalContent, deleteFolderModalContent, refreshAllModalContent, importExportModalContent]

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

    hideImageUrlInput();

    // hide search
    hideSearch();

}

function modalShowEffect(contentEl, modalEl) {
    modalEl.style.transform = "translateX(0%)";
    modalEl.style.opacity = "1";
    contentEl.style.transform = "scale(1)";
    contentEl.style.opacity = "1";
}

function hideToast() {
    if (isToastVisible) {
        toast.style.transform = "translateX(100%)";
        toast.classList.remove('visible');
        toastContent.innerText = '';
        isToastVisible = false;
    }
}

function showToast(message) {
    if (!isToastVisible) {
        toastContent.innerText = message;
        toast.classList.add('visible');
        toast.style.transform = "translateX(0%)";
        isToastVisible = true;
    }
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

    let newCarousel = document.createElement('div');
    newCarousel.setAttribute('id', 'carousel');
    modalImgContainer.appendChild(newCarousel);
    updateModalBackgroundPreview(modalBgColorPickerInput.value);

    //let createdCarousel = document.getElementById('carousel');
    modalTitle.value = title;
    modalURL.value = url;
    let images = await getThumbs(url);
    if (images && images.thumbnails.length) {
        // clunky af
        let index = images.thumbIndex;
        let img = appendModalCarouselImage(newCarousel, images.thumbnails[index]);
        img.onerror = function () {
            img.setAttribute('src', 'img/default.png'); // todo: image is borked, cleanup
        };

        img.onload = function () {
            // read the bg color and set the color picker preview
            // todo: stop storing bg in gradient format jesus
            let bgColor = cssGradientToHex(images.bgColor);
            if (bgColor) {
                setInputValue(modalBgColorPickerInput, rgbToHex(bgColor))
            }
        }

        for (let [i, image] of images.thumbnails.entries()) {
            if (i !== index) {
                let img = appendModalCarouselImage(newCarousel, image);
                img.onerror = function () {
                    img.setAttribute('src', 'img/default.png'); // todo: cleanup
                };
            }
        }
        initModalCarousel(images.bgColor);

    }
}

function appendModalCarouselImage(carousel, src) {
    let imgDiv = document.createElement('div');
    let img = document.createElement('img');
    img.crossOrigin = 'Anonymous';
    img.setAttribute('src', src);
    img.style.width = 'auto';
    img.style.height = '144px';
    img.style.objectFit = 'contain';
    img.style.maxWidth = '260px';
    imgDiv.appendChild(img);
    carousel.appendChild(imgDiv);
    return img;
}

function initModalCarousel(activeBgColor = null) {
    $('#carousel').flexCarousel({ height: '180px' });
    initModalCarouselPreviewPlates(activeBgColor);

    let fcNext = document.querySelector('.fc-next');
    if (fcNext) {
        fcNext.addEventListener('click', syncModalBackgroundPreviewToActiveSlide);
    }

    let fcPrev = document.querySelector('.fc-prev');
    if (fcPrev) {
        fcPrev.addEventListener('click', syncModalBackgroundPreviewToActiveSlide);
    }
}

function getUniqueModalCarouselImageSrcs(excludeSrc = null) {
    let images = [...modalImgContainer.querySelectorAll('#carousel .fc-slide:not(.fc-is-clone) img')];
    if (!images.length) {
        images = [...modalImgContainer.querySelectorAll('#carousel > div img')];
    }

    const excludedSrc = normalizeImageSrc(excludeSrc);
    const imageSrcs = [];
    const seenSrcs = new Set();

    for (let image of images) {
        const src = image.src;
        const normalizedSrc = normalizeImageSrc(src);
        if (!src || normalizedSrc === excludedSrc || seenSrcs.has(normalizedSrc)) continue;
        seenSrcs.add(normalizedSrc);
        imageSrcs.push(src);
    }

    return imageSrcs;
}

function normalizeImageSrc(src) {
    if (!src) return null;

    try {
        return new URL(src, window.location.href).href;
    } catch (error) {
        return src;
    }
}

function rebuildModalCarouselWithActiveImage(activeImageSrc) {
    let imageSrcs = [
        activeImageSrc,
        ...getUniqueModalCarouselImageSrcs(activeImageSrc)
    ];

    let carousel = document.getElementById('carousel');
    if (carousel) {
        modalImgContainer.removeChild(carousel);
    }

    let newCarousel = document.createElement('div');
    newCarousel.setAttribute('id', 'carousel');
    let activePreview = null;
    imageSrcs.forEach((src, index) => {
        let preview = appendModalCarouselImage(newCarousel, src);
        if (index === 0) activePreview = preview;
    });
    modalImgContainer.appendChild(newCarousel);
    updateModalBackgroundPreview(modalBgColorPickerInput.value);
    initModalCarousel();
    setModalPreviewPlateColorFromImage(activePreview, true);
}

function rectifyUrl(url) {
    if (url && !url.startsWith('https://') && !url.startsWith('http://') && !url.startsWith('file://') && !url.startsWith('chrome://')) {
        return 'https://' + url;
    } else {
        return url;
    }
}

function createDial() {
    let url = rectifyUrl(createDialModalURL.value.trim());

    chrome.bookmarks.create({
        title: url,
        url: url,
        parentId: createDialModalURL.parentId
    }).then(node => {
        hideModals();
        showToast(capturingImagesMessage)
    });
}

async function openAllTabs(folderId = currentFolder, groupTabs = false) {
    let folder = document.getElementById(folderId || speedDialId);

    if (folder) {
        let dials = [...folder.getElementsByClassName('tile')];

        if (groupTabs && supportsTabGroups) {
            // Grouping needs the created tabs' ids, so await them here.
            let tabs = await Promise.all(
                dials
                    .filter(dial => dial.href)
                    .map(dial => chrome.tabs.create({ url: dial.href, active: false }))
            );
            let tabIds = tabs.map(tab => tab.id).filter(Number.isInteger);
            if (tabIds.length) {
                await chrome.tabs.group({ tabIds });
            }
        } else {
            dials.forEach(dial => {
                if (dial.href) {
                    chrome.tabs.create({
                        url: dial.href,
                        active: false
                    });
                }
            });
        }
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

function colorsAreSimilar(color1, color2, tolerance = 2) {
    return Math.abs(color1[0] - color2[0]) <= tolerance &&
           Math.abs(color1[1] - color2[1]) <= tolerance &&
           Math.abs(color1[2] - color2[2]) <= tolerance &&
           Math.abs(color1[3] - color2[3]) <= tolerance;
}

// calculate the bg color of a given image. returns rgba array [r, g, b, a]
// todo: duped in offscreen logic; punt this to a worker
function getBgColor(img) {
    let imgWidth = img.naturalWidth;
    let imgHeight = img.naturalHeight;
    let canvas = offscreenCanvasShim(imgWidth, imgHeight);
    let context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(img, 0, 0);

    let totalPixels = 0;
    let avgColor = [0, 0, 0, 0];
    let colorCounts = {};
    let hasTransparentPixel = false;

    // background color algorithm
    // think the results are best when sampling 2 pixels deep from the edges
    // 1px gives bad results from image artifacts, more than 2px means we average away any natural framing/background in the image

    // Sample the top and bottom edges
    for (let x = 0; x < imgWidth; x += 2) { // Sample every other pixel
        for (let y = 0; y < 2; y++) {
            let pixelTop = context.getImageData(x, y, 1, 1).data;
            let pixelBottom = context.getImageData(x, imgHeight - 1 - y, 1, 1).data;
            let colorKeyTop = `${pixelTop[0]},${pixelTop[1]},${pixelTop[2]},${pixelTop[3]}`;
            let colorKeyBottom = `${pixelBottom[0]},${pixelBottom[1]},${pixelBottom[2]},${pixelBottom[3]}`;
            colorCounts[colorKeyTop] = (colorCounts[colorKeyTop] || 0) + 1;
            colorCounts[colorKeyBottom] = (colorCounts[colorKeyBottom] || 0) + 1;
            avgColor[0] += pixelTop[0] + pixelBottom[0];
            avgColor[1] += pixelTop[1] + pixelBottom[1];
            avgColor[2] += pixelTop[2] + pixelBottom[2];
            avgColor[3] += pixelTop[3] + pixelBottom[3];
            totalPixels += 2;
            if (pixelTop[3] < 255 || pixelBottom[3] < 255) {
                hasTransparentPixel = true;
            }
        }
    }

    // Sample the left and right edges
    for (let y = 2; y < imgHeight - 2; y += 2) { // Sample every other pixel
        for (let x = 0; x < 2; x++) {
            let pixelLeft = context.getImageData(x, y, 1, 1).data;
            let pixelRight = context.getImageData(imgWidth - 1 - x, y, 1, 1).data;
            let colorKeyLeft = `${pixelLeft[0]},${pixelLeft[1]},${pixelLeft[2]},${pixelLeft[3]}`;
            let colorKeyRight = `${pixelRight[0]},${pixelRight[1]},${pixelRight[2]},${pixelRight[3]}`;
            colorCounts[colorKeyLeft] = (colorCounts[colorKeyLeft] || 0) + 1;
            colorCounts[colorKeyRight] = (colorCounts[colorKeyRight] || 0) + 1;
            avgColor[0] += pixelLeft[0] + pixelRight[0];
            avgColor[1] += pixelLeft[1] + pixelRight[1];
            avgColor[2] += pixelLeft[2] + pixelRight[2];
            avgColor[3] += pixelLeft[3] + pixelRight[3];
            totalPixels += 2;
            if (pixelLeft[3] < 255 || pixelRight[3] < 255) {
                hasTransparentPixel = true;
            }
        }
    }

    avgColor = avgColor.map(color => color / totalPixels);
    avgColor[3] = avgColor[3] / 255; // Normalize alpha value

    let mostCommonColor = null;
    let maxCount = 0;
    for (let colorKey in colorCounts) {
        let color = colorKey.split(',').map(Number);
        let similarColorKey = Object.keys(colorCounts).find(key => {
            let keyColor = key.split(',').map(Number);
            return colorsAreSimilar(color, keyColor);
        });
    
        if (similarColorKey && similarColorKey !== colorKey) {
            colorCounts[similarColorKey] += colorCounts[colorKey];
            delete colorCounts[colorKey];
        }
    
        if (colorCounts[similarColorKey || colorKey] > maxCount) {
            maxCount = colorCounts[similarColorKey || colorKey];
            mostCommonColor = color;
        }
    }

    if (maxCount > totalPixels / 2) {
        mostCommonColor[3] = mostCommonColor[3] / 255; // Normalize alpha value
        return [mostCommonColor[0], mostCommonColor[1], mostCommonColor[2], mostCommonColor[3]];

    } else {
        if (hasTransparentPixel) {
            avgColor[3] = 0; // Make the gradient transparent if any pixel is transparent
        }
        return [avgColor[0], avgColor[1], avgColor[2], avgColor[3]];
    }
}

function rgbToHex(rgbArray) {
    // Convert RGBA values to hex color (#RRGGBB or #RRGGBBAA)
    let r = Math.round(rgbArray[0]);
    let g = Math.round(rgbArray[1]);
    let b = Math.round(rgbArray[2]);
    let hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    // Append alpha if present and not fully opaque
    if (rgbArray.length > 3) {
        let a = rgbArray[3];
        // alpha could be 0-1 float (from gradient) or 0-255 int
        let alpha = a <= 1 ? Math.round(a * 255) : Math.round(a);
        if (alpha < 255) {
            hex += alpha.toString(16).padStart(2, '0');
        }
    }
    return hex;
}

function hexToRgba(hex) {
    // Convert hex color to RGBA values (supports #RRGGBB and #RRGGBBAA)
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    let a = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
    return [r, g, b, a];
}

function rgbaToCssGradient(rgba) {
    // Convert RGBA values to CSS gradient string
    // gradient is used as a shortcut to set the background color at same time as image
    return `linear-gradient(to bottom, rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3]}) 50%, rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3]}) 50%)`;
}

function hexToCssGradient(hex) {
    // Convert hex color to CSS gradient string
    let rgba = hexToRgba(hex);
    return rgbaToCssGradient(rgba);
}

function cssGradientToHex(gradientString) {
    // css string is in format: 'linear-gradient(to bottom, rgba(255,255,255,1) 50%, rgba(0,0,0,1) 50%)'
    const rgbaString = gradientString.split('rgba(')[1].split(')')[0];
    const [r, g, b, a] = rgbaString.split(',').map(Number);
    return [r, g, b, a];
}

function saveBookmarkSettings() {
    // todo: cleanup this abomination when im not on drugs
    let title = modalTitle.value;
    let url = targetTileHref;
    let newUrl = rectifyUrl(modalURL.value.trim());
    let selectedImageSrc = null;
    let imageNodes = document.getElementsByClassName('fc-slide');
    let bgColor = null;
    let colorPickerColor = modalBgColorPickerInput.value;

    for (let node of imageNodes) {
        // div with order "2" is the one being displayed by the carousel
        if (node.style.order === '2' || imageNodes.length === 1) {
            // sometimes the carousel puts images inside a <figure class="fc-image"> elem
            if (node.children[0].className === "fc-image") {
                selectedImageSrc = node.children[0].children[0].src;
                bgColor = getBgColor(node.children[0].children[0]);
            } else {
                selectedImageSrc = node.children[0].src;
                bgColor = getBgColor(node.children[0]);
            }

            if (colorPickerColor && colorPickerColor !== rgbToHex(bgColor)) {
                bgColor = hexToCssGradient(colorPickerColor);
            } else {
                bgColor = rgbaToCssGradient(bgColor);
            }

            // update tile
            const targetTileContent = targetNode.children[0].children[0];
            targetTileContent.style.backgroundColor = "unset";
            targetTileContent.style.backgroundImage = `url('${selectedImageSrc}'), ${bgColor}`;
            break;
        }
    }

    getThumbs(url)
        .then(images => {
            if (selectedImageSrc) {
                const alternatives = [...new Set((images?.thumbnails || [])
                    .filter(image => image && image !== selectedImageSrc))];
                chrome.storage.local.set({
                    [newUrl]: {
                        thumbnail: selectedImageSrc,
                        bgColor
                    },
                    [getThumbnailCandidatesKey(newUrl)]: {
                        thumbnails: alternatives
                    }
                }).then(() => {
                    if (title !== targetTileTitle || url !== newUrl) {
                        updateTitle()
                    }
                });
            } else if (title !== targetTileTitle || url !== newUrl) {
                updateTitle()
            }
        });

    // find image index
    function updateTitle() {
        // allow ui to respond immediately while bookmark updated
        //targetNode.children[0].children[1].textContent = title;
        // sortable ids changed so rewrite to storage
        //let order = sortable.toArray();
        //chrome.storage.local.set({"sort":order});
        // todo: temp hack to match all until we start using bookmark ids
        chrome.bookmarks.search({ url })
            .then(bookmarks => {
                if (bookmarks.length <= 1 && (url !== newUrl)) {
                    // cleanup unused thumbnails
                    chrome.storage.local.remove(getThumbnailStorageKeys(url))
                }
                for (let bookmark of bookmarks) {
                    let currentParent = currentFolder ? currentFolder : speedDialId
                    if (bookmark.parentId === currentParent) {
                        chrome.bookmarks.update(bookmark.id, {
                            title,
                            url: newUrl
                        });
                    }

                    if (url !== newUrl && toastContent.innerText === '') {
                        showToast(capturingImagesMessage)
                    }
                }
            })
    }

    hideModals();
}

// Convert a tile's viewport rect into scroll-independent tileContainer content coordinates
function getTileContentRect(node, containerRect, scrollLeft, scrollTop) {
    const r = node.getBoundingClientRect();

    return {
        left: r.left - containerRect.left + scrollLeft,
        top: r.top - containerRect.top + scrollTop,
        bottom: r.bottom - containerRect.top + scrollTop,
        width: r.width,
        height: r.height
    };
}

function captureFlipScrollAnchor(nodes, scrollTop = bookmarksContainerParent.scrollTop, scrollLeft = bookmarksContainerParent.scrollLeft) {
    const viewportBottom = scrollTop + bookmarksContainerParent.clientHeight;
    let anchor = null;
    let bestDistance = Infinity;

    for (const node of nodes) {
        if (node.style.display === 'none') continue;

        const prev = flipPrevRects.get(node);
        if (!prev) continue;

        const prevBottom = prev.top + prev.height;
        if (prevBottom < scrollTop || prev.top > viewportBottom) continue;

        const offsetTop = prev.top - scrollTop;
        const distance = offsetTop <= 0 && prevBottom >= scrollTop ? 0 : Math.abs(offsetTop);
        if (distance >= bestDistance) continue;

        bestDistance = distance;
        anchor = {
            node,
            offsetLeft: prev.left - scrollLeft,
            offsetTop,
            scrollLeft,
            scrollTop
        };
    }

    return anchor;
}

function restoreFlipScrollAnchor(anchor, liveByNode) {
    if (!anchor) {
        return {
            left: bookmarksContainerParent.scrollLeft,
            top: bookmarksContainerParent.scrollTop
        };
    }

    const item = liveByNode.get(anchor.node);
    if (!item) {
        return {
            left: bookmarksContainerParent.scrollLeft,
            top: bookmarksContainerParent.scrollTop
        };
    }

    const maxScrollLeft = Math.max(0, bookmarksContainerParent.scrollWidth - bookmarksContainerParent.clientWidth);
    const maxScrollTop = Math.max(0, bookmarksContainerParent.scrollHeight - bookmarksContainerParent.clientHeight);
    const targetLeft = Math.min(maxScrollLeft, Math.max(0, item.left - anchor.offsetLeft));
    const targetTop = Math.min(maxScrollTop, Math.max(0, item.top - anchor.offsetTop));

    if (Math.abs(bookmarksContainerParent.scrollLeft - targetLeft) > 0.5) {
        bookmarksContainerParent.scrollLeft = targetLeft;
    }
    if (Math.abs(bookmarksContainerParent.scrollTop - targetTop) > 0.5) {
        bookmarksContainerParent.scrollTop = targetTop;
    }

    return {
        left: bookmarksContainerParent.scrollLeft,
        top: bookmarksContainerParent.scrollTop
    };
}

function isContentRectNearViewport(item, scrollTop, viewportHeight, margin) {
    return item.bottom - scrollTop >= -margin && item.top - scrollTop <= viewportHeight + margin;
}

// tile reflow animation (FLIP) when the grid reflows (window resize, dial-size change, delete)
function flip(options = {}) {
    const scaleTiles = options.scale !== false;
    const duration = options.duration ?? FLIP_DURATION;
    const staggerWindow = options.staggerWindow ?? FLIP_STAGGER_WINDOW;
    //const reduceMotion = reducedMotionQuery.matches;
    const parent = currentFolder || speedDialId;
    const nodes = document.querySelectorAll(`[id="${parent}"] > .tile`);
    const scrollAnchor = flipHoldAnchor || captureFlipScrollAnchor(nodes);
    flipHoldAnchor = null;

    clearTimeout(flipAnimationCleanupTimer);
    flipAnimationCleanupTimer = null;
    for (const [node, animation] of flipAnimations) {
        flipAnimations.delete(node);
        animation.cancel();
    }

    // a settle flip ends any in-progress resize hold; drop the pin bookkeeping so
    // a later hold starts from a clean slate (the transforms themselves are
    // cleared by the read pass below).
    flipHoldPins.clear();

    if (!nodes.length) {
        flipPrevRects.clear();
        flipPrevContainerTop = null;
        return;
    }

    // LAST: clear any in-flight transform/transition, then read resting positions.
    // Clearing first means getBoundingClientRect returns the true flex position.
    const resetNodes = [];
    for (const node of nodes) {
        if (!node.style.transition && !node.style.transform) continue;
        node.style.transition = 'none';
        node.style.transform = '';
        resetNodes.push(node);
    }

    const containerRect = bookmarksContainerParent.getBoundingClientRect();
    // The tileContainer can move on screen between relayouts when the folders header
    // wraps to a different number of lines. Content coords are relative to the
    // container top, so fold that outer shift back in as a common vertical delta.
    const prevContainerTop = flipPrevContainerTop;
    const currentContainerTop = containerRect.top;
    const containerTopDelta = prevContainerTop != null ? prevContainerTop - currentContainerTop : 0;
    const readScrollLeft = bookmarksContainerParent.scrollLeft;
    const readScrollTop = bookmarksContainerParent.scrollTop;
    const live = [];
    const liveByNode = new Map();
    for (const node of nodes) {
        const r = getTileContentRect(node, containerRect, readScrollLeft, readScrollTop);
        // skip hidden tiles (e.g. one being removed): nothing to measure/animate
        if (r.width === 0 && r.height === 0) continue;

        const item = { node, left: r.left, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
        live.push(item);
        liveByNode.set(node, item);
    }

    const scrollState = restoreFlipScrollAnchor(scrollAnchor, liveByNode);
    const oldScrollLeft = scrollAnchor ? scrollAnchor.scrollLeft : scrollState.left;
    const oldScrollTop = scrollAnchor ? scrollAnchor.scrollTop : scrollState.top;
    const vh = bookmarksContainerParent.clientHeight;

    // INVERT: offset each tile from its new position back to where it used to be.
    const anim = [];
    const liveSet = new Set();
    for (const item of live) {
        liveSet.add(item.node);
        const prev = flipPrevRects.get(item.node);
        // record the new resting position AND size for the next relayout
        flipPrevRects.set(item.node, { left: item.left, top: item.top, width: item.width, height: item.height });

        //if (reduceMotion) continue;

        // Tiles well outside the viewport snap to rest. Geometry is still read
        // for every tile, but transition, layer, and per-frame style work stays
        // bounded to the tiles near the screen.
        if (!isContentRectNearViewport(item, scrollState.top, vh, FLIP_MARGIN)) continue;
        if (!prev) continue; // brand-new tile: seed at rest, no animation

        const dx = (prev.left - oldScrollLeft) - (item.left - scrollState.left);
        // containerTopDelta animates the folders-header shift instead of snapping it
        const dy = (prev.top - oldScrollTop) - (item.top - scrollState.top) + containerTopDelta;
        // Scale back to the old size for true dial-size changes. Title visibility
        // toggles opt out so the tile height snaps to rest and only row position
        // animates; otherwise the labels feel like they bounce.
        const sx = scaleTiles && item.width ? prev.width / item.width : 1;
        const sy = scaleTiles && item.height ? prev.height / item.height : 1;
        const scaled = Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && !scaled) continue;

        anim.push({
            ...item,
            transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`
        });
    }

    // prune entries for tiles that no longer exist
    if (flipPrevRects.size > live.length) {
        for (const node of flipPrevRects.keys()) {
            if (!liveSet.has(node)) flipPrevRects.delete(node);
        }
    }

    // record the container's screen top alongside the resting rects so the next
    // relayout can tell how far the folders header pushed the whole grid
    flipPrevContainerTop = currentContainerTop;

    if (!anim.length) {
        for (const node of resetNodes) node.style.transition = '';
        return;
    }

    // PLAY: start every animation on one shared timeline. Each tile holds its
    // inverted transform until its stagger point, then moves for `duration` ms.
    // Avoiding per-animation delays keeps Chrome from repeatedly revisiting the
    // style tree as hundreds of effects enter and leave their active phases.
    const span = anim.length > 1 ? anim.length - 1 : 1;
    const effectiveStaggerWindow = anim.length >= FLIP_STAGGER_LIMIT
        ? 0
        : anim.length < 20 ? staggerWindow / 2 : staggerWindow;
    const totalDuration = duration + effectiveStaggerWindow;
    for (const node of resetNodes) {
        node.style.transition = '';
    }
    for (let i = 0; i < anim.length; i++) {
        const item = anim[i];
        const node = item.node;
        const delay = (i / span) * effectiveStaggerWindow;
        const moveStart = totalDuration ? delay / totalDuration : 0;
        const moveEnd = totalDuration ? (delay + duration) / totalDuration : 1;
        const keyframes = [{ transform: item.transform, offset: 0 }];

        if (moveStart > 0) {
            keyframes.push({ transform: item.transform, offset: moveStart, easing: FLIP_EASING });
        } else {
            keyframes[0].easing = FLIP_EASING;
        }
        keyframes.push({ transform: 'none', offset: moveEnd });
        if (moveEnd < 1) {
            keyframes.push({ transform: 'none', offset: 1 });
        }

        const animation = node.animate(keyframes, { duration: totalDuration });

        flipAnimations.set(node, animation);
    }

    flipAnimationCleanupTimer = setTimeout(() => {
        flipAnimationCleanupTimer = null;
        for (const [node, animation] of flipAnimations) {
            flipAnimations.delete(node);
            animation.cancel();
        }
    }, totalDuration + 60);
}

// Re-seed the FLIP position cache from the tiles' current resting positions without animating
// currently only needed after dnd
function recalcFlipRects() {
    const parent = currentFolder || speedDialId;
    const nodes = document.querySelectorAll(`[id="${parent}"] > .tile`);
    if (!nodes.length) {
        flipPrevRects.clear();
        flipPrevContainerTop = null;
        return;
    }

    const containerRect = bookmarksContainerParent.getBoundingClientRect();
    const scrollLeft = bookmarksContainerParent.scrollLeft;
    const scrollTop = bookmarksContainerParent.scrollTop;
    const liveSet = new Set();

    for (const node of nodes) {
        const r = getTileContentRect(node, containerRect, scrollLeft, scrollTop);
        if (r.width === 0 && r.height === 0) continue; // hidden / removing tile
        liveSet.add(node);
        flipPrevRects.set(node, { left: r.left, top: r.top, width: r.width, height: r.height });
    }

    // drop entries for tiles that no longer exist (e.g. one just moved to another folder)
    for (const node of flipPrevRects.keys()) {
        if (!liveSet.has(node)) flipPrevRects.delete(node);
    }

    flipPrevContainerTop = containerRect.top;
}

// Resize HOLD. While the window is being dragged the flex grid reflows every
// frame; for performance we dont let each tile chase the edge
function flipHold() {
    //if (reducedMotionQuery.matches) return;

    const parent = currentFolder || speedDialId;
    const nodes = document.querySelectorAll(`[id="${parent}"] > .tile`);
    if (!nodes.length) return;

    // Chrome can resume a maximize/restore after the quiet timer has already
    // started the settle animation. Carry that animation's current progress
    // into the frozen rects before removing it, equivalent to GSAP's old
    // killTweensOf() + current-transform handoff. Otherwise the measurements
    // below mix transformed visual rects with bare flex positions and snap.
    if (flipAnimations.size) {
        const renderedOffsets = [];
        for (const node of nodes) {
            const animation = flipAnimations.get(node);
            if (!animation) continue;
            const transform = getComputedStyle(node).transform;
            const matrix = transform && transform !== 'none'
                ? new DOMMatrixReadOnly(transform)
                : null;
            renderedOffsets.push({
                node,
                animation,
                dx: matrix ? matrix.m41 : 0,
                dy: matrix ? matrix.m42 : 0
            });
        }

        flipHoldPins.clear();
        flipHoldAnchor = null;
        for (const item of renderedOffsets) {
            const prev = flipPrevRects.get(item.node);
            if (prev) {
                flipPrevRects.set(item.node, {
                    ...prev,
                    left: prev.left + item.dx,
                    top: prev.top + item.dy
                });
            }
            if (flipAnimations.get(item.node) === item.animation) {
                flipAnimations.delete(item.node);
                item.animation.cancel();
            }
            item.node.style.transform = '';
        }
    }

    if (!flipHoldAnchor) {
        flipHoldAnchor = captureFlipScrollAnchor(nodes);
    }

    // Tiles outside both the old and current viewport can snap without being seen.
    const holdMargin = 0;
    const anchorScrollTop = flipHoldAnchor ? flipHoldAnchor.scrollTop : bookmarksContainerParent.scrollTop;
    const anchorScrollLeft = flipHoldAnchor ? flipHoldAnchor.scrollLeft : bookmarksContainerParent.scrollLeft;
    const viewportHeight = bookmarksContainerParent.clientHeight;
    const candidates = [];

    for (const node of nodes) {
        const prev = flipPrevRects.get(node);
        if (!prev) continue; // brand-new tile: leave at rest
        candidates.push({ node, prev });
    }

    if (!candidates.length) return;

    // READ pass: measure every candidate's current on-screen rect in one batch
    const reads = [];
    const containerRect = bookmarksContainerParent.getBoundingClientRect();
    const readScrollLeft = bookmarksContainerParent.scrollLeft;
    const readScrollTop = bookmarksContainerParent.scrollTop;
    for (const item of candidates) {
        const r = getTileContentRect(item.node, containerRect, readScrollLeft, readScrollTop);
        if (r.width === 0 && r.height === 0) continue;

        const applied = flipHoldPins.get(item.node);
        const flexLeft = applied ? r.left - applied.dx : r.left;
        const flexTop = applied ? r.top - applied.dy : r.top;
        const current = {
            left: flexLeft,
            top: flexTop,
            bottom: flexTop + r.height,
            width: r.width,
            height: r.height
        };
        const old = {
            left: item.prev.left,
            top: item.prev.top,
            bottom: item.prev.top + item.prev.height,
            width: item.prev.width,
            height: item.prev.height
        };
        const read = {
            node: item.node,
            flexLeft,
            flexTop,
            prev: item.prev,
            oldNearViewport: isContentRectNearViewport(old, anchorScrollTop, viewportHeight, holdMargin),
            currentNearViewport: isContentRectNearViewport(current, readScrollTop, viewportHeight, holdMargin),
            hadPin: !!applied
        };
        reads.push(read);
    }

    // Observe the browser's current scroll instead of writing it. The pin math
    // below glues every tile to `prev.top - anchorScrollTop` in viewport space
    // regardless of the scroll value, so we don't need to move the scrollbar to
    // hold the grid still
    const scrollState = { left: readScrollLeft, top: readScrollTop };

    // WRITE pass: pin each tile back to its frozen pre-resize spot
    for (const item of reads) {
        if (!item.oldNearViewport && !item.currentNearViewport) {
            if (item.hadPin) {
                item.node.style.transform = '';
                flipHoldPins.delete(item.node);
            }
            continue;
        }

        const dx = (item.prev.left - anchorScrollLeft) - (item.flexLeft - scrollState.left);
        // include the tileContainer's screen shift (folders header wrap) so tiles hold
        // their on-screen spot, not just their spot relative to the moving container
        const dy = (item.prev.top - anchorScrollTop) - (item.flexTop - scrollState.top)
            + (flipPrevContainerTop != null ? flipPrevContainerTop - containerRect.top : 0);

        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
            if (item.hadPin) {
                item.node.style.transform = '';
                flipHoldPins.delete(item.node);
            }
            continue;
        }

        if (!item.hadPin) item.node.style.transition = 'none';
        item.node.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        flipHoldPins.set(item.node, { dx, dy });
    }
}

const scheduleFlip = debounce(() => {
    requestAnimationFrame(flip);
}, 300)

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
                let ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(this, 0, 0, width, height);

                const newDataURI = canvas.toDataURL('image/webp', 0.87);
                resolve(newDataURI);
            } else {
                resolve(dataURI);
            }
        };
        img.src = dataURI;
    })
}

// todo: completely offload this shit to the worker
function resizeThumb(dataURI) {
    return new Promise(function (resolve, reject) {
        let img = new Image();
        img.onload = async function () {
            if (this.height > 256 || this.width > 256) {
                // todo: maybe proper 2x hidpi check
                let height = 288;
                let ratio = height / this.height;
                let width = Math.round(this.width * ratio);

                let canvas = new OffscreenCanvas(width, height)
                let ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";
                ctx.drawImage(this, 0, 0, width, height);

                // Use convertToBlob instead of toDataURL
                const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.86 });
                const reader = new FileReader();
                reader.onload = function (e) {
                    resolve(e.target.result); // Resolve with the data URI
                };
                reader.onerror = function (err) {
                    reject(err);
                };
                reader.readAsDataURL(blob)
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
        rebuildModalCarouselWithActiveImage(image);
    }
}

function applySettings(options = {}) {
    return new Promise(function (resolve, reject) {
        // apply settings to speed dial

        if (settings.wallpaper && wallpaperSrc) {
            // perf hack for default gradient bg image. user selected images are data URIs
            if (wallpaperSrc.length < 65) {
                // Remove any existing background styles and add the animated gradient class
                document.body.style.background = '';
                document.body.style.backgroundSize = '';
                document.body.classList.add('gradientBackground');
            } else {
                // Remove the gradient class and apply custom background
                document.body.classList.remove('gradientBackground');
                document.body.style.background = `url("${wallpaperSrc}") no-repeat top center`;
                document.body.style.backgroundSize = 'cover';
            }
        } else {
            // Remove the gradient class and apply solid background color
            document.body.classList.remove('gradientBackground');
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

        let columnsValue;
        if (settings.maxCols && settings.maxCols !== "100") {
            //todo cleanup - fixed values
            let colDialWidth = 220;
            let colDialMargin = 14 * 2; // 18px on each side

            switch (settings.dialSize) {
                case "xx-large":
                    colDialWidth = 300;
                    break;
                case "x-large":
                    colDialWidth = 256;
                    break;
                case "large":
                    colDialWidth = 220;
                    break;
                case "medium":
                    colDialWidth = 178;
                    break;
                case "small":
                    colDialWidth = 130;
                    break;
                case "x-small":
                    colDialWidth = 100;
                    colDialMargin = 12 * 2;
                    break;
                case "xx-small":
                    colDialWidth = 80;
                    colDialMargin = 8 * 2;
                    break;
                default:
                    colDialWidth = 220;
            }

            columnsValue = `${settings.maxCols * (colDialWidth + colDialMargin)}px`;
        } else {
            columnsValue = '100%';
        }

        let dialWidth, dialHeight, dialContentHeight, dialMargin, folderDropPadding;
        if (settings.dialSize && settings.dialSize !== "large") {
            switch (settings.dialSize) {
                case "xx-large":
                    dialWidth = '300px';
                    dialHeight = settings.dialRatio === "square" ? '318px' : '189px';
                    dialContentHeight = settings.dialRatio === "square" ? '300px' : '171px';
                    dialMargin = '14px';
                    folderDropPadding = '80px';
                    break;
                case "x-large":
                    dialWidth = '256px';
                    dialHeight = settings.dialRatio === "square" ? '274px' : '162px';
                    dialContentHeight = settings.dialRatio === "square" ? '256px' : '144px';
                    dialMargin = '14px';
                    folderDropPadding = '70px';
                    break;
                case "medium":
                    dialWidth = '178px';
                    dialHeight = settings.dialRatio === "square" ? '196px' : '118px';
                    dialContentHeight = settings.dialRatio === "square" ? '178px' : '100px';
                    dialMargin = '14px';
                    folderDropPadding = '45px';
                    break;
                case "small":
                    dialWidth = '130px';
                    dialHeight = settings.dialRatio === "square" ? '148px' : '91px';
                    dialContentHeight = settings.dialRatio === "square" ? '130px' : '73px';
                    dialMargin = '14px';
                    folderDropPadding = '35px';
                    break;
                case "x-small":
                    dialWidth = '100px';
                    dialHeight = settings.dialRatio === "square" ? '118px' : '74px';
                    dialContentHeight = settings.dialRatio === "square" ? '100px' : '56px';
                    dialMargin = '12px';
                    folderDropPadding = '25px';
                    break;
                case "xx-small":
                    dialWidth = '80px';
                    dialHeight = settings.dialRatio === "square" ? '98px' : '63px';
                    dialContentHeight = settings.dialRatio === "square" ? '80px' : '45px';
                    dialMargin = '8px';
                    folderDropPadding = '20px';
                    break;
                default:
                    dialWidth = '220px';
                    dialHeight = settings.dialRatio === "square" ? '238px' : '142px';
                    dialContentHeight = settings.dialRatio === "square" ? '220px' : '124px';
                    dialMargin = '14px';
                    folderDropPadding = '60px';
            }
        } else {
            dialWidth = '220px';
            dialMargin = '14px';
            folderDropPadding = '60px';
            if (settings.dialRatio === "square") {
                dialHeight = '238px';
                dialContentHeight = '220px';
            } else {
                dialHeight = '142px';
                dialContentHeight = '124px';
            }
        }

        // Apply all dial sizing in a single concrete-value stylesheet update
        //
        // content-visibility:auto paint containment clips label overflow, so we add a little extra height
        // and adjust tile margin correspondingly
        const TITLE_PADDING = 6;
        const tileHeight = settings.showTitles ? `${parseInt(dialHeight, 10) + TITLE_PADDING}px` : dialContentHeight;
        const tileMargin = settings.showTitles ? `${Math.max(0, parseInt(dialMargin, 10) - (TITLE_PADDING / 2))}px ${dialMargin}` : dialMargin;

        // Capture the scroll anchor BEFORE the size change reflows the grid. Near the
        // bottom of a folder, shrinking the tiles (e.g. hiding labels) makes the content
        // shorter and the browser instantly clamps scrollTop to the new, smaller max.
        // Reading the anchor after that clamp (flip()'s own fallback capture) uses the
        // already-clamped scroll, desyncs the FLIP scroll restore, and the dials jump up.
        // Capturing here preserves the pre-reflow scroll; flip() consumes it via flipHoldAnchor.
        const anchorParent = currentFolder || speedDialId;
        flipHoldAnchor = captureFlipScrollAnchor(document.querySelectorAll(`[id="${anchorParent}"] > .tile`));

        // content-visilibity set here for perf on folder navigation. test flip animations arent borked
        // todo: clean up
        dialSizeStyleEl.textContent =
            `.container{max-width:${columnsValue}}` +
            `.tile,.createDial{width:${dialWidth};height:${tileHeight};margin:${tileMargin};color:${settings.textColor};content-visibility:auto;contain-intrinsic-size:${dialWidth} ${tileHeight}}` +
            `.tile-content{height:${dialContentHeight}}` +
            `.folders-drag-active .folderTitle{padding:${folderDropPadding}}`;

        // Toggle the createDial (add-site) tile before flip
        if (!settings.showAddSite) {
            document.documentElement.style.setProperty('--create-dial-display', 'none');
        } else {
            document.documentElement.style.setProperty('--create-dial-display', 'block');
        }

        // All layout-affecting changes applied; trigger the FLIP reflow exactly once.
        flip({
            scale: options.scaleTiles,
            duration: options.flipDuration,
            staggerWindow: options.flipStaggerWindow
        });

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

        if (settings.showSearchBtn) {
            searchBtn.style.setProperty('--search', 'block');
        } else {
            searchBtn.style.setProperty('--search', 'none');
        }

        // Position search icon based on what's visible
        updateSearchIconPosition();

        if (!settings.showTitles) {
            document.documentElement.style.setProperty('--title-opacity', '0');
            document.documentElement.classList.add('hide-titles');
        } else {
            document.documentElement.style.setProperty('--title-opacity', '1');
            document.documentElement.classList.remove('hide-titles');
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
        showFoldersInput.checked = settings.showFolders;
        showClockInput.checked = settings.showClock;
        showSettingsBtnInput.checked = settings.showSettingsBtn;
        showSearchBtnInput.checked = settings.showSearchBtn;
        maxColsInput.value = settings.maxCols;
        dialSizeInput.value = settings.dialSize;
        dialRatioInput.value = settings.dialRatio;
        folderStyleInput.value = settings.folderStyle;
        defaultSortInput.value = settings.defaultSort;
        rememberFolderInput.checked = settings.rememberFolder;

        if (wallpaperSrc) {
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
                wallpaperSrc = DEFAULT_WALLPAPER_SRC;
                imgPreview.setAttribute('src', wallpaperSrc);
                chrome.storage.local.set({ wallpaperSrc });
            }
            imgPreview.setAttribute('src', wallpaperSrc);
        }

    });
}

function saveSettings(nextWallpaperSrc) {
    const showTitlesChanged = settings.showTitles !== showTitlesInput.checked;
    let wallpaperChanged = false;
    if (nextWallpaperSrc && nextWallpaperSrc !== wallpaperSrc) {
        wallpaperSrc = nextWallpaperSrc;
        wallpaperChanged = true;
    }

    settings.wallpaper = wallPaperEnabled.checked;
    settings.backgroundColor = color_picker.value;
    settings.textColor = textColor_picker.value;
    settings.showTitles = showTitlesInput.checked;
    settings.showAddSite = showCreateDialInput.checked;
    settings.largeTiles = largeTilesInput.checked;
    settings.showFolders = showFoldersInput.checked;
    settings.showClock = showClock.checked;
    settings.showSettingsBtn = showSettingsBtn.checked;
    settings.showSearchBtn = showSearchBtnInput.checked;
    settings.maxCols = maxColsInput.value;
    settings.dialSize = dialSizeInput.value;
    settings.dialRatio = dialRatioInput.value;
    settings.folderStyle = folderStyleInput.value;
    settings.defaultSort = defaultSortInput.value;
    settings.rememberFolder = rememberFolderInput.checked;
    settings.currentFolder = currentFolder ? currentFolder : speedDialId;

    applySettings({
        scaleTiles: !showTitlesChanged,
        flipDuration: showTitlesChanged ? TITLE_TOGGLE_FLIP_DURATION : undefined,
        flipStaggerWindow: showTitlesChanged ? TITLE_TOGGLE_STAGGER_WINDOW : undefined
    });

    const storageUpdates = { settings };
    if (wallpaperChanged) {
        storageUpdates.wallpaperSrc = wallpaperSrc;
    }

    chrome.storage.local.set(storageUpdates)
        .then(() => {
            /*
            settingsToast.style.opacity = "1";
            setTimeout(function () {
                settingsToast.style.opacity = "0";
            }, 3500);
             */

            //tabMessagePort.postMessage({updateSettings: true});
        });
}

// override context menu
document.addEventListener("contextmenu", function (e) {
    if (e.target.type === 'text' && (e.target.id === 'modalTitle' || e.target.id === 'modalURL' || e.target.id === 'modalImageURLInput' || e.target.id === 'createDialModalURL')) {
        return;
    }
    e.preventDefault();
    // prevent settings from being opened and immediately hidden when right-clicking the gear icon
    if (e.target.id === 'settingsDiv') {
        return;
    }
    hideSettings();
    const folderDial = e.target.closest?.('.folderDial');
    const folderHeader = e.target.closest?.('.folderTitle, .folderBreadcrumbLink, .folderBreadcrumbCurrent');
    if (folderDial) {
        targetFolderLink = folderDial;
        targetFolder = folderDial.dataset.id;
        targetFolderName = folderDial.querySelector('.tile-title').textContent;
        showContextMenu(folderMenu, e.pageY, e.pageX);
        return false;
    } else if (e.target.className === 'tile-content') {
        targetNode = e.target.parentElement.parentElement;
        targetTileHref = targetNode.href;
        targetTileId = targetNode.dataset.id;
        targetTileParentId = targetNode.closest('.container').id;
        targetTileTitle = e.target.nextElementSibling.innerText;
        showContextMenu(menu, e.pageY, e.pageX);
        return false;
    } else if (folderHeader && folderHeader.id !== "homeFolderLink") {
        targetFolderLink = folderHeader;
        targetFolder = folderHeader.getAttribute('folderId');
        targetFolderName = folderHeader.textContent;
        showContextMenu(folderMenu, e.pageY, e.pageX);
        return false;
    } else if (e.target === document.body || e.target.className === 'folders' || e.target.className === 'folders-content' || e.target.className === 'container' || e.target.className === 'tileContainer' || e.target.className === 'cta-container' || e.target.className === 'default-content' || e.target.className === 'default-content helpText') {
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
        let tile = e.target.closest('.tile');
        if (tile && (tile.href.startsWith('chrome:') || tile.href.startsWith('file:'))) {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
                chrome.tabs.create({ url: tile.href, active: false });
            } else {
                chrome.tabs.update({ url: tile.href });
            }
        }
        return;
    }
    e.preventDefault();
});

window.addEventListener("auxclick", e => {
    if (e.button === 1 && (e.target.className === 'tile-content' || e.target.className === 'tile-title')) {
        let tile = e.target.closest('.tile');
        if (tile && (tile.href.startsWith('chrome:') || tile.href.startsWith('file:'))) {
            e.preventDefault();
            chrome.tabs.create({ url: tile.href, active: false });
        }
    }
});

// listen for menu item
window.addEventListener("mousedown", e => {
    hideMenus();
    if (e.target.type === 'text' || e.target.id === 'maxcols' || e.target.id === 'defaultSort' || e.target.id === 'dialSize' || e.target.id === 'dialRatio' || e.target.id === 'folderStyle') {
        return
    }
    if (e.target.className.baseVal === 'gear') {
        openSettings();
        return;
    }
    if (e.target.closest('#splashAddDial')) {
        e.preventDefault();
        buildCreateDialModal(currentFolder);
        modalShowEffect(createDialModalContent, createDialModal);
        return;
    }
    if (e.target.closest('#splashImport')) {
        e.preventDefault();
        modalShowEffect(importExportModalContent, importExportModal);
        //importFileInput.click();
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
        case 'cta-container':
        case 'folders-content':
        case 'folders':
            hideSettings();
            break;
        case 'modal':
            hideModals();
            break;
        default: {
            const menuOption = e.target.closest('.menu-option');
            if (menuOption) {
            switch (menuOption.id) {
                case 'openSettings':
                    openSettings();
                    break;
                case 'newTab':
                    chrome.tabs.create({ url: targetTileHref });
                    break;
                case 'newBackgroundTab':
                    chrome.tabs.create({ url: targetTileHref, active: false });
                    break;
                case 'newWin':
                    chrome.windows.create({ "url": targetTileHref });
                    break;
                case 'newPrivate':
                    chrome.windows.create({ "url": targetTileHref, "incognito": true });
                    break;
                case 'openAll':
                    openAllTabs();
                    break;
                case 'openAllFolder':
                    openAllTabs(targetFolder);
                    break;
                case 'openAllFolderGroup':
                    openAllTabs(targetFolder, true);
                    break;
                case 'edit':
                    buildModal(targetTileHref, targetTileTitle).then(() => {
                        modalShowEffect(modalContent, modal);
                    });
                    break;
                case 'refresh':
                    refreshThumbnails(targetTileHref, targetTileId, targetTileParentId);
                    break;
                case 'refreshAll':
                    modalShowEffect(refreshAllModalContent, refreshAllModal);
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
            } else {
                e.preventDefault();
            }
            break;
        }
    }
});

window.addEventListener("keydown", event => {
    if (event.code === "Escape") {
        // Close search if it's active (prioritize this over other actions)
        if (searchContainer.classList.contains('active')) {
            event.preventDefault();
            hideSearch();
            return;
        }
        hideMenus();
        hideModals();
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        event.preventDefault(); // Prevent the default browser behavior
        activateExpandableSearch();
    }
});

window.addEventListener('popstate', handleFolderHistoryNavigation);

modalSave.addEventListener("click", saveBookmarkSettings);
createDialModalSave.addEventListener("click", createDial);
addFolderButton.addEventListener("click", createFolder);
createFolderModalSave.addEventListener("click", saveFolder)
editFolderModalSave.addEventListener("click", editFolder)
deleteFolderModalSave.addEventListener("click", removeFolder);
refreshAllModalSave.addEventListener("click", refreshAllThumbnails);
searchBtn.addEventListener("click", function() {
    activateExpandableSearch();
});

function activateExpandableSearch() {
    document.body.classList.add('search-active');
    searchContainer.classList.add('active');
    setTimeout(() => searchInput.focus(), 200);
}

function hideSearch() {
    document.body.classList.remove('search-active');
    searchContainer.classList.remove('active');
    searchInput.blur();
    
    if (searchInput.value) {
        searchInput.value = '';
        filterDials(''); // Clear search results only if there was a search term
    }
}

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

modalImgBtn.addEventListener('click', function () {
    document.getElementById('modalImgFile').click();
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

dialSizeInput.oninput = function (e) {
    saveSettings()
}

dialRatioInput.oninput = function (e) {
    saveSettings()
}

folderStyleInput.oninput = function () {
    if (settings.folderStyle === folderStyleInput.value) return;

    settings.folderStyle = folderStyleInput.value;
    chrome.storage.local.set({ settings });
    processRefresh({ transitionFolderStyle: true });
}

defaultSortInput.oninput = function (e) {
    if (settings.defaultSort !== defaultSortInput.value) {
        processRefresh();
        saveSettings()
    }
}

wallPaperEnabled.oninput = function (e) {
    saveSettings()
}

color_picker.onchange = function () {
    color_picker_wrapper.style.backgroundColor = color_picker.value;
    saveSettings();
};

textColor_picker.onchange = function () {
    textColor_picker_wrapper.style.backgroundColor = textColor_picker.value;
    if (settings.textColor !== textColor_picker.value) {
        saveSettings();
    }
};

showTitlesInput.oninput = function (e) {
    saveSettings()
}

showCreateDialInput.oninput = function (e) {
    saveSettings()
}

showFoldersInput.oninput = function (e) {
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

showSearchBtnInput.oninput = function (e) {
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
        saveSettings(imagedata)
    })
};

imgInput.onchange = function () {
    readURL(this);
};

previewOverlay.onclick = function () {
    imgInput.click();
}

// add image from url button clicked, show the input field
modalImgUrlBtn.addEventListener('click', function (event) {
    event.preventDefault();
    showImageUrlInput();
});

closeImgUrlBtn.addEventListener('click', function (event) {
    event.preventDefault();
    hideImageUrlInput();
});

// fetch the image from the url
fetchImageButton.addEventListener('click', function (event) {
    event.preventDefault();
    const imageUrl = modalImageURLInput.value.trim();
    if (imageUrl) {
        resizeThumb(imageUrl).then(resizedImage => {
            addImage(resizedImage);
            hideImageUrlInput();
        }).catch(error => {
            // todo: show error message to user in the modal
            console.error('Error adding image from URL:', error);
        });
    }
});

function hideImageUrlInput() {
    modalBtnContainer.classList.remove('is-hidden');
    imageUrlContainer.classList.remove('is-visible');
    modalImageURLInput.value = '';
}

function showImageUrlInput() {
    modalBtnContainer.classList.add('is-hidden');
    imageUrlContainer.classList.add('is-visible');
    modalImageURLInput.focus();
}

modalBgColorPickerBtn.addEventListener('click', function (e) {
    if (e.target === modalBgColorPickerInput) return;
    modalBgColorPickerInput.dispatchEvent(new Event('click', { bubbles: true }));
});

modalBgColorPickerInput.addEventListener('input', function () {
    const color = this.value;
    updateModalBackgroundPreview(color);
});

function syncModalBackgroundPreviewToActiveSlide() {
    const preview = getActiveModalPreviewImage();
    const plateColor = cssColorToHex(getModalPreviewPlate(preview)?.style.backgroundColor);
    if (plateColor) {
        setInputValue(modalBgColorPickerInput, plateColor);
        return;
    }

    const bgColor = preview ? getBgColor(preview) : null;
    if (bgColor) setInputValue(modalBgColorPickerInput, rgbToHex(bgColor));
}

function updateModalBackgroundPreview(color) {
    const previewColor = color || '#FFFFFF';
    const isSquareDial = settings?.dialRatio === 'square';
    setModalPreviewPlateColor(getActiveModalPreviewImage(), previewColor);
    modalImgContainer.style.setProperty('--modal-preview-width', isSquareDial ? '180px' : '260px');
    modalImgContainer.style.setProperty('--modal-preview-height', isSquareDial ? '180px' : '146px');
}

function initModalCarouselPreviewPlates(activeBgColor) {
    const activePreviewColor = activeBgColor ? rgbToHex(cssGradientToHex(activeBgColor)) : null;
    const previews = [...modalImgContainer.querySelectorAll('#carousel img')];
    previews.forEach((preview, index) => {
        if (index === 0 && activePreviewColor) {
            setModalPreviewPlateColor(preview, activePreviewColor);
            return;
        }
        setModalPreviewPlateColorFromImage(preview);
    });
}

function setModalPreviewPlateColorFromImage(preview, syncPicker = false) {
    if (!preview) return;

    const setColor = () => {
        const bgColor = getBgColor(preview);
        if (bgColor) {
            const color = rgbToHex(bgColor);
            setModalPreviewPlateColor(preview, color);
            if (syncPicker) setInputValue(modalBgColorPickerInput, color);
        }
    };

    if (preview.complete && preview.naturalWidth) {
        setColor();
    } else {
        preview.addEventListener('load', setColor, { once: true });
    }
}

function getActiveModalPreviewImage() {
    const imageNodes = document.getElementsByClassName('fc-slide');
    for (let node of imageNodes) {
        if (node.style.order === '2' || imageNodes.length === 1) return node.querySelector('img');
    }

    return null;
}

function setModalPreviewPlateColor(preview, color) {
    if (!preview) return;

    const plate = getModalPreviewPlate(preview);
    if (plate) plate.style.backgroundColor = color;
}

function getModalPreviewPlate(preview) {
    return preview?.closest('.fc-image') || (preview?.parentElement?.classList.contains('fc-slide') ? preview : null);
}

function cssColorToHex(color) {
    if (!color || color.startsWith('#')) return color;

    const match = color.match(/^rgba?\(([^)]+)\)$/);
    if (!match) return color;

    return rgbToHex(match[1].split(',').map(Number));
}

// helper function for when we set the color picker value programmatically to update our button
function setInputValue(inputElement, value) {
    inputElement.value = value;
    inputElement.dispatchEvent(new Event('input'));
}

document.getElementById('closeSettingsBtn').addEventListener('click', () => {
    hideSettings();
});


function prepareExportV1() {
    chrome.storage.local.get(null).then(function (items) {
        // filter out unused thumbnails to keep exported file efficient
        let filteredItems = {};
        for (const [key, value] of Object.entries(items)) {
            if (key.startsWith('http') || key.startsWith('file:') || key.startsWith('chrome:')) {
                let thumbnails = [];
                let thumbIndex = 0;
                let bgColor = null;

                const thumbnail = getSelectedThumbnail(value);
                if (thumbnail) {
                    thumbnails.push(thumbnail);
                }
                if (value.bgColor) {
                    bgColor = value.bgColor;
                }
                filteredItems[key] = {
                    thumbnails: thumbnails,
                    thumbIndex: thumbIndex,
                    bgColor: value.bgColor
                };
            } else if (key.startsWith('settings')) {
                filteredItems[key] = value;
            }
        }

        // save as file; requires downloads permission
        const blob = new Blob([JSON.stringify(filteredItems)], { type: 'application/json' })
        const today = new Date();
        const dateString = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;

        exportBtn.setAttribute('href', URL.createObjectURL(blob));
        exportBtn.download = `yasd-export-${dateString}.json`;
        exportBtn.classList.remove('disabled');

    });
}

function prepareExport() {
    // exports yasd json file that includes all bookmarks within the root speed dial folder, along with the yasd settings and thumbnails from storage
    // in the following format:

    /*
    const yasdJson = {
        "yasd": {
            "bookmarks":[
                {"id":123,"title":"Site Title","url":"https://www.website.com","index":1,"folderid":3}
            ],
            "folders":[
                {"id":123,"title":"Folder Title","index":1}
            ],
            "settings":{
                "showClock":true,
                "backgroundImage":""
            },
            "wallpaperSrc": "img/bg.jpg",
            "dials": [
                {"https://361114779041.signin.aws.amazon.com/console":{"thumbnails":["data:image/webp;asdfasdf.png","sdfsdfsdfsdfsdf"],"thumbIndex":0,"bgColor":"red"}},
                {"https://361114779041.signin.aws.amazon.com/console":{"thumbnails":["data:image/webp;asdfasdf.png","sdfsdfsdfsdfsdf"],"thumbIndex":0,"bgColor":"red"}}
            ]
        }
    }
    */

    let yasdJson = {
        yasd: {
            version: 3,
            bookmarks: [],
            folders: [],
            settings: {},
            wallpaperSrc: DEFAULT_WALLPAPER_SRC,
            dials: []
        }
    };

    // Get bookmarks and folders that YASD renders within the speed dial folder
    chrome.bookmarks.getSubTree(speedDialId).then(bookmarkTreeNodes => {
        let speedDialChildren = bookmarkTreeNodes[0].children || [];

        function exportNodes(nodes, parentFolderId = null) {
            for (const node of nodes) {
                if (node.url) {
                    yasdJson.yasd.bookmarks.push({
                        id: node.id,
                        title: node.title,
                        url: node.url,
                        index: node.index,
                        folderid: parentFolderId || speedDialId
                    });
                } else {
                    yasdJson.yasd.folders.push({
                        id: node.id,
                        title: node.title,
                        index: node.index,
                        parentFolderid: parentFolderId
                    });
                    exportNodes(node.children || [], node.id);
                }
            }
        }

        exportNodes(speedDialChildren);

        // Get YASD settings and thumbnails from storage
        chrome.storage.local.get(null).then(items => {
            for (const [key, value] of Object.entries(items)) {
                if (key === 'settings') {
                    yasdJson.yasd.settings = { ...value };
                } else if (key === 'wallpaperSrc') {
                    yasdJson.yasd.wallpaperSrc = value || DEFAULT_WALLPAPER_SRC;
                } else if (key.startsWith('http') || key.startsWith('file:') || key.startsWith('chrome:')) {
                    let thumbnails = [];
                    const thumbnail = getSelectedThumbnail(value);
                    if (thumbnail) {
                        thumbnails.push(thumbnail);
                    }
                    yasdJson.yasd.dials.push({
                        [key]: {
                            thumbnails: thumbnails,
                            thumbIndex: 0,
                            bgColor: value.bgColor
                        }
                    });
                }
            }

            // Save as file; requires downloads permission
            const blob = new Blob([JSON.stringify(yasdJson)], { type: 'application/json' });
            const today = new Date();
            const dateString = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}-v3`;

            exportBtn.setAttribute('href', URL.createObjectURL(blob));
            exportBtn.download = `yasd-export-${dateString}.json`;
            exportBtn.classList.remove('disabled');
        });
    });
}


importExportBtn.onclick = function () {
    hideSettings();
    importExportStatus.innerText = "";
    exportBtn.classList.add('disabled');
    prepareExport();
    modalShowEffect(importExportModalContent, importExportModal);
}

helpBtn.onclick = function () {
    chrome.tabs.create({ url: helpUrl });
}

resetSettingsBtn.onclick = function () {
    if (confirm('Are you sure you want to reset all settings to their defaults? This will not modify your site thumbnails.')) {
        settings = JSON.parse(JSON.stringify(defaults));
        wallpaperSrc = DEFAULT_WALLPAPER_SRC;
        chrome.storage.local.set({ settings, wallpaperSrc }).then(() => {
            applySettings().then(() => processRefresh());
        });
    }
}

importFileLabel.onclick = function () {
    importFileInput.click();
}

function parseJson(event) {
    try {
        return JSON.parse(event.target.result);
    } catch (err) {
        console.log(err);
        importExportStatus.innerText = "Error! Unable to parse file.";
        return null;
    }
}

// Add event listener for search input
searchInput.addEventListener('input', function (e) {
    const searchTerm = e.target.value.toLowerCase();
    filterDials(searchTerm);
});

function filterDials(searchTerm) {
    const currentParent = currentFolder;
    const dials = document.querySelectorAll(`[id="${currentParent}"] > .tile`);

    clearTimeout(filterHideTimer);
    // generation token: a newer keystroke invalidates the deferred show/hide
    // callbacks scheduled by an older one, so a tile that flips match->no-match
    // (or back) between keystrokes isn't released/hidden by a stale callback.
    const gen = ++filterGen;

    const toShow = [];
    const toHide = [];

    for (const dial of dials) {
        if (!settings.showAddSite && dial.classList.contains('createDial')) {
            // dont show the create dial button
            continue;
        }
        const title = dial.querySelector('.tile-title')?.textContent.toLowerCase();
        const url = dial.href.toLowerCase();
        if ((title && title.includes(searchTerm)) || url.includes(searchTerm)) {
            toShow.push(dial);
        } else {
            toHide.push(dial);
        }
    }

    // Fade out non-matching tiles in place. They keep their box (and stay in
    // layout) until the hide timer collapses them to display:none, so the
    // opacity/scale transition on .tile-main runs on the compositor.
    for (const dial of toHide) {
        if (!dial.classList.contains('filtered-out')) {
            dial.classList.add('filtered-out');
        }
    }

    // Bring matching tiles back into layout immediately (a cheap style write, no
    // forced reflow). The collapsed class is released later, on a frame boundary.
    for (const dial of toShow) {
        if (dial.style.display === 'none') {
            dial.style.display = '';
        }
    }

    const releaseShown = () => {
        if (gen !== filterGen) return;
        for (const dial of toShow) {
            dial.classList.remove('filtered-out');
        }
    };

    // Deferring avoids releasing a tile that a previous keystroke un-hid earlier
    //  in the same frame before it has painted. the keystroke stays free of any synchronous layout.
    cancelAnimationFrame(filterShowRaf);
    filterShowRaf = requestAnimationFrame(() => {
        filterShowRaf = requestAnimationFrame(releaseShown);
    });

    filterHideTimer = setTimeout(() => {
        if (gen !== filterGen) return;
        for (const dial of toHide) {
            if (dial.classList.contains('filtered-out')) {
                dial.style.display = 'none';
            }
        }
    }, 300);
}

// Search filter visibility
document.getElementById('closeSearch').addEventListener('click', () => {
    hideSearch();
});

importFileInput.onchange = function (event) {
    let filereader = new FileReader();

    filereader.onload = function (event) {
        let json = parseJson(event);
        if (!json) return;

        // quiet the listeners so yasd doesnt go crazy
        chrome.runtime.sendMessage({ target: 'background', type: 'toggleBookmarkCreatedListener', data: { enable: false } });
        //todo: proceed once we get a response
        //todo: re-enable listener when import complete
        //todo: add an option to fetch new thumbnails or use the included ones

        if (json.dials && json.groups) {
            importFromSD2(json);
        } else if (json.db) {
            importFromFVD(json);
        } else if (json.yasd) {
            importFromYASD(json);
        } else {
            importFromOldYASD(json);
        }
    };

    if (event && event.target && event.target.files) {
        filereader.readAsText(event.target.files[0]);
    }
};

function importFromSD2(json) {
    let bookmarks = json.dials.map(dial => ({
        title: dial.title,
        url: dial.url,
        idgroup: dial.idgroup
    }));

    let groups = json.groups.map(group => ({
        id: group.id,
        title: group.title
    }));

    chrome.storage.local.clear().then(() => {
        // Create groups and bookmarks
        let groupPromises = groups.map(group => {
            if (group.id === 0) {
                return Promise.resolve(speedDialId);
            } else {
                return chrome.bookmarks.search({ title: group.title }).then(existingGroups => {
                    const matchingGroups = existingGroups.filter(group => group.parentId === speedDialId);
                    if (matchingGroups.length > 0) {
                        return matchingGroups[0].id;
                    } else {
                        return chrome.bookmarks.create({
                            title: group.title,
                            parentId: speedDialId
                        }).then(node => node.id);
                    }
                });
            }
        });

        Promise.all(groupPromises).then(groupIds => {
            let bookmarkPromises = bookmarks.map(bookmark => {
                let parentId = groupIds[bookmark.idgroup];
                return chrome.bookmarks.search({ url: bookmark.url }).then(existingBookmarks => {
                    let existsInFolder = existingBookmarks.some(b => b.parentId === parentId);
                    if (!existsInFolder) {
                        return chrome.bookmarks.create({
                            title: bookmark.title,
                            url: bookmark.url,
                            parentId: parentId
                        });
                    }
                });
            });

            return Promise.all(bookmarkPromises);
        }).then((createdBookmarks) => {
            hideModals();
            // refresh page
            processRefresh();
            chrome.runtime.sendMessage({ target: 'background', type: 'toggleBookmarkCreatedListener', data: { enable: true } });
            // sd2 export doesnt include thumbnails, dickheads
            refreshImportedThumbnails(createdBookmarks);
        }).catch(err => {
            console.log(err)
            chrome.runtime.sendMessage({ target: 'background', type: 'toggleBookmarkCreatedListener', data: { enable: true } });
            importExportStatus.innerText = "SD2 import error! Unable to create folders."
        });

    }).catch(err => {
        console.log(err)
        chrome.runtime.sendMessage({ target: 'background', type: 'toggleBookmarkCreatedListener', data: { enable: true } });
        importExportStatus.innerText = "Something went wrong. Please try again"
    });
}

function importFromFVD(json) {
    let bookmarks = json.db.dials.map(dial => ({
        title: dial.title,
        url: dial.url,
        groupId: dial.group_id
    }));

    let groups = json.db.groups.map(group => ({
        id: group.id,
        title: group.name
    }));

    // clear previous settings and import
    chrome.storage.local.clear().then(() => {
        // Create groups and bookmarks
        let groupPromises = groups.map(group => {
            if (group.id === 1) {
                return Promise.resolve(speedDialId);
            } else {
                return chrome.bookmarks.search({ title: group.title }).then(existingGroups => {
                    const matchingGroups = existingGroups.filter(group => group.parentId === speedDialId);
                    if (matchingGroups.length > 0) {
                        return matchingGroups[0].id;
                    } else {
                        return chrome.bookmarks.create({
                            title: group.title,
                            parentId: speedDialId
                        }).then(node => node.id);
                    }
                });
            }
        });

        Promise.all(groupPromises).then(groupIds => {
            let bookmarkPromises = bookmarks.map(bookmark => {
                let parentId = groupIds[bookmark.groupId];
                return chrome.bookmarks.search({ url: bookmark.url }).then(existingBookmarks => {
                    let existsInFolder = existingBookmarks.some(b => b.parentId === parentId);
                    if (!existsInFolder) {
                        return chrome.bookmarks.create({
                            title: bookmark.title,
                            url: bookmark.url,
                            parentId: parentId
                        });
                    }
                });
            });

            return Promise.all(bookmarkPromises);
        }).then(() => {
            hideModals();
            // refresh page
            processRefresh();
            chrome.runtime.sendMessage({ target: 'background', type: 'toggleBookmarkCreatedListener', data: { enable: true } });
        }).catch(err => {
            console.log(err);
            importExportStatus.innerText = "FVD import error! Unable to create folders.";
        });

    }).catch(err => {
        console.log(err);
        importExportStatus.innerText = "Something went wrong. Please try again";
    });
}

async function importFromYASD(json) {
    // import from yasd v3 format:
    let yasdData = json.yasd;

    try {
        // Clear previous settings and import new data
        await chrome.storage.local.clear();

        // Store settings
        let settingsPromise = Promise.resolve();
        if (yasdData.settings) {
            const importedSettings = yasdData.settings.settings || yasdData.settings;
            // wallpaperSrc is exported as a top-level sibling of settings; fall back to the
            // legacy location (nested inside settings) for older backups.
            wallpaperSrc = yasdData.wallpaperSrc || importedSettings.wallpaperSrc || DEFAULT_WALLPAPER_SRC;
            delete importedSettings.wallpaperSrc;
            settings = Object.assign({}, defaults, importedSettings);
            settingsPromise = chrome.storage.local.set({ settings, wallpaperSrc });
        }

        // Store dials
        let dialPromises = (yasdData.dials || []).map(dial => {
            let url = Object.keys(dial)[0];
            let dialData = dial[url];
            return chrome.storage.local.set({ [url]: dialData });
        });

        // Create parent folders before their descendants. Backups without
        // parentFolderid remain compatible and import all folders at the root.
        const importedFolders = yasdData.folders || [];
        const importedFolderIds = new Set(importedFolders.map(folder => folder.id));
        const pendingFolders = [...importedFolders].sort((a, b) => a.index - b.index);
        const folderIdMap = {};

        while (pendingFolders.length) {
            let createdFolder = false;

            for (let index = 0; index < pendingFolders.length; index++) {
                const folder = pendingFolders[index];
                if (folder.parentFolderid && importedFolderIds.has(folder.parentFolderid)
                    && !folderIdMap[folder.parentFolderid]) {
                    continue;
                }

                const parentId = folderIdMap[folder.parentFolderid] || speedDialId;
                const existingFolders = await chrome.bookmarks.search({ title: folder.title });
                const matchingFolder = existingFolders.find(existing => existing.parentId === parentId && !existing.url);
                if (matchingFolder) {
                    folderIdMap[folder.id] = matchingFolder.id;
                } else {
                    const node = await chrome.bookmarks.create({ title: folder.title, parentId });
                    folderIdMap[folder.id] = node.id;
                }

                pendingFolders.splice(index, 1);
                createdFolder = true;
                break;
            }

            if (!createdFolder) {
                throw new Error('Unable to resolve imported folder hierarchy.');
            }
        }

        if (yasdData.settings) {
            await settingsPromise;
            settings.currentFolder = folderIdMap[settings.currentFolder] || speedDialId;
            currentFolder = settings.currentFolder;
            settingsPromise = chrome.storage.local.set({ settings, wallpaperSrc });
        }

        const bookmarkPromises = (yasdData.bookmarks || []).map(async bookmark => {
            const parentId = folderIdMap[bookmark.folderid] || speedDialId;
            const existingBookmarks = await chrome.bookmarks.search({ url: bookmark.url });
            const existsInFolder = existingBookmarks.some(existing => existing.parentId === parentId);
            if (!existsInFolder) {
                return chrome.bookmarks.create({
                    title: bookmark.title,
                    url: bookmark.url,
                    parentId
                });
            }
        });

        await Promise.all([settingsPromise, ...dialPromises, ...bookmarkPromises]);
        hideModals();
        if (yasdData.settings) {
            await applySettings();
        }
        processRefresh();
        chrome.runtime.sendMessage({ target: 'background', type: 'toggleBookmarkCreatedListener', data: { enable: true } });
    } catch (err) {
        console.log(err);
        importExportStatus.innerText = "Error! Unable to import bookmarks and dials.";
        chrome.runtime.sendMessage({ target: 'background', type: 'toggleBookmarkCreatedListener', data: { enable: true } });
    }
}

function importFromOldYASD(json) {
    // import from old yasd format
    chrome.storage.local.clear().then(() => {
        chrome.storage.local.set(json).then(result => {
            hideModals();
            // refresh page
            //tabMessagePort.postMessage({handleImport: true});
            processRefresh();
            chrome.runtime.sendMessage({ target: 'background', type: 'toggleBookmarkCreatedListener', data: { enable: true } });
        }).catch(err => {
            console.log(err)
            importExportStatus.innerText = "Error! Unable to parse file."
        });
    }).catch(err => {
        console.log(err)
        importExportStatus.innerText = "Error! Please try again"
    })
}

// native handlers for folder tab target
// container-level handlers to expand/collapse all folder titles
function folderContainerDragEnter(ev) {
    ev.preventDefault();
    this.classList.add('folders-drag-active');
}

function folderContainerDragLeave(ev) {
    // only collapse when truly leaving the container (not entering a child)
    if (this.contains(ev.relatedTarget)) return;
    this.classList.remove('folders-drag-active');
    clearTimeout(folderNavTimeout);
    document.querySelectorAll('.folderTitle.drag-hover').forEach(el => el.classList.remove('drag-hover'));
}

function folderContainerDragOver(ev) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
}

// individual folder title handlers for highlight + navigation
function dragenterHandler(ev) {
    ev.preventDefault();
    const el = ev.currentTarget;
    if (!el.classList.contains("folderTitle")) return;

    // clear hover from siblings, highlight this one
    document.querySelectorAll('.folderTitle.drag-hover').forEach(t => t.classList.remove('drag-hover'));
    el.classList.add("drag-hover");

    const folderId = el.getAttribute("folderid");
    clearTimeout(folderNavTimeout);
    if (currentFolder !== folderId) {
        folderNavTimeout = setTimeout(() => {
            currentFolder = folderId;
            showFolder(currentFolder);
            scrollPos = 0;
            bookmarksContainerParent.scrollTop = scrollPos;
            settings.currentFolder = folderId;
            chrome.storage.local.set({ settings });
        }, 350);
    }
}

function dragleaveHandler(ev) {
    const el = ev.currentTarget;
    // ignore if still inside the element (entering a child node)
    if (el.contains(ev.relatedTarget)) return;

    el.classList.remove("drag-hover");

    // only clear nav timeout if we're not entering another folder title
    if (!foldersContainer.querySelector('.folderTitle.drag-hover')) {
        clearTimeout(folderNavTimeout);
    }
}

// Sortable helper fns
function clearFolderDialDropTarget() {
    clearTimeout(folderDialDropTimer);
    folderDialDropTimer = null;
    folderDialDropTarget?.classList.remove('folderDial-drop-hover', 'folderDial-drop-target');
    folderDialDropTarget = null;
}

function getDragPointer(event) {
    const pointer = event?.touches?.[0] || event?.changedTouches?.[0] || event;
    if (!Number.isFinite(pointer?.clientX) || !Number.isFinite(pointer?.clientY)) return null;

    return { clientX: pointer.clientX, clientY: pointer.clientY };
}

function setFolderDialDropTarget(folderDial) {
    if (folderDialDropTarget === folderDial) return;

    clearFolderDialDropTarget();
    folderDialDropTarget = folderDial;
    folderDial.classList.add('folderDial-drop-hover');
    folderDialDropTimer = setTimeout(() => {
        if (folderDialDropTarget === folderDial) {
            folderDial.classList.add('folderDial-drop-target');
        }
    }, FOLDER_DIAL_DROP_DELAY);
}

function captureFolderDialDropZones(container) {
    const zones = [];
    for (const folderDial of container.querySelectorAll('.folderDial')) {
        const rect = folderDial.getBoundingClientRect();
        const horizontalInset = rect.width * 0.15;
        const verticalInset = rect.height * 0.15;
        zones.push({
            folderDial,
            left: rect.left + horizontalInset,
            right: rect.right - horizontalInset,
            top: rect.top + verticalInset,
            bottom: rect.bottom - verticalInset
        });
    }

    folderDialDropTracking = {
        zones,
        scrollLeft: bookmarksContainerParent.scrollLeft,
        scrollTop: bookmarksContainerParent.scrollTop,
        pointer: null,
        raf: null
    };
}

function getFolderDialAtPointer(pointer) {
    if (!pointer || !folderDialDropTracking) return null;

    const scrollDeltaX = bookmarksContainerParent.scrollLeft - folderDialDropTracking.scrollLeft;
    const scrollDeltaY = bookmarksContainerParent.scrollTop - folderDialDropTracking.scrollTop;
    for (const zone of folderDialDropTracking.zones) {
        if (pointer.clientX >= zone.left - scrollDeltaX
            && pointer.clientX <= zone.right - scrollDeltaX
            && pointer.clientY >= zone.top - scrollDeltaY
            && pointer.clientY <= zone.bottom - scrollDeltaY) {
            return zone.folderDial;
        }
    }

    return null;
}

function trackFolderDialDropTarget(event) {
    if (!folderDialDropTracking) return;

    folderDialDropTracking.pointer = getDragPointer(event);
    if (!folderDialDropTracking.pointer) {
        clearFolderDialDropTarget();
        return;
    }

    if (folderDialDropTracking.raf != null) return;
    const tracking = folderDialDropTracking;
    tracking.raf = requestAnimationFrame(() => {
        tracking.raf = null;
        if (folderDialDropTracking !== tracking) return;

        const folderDial = getFolderDialAtPointer(tracking.pointer);
        if (folderDial) {
            setFolderDialDropTarget(folderDial);
        } else {
            clearFolderDialDropTarget();
        }
    });
}

function onStartHandler(evt) {
    stopFolderDialDropTracking();
    clearFolderDialDropTarget();
    if (settings.folderStyle === 'dials' && evt.item.dataset.type !== 'folder') {
        captureFolderDialDropZones(evt.from);
        FOLDER_DIAL_MOVE_EVENTS.forEach(eventName => {
            document.addEventListener(eventName, trackFolderDialDropTarget, { passive: true });
        });
    }
}

function stopFolderDialDropTracking() {
    FOLDER_DIAL_MOVE_EVENTS.forEach(eventName => {
        document.removeEventListener(eventName, trackFolderDialDropTarget);
    });
    if (folderDialDropTracking?.raf != null) {
        cancelAnimationFrame(folderDialDropTracking.raf);
    }
    folderDialDropTracking = null;
}

function getNextSiblingOfSameType(item) {
    const itemIsFolder = item.dataset.type === 'folder';
    let sibling = item.nextElementSibling;

    while (sibling) {
        if (!sibling.classList.contains('createDial')
            && (sibling.dataset.type === 'folder') === itemIsFolder) {
            return sibling;
        }
        sibling = sibling.nextElementSibling;
    }

    return null;
}

function moveBookmarkToFolder(id, folderId) {
    chrome.bookmarks.move(id, { parentId: folderId }).catch(err => {
        console.log(err);
    });
}

function onMoveHandler(evt) {
    if (evt.related) {
        if (settings.folderStyle === 'dials') {
            const draggedIsFolder = evt.dragged.dataset.type === 'folder';
            const relatedFolder = evt.related.closest?.('.folderDial');

            if (!draggedIsFolder && relatedFolder) {
                trackFolderDialDropTarget(evt.originalEvent);
                return false;
            }

            clearFolderDialDropTarget();
            if (draggedIsFolder && !relatedFolder) return false;
        }

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

function dewrap(str) {
    // unlike folder tabs, main dial container doesnt include the folder id
    // todo: cleanup
    if (str === "wrap") {
        return speedDialId
    } else {
        return str
    }
}

function onEndHandler(evt) {
    const folderAtRelease = getFolderDialAtPointer(getDragPointer(evt?.originalEvent));
    const folderDropTarget = folderDialDropTarget?.classList.contains('folderDial-drop-target')
        && folderAtRelease === folderDialDropTarget
        ? folderDialDropTarget
        : null;
    stopFolderDialDropTracking();
    clearFolderDialDropTarget();

    // clean up folder drag-hover state
    document.getElementById('foldersContainer').classList.remove('folders-drag-active');
    document.querySelectorAll('.folderTitle.drag-hover').forEach(el => el.classList.remove('drag-hover'));

    if (evt && (evt.clone.href || evt.clone.dataset.type === 'folder')) {
        let id = evt.clone.dataset.id;
        let fromParentId = dewrap(evt.from.id);
        let toParentId = dewrap(evt.to.id);
        let nextSibling = settings.folderStyle === 'dials'
            ? getNextSiblingOfSameType(evt.item)
            : evt.item.nextElementSibling;
        let newSiblingId = nextSibling ? nextSibling.dataset.id : null;
        let newSiblingParentId = newSiblingId ? dewrap(nextSibling.parentElement.id) : null;
        let oldIndex = evt.oldIndex;
        let newIndex = evt.newIndex;

        if (folderDropTarget && evt.clone.href) {
            moveBookmarkToFolder(id, folderDropTarget.dataset.id);
            return;
        }

        // check if dropped directly onto a folder title (may happen before the 350ms nav timeout fires)
        let dropTarget = evt.originalEvent.target;
        let folderTitleEl = dropTarget.closest ? dropTarget.closest('.folderTitle') : null;
        let droppedOnFolderId = folderTitleEl ? folderTitleEl.getAttribute('folderid') : null;

        // todo: test if this is needed
        if (fromParentId !== toParentId && toParentId !== evt.originalEvent.target.id) {
            // sortable's position doesn't match the dom's drop target
            // this may happen if the tile is dragged over a sortable list but then ultimately dropped somewhere else
            // for example directly on the folder name, or directly onto the new dial button. so use the folder target if available or else currentFolder
            toParentId = droppedOnFolderId || currentFolder || speedDialId;
        }

        if (fromParentId === toParentId && fromParentId !== currentFolder) {
            // occurs when there is no sortable target -- for example dropping the dial onto the folder name
            // or some space of the page outside the sortable container element
            toParentId = droppedOnFolderId || currentFolder || speedDialId;
        }

        // if the sibling's parent doesnt match the parent we are moving to discard this sibling
        // can occur when dropping onto a non sortable target (like folder name)
        if (newSiblingParentId && newSiblingParentId !== toParentId) {
            newSiblingId = -1;
        }

        if ((fromParentId && toParentId && fromParentId !== toParentId) || oldIndex !== newIndex) {
            moveBookmark(id, fromParentId, toParentId, oldIndex, newIndex, newSiblingId)

            // recalc layout after dnd so flip anim runs properly
            setTimeout(recalcFlipRects, SORTABLE_ANIMATION);
        }
    } else if (evt && evt.clone.classList.contains('folderTitle')) {
        let oldIndex = evt.oldIndex;
        let newIndex = evt.newIndex;

        if (newIndex !== oldIndex) {
            if (evt.clone.attributes.folderid) {
                let id = evt.clone.attributes.folderid.value;
                let newSiblingId = evt.item.nextElementSibling ? evt.item.nextElementSibling.attributes.folderid.value : null;
                moveFolder(id, oldIndex, newIndex, newSiblingId)
            }
        }
    }
}

const processRefresh = debounce(({ foldersOnly = false, transitionFolderStyle = false } = {}) => {
    if (foldersOnly) {
        buildFolderPages(speedDialId)
    } else {
        const refreshDialPages = async () => {
            // prevent page scroll on refresh
            // react where are you...
            scrollPos = bookmarksContainerParent.scrollTop;
            //noBookmarks.style.display = 'none';
            // clear the inline override so `display: var(--show-folders)` (the "Add Folder Button" setting) governs visibility
            addFolderButton.style.display = '';
            searchBtn.style.display = '';

            //bookmarksContainer.style.opacity = "0";

            //getBookmarks(speedDialId)
            await buildDialPages(speedDialId, currentFolder);
            // re-measure resting positions for the new dom nodes and animate
            scheduleFlip();
        };

        const canTransition = transitionFolderStyle
            && typeof document.startViewTransition === 'function'
            && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (!canTransition) {
            refreshDialPages();
            return;
        }

        document.documentElement.classList.add('folder-style-transition');
        const transition = document.startViewTransition(refreshDialPages);
        const finishTransition = () => document.documentElement.classList.remove('folder-style-transition');
        transition.finished.then(finishTransition, finishTransition);
    }
}, 650, true);

function getSpeedDialId() {
    return new Promise((resolve, reject) => {
        chrome.bookmarks.search({ title: 'Speed Dial' }).then(result => {
            if (result) {
                for (let bookmark of result) {
                    if (!bookmark.url) {
                        speedDialId = bookmark.id;
                        break;
                    }
                }
            }
            if (speedDialId) {
                resolve();
            } else {
                chrome.bookmarks.create({ title: 'Speed Dial' }).then(result => {
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

// Preload the image before setting the background
function preloadImage(url) {
    const img = new Image();
    img.src = url;
    return new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
    });
}

function setBackgroundImages(thumbnails) {
    const elementsToUpdate = [];
    const observers = new Map();

    thumbnails.forEach(thumb => {
        const element = document.getElementById(thumb.id);
        const previewElements = thumbnailPreviewElements.get(thumb.id);

        if (previewElements?.size) {
            previewElements.forEach(previewElement => {
                elementsToUpdate.push({ element: previewElement, thumb });
            });
        }
        if (element) {
            elementsToUpdate.push({ element, thumb });
        } else if (!previewElements?.size) {
            let observer = observers.get(thumb.parentId);
            if (!observer) {
                const parentElement = document.getElementById(thumb.parentId);
                if (!parentElement) return; // Skip if parent is missing

                observer = new MutationObserver((mutations, obs) => {
                    thumbnails.forEach(t => {
                        const el = document.getElementById(t.id);
                        if (el) {
                            elementsToUpdate.push({ element: el, thumb: t });
                        }
                    });

                    if (elementsToUpdate.length) {
                        batchApplyImages(elementsToUpdate);
                        obs.disconnect();
                    }
                });

                observer.observe(parentElement, { childList: true, subtree: true });
                observers.set(thumb.parentId, observer);
            }
        }
    });

    if (elementsToUpdate.length) {
        batchApplyImages(elementsToUpdate);
    }
}

function batchApplyImages(elements) {
    requestAnimationFrame(() => {
        elements.forEach(({ element, thumb }) => {
            element.style.backgroundColor = "unset";
            element.style.backgroundImage = `url('${thumb.thumbnail}'), ${thumb.bgColor}`;
        });
    });
}

function handleMessages(message) {
    //console.log(message);
    if (message.target !== 'newtab') {
        return
    }
    if (message.data?.refresh) {
        hideToast();
        processRefresh();
    } else if(message.data?.reloadFolders) {
        hideToast();
        processRefresh({ foldersOnly: settings.folderStyle !== 'dials' });
    } else if(message.type === 'thumbBatch') {
        // lets update the backgroundImage with the thumbnail for each element using its id (parentId + id)
        // data.thumbs is an array of objects containing id, parentId, thumbnail and bgcolor
        //console.log(message.data);
        // todo: background not working?
        setBackgroundImages(message.data);
        hideToast();
    }
}

function onResize() {
    // Every resize -- a maximize/snap (one event) or a slow edge-drag (many
    // events) -- pins each tile at its pre-drag spot via flipHold so the grid sits
    // still while the viewport changes, then plays one staggered settle wave (flip)
    // once the resize goes quiet. The hold keeps flipPrevRects on the original
    // layout so the settle wave has the full delta to stagger across.
    /*
    if (reducedMotionQuery.matches) {
        clearTimeout(resizeSettleTimer);
        resizeSettleTimer = setTimeout(flip, RESIZE_SETTLE_DELAY);
        return;
    }
    */

    if (!resizeFlipScheduled) {
        resizeFlipScheduled = true;
        requestAnimationFrame(() => {
            resizeFlipScheduled = false;
            flipHold();
        });
    }

    // once the drag goes quiet, replay one staggered settle wave so a slow manual
    // resize ends with the same flourish as a maximize/snap jump
    clearTimeout(resizeSettleTimer);
    resizeSettleTimer = setTimeout(() => {
        flip();
    }, RESIZE_SETTLE_DELAY);
}

function init() {

    document.querySelectorAll('[data-locale]').forEach(elem => {
        elem.textContent = chrome.i18n.getMessage(elem.dataset.locale);
    })

    // Handle placeholder translations separately
    document.querySelectorAll('[data-locale-placeholder]').forEach(elem => {
        elem.placeholder = chrome.i18n.getMessage(elem.dataset.localePlaceholder)
    })

    // init what used to be background work"
    // build a thumbnail cache of url:thumbUrl pairs
    // todo: slow; lets get the current tab first
    chrome.storage.local.get(['settings', 'wallpaperSrc']).then(async result => {
        if (result) {
            if (result.settings) {
                settings = Object.assign({}, defaults, result.settings);
            } else {
                settings = defaults;
            }

            const hasLegacyWallpaper = Object.prototype.hasOwnProperty.call(settings, 'wallpaperSrc');
            wallpaperSrc = result.wallpaperSrc || settings.wallpaperSrc || DEFAULT_WALLPAPER_SRC;
            if (hasLegacyWallpaper) {
                delete settings.wallpaperSrc;
                await chrome.storage.local.set({ settings, wallpaperSrc });
            }
            /*
            const entries = Object.entries(result);
            for (let e of entries) {
                //console.log(e);
                // todo: filter folder ids
                if (e[0] !== "settings" && e[1].thumbnails) {
                    let index = e[1].thumbIndex;
                    cache[e[0]] = [e[1].thumbnails[index], e[1].bgColor];
                }
            }
            */
        }

        getSpeedDialId().then(() => {
            if (settings.rememberFolder && settings.currentFolder) {
                currentFolder = settings.currentFolder;
            } else {
                currentFolder = speedDialId;
            }
            applySettings().then(() => buildDialPages(speedDialId, currentFolder));
        }, error => {
            console.log(error);
        });
    });



    sidenav.style.display = "flex";

    // container-level drag listeners for expanding folder titles
    const foldersContainerEl = document.getElementById('foldersContainer');
    foldersContainerEl.addEventListener('dragenter', folderContainerDragEnter);
    foldersContainerEl.addEventListener('dragleave', folderContainerDragLeave);
    foldersContainerEl.addEventListener('dragover', folderContainerDragOver);

    new Sortable(foldersContainer, {
        animation: 150,
        forceFallback: true,
        fallbackTolerance: 4,
        filter: "#homeFolderLink, .folderBreadcrumbSeparator, .folderBreadcrumbLink, .folderBreadcrumbCurrent",
        ghostClass: 'selected',
        onMove: function (evt) {
            return evt.related.id !== 'homeFolderLink';
        },
        onEnd: onEndHandler
    });

    window.addEventListener('resize', onResize);

}

init();
