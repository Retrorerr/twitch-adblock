const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const mainBridgePath = path.join(root, 'src', 'chrome-mv3', 'main-bridge.js');
const isolatedBridgePath = path.join(root, 'dist', 'chrome-mv3', 'bridge.js');

class FakeWindow {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  postMessage(data) {
    for (const listener of this.listeners.get('message') || []) {
      listener({ source: this, data });
    }
  }
}

async function main() {
  const page = new FakeWindow();
  const messageListeners = [];
  const context = {
    window: page,
    location: { href: 'https://www.twitch.tv/test-channel' },
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            messageListeners.push(listener);
          },
        },
      },
    },
    clearTimeout,
    console,
    Date,
    Map,
    Promise,
    setTimeout,
  };

  page.twitchAdblockDebug = {
    version: '0.1.9',
    dump: () => [{ event: 'test' }],
  };
  page.__twitchAdblockWorkers = [{}];

  vm.runInNewContext(fs.readFileSync(mainBridgePath, 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(isolatedBridgePath, 'utf8'), context);

  assert(messageListeners.length === 1, 'isolated bridge did not register a message listener');
  const state = await new Promise((resolve) => {
    messageListeners[0]({ target: 'twitch-adblock-bridge', type: 'get-state' }, {}, resolve);
  });

  assert(state?.active === true, 'bridge state did not report an active page script');
  assert(state.workerCount === 1, 'bridge state returned the wrong worker count');
  assert(state.eventCount === 1, 'bridge state returned the wrong event count');
  console.log('Chrome page/isolated bridge simulation passed.');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
