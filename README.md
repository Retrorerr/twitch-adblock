# twitch-adblock

![Twitch Adblock logo](assets/twitch-adblock-logo.png)

A privacy-first Twitch video ad filtering source that builds uBlock Origin, userscript, and a polished Chrome MV3 extension.

All three outputs are generated from the same `src/vaft.js` source, so the filtering logic stays aligned across installation methods. The Chrome build is a self-contained, unpacked extension with a compact status popup and no analytics or remote code.

## Chrome MV3 features

- Runs the bundled Twitch hooks at page start, where `window`, `Worker`, and `fetch` are available.
- Shows protection state, hooked-worker count, and diagnostic-event count for the active Twitch tab.
- Includes branded icons and a one-click **Copy diagnostics** action for troubleshooting.
- Uses no background service worker, analytics, or broad runtime permissions.

## Install in Chrome (MV3)

1. Build the extension:

```sh
npm run build
```

2. Open `chrome://extensions` in Chrome and enable **Developer mode**.

3. Click **Load unpacked** and select the `dist/chrome-mv3` directory.

4. Open or reload Twitch. After changing the source, run the build again, click the extension's reload button, and reload the Twitch tab.

The MV3 build runs the same page script as the other outputs in Chrome's `MAIN` world at `document_start`, which is required for its Twitch `window`, `Worker`, and `fetch` hooks. The popup reports live protection status for the current tab, hooked-worker and diagnostic-event counts, and a one-click diagnostics export.

## Install in uBlock Origin

1. Open the uBlock Origin dashboard.
   - Click the uBlock Origin icon.
   - Click the gear icon to open the dashboard.

2. Enable advanced settings.
   - Go to the **Settings** tab.
   - Check **I am an advanced user**.
   - Click the small gear icon that appears next to it.

3. Add the custom script resource.
   - Find `userResourcesLocation`.
   - Replace `unset` with this URL:

```text
https://raw.githubusercontent.com/Retrorerr/twitch-adblock/45e7575f60b17d549c860496c5789ebbe134fb8a/dist/vaft-ublock-origin.js
```

This URL is pinned to `v0.1.9`, so uBlock Origin fetches the exact script version shown in the overlay.

If `userResourcesLocation` already has something in it, add a space after the existing value and paste the URL after it.

4. Add the Twitch filter.
   - Go to the **My filters** tab.
   - Make sure **Enable my custom filters** is checked.
   - Add this line:

```text
twitch.tv##+js(twitch-videoad)
```

5. Apply the changes.
   - Click **Apply changes**.
   - If this is a new install or version change, go to **Filter lists**, purge/update the `uBlock filters` cache, then click **Update now**.
   - Restart the browser, or disable and re-enable uBlock Origin from the browser extensions page.

The filter name intentionally omits `.js`: `twitch-videoad` maps to the `twitch-videoad.js` resource inside `vaft-ublock-origin.js`.

## Files

- `src/vaft.js` - source resource.
- `src/chrome-mv3/` - MV3 bridge, popup, styles, and icon sources.
- `assets/twitch-adblock-logo.png` - source logo artwork.
- `dist/vaft-ublock-origin.js` - uBlock Origin resource.
- `dist/vaft.user.js` - userscript build.
- `dist/chrome-mv3/` - unpacked Chrome Manifest V3 extension build.
- `scripts/build.js` - build script for all three outputs.
- `scripts/check-extension.js` - MV3 manifest, asset, parity, and syntax checks.
- `scripts/check-bridge.js` - page/isolated-world bridge simulation.

## Development

```sh
npm run build
npm run check
```

`npm run check` rebuilds the artifacts and verifies the MV3 manifest, icon dimensions/transparency, source parity, JavaScript syntax, and page/isolated bridge handshake.

## Debugging

To test whether uBlock Origin is running custom resources at all, temporarily add this line to **My filters**:

```text
twitch.tv##+js(twitch-adblock-test)
```

Open Twitch and run:

```js
window.twitchAdblockSelfTest
```

If that is undefined, uBlock Origin has not loaded or applied the custom resource file.
Recheck the resource URL, **Enable my custom filters**, click **Apply changes**, update the `uBlock filters` cache, and restart the browser or disable and re-enable uBlock Origin.

Remove the self-test filter after this check:

```text
twitch.tv##+js(twitch-adblock-test)
```

Open Twitch, then run this in the browser console and reload the page:

```js
localStorage.setItem('twitch-adblock-debug', '1');
location.reload();
```

After an ad leaks or the overlay appears, run:

```js
copy(JSON.stringify(window.twitchAdblockDebug.dump(), null, 2));
```

If `window.twitchAdblockDebug` is undefined after reloading Twitch, uBlock Origin did not run the resource. Recheck `userResourcesLocation`, the `twitch.tv##+js(twitch-videoad)` filter, and reload uBlock Origin from the browser extensions page.

The Chrome MV3 build exposes the same `window.twitchAdblockDebug` helpers after the extension has been reloaded and the Twitch tab refreshed.
You can also open the extension popup and choose **Copy diagnostics** while a Twitch tab is active.

Paste the copied debug output into an issue or discussion. To turn logging off:

```js
window.twitchAdblockDebug.disable();
```

## Notes

Based on `vaft` from [pixeltris/TwitchAdSolutions](https://github.com/pixeltris/TwitchAdSolutions), licensed under MIT.

Use one Twitch video ad scriptlet at a time. Multiple overlapping Twitch adblockers can conflict with playback.
