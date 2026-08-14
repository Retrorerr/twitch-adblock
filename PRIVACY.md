# Privacy

Last updated: 2026-08-14

Twitch Adblock is a small, local-only browser extension for filtering Twitch video ads. It does not collect, sell, or transmit personal information, Twitch account information, browsing history, or diagnostics to a developer-controlled server.

## What the extension can access

The extension runs only on pages matching `twitch.tv`, `www.twitch.tv`, and `m.twitch.tv`. It needs access to those Twitch pages because its filtering logic hooks Twitch's page, `Worker`, and `fetch` behavior at document start.

The extension does not request broad browser API permissions, use a background service worker, load remote code, include analytics, or contact an external telemetry service.

## Diagnostics

Diagnostics are created only when the user clicks **Copy diagnostics** in the extension popup. The resulting JSON describes the current Twitch page's local protection state, such as hooked-worker and diagnostic-event counts, and is written to the user's clipboard. It is not uploaded or shared by the extension.

## Storage and retention

The extension does not maintain a developer-controlled account or remote database. Temporary runtime state exists in the browser while Twitch is open. Debug logging can be enabled by the user through the documented browser-console command and can be disabled with the corresponding debug helper.

## Changes and contact

If this policy changes, the updated version will be published with the extension source. For questions or privacy concerns, open an issue in the [GitHub repository](https://github.com/Retrorerr/twitch-adblock/issues).

