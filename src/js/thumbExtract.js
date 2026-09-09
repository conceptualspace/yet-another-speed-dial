// yet another speed dial
// copyright 2019 dev@conceptualspace.net
// absolutely no warranty is expressed or implied

// shared by the script injected into live pages and the offscreen DOMParser path,
// so it must only depend on `doc` and `baseUrl`. function declarations only: the
// content script world persists per tab and re-injection would trip on const/let.

function collectPageImages(doc, baseUrl) {
    const candidates = [];
    const seen = new Set();
    // known junk that shows up as the first <img> on some sites
    const filters = ['fxxj3ttftm5ltcqnto1o4baovyl', 'nav-sprite-global'];

    let hostname = '';
    try {
        hostname = new URL(baseUrl).hostname;
    } catch (err) {}

    function resolve(value) {
        if (typeof value !== 'string' || !value.trim()) return null;
        try {
            const href = new URL(value.trim(), baseUrl).href;
            return /^(https?:|data:)/.test(href) ? href : null;
        } catch (err) {
            return null;
        }
    }

    function add(value) {
        const href = resolve(value);
        if (!href || seen.has(href) || filters.some(filter => href.includes(filter))) return;
        seen.add(href);
        candidates.push(href);
    }

    // currentSrc is only populated on a live document
    function imageSource(img) {
        return img.currentSrc || img.getAttribute('src');
    }

    function iconSize(link) {
        const match = (link.getAttribute('sizes') || '').match(/(\d+)x(\d+)/i);
        return match ? Math.min(parseInt(match[1], 10), parseInt(match[2], 10)) : 0;
    }

    function largestIcon(links) {
        const sized = links.map(link => ({ link, size: iconSize(link) })).filter(entry => entry.size >= 96);
        sized.sort((a, b) => b.size - a.size);
        return sized.length ? sized[0].link : null;
    }

    function addStructuredImage(value) {
        if (!value) return;
        if (Array.isArray(value)) {
            value.forEach(addStructuredImage);
        } else if (typeof value === 'object') {
            add(value.url || value.contentUrl);
        } else {
            add(value);
        }
    }

    function walkStructuredData(node, depth) {
        if (!node || depth > 3) return;
        if (Array.isArray(node)) {
            node.forEach(child => walkStructuredData(child, depth));
            return;
        }
        if (typeof node !== 'object') return;
        addStructuredImage(node.image);
        addStructuredImage(node.logo);
        for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
            walkStructuredData(node[key], depth + 1);
        }
    }

    // open graph
    for (const meta of doc.querySelectorAll('meta[property="og:image" i], meta[name="og:image" i], meta[property="og:image:secure_url" i]')) {
        add(meta.getAttribute('content'));
    }

    // json-ld: often carries a product image when there is no og:image
    for (const script of doc.querySelectorAll('script[type="application/ld+json" i]')) {
        try {
            walkStructuredData(JSON.parse(script.textContent), 0);
        } catch (err) {
            // malformed json-ld is common; ignore it
        }
    }

    // schema.org microdata
    for (const meta of doc.querySelectorAll('meta[itemprop="image"]')) {
        add(meta.getAttribute('content'));
    }

    // amazon product image, skipping the 'look inside' badge on books
    const mainImage = [...doc.querySelectorAll('#main-image-container img')].find(img => img.id !== 'sitbLogoImg');
    if (mainImage) {
        add(imageSource(mainImage));
    }

    // largest image rendered in the viewport; only possible on a live document
    const win = doc.defaultView;
    if (win && win.innerWidth) {
        let best = null;
        let bestArea = 0;
        for (const img of doc.querySelectorAll('img')) {
            if (img.naturalWidth < 96 || img.naturalHeight < 96) continue;
            const rect = img.getBoundingClientRect();
            if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= win.innerHeight || rect.left >= win.innerWidth) continue;
            const area = rect.width * rect.height;
            if (area > bestArea) {
                bestArea = area;
                best = img;
            }
        }
        if (best) {
            add(imageSource(best));
        }
    }

    // icons
    const icons = [...doc.querySelectorAll('link[rel~="icon" i]')];
    const appleIcons = [...doc.querySelectorAll('link[rel~="apple-touch-icon" i], link[rel~="apple-touch-icon-precomposed" i]')];
    const largeIcon = largestIcon(icons);
    const largeAppleIcon = largestIcon(appleIcons);
    if (largeIcon) add(largeIcon.getAttribute('href'));
    if (largeAppleIcon) add(largeAppleIcon.getAttribute('href'));
    // apple touch icons default to 180px, so they rank above generic favicons
    if (appleIcons[0]) add(appleIcons[0].getAttribute('href'));
    if (icons[0]) add(icons[0].getAttribute('href'));

    // first usable image on the page
    for (const img of doc.querySelectorAll('img')) {
        const src = imageSource(img);
        if (src && !filters.some(filter => src.includes(filter))) {
            add(src);
            break;
        }
    }

    // inline svg logo; ranked last by the caller since it is a weak heuristic
    let svgLogo = null;
    const siteName = hostname.split('.')[0];
    for (const svg of doc.querySelectorAll('svg')) {
        const isLogo = (siteName && svg.getAttribute('aria-label')?.toLowerCase().includes(siteName)) ||
            svg.getAttribute('class')?.toLowerCase().includes('logo') ||
            svg.id?.toLowerCase().includes('logo') ||
            (svg.getAttribute('role') === 'img' && parseInt(svg.getAttribute('width'), 10) >= 96);
        if (isLogo) {
            try {
                const svgString = new XMLSerializer().serializeToString(svg);
                svgLogo = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
                break;
            } catch (err) {}
        }
    }

    let title = null;
    for (const candidate of [doc.querySelector('title')?.textContent, doc.querySelector('meta[property="og:title" i]')?.getAttribute('content')]) {
        const cleaned = candidate?.replace(/\s+/g, ' ').trim();
        if (cleaned) {
            title = cleaned;
            break;
        }
    }

    const manifestUrl = resolve(doc.querySelector('link[rel="manifest" i]')?.getAttribute('href'));
    const stylesheets = [...doc.querySelectorAll('link[rel~="stylesheet" i]')]
        .map(link => resolve(link.getAttribute('href')))
        .filter(Boolean);

    return { title, candidates, svgLogo, manifestUrl, stylesheets };
}
