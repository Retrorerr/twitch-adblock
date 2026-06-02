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
https://raw.githubusercontent.com/Retrorerr/twitch-adblock/main/dist/vaft-ublock-origin.js?v=0.1.2
```

The `?v=0.1.2` part helps uBlock Origin fetch the current version instead of using an older cached copy.

If `userResourcesLocation` already has something in it, add a space after the existing value and paste the URL after it.

4. Add the Twitch filter.
   - Go to the **My filters** tab.
   - Add this line:

```text
twitch.tv##+js(twitch-videoad)
```

5. Apply the changes.
   - Click **Apply changes**.
   - Restart the browser, or reload uBlock Origin from the browser extensions page.

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

## Notes

Based on `vaft` from [pixeltris/TwitchAdSolutions](https://github.com/pixeltris/TwitchAdSolutions), licensed under MIT.

Use one Twitch video ad scriptlet at a time. Multiple overlapping Twitch adblockers can conflict with playback.
