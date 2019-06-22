const reader = new FileReader();
const color_picker = document.getElementById("color-picker");
const color_picker_wrapper = document.getElementById("color-picker-wrapper");
const imgInput = document.getElementById("file");
const imgPreview = document.getElementById("preview");
const wallPaperEnabled = document.getElementById("wallpaper");
const previewContainer = document.getElementById("previewContainer");
const largeTilesInput = document.getElementById("largeTiles");
const showTitlesInput = document.getElementById("showTitles");
const saveBtn = document.getElementById("saveBtn");
const settingsDiv = document.getElementById("settingsDiv");
const toast = document.getElementById("toast");

let settings = null;

function initSettings () {
    browser.storage.local.get('settings').then(store => {
        settings = store.settings;
        if (!settings) {
            settingsDiv.innerHTML = "Error loading settings. Please try again"
            return;
        }

        wallPaperEnabled.checked = settings.wallpaper;
        color_picker.value = settings.backgroundColor;
        showTitlesInput.checked = settings.showTitles;
        largeTilesInput.checked = settings.largeTiles;

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
    settings.largeTiles = largeTilesInput.checked;

    browser.storage.local.set({settings})
    .then(()=> {
        toast.style.opacity = "1";
        setTimeout(function() {
            toast.style.opacity = "0";
        }, 3500);
        browser.runtime.sendMessage({"reload":true});
    });
}

color_picker.onchange = function() {
    color_picker_wrapper.style.backgroundColor = color_picker.value;
};
color_picker_wrapper.style.backgroundColor = color_picker.value;


reader.onload = function (e) {
    imgPreview.setAttribute('src', e.target.result);
    imgPreview.style.display = 'block';
};

function readURL(input) {
    if (input.files && input.files[0]) {
        reader.readAsDataURL(input.files[0]);
    }
}

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

initSettings();
