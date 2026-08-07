// Chrome-only: MV3 service workers have no DOM, so thumbnail HTML parsing
// runs in an offscreen document. Firefox packages omit this file and instead
// load offscreen.js via background.scripts (event page has DOM).

'use strict';

let creatingOffscreen; // avoid concurrent createDocument races

async function setupOffscreenDocument(path) {
	const offscreenUrl = chrome.runtime.getURL(path);
	const existingContexts = await chrome.runtime.getContexts({
		contextTypes: ['OFFSCREEN_DOCUMENT'],
		documentUrls: [offscreenUrl]
	});

	if (existingContexts.length > 0) {
		return;
	}

	if (creatingOffscreen) {
		await creatingOffscreen;
	} else {
		creatingOffscreen = chrome.offscreen.createDocument({
			url: path,
			reasons: [chrome.offscreen.Reason.DOM_PARSER],
			justification: 'parse document for image tags to use as thumbnail'
		});
		await creatingOffscreen;
		creatingOffscreen = null;
	}
}

async function processThumbnailsViaOffscreen(payload, onFailure) {
	await setupOffscreenDocument('offscreen.html');

	try {
		// Do not await offscreen completion — its async listener would hold this
		// call open, and awaiting a round-trip saveThumbnails message can deadlock MV3.
		chrome.runtime.sendMessage({
			target: 'offscreen',
			data: payload
		}).catch((err) => {
			console.log('Failed to message offscreen document:', err?.message || err);
			if (typeof onFailure === 'function') {
				onFailure();
			}
		});
	} catch (err) {
		console.log('Failed to message offscreen document:', err?.message || err);
		return false;
	}
	return true;
}
