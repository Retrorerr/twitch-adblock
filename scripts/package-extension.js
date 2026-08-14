const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'dist', 'chrome-mv3');
const defaultOutputDir = path.join(root, 'artifacts', 'twitch-adblock-chromium');
const outputDir = path.resolve(process.argv[2] || defaultOutputDir);

const expectedFiles = [
  'bridge.js',
  'content.js',
  'icons/icon-128.png',
  'icons/icon-16.png',
  'icons/icon-32.png',
  'icons/icon-48.png',
  'manifest.json',
  'popup.css',
  'popup.html',
  'popup.js',
];

if (outputDir === root || outputDir === sourceDir || outputDir.startsWith(`${sourceDir}${path.sep}`)) {
  throw new Error(`Refusing to package into a protected repository path: ${outputDir}`);
}

assert(fs.existsSync(sourceDir), 'dist/chrome-mv3 is missing; run npm run build first');

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.cpSync(sourceDir, outputDir, { recursive: true });

const packageJson = readJson(path.join(root, 'package.json'));
const manifest = readJson(path.join(outputDir, 'manifest.json'));

assert(manifest.manifest_version === 3, 'packaged manifest_version must be 3');
assert(manifest.version === packageJson.version, 'packaged manifest version must match package.json');
assert(manifest.name === 'Twitch Adblock', 'packaged extension name is unexpected');

for (const iconPath of Object.values(manifest.icons || {})) {
  assertPackageFile(iconPath);
}

assertPackageFile(manifest.action?.default_popup);
for (const iconPath of Object.values(manifest.action?.default_icon || {})) {
  assertPackageFile(iconPath);
}
for (const script of manifest.content_scripts || []) {
  for (const scriptPath of script.js || []) {
    assertPackageFile(scriptPath);
  }
}

const actualFiles = collectFiles(outputDir).sort();
assert(JSON.stringify(actualFiles) === JSON.stringify([...expectedFiles].sort()), 'packaged files do not match the MV3 extension allowlist');

console.log(`Packaged ${path.relative(root, outputDir)} (version ${manifest.version}).`);

function assertPackageFile(relativePath) {
  assert(typeof relativePath === 'string' && relativePath.length > 0, 'manifest references an empty file path');
  assert(!path.isAbsolute(relativePath) && !relativePath.split(/[\\/]/).includes('..'), `unsafe package path: ${relativePath}`);
  assert(fs.existsSync(path.join(outputDir, relativePath)), `manifest references missing package file: ${relativePath}`);
}

function collectFiles(directory, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, relative));
    } else {
      files.push(relative);
    }
  }
  return files;
}

function readJson(filePath) {
  assert(fs.existsSync(filePath), `missing JSON file: ${path.relative(root, filePath)}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

