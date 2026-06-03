# twitch-adblock

A minimal uBlock Origin resource for Twitch video ad filtering.

## Install

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
https://raw.githubusercontent.com/Retrorerr/twitch-adblock/6496d7507bef7c0e5650b0821f8ae23d7e6b9c81/dist/vaft-ublock-origin.js
```

This URL is pinned to `v0.1.7`, so uBlock Origin fetches the exact script version shown in the overlay.

If `userResourcesLocation` already has something in it, add a space after the existing value and paste the URL after it.

4. Add the Twitch filter.
   - Go to the **My filters** tab.
   - Make sure **Enable my custom filters** is checked.
   - If **Trust my filters** is shown, check it. If it is not shown, make sure the advanced setting `trustedListPrefixes` contains `user-`, for example `ublock- user-`.
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
- `dist/vaft-ublock-origin.js` - uBlock Origin resource.
- `dist/vaft.user.js` - userscript build.
- `scripts/build.js` - build script.

## Development

```sh
npm run build
npm run check
```

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
Recheck the resource URL, **Enable my custom filters**, **Trust my filters**, click **Apply changes**, update the `uBlock filters` cache, and restart the browser or disable and re-enable uBlock Origin.

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

Paste the copied debug output into an issue or discussion. To turn logging off:

```js
window.twitchAdblockDebug.disable();
```

## Notes

Based on `vaft` from [pixeltris/TwitchAdSolutions](https://github.com/pixeltris/TwitchAdSolutions), licensed under MIT.

Use one Twitch video ad scriptlet at a time. Multiple overlapping Twitch adblockers can conflict with playback.
