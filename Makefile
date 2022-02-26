package:
	cp -r src/ ./firefox-extension
	cp -r src/ ./edge-extension
	cp -r src/ ./chrome-extension
	cat ./chrome-extension/manifest.json | jq 'del(.chrome_settings_overrides, .browser_specific_settings)' > ./chrome-extension/manifest.json.tmp
	mv ./chrome-extension/manifest.json.tmp ./chrome-extension/manifest.json

zip:
	cd firefox-extension; zip -r ../firefox-extension.zip .; cd ..
	cd chrome-extension; zip -r ../chrome-extension.zip .; cd ..
	cd edge-extension; zip -r ../edge-extension.zip .; cd ..

clean:
	rm -rf *-extension/