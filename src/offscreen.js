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
    let forcePageReload = message.data.forcePageReload;
    let id = message.data.id;
    let parentId = message.data.parentId;
    let resizedImages = [];
    let thumbs = [];
    let bgColor = null;
    let pageInfo = { title: null };
    let pageData = message.data.pageData || null;

    let url = message.data.url;

    let images = await fetchImages(url, quickRefresh, pageInfo, pageData).catch(err => {
        console.log(err);
    })

    const topCropGoogleThumb = shouldTopCropGoogleThumb(url);

    if (images && images.length) {
        resizedImages = await Promise.all(images.map(async (image, index) => {
            const topCrop = topCropGoogleThumb && typeof image === 'string' && image.startsWith('https://drive.google.com/thumbnail?id=');
            const result = await resizeImage(image, false, false, topCrop).catch(err => {
                console.log(err);
            });
            return result
        }))
    }

    let processedScreenshot = null;
    if (screenshot) {
        // screenshot is handled separately to remove scrollbars
        processedScreenshot = await resizeImage(screenshot, true).catch(err => {
            console.log(err);
        });
    }

    if (resizedImages && resizedImages.length) {
        // If we have a screenshot, reserve the last spot for it and only take 4 webpage images
        const maxWebpageImages = processedScreenshot ? 5 : 6;
        thumbs = resizedImages.filter(item => item).slice(0, maxWebpageImages);
        
        // Always add the screenshot as the last image if available
        if (processedScreenshot) {
            thumbs.push(processedScreenshot);
        }
    } else if (processedScreenshot) {
        // No webpage images, but we have a screenshot
        thumbs = [processedScreenshot];
    }

    if (thumbs.length) {
        bgColor = await getBgColor(thumbs[0])
        
        //await saveThumbnails(url, thumbs, bgColor)
    }

    chrome.runtime.sendMessage({target: 'background', type: 'saveThumbnails', data: {url, id, parentId, thumbs, bgColor, title: pageInfo.title}, forcePageReload});

      //chrome.runtime.sendMessage(images);
}

function colorsAreSimilar(color1, color2, tolerance = 2) {
    return Math.abs(color1[0] - color2[0]) <= tolerance &&
           Math.abs(color1[1] - color2[1]) <= tolerance &&
           Math.abs(color1[2] - color2[2]) <= tolerance &&
           Math.abs(color1[3] - color2[3]) <= tolerance;
}

async function fetchImageAsDataURI(imageUrl) {
    if (imageUrl.startsWith('data:')) return imageUrl;
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error('Fetch failed');
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        return null;
    }
}

