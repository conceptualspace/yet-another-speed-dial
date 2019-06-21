
let bookmarksContainer = document.getElementById('wrap');

let speedDialId = null;
let settings = {};

// get speed dial folder or create one
// const bookmarksTree = await browser.bookmarks.getTree();
function getSpeedDial() {
    return browser.bookmarks.search({title: 'Speed Dial'})
        .then(result => result.length && result[0])
        .then(result => {
            if (result) {
                if (!result) { return; }
                speedDialId = result.id;
                return result.id
            }
        })
}

function getBookmarks(folderId) {
    return browser.bookmarks.getChildren(folderId)
}

function createSpeedDial() {
    return browser.bookmarks.create({
        title: 'Speed Dial',
        type: 'folder'
    })
        .then(result => result.id)
}

function getThumbs(bookmarkUrl) {
    return browser.storage.local.get(bookmarkUrl)
        .then(result => {
            if (result[bookmarkUrl]) {
                return result[bookmarkUrl];
            }
        });
}

async function printBookmarks(bookmarks) {
    for (let bookmark of bookmarks) {

        let result = await getThumbs(bookmark.url);
        let thumbUrl = null;

        if (result) {
            // if the image is a blob:
            //iconURL = URL.createObjectURL(result.icon);
            //iconURL = result.icon;
            thumbUrl = result.thumbnails[result.thumbIndex];
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
        //console.log(icon);
        content.style.backgroundImage = "url("+thumbUrl+")";
        //content.style.backgroundImage = "url('img/screenshot.png')";

        let title = document.createElement('div');
        title.classList.add('tile-title');
        if (!settings.showTitles) {
            title.classList.add('hide');
        }
        title.textContent = bookmark.title;

        main.appendChild(content);
        main.appendChild(title);
        a.appendChild(main);
        bookmarksContainer.appendChild(a);

    }
    animate();
    sort();
    bookmarksContainer.style.opacity = "1";
}

function applySettings() {
    browser.storage.local.get('settings').then(store => {
        settings = store.settings || {};
        if (settings.backgroundColor) {
            document.body.style.background = settings.backgroundColor;
        }
        if (settings.wallpaper && settings.wallpaperSrc) {
            document.body.style.background = `url("${settings.wallpaperSrc}") no-repeat top center fixed`;
            document.body.style.backgroundSize = 'cover';
        }
    });
}

applySettings();

getSpeedDial()
    .then(speedDialId => {
        if (speedDialId) {
            getBookmarks(speedDialId)
                .then(bookmarks => {
                    if (bookmarks.length) {
                        printBookmarks(bookmarks)
                    } else {
                        noBookmarks.style.display = 'flex';
                    }
                })
                //.then(import { animate } from './animate.js');
        } else {
            noBookmarks.style.display = 'flex';
            createSpeedDial()
                .then(speedDialId => getBookmarks(speedDialId))
                .then(bookmarks => printBookmarks(bookmarks))
        }
    });

let sortable = new Sortable(bookmarksContainer, {
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

function sort() {
    browser.storage.local.get('sort')
        .then(result => {
            if (result.sort) {
                sortable.sort(result.sort);
            }
        });
}

const menu = document.getElementById('contextMenu');
let targetTileHref = null;
let targetTileTitle = null;
let targetNode = null;

const modal = document.getElementById('tileModal');
const closeModal = document.getElementsByClassName("close")[0];
const modalSave = document.getElementById('modalSave');//.onclick = saveBookmarkSettings();

let modalTitle = document.getElementById("modalTitle");
let modalURL = document.getElementById("modalURL");
let modalImgContainer = document.getElementById("modalImgContainer");
let modalImgInput = document.getElementById("modalImgInput");

const noBookmarks = document.getElementById('noBookmarks');

function showContextMenu(top, left) {
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.visibility = "visible";
    menu.style.opacity = "1";
}

function hideContextMenu() {
    menu.style.visibility = "hidden";
    menu.style.opacity = "0";
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
                    browser.storage.local.set({[url]:{thumbnails, thumbIndex}});
                }
            }
            hideModal();
        });
}

// override context menu
document.addEventListener( "contextmenu", function(e) {
    e.preventDefault();
    if (e.target.className === 'tile-content') {
        targetNode = e.target.parentElement.parentElement;
        targetTileHref = e.target.parentElement.parentElement.href;
        targetTileTitle = e.target.nextElementSibling.innerText;
        showContextMenu(e.pageY, e.pageX);
        return false;
    }
});

function hideModal() {
    modal.style.display = "none";
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

// listen for menu item
window.addEventListener("click", e => {
    // required to accommodate carousel clicks
    //e.preventDefault();
    hideContextMenu();

    switch (e.target.className) {
        case 'tile-content':
        case 'tile-title':
            break;
        case 'modal':
            hideModal();
            break;
        case 'menu-option':
            switch (e.target.id) {
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
            e.preventDefault();
    }

});

window.addEventListener("keydown", event => {
    if (event.code === "Escape") {
        hideContextMenu();
        hideModal();
    }
});

closeModal.onclick = function(e) {
    e.preventDefault();
    hideModal();
};

modalSave.addEventListener("click", saveBookmarkSettings);
