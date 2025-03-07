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
    let resizedImages = [];
    let thumbs = [];
    let title = null;

    let url = message.data.url;

    let images = await fetchImages(url).catch(err => {
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
        thumbs = resizedImages.filter(item => item)
    }

    if (thumbs.length) {
        const bgColor = await getBgColor(thumbs[0])
        chrome.runtime.sendMessage({target: 'background', type: 'saveThumbnails', data: {url, thumbs, bgColor}});
        //await saveThumbnails(url, thumbs, bgColor)
    }

    return title; //todo: why did i do this?

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
    return new Promise(function(resolve, reject) {
        let img = new Image();
        img.onload = function () {
            let imgWidth = img.naturalWidth;
            let imgHeight = img.naturalHeight;
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
            let context = canvas.getContext('2d', {willReadFrequently:true});
            context.drawImage(img, 0, 0);

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
            //console.log(direction, rgba, rgbaa);
            resolve(`linear-gradient(to ${direction}, rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3]}) 50%, rgba(${rgbaa[0]},${rgbaa[1]},${rgbaa[2]},${rgbaa[3]}) 50%)`);
        }
        img.onerror = function() {
            resolve();
        };
        img.crossOrigin = "Anonymous";
        img.src = image
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

                    const newDataURI = canvas.toDataURL('image/webp', 0.94);
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

async function fetchImages(url) {

    const whitelist = [
        "mail.google.com",
        "gmail.com",
        "www.facebook.com",
        "www.reddit.com",
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

            return images;

        } catch (error) {
            console.log(error);
        }
    }
}
