const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'src', 'vaft.js');
const distDir = path.join(root, 'dist');
const ublockPath = path.join(distDir, 'vaft-ublock-origin.js');
const userscriptPath = path.join(distDir, 'vaft.user.js');

const source = fs.readFileSync(sourcePath, 'utf8').trim();

if (!source || source.includes('Paste your VAFT script here')) {
  throw new Error('src/vaft.js still contains the placeholder. Paste your VAFT script before building.');
}

fs.mkdirSync(distDir, { recursive: true });

const parsed = parseSource(source);
assertValidJavaScript(parsed.script);

const ublockResource = `${parsed.resourceName} ${parsed.mimeType} ${parsed.script}\n`;
const userscript = `// ==UserScript==
// @name         Personal Twitch VAFT
// @namespace    personal-twitch-vaft
// @version      0.1.0
// @description  Personal VAFT-style Twitch script.
// @match        https://www.twitch.tv/*
// @match        https://m.twitch.tv/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

${parsed.script}
`;

fs.writeFileSync(ublockPath, ublockResource);
fs.writeFileSync(userscriptPath, userscript);

console.log(`Wrote ${path.relative(root, ublockPath)}`);
console.log(`Wrote ${path.relative(root, userscriptPath)}`);

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

function indent(value, spaces) {
  const padding = ' '.repeat(spaces);
  return value
    .split(/\r?\n/)
    .map((line) => (line.length ? padding + line : line))
    .join('\n');
}
