(() => {
  'use strict';

  const requestSource = 'twitch-adblock-extension';
  const responseSource = 'twitch-adblock-page';

  function getDebugEvents() {
    try {
      const debugApi = window.twitchAdblockDebug;
      const events = debugApi && typeof debugApi.dump === 'function' ? debugApi.dump() : [];
      return Array.isArray(events) ? events : [];
    } catch {
      return [];
    }
  }

  function getState(includeEvents) {
    const debugApi = window.twitchAdblockDebug;
    const events = getDebugEvents();
    const state = {
      active: Boolean(debugApi && typeof debugApi.dump === 'function'),
      version: debugApi?.version ?? null,
      solutionsVersion: window.twitchAdSolutionsVersion ?? null,
      workerCount: Array.isArray(window.__twitchAdblockWorkers)
        ? window.__twitchAdblockWorkers.length
        : 0,
      eventCount: events.length,
      href: location.href,
    };

    if (includeEvents) {
      state.events = events;
    }

    return state;
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) {
      return;
    }

    const request = event.data;
    if (!request || request.source !== requestSource || request.target !== responseSource) {
      return;
    }

    if (request.type !== 'get-state' && request.type !== 'get-debug') {
      return;
    }

    window.postMessage({
      source: responseSource,
      target: requestSource,
      type: 'response',
      id: request.id,
      payload: getState(request.type === 'get-debug'),
    }, '*');
  });
})();
