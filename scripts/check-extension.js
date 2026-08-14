const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const extensionDir = path.join(root, 'dist', 'chrome-mv3');
const manifestPath = path.join(extensionDir, 'manifest.json');
const sourcePath = path.join(root, 'src', 'vaft.js');
const packageJson = readJson(path.join(root, 'package.json'));

const manifest = readJson(manifestPath);
const expectedMatches = [
  'https://twitch.tv/*',
  'https://www.twitch.tv/*',
  'https://m.twitch.tv/*',
];
const expectedIcons = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
};

assert(manifest.manifest_version === 3, 'manifest_version must be 3');
assert(manifest.name === 'Twitch Adblock', 'unexpected extension name');
assert(typeof manifest.version === 'string' && manifest.version.length > 0, 'manifest version is missing');
assert(manifest.version === packageJson.version, 'manifest version must match package.json');
assert(manifest.icons && JSON.stringify(manifest.icons) === JSON.stringify(expectedIcons), 'manifest icons are incomplete');
assert(manifest.action?.default_popup === 'popup.html', 'popup is not registered');
assert(manifest.action?.default_icon && JSON.stringify(manifest.action.default_icon) === JSON.stringify(expectedIcons), 'action icons are incomplete');
assert(!manifest.permissions || manifest.permissions.length === 0, 'unexpected broad permissions');

const contentScript = findContentScript('content.js');
const bridgeScript = findContentScript('bridge.js');
assert(JSON.stringify(contentScript.matches) === JSON.stringify(expectedMatches), 'content script matches are incomplete');
assert(contentScript.run_at === 'document_start' && contentScript.world === 'MAIN', 'main content script must run in MAIN at document_start');
assert(JSON.stringify(bridgeScript.matches) === JSON.stringify(expectedMatches), 'bridge matches are incomplete');
assert(bridgeScript.run_at === 'document_start' && !bridgeScript.world, 'bridge must remain isolated');

const source = fs.readFileSync(sourcePath, 'utf8').trim();
const sourcePayload = source.slice(source.indexOf('\n') + 1).trim();
const generatedContent = readFile('content.js').trimEnd();
assert(generatedContent.endsWith(sourcePayload), 'generated content.js is not built from src/vaft.js');
assert(generatedContent.includes('twitch-adblock-page'), 'page bridge is missing');
assert(readFile('bridge.js').includes('chrome.runtime.onMessage'), 'isolated bridge is missing runtime messaging');
assert(readFile('popup.html').includes('popup.js'), 'popup script is not loaded');
assert(!readFile('popup.html').includes('PERSONAL PROTECTION'), 'popup contains removed eyebrow text');
assert(!readFile('popup.html').includes('Quiet playback'), 'popup contains removed subtitle text');
assert(!readFile('popup.html').includes('info-card'), 'popup contains removed informational card');
assert(readFile('popup.js').includes("chrome.tabs.query"), 'popup does not inspect the active tab');
const popupCss = readFile('popup.css');
const shellRule = popupCss.match(/\.shell\s*\{([\s\S]*?)\}/)?.[1] || '';
assert(!/border-radius|overflow\s*:\s*hidden/.test(shellRule), 'outer popup corner styling must not be applied to the shell');

for (const [size, iconPath] of Object.entries(expectedIcons)) {
  const icon = readPng(iconPath);
  assert(icon.width === Number(size) && icon.height === Number(size), `${iconPath} has the wrong dimensions`);
  assert(icon.colorType === 6, `${iconPath} must preserve RGBA transparency`);
}

new Function(readFile('content.js'));
new Function(readFile('bridge.js'));
new Function(readFile('popup.js'));
assert(readDistFile('vaft-ublock-origin.js').includes(`version: '${packageJson.version}'`), 'uBlock self-test version is stale');
assert(readDistFile('vaft.user.js').includes(`// @version      ${packageJson.version}`), 'userscript version is stale');

console.log('Chrome MV3 extension checks passed.');

function findContentScript(fileName) {
  const entry = manifest.content_scripts?.find((script) => script.js?.includes(fileName));
  assert(entry, `${fileName} is not registered in content_scripts`);
  return entry;
}

function readFile(fileName) {
  const filePath = path.join(extensionDir, fileName);
  assert(fs.existsSync(filePath), `missing generated file: ${fileName}`);
  return fs.readFileSync(filePath, 'utf8');
}

function readDistFile(fileName) {
  const filePath = path.join(distDir, fileName);
  assert(fs.existsSync(filePath), `missing generated file: dist/${fileName}`);
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  assert(fs.existsSync(filePath), `missing generated file: ${path.relative(root, filePath)}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readPng(fileName) {
  const buffer = fs.readFileSync(path.join(extensionDir, fileName));
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert(buffer.subarray(0, 8).equals(signature), `${fileName} is not a PNG`);
  assert(buffer.toString('ascii', 12, 16) === 'IHDR', `${fileName} has no IHDR chunk`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25],
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

