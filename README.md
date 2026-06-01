# twitch-adblock

A minimal uBlock Origin resource for Twitch video ad filtering.

## Install

Add the resource URL to uBlock Origin's advanced setting `userResourcesLocation`:

```text
https://raw.githubusercontent.com/Retrorerr/twitch-adblock/main/dist/vaft-ublock-origin.js
```

Then add the scriptlet filter:

```text
twitch.tv##+js(twitch-videoad)
```

Reload uBlock Origin after changing custom resources.

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

Use one Twitch video ad scriptlet at a time. Multiple overlapping Twitch adblockers can conflict with playback.
