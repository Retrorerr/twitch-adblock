# Twitch VAFT uBlock Resource

Personal uBlock Origin resource packaging for a VAFT-style Twitch script.

This repository is intentionally small: put your script in `src/vaft.js`, run the build command, and point uBlock Origin at the generated raw `dist/vaft-ublock-origin.js` file.

## Files

- `src/vaft.js` - your editable source script. This can be plain JavaScript or a full uBlock Origin resource beginning with `twitch-videoad.js text/javascript`.
- `dist/vaft-ublock-origin.js` - generated uBlock Origin resource.
- `dist/vaft.user.js` - generated userscript variant for userscript managers.
- `scripts/build.js` - no-dependency build script.

## Build

```powershell
npm run build
```

## uBlock Origin Setup

1. Open the uBlock Origin dashboard.
2. Go to **My filters** and add:

```text
twitch.tv##+js(twitch-videoad)
```

3. Go to **Settings**, enable **I am an advanced user**, then open the advanced settings cog.
4. Set `userResourcesLocation` to the raw GitHub URL for `dist/vaft-ublock-origin.js`.

Example after pushing this repository to GitHub:

```text
userResourcesLocation https://raw.githubusercontent.com/<your-user>/<your-repo>/main/dist/vaft-ublock-origin.js
```

If you already have a `userResourcesLocation`, append this URL after a space.

For a fixed, non-auto-updating version, use a commit permalink instead of the `main` branch URL.

## Updating

After editing `src/vaft.js`:

```powershell
npm run build
git add src/vaft.js dist/vaft-ublock-origin.js dist/vaft.user.js
git commit -m "Update VAFT script"
git push
```

Then reload uBlock Origin or restart the browser so the updated resource is picked up.

## Notes

Do not combine multiple Twitch-specific adblock scriptlets at the same time. If playback becomes flaky, disable other Twitch adblockers first so you can isolate the cause.
