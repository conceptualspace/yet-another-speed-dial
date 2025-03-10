chrome.runtime.onMessage.addListener(handleMessages);

const imageRatio = 1.54;

function offscreenCanvasShim(w=1, h=1) {
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

async function handleMessages(message) {
    if (message.target !== 'offscreen') {
        return;
      }

    let screenshot = message.data.screenshot;
    let quickRefresh = message.data.quickRefresh;
    let resizedImages = [];
    let thumbs = [];
    let bgColor = null;
    let title = null;

    let url = message.data.url;

    let images = await fetchImages(url, quickRefresh).catch(err => {
        console.log(err);
    })

    if (images && images.length) {
        resizedImages = await Promise.all(images.map(async (image) => {
            const result = await resizeImage(image).catch(err => {
                console.log(err);
            });
            return result
        }))

        if (screenshot) {
            // screenshot is handled separately to remove scrollbars
            let result = await resizeImage(screenshot, true).catch(err => {
                console.log(err);
            });
            if (result) {
                resizedImages.push(result);
            }
        }
    }

    if (resizedImages && resizedImages.length) {
        thumbs = resizedImages.filter(item => item).slice(0,5)
    }

    if (thumbs.length) {
        bgColor = await getBgColor(thumbs[0])
        
        //await saveThumbnails(url, thumbs, bgColor)
    }

    chrome.runtime.sendMessage({target: 'background', type: 'saveThumbnails', data: {url, thumbs, bgColor}});
    //return title; //todo: why did i do this?

      //chrome.runtime.sendMessage(images);
}



function convertUrlToAbsolute(origin, path) {
    if (path.indexOf('://') > 0) {
        return path
    } else if (path.indexOf('//') === 0) {
        return 'https:' + path;
    } else {
        let url = new URL(origin);
        if (path.slice(0,1) === "/") {
            return url.origin + path;
        } else {
            if (url.pathname.slice(-1) !== "/") {
                url.pathname = url.pathname + "/";
            }
            return new URL(path, origin).href;
        }
    }
}

function getBgColor(image) {
    // todo: ensure this is performant
    return new Promise(function(resolve, reject) {
        let img = new Image();
        img.onload = function () {
            let imgWidth = img.naturalWidth;
            let imgHeight = img.naturalHeight;
            let canvas = offscreenCanvasShim(imgWidth, imgHeight);
            let context = canvas.getContext('2d', {willReadFrequently:true});
            context.drawImage(img, 0, 0);

            let totalPixels = 0;
            let avgColor = [0, 0, 0, 0];
            let colorCounts = {};
            let hasTransparentPixel = false;

            // Sample the top and bottom edges
            for (let x = 0; x < imgWidth; x += 2) { // Sample every other pixel
                for (let y = 0; y < 10; y++) {
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
            for (let y = 10; y < imgHeight - 10; y += 2) { // Sample every other pixel
                for (let x = 0; x < 10; x++) {
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
                if (colorCounts[colorKey] > maxCount) {
                    maxCount = colorCounts[colorKey];
                    mostCommonColor = colorKey.split(',').map(Number);
                }
            }

            if (maxCount > totalPixels / 2) {
                mostCommonColor[3] = mostCommonColor[3] / 255; // Normalize alpha value
                resolve(`linear-gradient(to bottom, rgba(${mostCommonColor[0]},${mostCommonColor[1]},${mostCommonColor[2]},${mostCommonColor[3]}) 50%, rgba(${mostCommonColor[0]},${mostCommonColor[1]},${mostCommonColor[2]},${mostCommonColor[3]}) 50%)`);
            } else {
                if (hasTransparentPixel) {
                    avgColor[3] = 0; // Make the gradient transparent if any pixel is transparent
                }
                resolve(`linear-gradient(to bottom, rgba(${avgColor[0]},${avgColor[1]},${avgColor[2]},${avgColor[3]}) 50%, rgba(${avgColor[0]},${avgColor[1]},${avgColor[2]},${avgColor[3]}) 50%)`);
            }
        };
        img.onerror = function() {
            resolve();
        };
        img.crossOrigin = "Anonymous";
        img.src = image;
    });
}

function resizeImage(image, screenshot=false) {
    return new Promise(function (resolve, reject) {
        if (image && image.length) {
            let img = new Image();

            img.onerror = function(event) {
                resolve();
            }

            img.onload = function () {

                let sWidth = this.width;
                let sHeight = this.height;

                if (sHeight > 256 || sWidth > 256) {

                    let canvas = document.createElement('canvas');
                    let ctx = canvas.getContext('2d', { willReadFrequently: true });
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = "high";

                    const maxSize = 256;
                    const maxWidth = Math.round(256 * imageRatio);

                    const sRatio = sWidth / sHeight

                    let sX = 0;
                    let sY = 0;
                    let dX = 0;
                    let dY = 0;
                    let dWidth = sWidth;
                    let dHeight = sHeight;

                    // remove scrollbars from screenshots
                    if (screenshot) {
                        sWidth = sWidth - 17;
                        sHeight = sHeight - 17;
                    }

                    // if image aspect ratio is very close to the speed dial aspect ratio crop it to fit
                    if (sRatio < imageRatio && sRatio > (imageRatio - 0.2)) {
                        // aspect is narrower, crop top and bottom
                        let naturalHeight = maxWidth / sRatio
                        let crop = ( naturalHeight - maxSize )
                        sY = crop / 2; // take equal amounts from each side
                        sHeight = sHeight - crop;
                        dHeight = maxSize;
                        dWidth = Math.round(maxSize * imageRatio)
                    } else if (sRatio > imageRatio && sRatio < (imageRatio + 0.2)) {
                        // aspect is wider, crop sides to fit
                        let naturalWidth = maxSize * sRatio
                        let crop = ( naturalWidth - maxWidth )
                        sX = crop / 2;
                        sWidth = sWidth - crop;
                        dWidth = maxSize;
                        dHeight = Math.round(maxSize / imageRatio)
                    } else if (sWidth > sHeight) {
                        // rescale to max width of 256px
                        let ratio = maxSize / sWidth;
                        dHeight = Math.round(sHeight * ratio);
                        dWidth = maxSize;
                    } else {
                        // rescale to max height of 256px
                        let ratio = maxSize / sHeight;
                        dWidth = Math.round(sWidth * ratio);
                        dHeight = maxSize;
                    }

                    canvas.width = dWidth;
                    canvas.height = dHeight;

                    //console.log(sX, sY, sWidth, sHeight, dX, dY, dWidth, dHeight);
                    ctx.drawImage(this, sX, sY, sWidth, sHeight, dX, dY, dWidth, dHeight)

                    const newDataURI = canvas.toDataURL('image/webp', 0.9);
                    resolve(newDataURI);

                } else if (sHeight >= 96 || sWidth >= 96) {
                    resolve(image);
                } else {
                    // discard images < 96px
                    resolve();
                }
            };
            img.crossOrigin = "Anonymous";
            img.src = image;
        } else {
            resolve();
        }
    });
}

function extractBackgroundImages(cssText) {
    const backgroundImages = [];
    const regex = /background(?:-image)?:\s*url\(["']?(.*?)["']?\)/g;
    
    let match;
    while ((match = regex.exec(cssText)) !== null) {
        backgroundImages.push(match[1]); // Extracted URL
    }

    return backgroundImages;
}

async function fetchImages(url, quickRefresh) {

    const whitelist = [
        "mail.google.com",
        "gmail.com",
        "www.facebook.com",
        "twitter.com"
    ];

    const hostname = new URL(url).hostname;

    let images = [];

    // default favicons
    images.push(new URL(url).origin + "/favicon.ico")
    // amazon hack
    if (hostname.includes('amazon')) {
        images.push('img/amazon.com.png');
        // dont fetch other images for the root page
        if (hostname.startsWith('amazon') && hostname.length < 14) {
            return(images);
        }
    } else {
        images.push('https://logo.clearbit.com/' + new URL(url).hostname + '?size=256');
    }

    // avoid duplicates and preserve the precedence of images
    function insert(imageUrl) {
        let existingIndex = images.indexOf(imageUrl);
        if (existingIndex === -1) {
            images.unshift(imageUrl);
        } else {
            images.unshift(images.splice(existingIndex, 1)[0])
        }
    }

    if (whitelist.includes(hostname)) {
        return(['img/' + hostname + '.png']);
    } else {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'text/html'
                },
                mode: 'cors',
                credentials: 'same-origin'
            });

            if (!response.ok) {
                return(images);
            }

            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');

            // get first image from page
            let firstImage = doc.querySelector('img');
            if (firstImage && firstImage.src) {
                // filter known problematic images
                const filters = ['fxxj3ttftm5ltcqnto1o4baovyl', 'nav-sprite-global'];
                if (!filters.some(element => firstImage.src.includes(element))) {
                    let imageUrl = convertUrlToAbsolute(url, firstImage.getAttribute('src')); // can't use .src directly in offscreen doc
                    insert(imageUrl);
                }
            }

            // amazon images
            let mainImage = doc.querySelector('#main-image-container img');
            if (mainImage && mainImage.src) {
                // filter for 'look inside' amazon book images; grab the next image
                if (mainImage.id === 'sitbLogoImg') {
                    let newMainImage = doc.querySelectorAll('#main-image-container img')[1];
                    if (newMainImage && newMainImage.src && newMainImage.id !== 'sitbLogoImg') {
                        insert(newMainImage.src);
                    }
                } else {
                    insert(mainImage.src);
                }
            }

            // get apple touch icon
            let appleIcon = doc.querySelector('link[rel="apple-touch-icon"]');
            if (appleIcon && appleIcon.getAttribute('href')) {
                let imageUrl = convertUrlToAbsolute(url, appleIcon.getAttribute('href'));
                insert(imageUrl);
            }

            // get x-icon
            let xIcon = doc.querySelector('link[rel="icon"]');
            if (xIcon && xIcon.getAttribute('href')) {
                let imageUrl = convertUrlToAbsolute(url, xIcon.getAttribute('href'));
                insert(imageUrl);
            }
            
            // get large icons
            let sizes = [
                "512x512",
                "256x256",
                "192x192",
                "180x180",
                "144x144",
                "96x96"
            ];
            for (let size of sizes) {
                let icon = doc.querySelector(`link[rel="icon"][sizes="${size}"]`);
                if (icon && icon.getAttribute('href')) {
                    let imageUrl = convertUrlToAbsolute(url, icon.getAttribute('href'));
                    insert(imageUrl);
                    break;
                }
            }

            // get open graph images
            let metas = doc.getElementsByTagName("meta");
            for (let meta of metas) {
                if (meta.getAttribute("property") === "og:image" && meta.getAttribute("content")) {
                    let imageUrl = convertUrlToAbsolute(url, meta.getAttribute("content"));
                    insert(imageUrl);
                }
            }

            // if we havent had much luck with images, lets check the style sheets
            if (images.length < 4 && !quickRefresh) {
                const stylesheetLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))
                .map(stylesheet => convertUrlToAbsolute(url, stylesheet.getAttribute('href')));
            
                for (const sheetUrl of stylesheetLinks) {
                    try {
                        const cssResponse = await fetch(sheetUrl);
                        const cssText = await cssResponse.text();
                        const cssImages = extractBackgroundImages(cssText)
                            .filter(image => /logo|icon|splash|hero|main/i.test(image)); // heuristic filter for icon

                        if (cssImages.length) {
                            // todo: fix the absolute url conversion -- i think urls that jump a couple of levels are busted
                            cssImages.forEach(cssImage => {
                                images.push(convertUrlToAbsolute(sheetUrl, cssImage));
                            });
                        }

                    } catch (err) {
                        console.warn(`Could not fetch stylesheet: ${sheetUrl}`, err);
                    }
                }
            }

            return images;

        } catch (error) {
            console.log(error);
        }
    }
}
