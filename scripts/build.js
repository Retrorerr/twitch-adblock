const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const sourcePath = path.join(root, 'src', 'vaft.js');
const distDir = path.join(root, 'dist');
const ublockPath = path.join(distDir, 'vaft-ublock-origin.js');
const userscriptPath = path.join(distDir, 'vaft.user.js');
const chromeExtensionDir = path.join(distDir, 'chrome-mv3');
const chromeManifestPath = path.join(chromeExtensionDir, 'manifest.json');
const chromeContentScriptPath = path.join(chromeExtensionDir, 'content.js');
const chromeIconDir = path.join(chromeExtensionDir, 'icons');
const chromeSourceDir = path.join(root, 'src', 'chrome-mv3');
const chromeMainBridgeSourcePath = path.join(chromeSourceDir, 'main-bridge.js');
const chromeBridgeSourcePath = path.join(chromeSourceDir, 'bridge.js');
const chromePopupHtmlSourcePath = path.join(chromeSourceDir, 'popup.html');
const chromePopupCssSourcePath = path.join(chromeSourceDir, 'popup.css');
const chromePopupJsSourcePath = path.join(chromeSourceDir, 'popup.js');
const chromeIconSourceDir = path.join(chromeSourceDir, 'icons');
const chromeIconNames = ['icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-128.png'];
const chromeMatches = [
  'https://twitch.tv/*',
  'https://www.twitch.tv/*',
  'https://m.twitch.tv/*',
];

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const source = fs.readFileSync(sourcePath, 'utf8').trim();

if (!source || source.includes('Paste your VAFT script here')) {
  throw new Error('src/vaft.js still contains the placeholder. Paste your VAFT script before building.');
}

fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(chromeExtensionDir, { recursive: true });
fs.mkdirSync(chromeIconDir, { recursive: true });

const parsed = parseSource(source);
assertValidJavaScript(parsed.script);

const chromeMainBridge = fs.readFileSync(chromeMainBridgeSourcePath, 'utf8').trim();
const chromeBridge = fs.readFileSync(chromeBridgeSourcePath, 'utf8').trim();
const chromePopupJs = fs.readFileSync(chromePopupJsSourcePath, 'utf8').trim();
assertValidJavaScript(chromeMainBridge);
assertValidJavaScript(chromeBridge);
assertValidJavaScript(chromePopupJs);

const selfTestResource = `twitch-adblock-test.js text/javascript
(function() {
  window.twitchAdblockSelfTest = {
    ok: true,
    version: '${packageJson.version}',
    loadedAt: new Date().toISOString(),
    href: location.href
  };
  console.log('[twitch-adblock] self-test loaded', window.twitchAdblockSelfTest);
})();`;

const ublockResource = `${parsed.resourceName} ${parsed.mimeType}\n${parsed.script}\n\n${selfTestResource}\n`;
assertValidUblockResource(ublockResource);

const userscript = `// ==UserScript==
// @name         Personal Twitch VAFT
// @namespace    personal-twitch-vaft
// @version      ${packageJson.version}
// @description  Personal VAFT-style Twitch script.
// @match        https://www.twitch.tv/*
// @match        https://m.twitch.tv/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

${parsed.script}
`;

const chromeManifest = {
  manifest_version: 3,
  name: 'Twitch Adblock',
  version: packageJson.version,
  description: 'Blocks Twitch video ads with the bundled Twitch adblock script.',
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_title: 'Twitch Adblock',
    default_popup: 'popup.html',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  content_scripts: [
    {
      matches: chromeMatches,
      js: ['bridge.js'],
      run_at: 'document_start',
    },
    {
      matches: chromeMatches,
      js: ['content.js'],
      run_at: 'document_start',
      world: 'MAIN',
    },
  ],
};

const chromeContentScript = `// Built from src/vaft.js for Chrome Manifest V3.
// This runs in the page's MAIN world because the source hooks Twitch page globals.

${chromeMainBridge}

${parsed.script}
`;

fs.writeFileSync(ublockPath, ublockResource);
fs.writeFileSync(userscriptPath, userscript);
fs.writeFileSync(chromeManifestPath, `${JSON.stringify(chromeManifest, null, 2)}\n`);
fs.writeFileSync(chromeContentScriptPath, chromeContentScript);
copyChromeFile(chromeBridgeSourcePath, path.join(chromeExtensionDir, 'bridge.js'));
copyChromeFile(chromePopupHtmlSourcePath, path.join(chromeExtensionDir, 'popup.html'));
copyChromeFile(chromePopupCssSourcePath, path.join(chromeExtensionDir, 'popup.css'));
copyChromeFile(chromePopupJsSourcePath, path.join(chromeExtensionDir, 'popup.js'));
for (const iconName of chromeIconNames) {
  copyChromeFile(path.join(chromeIconSourceDir, iconName), path.join(chromeIconDir, iconName));
}

console.log(`Wrote ${path.relative(root, ublockPath)}`);
console.log(`Wrote ${path.relative(root, userscriptPath)}`);
console.log(`Wrote ${path.relative(root, chromeManifestPath)}`);
console.log(`Wrote ${path.relative(root, chromeContentScriptPath)}`);
console.log(`Copied ${path.relative(root, path.join(chromeExtensionDir, 'bridge.js'))}`);
console.log(`Copied ${path.relative(root, path.join(chromeExtensionDir, 'popup.html'))}`);
console.log(`Copied ${path.relative(root, path.join(chromeExtensionDir, 'popup.css'))}`);
console.log(`Copied ${path.relative(root, path.join(chromeExtensionDir, 'popup.js'))}`);
for (const iconName of chromeIconNames) {
  console.log(`Copied ${path.relative(root, path.join(chromeIconDir, iconName))}`);
}

function copyChromeFile(sourceFile, destinationFile) {
  fs.copyFileSync(sourceFile, destinationFile);
}

function parseSource(value) {
  const resourceMatch = value.match(/^([^\s]+)\s+(text\/javascript|application\/javascript)\s*([\s\S]*)$/);

  if (resourceMatch) {
    return {
      resourceName: resourceMatch[1],
      mimeType: resourceMatch[2],
      script: resourceMatch[3].trim(),
    };
  }

  return {
    resourceName: 'twitch-videoad.js',
    mimeType: 'text/javascript',
    script: `(function() {
  if (/(^|\\.)twitch\\.tv$/.test(document.location.hostname) === false) {
    return;
  }

  'use strict';

${indent(value, 2)}
})();`,
  };
}

function assertValidJavaScript(value) {
  try {
    new Function(value);
  } catch (error) {
    throw new Error(`Generated script is not valid JavaScript: ${error.message}`);
  }
}

function assertValidUblockResource(value) {
  const lines = value.split(/\r?\n/);
  let inBody = false;

  for (const line of lines) {
    const headerMatch = line.match(/^([^\s]+\.js)\s+(text\/javascript|application\/javascript)(?:\s+(.+))?$/);
    if (headerMatch && headerMatch[3]) {
      throw new Error(`uBlock Origin resource header must be on its own line: ${line}`);
    }

    if (headerMatch) {
      if (inBody) {
        throw new Error(`uBlock Origin resource header must be preceded by a blank line: ${line}`);
      }
      inBody = true;
      continue;
    }

    if (line.trim() === '') {
      inBody = false;
    }
  }
}

function indent(value, spaces) {
  const padding = ' '.repeat(spaces);
  return value
    .split(/\r?\n/)
    .map((line) => (line.length ? padding + line : line))
    .join('\n');
}