function getBgColor(image) {
    // todo: ensure this is performant
    // todo: ensure our similar color counting is accurate, same as index
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
            let colorCounts = [];
            let hasTransparentPixel = false;

            // background color algorithm
            // think the results are best when sampling 2 pixels deep from the edges
            // 1px gives bad results from image artifacts, more than 2px means we average away any natural framing/background in the image
            
            // Sample the top and bottom edges
            for (let x = 0; x < imgWidth; x += 2) { // Sample every other pixel
                for (let y = 0; y < 2; y++) {
                    let pixelTop = context.getImageData(x, y, 1, 1).data;
                    let pixelBottom = context.getImageData(x, imgHeight - 1 - y, 1, 1).data;
                    avgColor[0] += pixelTop[0] + pixelBottom[0];
                    avgColor[1] += pixelTop[1] + pixelBottom[1];
                    avgColor[2] += pixelTop[2] + pixelBottom[2];
                    avgColor[3] += pixelTop[3] + pixelBottom[3];
                    totalPixels += 2;
                    if (pixelTop[3] < 255 || pixelBottom[3] < 255) {
                        hasTransparentPixel = true;
                    }

                    let found = false;
                    for (let colorCount of colorCounts) {
                        if (colorsAreSimilar(colorCount.color, pixelTop)) {
                            colorCount.count++;
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        colorCounts.push({ color: pixelTop, count: 1 });
                    }

                    found = false;
                    for (let colorCount of colorCounts) {
                        if (colorsAreSimilar(colorCount.color, pixelBottom)) {
                            colorCount.count++;
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        colorCounts.push({ color: pixelBottom, count: 1 });
                    }
                }
            }

            // Sample the left and right edges
            for (let y = 2; y < imgHeight - 2; y += 2) { // Sample every other pixel
                for (let x = 0; x < 2; x++) {
                    let pixelLeft = context.getImageData(x, y, 1, 1).data;
                    let pixelRight = context.getImageData(imgWidth - 1 - x, y, 1, 1).data;
                    avgColor[0] += pixelLeft[0] + pixelRight[0];
                    avgColor[1] += pixelLeft[1] + pixelRight[1];
                    avgColor[2] += pixelLeft[2] + pixelRight[2];
                    avgColor[3] += pixelLeft[3] + pixelRight[3];
                    totalPixels += 2;
                    if (pixelLeft[3] < 255 || pixelRight[3] < 255) {
                        hasTransparentPixel = true;
                    }

                    let found = false;
                    for (let colorCount of colorCounts) {
                        if (colorsAreSimilar(colorCount.color, pixelLeft)) {
                            colorCount.count++;
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        colorCounts.push({ color: pixelLeft, count: 1 });
                    }

                    found = false;
                    for (let colorCount of colorCounts) {
                        if (colorsAreSimilar(colorCount.color, pixelRight)) {
                            colorCount.count++;
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        colorCounts.push({ color: pixelRight, count: 1 });
                    }
                }
            }

            avgColor = avgColor.map(color => color / totalPixels);
            avgColor[3] = avgColor[3] / 255; // Normalize alpha value

            let mostCommonColor = null;
            let maxCount = 0;
            for (let colorCount of colorCounts) {
                if (colorCount.count > maxCount) {
                    maxCount = colorCount.count;
                    mostCommonColor = colorCount.color;
                }
            }

            // todo: clean this up - set background and color separately

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

function resizeImage(image, screenshot = false, isFallback = false, topCrop = false) {
    return new Promise((resolve, reject) => {
        if (!image || !image.length) {
            return resolve();
        }

        const targetWidth = 440;
        const targetHeight = 248;
        const targetRatio = targetWidth / targetHeight;
        const tolerance = 0.25;

        // we dont need to resize svgs
        if (image.startsWith('data:image/svg+xml')) {
            return resolve(image);
        }
        
        // if we only have a reference, store as image. todo: just fetch the svg instead
        if (image.endsWith('.svg')) {
            const img = new Image();
            
            img.onerror = async (event) => {
                if (!isFallback && !image.startsWith('data:')) {
                    const dataUri = await fetchImageAsDataURI(image).catch(() => null);
                    if (dataUri) {
                        const result = await resizeImage(dataUri, screenshot, true, topCrop);
                        return resolve(result);
                    }
                }
                resolve();
            };
            
            img.onload = function() {
                let canvas = document.createElement('canvas');
                let ctx = canvas.getContext('2d');
                
                // Set canvas to target size for SVGs
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                
                // Draw SVG centered and scaled to fit
                let scale = Math.min(targetWidth / this.width, targetHeight / this.height);
                let x = (targetWidth - this.width * scale) / 2;
                let y = (targetHeight - this.height * scale) / 2;
                
                ctx.drawImage(this, x, y, this.width * scale, this.height * scale);
                
                const newDataURI = canvas.toDataURL('image/webp', 0.86);
                resolve(newDataURI);
            };
            
            img.src = image;
            return;
        }

        const img = new Image();

        img.onerror = async (event) => {
            if (!isFallback && !image.startsWith('data:')) {
                const dataUri = await fetchImageAsDataURI(image).catch(() => null);
                if (dataUri) {
                    const result = await resizeImage(dataUri, screenshot, true, topCrop);
                    return resolve(result);
                }
            }
            resolve();
        };

        img.onload = function () {
            let sWidth = this.naturalWidth || this.width;
            let sHeight = this.naturalHeight || this.height;

            // resize any image > target size
            if (sWidth >= targetWidth || sHeight >= (targetHeight - 22)) {

                let nocrop = false;

                if (screenshot) {
                    sWidth -= 17;
                    sHeight -= 17;
                }

                const sRatio = sWidth / sHeight;
                let canvas = document.createElement('canvas');
                let ctx = canvas.getContext('2d');

                let sX = 0, sY = 0, dWidth = targetWidth, dHeight = targetHeight;

                if (topCrop) {
                    // trim 5% off the page margins for google doc thumbnails
                    // if this looks shitty we can remove it (todo: test)
                    const marginX = sWidth * 0.05;
                    sX = marginX;
                    sWidth = sWidth - 2 * marginX;
                    sY = sHeight * 0.05;
                    sHeight = sWidth / targetRatio;
                } else if (screenshot) {
                    if (sRatio > targetRatio) {
                        // Wider than target, crop sides
                        const newWidth = sHeight * targetRatio;
                        sX = (sWidth - newWidth) / 2;
                        sWidth = newWidth;
                    } else {
                        // Taller than target, crop from top (by adjusting sHeight)
                        sHeight = sWidth / targetRatio;
                    }
                } else if (sRatio < targetRatio && sRatio > (targetRatio - tolerance)) {
                    // if image aspect ratio is very close to the speed dial aspect ratio crop it to fit
                    // todo: maybe we can do this programmatically with css imagefit so we dont overly crop images when user wants square format

                    // Aspect is narrower, crop top and bottom
                    let naturalHeight = targetWidth / sRatio;
                    let crop = (naturalHeight - targetHeight) / 2;
                    sY = crop;
                    sHeight -= 2 * crop;
                } else if (sRatio > targetRatio && sRatio < (targetRatio + tolerance)) {
                    // Aspect is wider, crop sides
                    let naturalWidth = targetHeight * sRatio;
                    let crop = (naturalWidth - targetWidth) / 2;
                    sX = crop;
                    sWidth -= 2 * crop;
                } else {
                    nocrop = true;
                    // image is not close to our target ratio. rescale to target width/height without cropping
                    if (sWidth > sHeight) {
                        dHeight = Math.round(targetWidth / sRatio);
                        dWidth = targetWidth;
                    } else {
                        dWidth = Math.round(targetHeight * sRatio);
                        dHeight = targetHeight;
                    }
                }

                canvas.width = dWidth;
                canvas.height = dHeight;
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";
                if (nocrop) {
                    ctx.drawImage(this, sX, sY, dWidth, dHeight);
                } else {
                    ctx.drawImage(this, sX, sY, sWidth, sHeight, 0, 0, dWidth, dHeight);
                }

                const newDataURI = canvas.toDataURL('image/webp', 0.87);
                resolve(newDataURI);
            } else if (sHeight >= 96 || sWidth >= 96) {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = sWidth;
                canvas.height = sHeight;
                ctx.drawImage(this, 0, 0, sWidth, sHeight);
                resolve(canvas.toDataURL('image/webp', 0.87));
            } else {
                // discard images < 96px
                resolve();
            }
        };

        img.crossOrigin = "Anonymous";
        img.src = image;
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

function getGoogleDriveFileId(urlObj) {
    const hostname = urlObj.hostname.toLowerCase();
    if (hostname === 'docs.google.com') {
        const match = urlObj.pathname.match(/^\/(?:document|spreadsheets|presentation|drawings)\/d\/([^/?#]+)/);
        if (match) {
            return match[1];
        }
    }
    if (hostname === 'drive.google.com') {
        const fileMatch = urlObj.pathname.match(/^\/file\/d\/([^/?#]+)/);
        if (fileMatch) {
            return fileMatch[1];
        }
        return urlObj.searchParams.get('id');
    }
    return null;
}

function getGoogleDriveThumbnailUrl(urlObj) {
    const fileId = getGoogleDriveFileId(urlObj);
    return fileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w512` : null;
}

// docs and sheets render as tall portrait pages; top-crop them to fill the dial.
// slides and drawings are landscape and fit naturally, so leave them as-is.
function shouldTopCropGoogleThumb(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.toLowerCase() === 'docs.google.com' &&
            /^\/(?:document|spreadsheets)\/d\//.test(urlObj.pathname);
    } catch (err) {
        return false;
    }
}

// pageInfo receives the page title so it can ride along with the images.
// pageData is the collectPageImages result from a live tab; when absent the page is fetched and parsed here
async function fetchImages(url, quickRefresh, pageInfo = {}, pageData = null) {

    if (url.startsWith('file://')) {
        return ['img/file.png'];
    }
    if (url.startsWith('chrome://')) {
        return ['img/widget.png'];
    }

    const whitelist = [
        "mail.google.com",
        "gmail.com",
        "chromewebstore.google.com",
        "twitter.com"
    ];

    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // generic fallbacks, not evidence the scrape found anything
    let fallbacks = [];

    // default favicons
    fallbacks.push(urlObj.origin + "/favicon.ico")
    
    // amazon hack
    if (hostname.includes('amazon')) {
        fallbacks.push('img/amazon.com.png');
        // dont fetch other images for the root page
        if (hostname.startsWith('amazon') && hostname.length < 14) {
            return fallbacks;
        }
    } else {
        // favicon fallback
        fallbacks.push(`https://cdn.brandfetch.io/domain/${hostname}/w/512/logo/fallback/404/?c=key`);
        fallbacks.push(`https://cdn.brandfetch.io/domain/${hostname}/w/512/icon/fallback/404/?c=key`);
        fallbacks.push(`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(urlObj.origin)}&size=256`);
    }

    const googleDriveThumbnailUrl = getGoogleDriveThumbnailUrl(urlObj);
    if (googleDriveThumbnailUrl) {
        return [googleDriveThumbnailUrl, ...fallbacks];
    }

    if (whitelist.includes(hostname)) {
        return(['img/' + hostname + '.png']);
    }

    // Set up fetch timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), quickRefresh ? 3000 : 4000);

    try {
        if (!pageData) {
            // allows og images to work, with creds they are behind js
            const omitDomains = ['facebook.com', 'github.com'];
            const credentials = omitDomains.some(domain => hostname.endsWith(domain)) ? 'omit' : 'same-origin'; // should be include bro?

            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                credentials,
                signal: controller.signal
            });

            if (!response.ok) {
                return fallbacks;
            }

            const text = await response.text();
            const doc = new DOMParser().parseFromString(text, 'text/html');
            // resolve relative urls against the final redirected url
            pageData = collectPageImages(doc, response.url || url);
        }

        pageInfo.title = pageData.title || null;

        const candidates = pageData.candidates || [];
        let images = [...candidates, ...fallbacks];
        if (pageData.svgLogo) {
            images.push(pageData.svgLogo);
        }

        // if we havent had much luck with images, lets check the manifest and style sheets
        // we dont do so during a quick refresh to avoid fetching extra resources
        if (!candidates.length && !quickRefresh) {
            // web application manifest icon
            if (pageData.manifestUrl) {
                try {
                    const manifestResponse = await fetch(pageData.manifestUrl, {
                        signal: controller.signal
                    });
                    if (manifestResponse.ok) {
                        const manifest = await manifestResponse.json();
                        if (manifest.icons && Array.isArray(manifest.icons)) {
                            // Sort icons by size (largest first) and get the best ones
                            const sortedIcons = manifest.icons
                                .filter(icon => icon.src) // Only icons with src
                                .sort((a, b) => {
                                    // Extract numeric size for comparison
                                    const getSizeValue = (sizes) => {
                                        if (!sizes) return 0;
                                        const match = sizes.match(/(\d+)x(\d+)/);
                                        return match ? parseInt(match[1]) * parseInt(match[2]) : 0;
                                    };
                                    return getSizeValue(b.sizes) - getSizeValue(a.sizes);
                                });
                            // take the largest
                            if (sortedIcons.length > 0) {
                                images.push(new URL(sortedIcons[0].src, pageData.manifestUrl).href);
                            }
                        }
                    }
                } catch (manifestError) {
                    console.warn(`[fetchImages] Error fetching manifest:`, manifestError);
                }
            }

            for (const sheetUrl of pageData.stylesheets || []) {
                try {
                    const cssResponse = await fetch(sheetUrl, {
                        signal: controller.signal
                    });
                    if (!cssResponse.ok) throw new Error(`failed to fetch css`);
                    const cssText = await cssResponse.text();
                    const cssImages = extractBackgroundImages(cssText)
                        .filter(image => /logo|icon|splash|hero|main/i.test(image)); // heuristic filter for icon

                    cssImages.forEach(cssImage => {
                        try {
                            images.push(new URL(cssImage, sheetUrl).href);
                        } catch (err) {}
                    });

                } catch (err) {
                    console.warn(`Could not fetch stylesheet: ${sheetUrl}`, err);
                }
            }
        }

        return [...new Set(images)];

    } catch (error) {
        //console.log("fetch error: ", error)
        // return the images we have:
        return fallbacks;
    } finally {
        clearTimeout(timeoutId); // Ensure timeout is cleared in case of early exit
    }
}

