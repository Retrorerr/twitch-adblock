# Twitch Adblock

![Twitch Adblock logo](assets/twitch-adblock-logo.png)

Privacy-first Twitch video ad filtering for Chrome and Microsoft Edge. Download the validated release from GitHub, load it once, and keep browsing Twitch without store accounts or extra services.

The same `src/vaft.js` source produces the Chrome/Edge extension, uBlock Origin resource, and userscript builds.

## Install from GitHub

The GitHub Release ZIP is the supported install path for both Chrome and Edge. It is built and validated by GitHub Actions, with `manifest.json` placed at the ZIP root for a straightforward unpacked install.

[Download the latest Chrome/Edge ZIP](https://github.com/Retrorerr/twitch-adblock/releases/latest/download/twitch-adblock-chromium.zip) · [View all GitHub Releases](https://github.com/Retrorerr/twitch-adblock/releases)

1. Download `twitch-adblock-chromium.zip` from the latest release.
2. Extract the ZIP completely. Do not select the ZIP itself.
3. Open the extensions page:
   - Chrome: [`chrome://extensions`](chrome://extensions)
   - Edge: [`edge://extensions`](edge://extensions)
4. Turn on **Developer mode**.
5. Click **Load unpacked** and select the extracted folder whose contents include `manifest.json`.
6. Open Twitch or reload an existing Twitch tab.

When a new release is available, download and extract the new ZIP, then use the extension page's reload control or remove the old unpacked copy before loading the new folder.

## What it does

- Starts the bundled Twitch hooks at page start, where Twitch's `window`, `Worker`, and `fetch` objects are available.
- Shows protection status, hooked-worker count, and diagnostic-event count for the active Twitch tab.
- Includes a compact popup with branded icons and a user-triggered **Copy diagnostics** action.
- Declares no broad browser API permissions and has no background service worker, analytics, or remote code.

## Troubleshooting

### “Manifest file is missing”

You selected the ZIP, its parent folder, or an extra nested folder. Extract the ZIP and choose the folder that directly contains `manifest.json`.

### The popup says “Waiting for Twitch”

Open a Twitch channel and reload the tab after installing or reloading the extension. The extension intentionally stays inactive on non-Twitch pages.

### The extension was updated but Twitch still behaves like before

Click the extension's reload button on the extensions page, then hard-refresh the Twitch tab. Do not keep two unpacked copies enabled at the same time.

### Ads or playback problems continue

Disable other Twitch video-ad scriptlets or extensions temporarily; overlapping Twitch adblockers can conflict. If the issue remains, open the popup on Twitch and use **Copy diagnostics** before opening an issue.

## Alternative: uBlock Origin

The uBlock Origin resource remains available for advanced users who already use uBlock Origin.

1. Open the uBlock Origin dashboard from the extension menu.
2. In **Settings**, enable **I am an advanced user**, then click the small gear beside it.
3. Find `userResourcesLocation` and add this pinned resource URL:

```text
https://raw.githubusercontent.com/Retrorerr/twitch-adblock/45e7575f60b17d549c860496c5789ebbe134fb8a/dist/vaft-ublock-origin.js
```

If the setting already contains a value, add a space before the URL instead of deleting the existing value.

4. In **My filters**, make sure **Enable my custom filters** is checked and add:

```text
twitch.tv##+js(twitch-videoad)
```

5. Click **Apply changes**. For a first install or version change, purge/update the uBlock filter cache and restart the browser or reload uBlock Origin.

The filter name intentionally omits `.js`: `twitch-videoad` maps to the `twitch-videoad.js` resource inside `vaft-ublock-origin.js`.

## Development

```sh
npm run build
npm run check
```

`npm run check` rebuilds every output and verifies the MV3 manifest, version alignment, icon dimensions/transparency, source parity, JavaScript syntax, and page/isolated-world bridge handshake.

The release workflow packages only `dist/chrome-mv3`, validates its file allowlist, checks that `manifest.json` is at the ZIP root, and publishes the package when a tag matches `package.json`.

## Files

- `src/vaft.js` - shared Twitch filtering source.
- `src/chrome-mv3/` - MV3 bridge, popup, styles, and icon sources.
- `assets/twitch-adblock-logo.png` - source logo artwork.
- `dist/vaft-ublock-origin.js` - uBlock Origin resource.
- `dist/vaft.user.js` - userscript build.
- `dist/chrome-mv3/` - unpacked Chrome/Edge MV3 build.
- `scripts/build.js` - build script for all outputs.
- `scripts/package-extension.js` - release-package staging and validation.
- `scripts/check-extension.js` - MV3 manifest, asset, parity, version, and syntax checks.
- `scripts/check-bridge.js` - page/isolated-world bridge simulation.

## Debugging

To test whether uBlock Origin is running custom resources, temporarily add this line to **My filters**:

```text
twitch.tv##+js(twitch-adblock-test)
```

Open Twitch and run:

```js
window.twitchAdblockSelfTest
```

If that is undefined, recheck the resource URL, **Enable my custom filters**, **Apply changes**, the uBlock filter-cache update, and the browser restart/reload.

For detailed Twitch debugging, enable logging and reload the page:

```js
localStorage.setItem('twitch-adblock-debug', '1');
location.reload();
```

Then copy the debug dump:

```js
copy(JSON.stringify(window.twitchAdblockDebug.dump(), null, 2));
```

Turn logging off with:

```js
window.twitchAdblockDebug.disable();
```

## Notes

Based on [`vaft`](https://github.com/pixeltris/TwitchAdSolutions), licensed under MIT.

Use one Twitch video ad scriptlet at a time. Multiple overlapping Twitch adblockers can conflict with playback.

