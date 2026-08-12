(() => {
  'use strict';

  const requestSource = 'twitch-adblock-extension';
  const responseSource = 'twitch-adblock-page';
  const bridgeTarget = 'twitch-adblock-bridge';
  const pendingRequests = new Map();
  let requestNumber = 0;

  function requestPage(type) {
    const id = `${Date.now()}-${requestNumber++}`;

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        pendingRequests.delete(id);
        resolve(null);
      }, 750);

      pendingRequests.set(id, { resolve, timeoutId });
      window.postMessage({
        source: requestSource,
        target: responseSource,
        type,
        id,
      }, '*');
    });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) {
      return;
    }

    const response = event.data;
    if (!response || response.source !== responseSource || response.target !== requestSource) {
      return;
    }

    const pendingRequest = pendingRequests.get(response.id);
    if (!pendingRequest) {
      return;
    }

    clearTimeout(pendingRequest.timeoutId);
    pendingRequests.delete(response.id);
    pendingRequest.resolve(response.payload || null);
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.target !== bridgeTarget) {
      return undefined;
    }

    requestPage(message.type).then(sendResponse);
    return true;
  });
})();
