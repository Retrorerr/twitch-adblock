(() => {
  'use strict';

  const bridgeTarget = 'twitch-adblock-bridge';
  const statusCard = document.querySelector('#status-card');
  const statusDot = document.querySelector('#status-dot');
  const statusTitle = document.querySelector('#status-title');
  const statusDetail = document.querySelector('#status-detail');
  const workerCount = document.querySelector('#worker-count');
  const eventCount = document.querySelector('#event-count');
  const notice = document.querySelector('#notice');
  const refreshButton = document.querySelector('#refresh-button');
  const copyButton = document.querySelector('#copy-button');

  document.querySelector('#version').textContent = `v${chrome.runtime.getManifest().version}`;

  function setStatus(kind, title, detail, state) {
    statusCard.className = `status-card is-${kind}`;
    statusTitle.textContent = title;
    statusDetail.textContent = detail;
    statusDot.setAttribute('aria-label', title);
    workerCount.textContent = state?.workerCount ?? '—';
    eventCount.textContent = state?.eventCount ?? '—';
    copyButton.disabled = kind !== 'active';
  }

  function setNotice(message, isError = false) {
    notice.textContent = message;
    notice.style.color = isError ? '#f3a6b8' : '';
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs[0] || null;
  }

  async function requestPage(type) {
    const tab = await getActiveTab();
    if (!tab || typeof tab.id !== 'number') {
      return null;
    }

    return chrome.tabs.sendMessage(tab.id, {
      target: bridgeTarget,
      type,
    });
  }

  async function refreshStatus() {
    refreshButton.disabled = true;
    setNotice('');
    setStatus('checking', 'Checking current tab', 'Looking for the protection layer on this page.');

    try {
      const state = await requestPage('get-state');
      if (!state?.active) {
        setStatus('idle', 'Not active here', 'Open a Twitch channel to start protection.', state);
        return;
      }

      const workerLabel = state.workerCount === 1 ? 'worker' : 'workers';
      setStatus('active', 'Protection active', `Twitch is covered · ${state.workerCount} ${workerLabel} connected.`, state);
    } catch {
      setStatus('idle', 'Waiting for Twitch', 'This extension activates automatically on Twitch pages.');
    } finally {
      refreshButton.disabled = false;
    }
  }

  async function copyDiagnostics() {
    copyButton.disabled = true;
    setNotice('Preparing diagnostics…');

    try {
      const diagnostics = await requestPage('get-debug');
      if (!diagnostics) {
        throw new Error('No Twitch page response');
      }

      const text = JSON.stringify(diagnostics, null, 2);
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      setNotice('Diagnostics copied to the clipboard.');
    } catch {
      setNotice('Open Twitch first, then try again.', true);
    } finally {
      copyButton.disabled = false;
    }
  }

  refreshButton.addEventListener('click', refreshStatus);
  copyButton.addEventListener('click', copyDiagnostics);
  refreshStatus();
})();
