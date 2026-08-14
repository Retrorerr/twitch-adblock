# Store listing copy

This document is the source of truth for the Chrome Web Store and Microsoft Edge Add-ons submissions.

## Name

Twitch Adblock

## Short description

Block Twitch video ads with a small, local-only extension for Chrome and Microsoft Edge.

## Full description

Twitch Adblock filters Twitch video ads with a bundled, privacy-first script that runs only on Twitch pages.

The extension:

- activates automatically on Twitch;
- shows whether protection is active in its popup;
- reports local worker and diagnostic counts to help troubleshoot playback issues;
- includes a user-triggered **Copy diagnostics** action; and
- contains no analytics, remote code, advertising, account system, or background service worker.

The filtering source is available in the public GitHub repository. The project also provides uBlock Origin and userscript builds for advanced users.

## Single purpose

Filter Twitch video ads and provide a small status and diagnostics popup for that purpose.

## Site access and data use

The extension runs on `twitch.tv`, `www.twitch.tv`, and `m.twitch.tv` because it must hook Twitch page, `Worker`, and `fetch` behavior at document start. Runtime page state is processed locally in the browser to provide the filtering and status features.

No page data, account information, browsing history, or diagnostics are sent to a developer-controlled server. Diagnostics are created only when the user clicks **Copy diagnostics** and are written to the local clipboard.

See the public [privacy policy](https://github.com/Retrorerr/twitch-adblock/blob/main/PRIVACY.md).

## Permissions justification

The extension declares no broad API permissions. Its content scripts are limited to the three Twitch host patterns required for its single purpose. The popup uses the active-tab query and message bridge only to report local protection state and copy user-requested diagnostics.

## Support

- Repository: https://github.com/Retrorerr/twitch-adblock
- Issues: https://github.com/Retrorerr/twitch-adblock/issues
- Privacy policy: https://github.com/Retrorerr/twitch-adblock/blob/main/PRIVACY.md

## Store asset checklist

- Reuse `assets/twitch-adblock-logo.png` for the listing logo where the store accepts it.
- Use the generated extension icons from `dist/chrome-mv3/icons/` for package and listing metadata.
- Capture screenshots showing the popup reporting **Protection active** on a Twitch page and the manual fallback install flow.
- Do not show private account information, usernames, messages, or unrelated browser tabs in screenshots.

## Submission checklist

1. Run `npm run check`.
2. Use the ZIP attached to the matching GitHub Release; it must contain `manifest.json` at its root.
3. Use the exact version from `dist/chrome-mv3/manifest.json`.
4. Link to `PRIVACY.md`.
5. Confirm that the store listing describes Twitch-only site access and local diagnostics.
6. Replace the pending store labels in `README.md` with the final Chrome Web Store and Edge Add-ons URLs after approval.

