// ==UserScript==
// @name         Personal Twitch VAFT
// @namespace    personal-twitch-vaft
// @version      0.2.0
// @description  Personal VAFT-style Twitch script.
// @match        https://www.twitch.tv/*
// @match        https://m.twitch.tv/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    if ( /(^|\.)twitch\.tv$/.test(document.location.hostname) === false ) { return; }
    'use strict';
    const ourTwitchAdSolutionsVersion = 24;// Used to prevent conflicts with outdated versions of the scripts
    const twitchAdblockVersion = '0.2.0';
    const twitchAdblockDebugKey = 'twitch-adblock-debug';
    const twitchAdblockDebugLimit = 200;
    window.__twitchAdblockWorkers = window.__twitchAdblockWorkers || [];
    installTwitchAdblockDebugHelpers();
    recordTwitchAdblockDebug('page', 'script-start', {
        href: location.href,
        existingTwitchAdSolutionsVersion: window.twitchAdSolutionsVersion
    });
    if (typeof window.twitchAdSolutionsVersion !== 'undefined' && window.twitchAdSolutionsVersion >= ourTwitchAdSolutionsVersion) {
        console.log("skipping vaft as there's another script active. ourVersion:" + ourTwitchAdSolutionsVersion + " activeVersion:" + window.twitchAdSolutionsVersion);
        recordTwitchAdblockDebug('page', 'skipped-conflict', {
            ourVersion: ourTwitchAdSolutionsVersion,
            activeVersion: window.twitchAdSolutionsVersion
        });
        window.twitchAdSolutionsVersion = ourTwitchAdSolutionsVersion;
        return;
    }
    window.twitchAdSolutionsVersion = ourTwitchAdSolutionsVersion;
    function declareOptions(scope) {
        scope.AdSignifier = 'stitched';
        scope.ClientID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
        scope.BackupPlayerTypes = [
            'embed',//Source
            'popout',//Source (a separate session from the player's own popout session)
            'autoplay',//360p. Last resort; switching resolution mid-stream costs a short decoder reset.
        ];
        scope.FallbackPlayerType = 'embed';
        scope.ForceAccessTokenPlayerType = 'popout';
        scope.SkipPlayerReloadOnHevc = true;// Smoother mode: avoid codec-triggered player reloads. If 1440p/4K errors occur in Chromium/Brave, set this back to false.
        scope.AlwaysReloadPlayerOnAd = false;// Always pause/play when entering/leaving ads
        scope.ReloadPlayerAfterAd = false;// Smoother mode: avoid full player reloads after ads.
        scope.HasTriggeredPlayerReload = false;
        scope.StreamInfos = [];
        scope.StreamInfosByUrl = [];
        scope.GQLDeviceID = null;
        scope.ClientVersion = null;
        scope.ClientSession = null;
        scope.ClientIntegrityHeader = null;
        scope.AuthorizationHeader = undefined;
        scope.SimulatedAdsDepth = 0;
        scope.PlayerBufferingFix = true;// Last-resort watchdog: pause/play only when playback is fully frozen (see PlayerBufferingSameStateCount).
        scope.PlayerBufferingDelay = 1000;// How often to check the player state (in milliseconds)
        scope.PlayerBufferingSameStateCount = 4;// Consecutive frozen checks before acting (~4 seconds of no progress)
        scope.PlayerBufferingDangerZone = 0;// 0 = only act when the playback position is truly stuck, never on a low-but-moving buffer.
        scope.PlayerBufferingDoPlayerReload = false;// If true this will do a player reload instead of pause/play (player reloading is better at fixing the playback issues but it takes slightly longer)
        scope.PlayerBufferingMinRepeatDelay = 15000;// Longer cooldown between forced pause/play attempts.
        scope.PlayerBufferingPrerollCheckEnabled = true;// Avoid early false positives if PlayerBufferingFix is re-enabled.
        scope.PlayerBufferingPrerollCheckOffset = 5;// How far the stream need to move before doing the buffering mitigation (depends on PlayerBufferingPrerollCheckEnabled being true)
        scope.V2API = false;
        scope.IsAdStrippingEnabled = true;
        scope.PauseResumePlayerAfterAd = false;// Forced pause/play after every ad. Not needed with SeamlessPlaylists and it causes a visible hitch.
        scope.SeamlessPlaylists = true;// Stitch main + backup playlists into one continuous playlist numbered by Twitch's live sequence (see buildSeamlessPlaylist)
        scope.SeamlessWindowSize = 15;// Max segments in the playlists we hand to the player
        scope.SeamlessGapJumpSegments = 3;// If the next segment is missing but this many newer ones exist, skip ahead instead of waiting
        scope.SeamlessMaxPdtDriftMs = 3000;// Reject a source whose timestamps disagree with what we've already shown by more than this
        scope.SeamlessStallResetMs = 10000;// If the main stream progresses but our playlist hasn't for this long, rebuild and reload the player
        scope.BackupEncodingsMaxAgeMs = 8 * 60 * 1000;// Access tokens last ~20 minutes; refresh well before that
        scope.BackupSessionRefreshMs = 20000;// A backup session that has shown ads for this long gets a fresh access token
        scope.BackupWarmIntervalMs = 45000;// While no ads are showing, re-poll one backup session this often (round-robin, after warming all of them once)
        scope.BackupWarmStartDelayMs = 5000;// Don't compete with the player's own startup requests
        scope.LastSeamlessReload = 0;
        scope.AdSegmentCache = new Map();
        scope.AllSegmentsAreAdSegments = false;
        scope.DebugEnabled = false;
    }
    let isActivelyStrippingAds = false;
    let localStorageHookFailed = false;
    let lastAdblockOverlayText = null;
    let lastAdblockOverlayDisplay = null;
    const twitchWorkers = window.__twitchAdblockWorkers;
    function isTwitchAdblockDebugEnabled() {
        try {
            return localStorage.getItem(twitchAdblockDebugKey) === '1' || window.__twitchAdblockDebugEnabled === true;
        } catch {
            return window.__twitchAdblockDebugEnabled === true;
        }
    }
    function setTwitchAdblockDebugEnabled(value) {
        const isEnabled = value === true;
        window.__twitchAdblockDebugEnabled = isEnabled;
        try {
            localStorage.setItem(twitchAdblockDebugKey, isEnabled ? '1' : '0');
        } catch {}
        window.__twitchAdblockWorkers.forEach((worker) => worker.postMessage({
            key: 'SetDebugEnabled',
            value: isEnabled
        }));
        recordTwitchAdblockDebug('page', 'debug-toggle', { enabled: isEnabled });
        return isEnabled;
    }
    function recordTwitchAdblockDebug(source, event, data) {
        const entry = {
            at: new Date().toISOString(),
            version: twitchAdblockVersion,
            source,
            event,
            data: data || null
        };
        const entries = window.__twitchAdblockDebugEvents = window.__twitchAdblockDebugEvents || [];
        entries.push(entry);
        while (entries.length > twitchAdblockDebugLimit) {
            entries.shift();
        }
        if (isTwitchAdblockDebugEnabled()) {
            console.log('[twitch-adblock]', event, entry.data);
        }
        return entry;
    }
    function installTwitchAdblockDebugHelpers() {
        window.twitchAdblockDebug = {
            version: twitchAdblockVersion,
            enable: () => setTwitchAdblockDebugEnabled(true),
            disable: () => setTwitchAdblockDebugEnabled(false),
            clear: () => {
                window.__twitchAdblockDebugEvents = [];
                return [];
            },
            dump: () => window.__twitchAdblockDebugEvents || []
        };
        if (isTwitchAdblockDebugEnabled()) {
            recordTwitchAdblockDebug('page', 'page-start', { href: location.href });
        }
    }
    const workerStringConflicts = [
        'twitch',
        'isVariantA'// TwitchNoSub
    ];
    const workerStringAllow = [];
    const workerStringReinsert = [
        'isVariantA',// TwitchNoSub (prior to (0.9))
        'besuper/',// TwitchNoSub (0.9)
        '${patch_url}'// TwitchNoSub (0.9.1)
    ];
    function getCleanWorker(worker) {
        let root = null;
        let parent = null;
        let proto = worker;
        while (proto) {
            const workerString = proto.toString();
            if (workerStringConflicts.some((x) => workerString.includes(x)) && !workerStringAllow.some((x) => workerString.includes(x))) {
                if (parent !== null) {
                    Object.setPrototypeOf(parent, Object.getPrototypeOf(proto));
                }
            } else {
                if (root === null) {
                    root = proto;
                }
                parent = proto;
            }
            proto = Object.getPrototypeOf(proto);
        }
        return root;
    }
    function getWorkersForReinsert(worker) {
        const result = [];
        let proto = worker;
        while (proto) {
            const workerString = proto.toString();
            if (workerStringReinsert.some((x) => workerString.includes(x))) {
                result.push(proto);
            } else {
            }
            proto = Object.getPrototypeOf(proto);
        }
        return result;
    }
    function reinsertWorkers(worker, reinsert) {
        let parent = worker;
        for (let i = 0; i < reinsert.length; i++) {
            Object.setPrototypeOf(reinsert[i], parent);
            parent = reinsert[i];
        }
        return parent;
    }
    function isValidWorker(worker) {
        const workerString = worker.toString();
        return !workerStringConflicts.some((x) => workerString.includes(x))
            || workerStringAllow.some((x) => workerString.includes(x))
            || workerStringReinsert.some((x) => workerString.includes(x));
    }
    function hookWindowWorker() {
        const reinsert = getWorkersForReinsert(window.Worker);
        const newWorker = class Worker extends getCleanWorker(window.Worker) {
            constructor(twitchBlobUrl, options) {
                let isTwitchWorker = false;
                try {
                    isTwitchWorker = new URL(twitchBlobUrl).origin.endsWith('.twitch.tv');
                } catch {}
                if (!isTwitchWorker) {
                    super(twitchBlobUrl, options);
                    return;
                }
                const newBlobStr = `
                    const pendingFetchRequests = new Map();
                    const twitchAdblockVersion = '${twitchAdblockVersion}';
                    ${debugLog.toString()}
                    ${summarizeUrl.toString()}
                    ${hasAdMarkers.toString()}
                    ${isAdMarkerLine.toString()}
                    ${isSegmentUrlLine.toString()}
                    ${cacheAdSegment.toString()}
                    ${getAdMarkerSummary.toString()}
                    ${stripAdSegments.toString()}
                    ${getStreamUrlForResolution.toString()}
                    ${getVariantKey.toString()}
                    ${getVariantKeyForUrl.toString()}
                    ${parseM3u8Playlist.toString()}
                    ${mapLiveSequences.toString()}
                    ${isDroppedPlaylistTag.toString()}
                    ${getSeamlessState.toString()}
                    ${isSourceAligned.toString()}
                    ${buildSeamlessPlaylist.toString()}
                    ${renderSeamlessPlaylist.toString()}
                    ${getBackupState.toString()}
                    ${ensureBackupEncodings.toString()}
                    ${fetchBackupPlaylist.toString()}
                    ${getBackupPlaylists.toString()}
                    ${warmBackupPlaylist.toString()}
                    ${processM3U8.toString()}
                    ${hookWorkerFetch.toString()}
                    ${declareOptions.toString()}
                    ${getAccessToken.toString()}
                    ${gqlRequest.toString()}
                    ${parseAttributes.toString()}
                    ${getWasmWorkerJs.toString()}
                    ${getServerTimeFromM3u8.toString()}
                    ${replaceServerTimeInM3u8.toString()}
                    const workerString = getWasmWorkerJs('${twitchBlobUrl.replaceAll("'", "%27")}');
                    declareOptions(self);
                    DebugEnabled = ${isTwitchAdblockDebugEnabled() ? 'true' : 'false'};
                    GQLDeviceID = ${GQLDeviceID ? "'" + GQLDeviceID + "'" : null};
                    AuthorizationHeader = ${AuthorizationHeader ? "'" + AuthorizationHeader + "'" : undefined};
                    ClientIntegrityHeader = ${ClientIntegrityHeader ? "'" + ClientIntegrityHeader + "'" : null};
                    ClientVersion = ${ClientVersion ? "'" + ClientVersion + "'" : null};
                    ClientSession = ${ClientSession ? "'" + ClientSession + "'" : null};
                    debugLog('worker-start', { version: twitchAdblockVersion });
                    self.addEventListener('message', function(e) {
                        if (e.data.key == 'UpdateClientVersion') {
                            ClientVersion = e.data.value;
                        } else if (e.data.key == 'UpdateClientSession') {
                            ClientSession = e.data.value;
                        } else if (e.data.key == 'UpdateClientId') {
                            ClientID = e.data.value;
                        } else if (e.data.key == 'UpdateDeviceId') {
                            GQLDeviceID = e.data.value;
                        } else if (e.data.key == 'UpdateClientIntegrityHeader') {
                            ClientIntegrityHeader = e.data.value;
                        } else if (e.data.key == 'UpdateAuthorizationHeader') {
                            AuthorizationHeader = e.data.value;
                        } else if (e.data.key == 'FetchResponse') {
                            const responseData = e.data.value;
                            if (pendingFetchRequests.has(responseData.id)) {
                                const { resolve, reject } = pendingFetchRequests.get(responseData.id);
                                pendingFetchRequests.delete(responseData.id);
                                if (responseData.error) {
                                    reject(new Error(responseData.error));
                                } else {
                                    // Create a Response object from the response data
                                    const response = new Response(responseData.body, {
                                        status: responseData.status,
                                        statusText: responseData.statusText,
                                        headers: responseData.headers
                                    });
                                    resolve(response);
                                }
                            }
                        } else if (e.data.key == 'TriggeredPlayerReload') {
                            HasTriggeredPlayerReload = true;
                        } else if (e.data.key == 'SimulateAds') {
                            SimulatedAdsDepth = e.data.value;
                            console.log('SimulatedAdsDepth: ' + SimulatedAdsDepth);
                        } else if (e.data.key == 'AllSegmentsAreAdSegments') {
                            AllSegmentsAreAdSegments = !AllSegmentsAreAdSegments;
                            console.log('AllSegmentsAreAdSegments: ' + AllSegmentsAreAdSegments);
                        } else if (e.data.key == 'SetDebugEnabled') {
                            DebugEnabled = e.data.value === true;
                            debugLog('debug-state', { enabled: DebugEnabled });
                        }
                    });
                    hookWorkerFetch();
                    eval(workerString);
                `;
                super(URL.createObjectURL(new Blob([newBlobStr])), options);
                twitchWorkers.push(this);
                this.addEventListener('message', (e) => {
                    if (e.data.key == 'UpdateAdBlockBanner') {
                        updateAdblockBanner(e.data);
                    } else if (e.data.key == 'PauseResumePlayer') {
                        recordTwitchAdblockDebug('page', 'player-task-request', { task: 'pause-resume' });
                        doTwitchPlayerTask(true, false);
                    } else if (e.data.key == 'ReloadPlayer') {
                        recordTwitchAdblockDebug('page', 'player-task-request', { task: 'reload' });
                        doTwitchPlayerTask(false, true);
                    } else if (e.data.key == 'DebugLog') {
                        recordTwitchAdblockDebug('worker', e.data.event, e.data.data);
                    }
                });
                this.addEventListener('message', async event => {
                    if (event.data.key == 'FetchRequest') {
                        const fetchRequest = event.data.value;
                        const responseData = await handleWorkerFetchRequest(fetchRequest);
                        this.postMessage({
                            key: 'FetchResponse',
                            value: responseData
                        });
                    }
                });
            }
        };
        let workerInstance = reinsertWorkers(newWorker, reinsert);
        Object.defineProperty(window, 'Worker', {
            get: function() {
                return workerInstance;
            },
            set: function(value) {
                if (isValidWorker(value)) {
                    workerInstance = value;
                } else {
                    console.log('Attempt to set twitch worker denied');
                }
            }
        });
    }
    function getWasmWorkerJs(twitchBlobUrl) {
        const req = new XMLHttpRequest();
        req.open('GET', twitchBlobUrl, false);
        req.overrideMimeType("text/javascript");
        req.send();
        return req.responseText;
    }
    function hookWorkerFetch() {
        console.log('hookWorkerFetch (vaft)');
        const realFetch = fetch;
        fetch = async function(url, options) {
            if (typeof url === 'string') {
                if (AdSegmentCache.has(url)) {
                    debugLog('segment-cache-hit', {
                        url: summarizeUrl(url),
                        cachedSegments: AdSegmentCache.size
                    });
                    return new Promise(function(resolve, reject) {
                        const send = function() {
                            return realFetch('data:video/mp4;base64,AAAAKGZ0eXBtcDQyAAAAAWlzb21tcDQyZGFzaGF2YzFpc282aGxzZgAABEltb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAYagAAAAAAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAABqHRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAURtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAALuAAAAAAFXEAAAAAAAtaGRscgAAAAAAAAAAc291bgAAAAAAAAAAAAAAAFNvdW5kSGFuZGxlcgAAAADvbWluZgAAABBzbWhkAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAACzc3RibAAAAGdzdHNkAAAAAAAAAAEAAABXbXA0YQAAAAAAAAABAAAAAAAAAAAAAgAQAAAAALuAAAAAAAAzZXNkcwAAAAADgICAIgABAASAgIAUQBUAAAAAAAAAAAAAAAWAgIACEZAGgICAAQIAAAAQc3R0cwAAAAAAAAAAAAAAEHN0c2MAAAAAAAAAAAAAABRzdHN6AAAAAAAAAAAAAAAAAAAAEHN0Y28AAAAAAAAAAAAAAeV0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAoAAAAFoAAAAAAGBbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAA9CQAAAAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABLG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAOxzdGJsAAAAoHN0c2QAAAAAAAAAAQAAAJBhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAoABaABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAAOmF2Y0MBTUAe/+EAI2dNQB6WUoFAX/LgLUBAQFAAAD6AAA6mDgAAHoQAA9CW7y4KAQAEaOuPIAAAABBzdHRzAAAAAAAAAAAAAAAQc3RzYwAAAAAAAAAAAAAAFHN0c3oAAAAAAAAAAAAAAAAAAAAQc3RjbwAAAAAAAAAAAAAASG12ZXgAAAAgdHJleAAAAAAAAAABAAAAAQAAAC4AAAAAAoAAAAAAACB0cmV4AAAAAAAAAAIAAAABAACCNQAAAAACQAAA', options).then(function(response) {
                                resolve(response);
                            })['catch'](function(err) {
                                reject(err);
                            });
                        };
                        send();
                    });
                }
                url = url.trimEnd();
                if (url.endsWith('m3u8')) {
                    // While an ad break is running, fetch the backup playlists at the same time as the main one so
                    // the player's playlist request isn't delayed by two round trips back to back.
                    const adStreamInfo = StreamInfosByUrl[url];
                    let backupPromise = null;
                    if (adStreamInfo && adStreamInfo.IsShowingAd && adStreamInfo.Urls[url]) {
                        backupPromise = getBackupPlaylists(adStreamInfo, adStreamInfo.Urls[url], realFetch).catch(() => []);
                    }
                    return new Promise(function(resolve, reject) {
                        const processAfter = async function(response) {
                            if (response.status === 200) {
                                resolve(new Response(await processM3U8(url, await response.text(), realFetch, backupPromise)));
                            } else {
                                resolve(response);
                            }
                        };
                        const send = function() {
                            return realFetch(url, options).then(function(response) {
                                processAfter(response);
                            })['catch'](function(err) {
                                reject(err);
                            });
                        };
                        send();
                    });
                } else if (url.includes('/channel/hls/') && !url.includes('picture-by-picture')) {
                    V2API = url.includes('/api/v2/');
                    const channelName = (new URL(url)).pathname.match(/([^\/]+)(?=\.\w+$)/)[0];
                    if (ForceAccessTokenPlayerType) {
                        // parent_domains is used to determine if the player is embeded and stripping it gets rid of fake ads
                        const tempUrl = new URL(url);
                        tempUrl.searchParams.delete('parent_domains');
                        url = tempUrl.toString();
                    }
                    return new Promise(function(resolve, reject) {
                        const processAfter = async function(response) {
                            if (response.status == 200) {
                                const encodingsM3u8 = await response.text();
                                const serverTime = getServerTimeFromM3u8(encodingsM3u8);
                                let streamInfo = StreamInfos[channelName];
                                if (streamInfo != null && streamInfo.EncodingsM3U8 != null && (await realFetch(streamInfo.EncodingsM3U8.match(/^https:.*\.m3u8$/m)[0])).status !== 200) {
                                    // The cached encodings are dead (the stream probably restarted)
                                    streamInfo = null;
                                }
                                if (streamInfo == null || streamInfo.EncodingsM3U8 == null) {
                                    StreamInfos[channelName] = streamInfo = {
                                        ChannelName: channelName,
                                        CreatedAt: Date.now(),
                                        IsShowingAd: false,
                                        LastPlayerReload: 0,
                                        EncodingsM3U8: encodingsM3u8,
                                        ModifiedM3U8: null,
                                        IsUsingModifiedM3U8: false,
                                        UsherParams: (new URL(url)).search,
                                        RequestedAds: new Set(),
                                        Urls: [],// xxx.m3u8 -> { Resolution: "284x160", FrameRate: 30.0 }
                                        ResolutionList: [],
                                        BackupStates: {},// playerType -> session/encodings state (see getBackupState)
                                        PreferredBackupType: null,
                                        BackupWarmAt: 0,
                                        BackupWarmIndex: 0,
                                        SeamlessStates: {},// variant playlist url -> continuous playlist state (see getSeamlessState)
                                        ActiveBackupPlayerType: null,
                                        IsMidroll: false,
                                        IsStrippingAdSegments: false,
                                        NumStrippedAdSegments: 0
                                    };
                                    const lines = encodingsM3u8.replaceAll('\r', '').split('\n');
                                    for (let i = 0; i < lines.length - 1; i++) {
                                        if (lines[i].startsWith('#EXT-X-STREAM-INF') && lines[i + 1].includes('.m3u8')) {
                                            const attributes = parseAttributes(lines[i]);
                                            const resolution = attributes['RESOLUTION'];
                                            if (resolution) {
                                                const resolutionInfo = {
                                                    Resolution: resolution,
                                                    FrameRate: attributes['FRAME-RATE'],
                                                    Codecs: attributes['CODECS'],
                                                    Url: lines[i + 1]
                                                };
                                                streamInfo.Urls[lines[i + 1]] = resolutionInfo;
                                                streamInfo.ResolutionList.push(resolutionInfo);
                                            }
                                            StreamInfosByUrl[lines[i + 1]] = streamInfo;
                                        }
                                    }
                                    const nonHevcResolutionList = streamInfo.ResolutionList.filter((element) => element.Codecs.startsWith('avc') || element.Codecs.startsWith('av0'));
                                    if (AlwaysReloadPlayerOnAd || (nonHevcResolutionList.length > 0 && streamInfo.ResolutionList.some((element) => element.Codecs.startsWith('hev') || element.Codecs.startsWith('hvc')) && !SkipPlayerReloadOnHevc)) {
                                        if (nonHevcResolutionList.length > 0) {
                                            for (let i = 0; i < lines.length - 1; i++) {
                                                if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                                                    const resSettings = parseAttributes(lines[i].substring(lines[i].indexOf(':') + 1));
                                                    const codecsKey = 'CODECS';
                                                    if (resSettings[codecsKey].startsWith('hev') || resSettings[codecsKey].startsWith('hvc')) {
                                                        const oldResolution = resSettings['RESOLUTION'];
                                                        const [targetWidth, targetHeight] = oldResolution.split('x').map(Number);
                                                        const newResolutionInfo = nonHevcResolutionList.sort((a, b) => {
                                                            // TODO: Take into account 'Frame-Rate' when sorting (i.e. 1080p60 vs 1080p30)
                                                            const [streamWidthA, streamHeightA] = a.Resolution.split('x').map(Number);
                                                            const [streamWidthB, streamHeightB] = b.Resolution.split('x').map(Number);
                                                            return Math.abs((streamWidthA * streamHeightA) - (targetWidth * targetHeight)) - Math.abs((streamWidthB * streamHeightB) - (targetWidth * targetHeight));
                                                        })[0];
                                                        console.log('ModifiedM3U8 swap ' + resSettings[codecsKey] + ' to ' + newResolutionInfo.Codecs + ' oldRes:' + oldResolution + ' newRes:' + newResolutionInfo.Resolution);
                                                        lines[i] = lines[i].replace(/CODECS="[^"]+"/, `CODECS="${newResolutionInfo.Codecs}"`);
                                                        lines[i + 1] = newResolutionInfo.Url + ' '.repeat(i + 1);// The stream doesn't load unless each url line is unique
                                                    }
                                                }
                                            }
                                        }
                                        if (nonHevcResolutionList.length > 0 || AlwaysReloadPlayerOnAd) {
                                            streamInfo.ModifiedM3U8 = lines.join('\n');
                                        }
                                    }
                                }
                                streamInfo.LastPlayerReload = Date.now();
                                resolve(new Response(replaceServerTimeInM3u8(streamInfo.IsUsingModifiedM3U8 ? streamInfo.ModifiedM3U8 : streamInfo.EncodingsM3U8, serverTime)));
                            } else {
                                resolve(response);
                            }
                        };
                        const send = function() {
                            return realFetch(url, options).then(function(response) {
                                processAfter(response);
                            })['catch'](function(err) {
                                reject(err);
                            });
                        };
                        send();
                    });
                }
            }
            return realFetch.apply(this, arguments);
        };
    }
    function getServerTimeFromM3u8(encodingsM3u8) {
        if (V2API) {
            const matches = encodingsM3u8.match(/#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE="([^"]+)"/);
            return matches.length > 1 ? matches[1] : null;
        }
        const matches = encodingsM3u8.match('SERVER-TIME="([0-9.]+)"');
        return matches.length > 1 ? matches[1] : null;
    }
    function replaceServerTimeInM3u8(encodingsM3u8, newServerTime) {
        if (V2API) {
            return newServerTime ? encodingsM3u8.replace(/(#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE=")[^"]+(")/, `$1${newServerTime}$2`) : encodingsM3u8;
        }
        return newServerTime ? encodingsM3u8.replace(new RegExp('(SERVER-TIME=")[0-9.]+"'), `SERVER-TIME="${newServerTime}"`) : encodingsM3u8;
    }
    function debugLog(event, data) {
        if (!DebugEnabled) {
            return;
        }
        try {
            postMessage({
                key: 'DebugLog',
                event,
                data
            });
        } catch {
            try {
                console.log('[twitch-adblock]', event, data);
            } catch {}
        }
    }
    function summarizeUrl(url) {
        try {
            const parsedUrl = new URL(url);
            return parsedUrl.origin + parsedUrl.pathname;
        } catch {
            return String(url).slice(0, 180);
        }
    }
    function hasAdMarkers(textStr) {
        const lowerText = textStr.toLowerCase();
        return textStr.includes(AdSignifier)
            || textStr.includes('X-TV-TWITCH-AD-')
            || lowerText.includes('twitch-ad')
            || lowerText.includes('"midroll"')
            || lowerText.includes('"preroll"');
    }
    function isAdMarkerLine(line) {
        const lowerLine = line.toLowerCase();
        return line.includes(AdSignifier)
            || line.includes('X-TV-TWITCH-AD-')
            || lowerLine.includes('twitch-ad')
            || lowerLine.includes('"midroll"')
            || lowerLine.includes('"preroll"');
    }
    function isSegmentUrlLine(line) {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('#');
    }
    function cacheAdSegment(segmentUrl, streamInfo) {
        const isNewSegment = !AdSegmentCache.has(segmentUrl);
        if (isNewSegment) {
            streamInfo.NumStrippedAdSegments++;
        }
        AdSegmentCache.set(segmentUrl, Date.now());
        debugLog('cache-ad-segment', {
            channelName: streamInfo.ChannelName,
            segmentUrl: summarizeUrl(segmentUrl),
            isNewSegment,
            cachedSegments: AdSegmentCache.size
        });
    }
    function getAdMarkerSummary(textStr) {
        const lines = textStr.replaceAll('\r', '').split('\n');
        const markerLines = [];
        let segmentCount = 0;
        let liveSegmentCount = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('#EXTINF')) {
                segmentCount++;
                if (line.includes(',live')) {
                    liveSegmentCount++;
                }
            }
            if (isAdMarkerLine(line)) {
                markerLines.push(line.slice(0, 180));
            }
        }
        return {
            lineCount: lines.length,
            segmentCount,
            liveSegmentCount,
            markerCount: markerLines.length,
            sampleMarkers: markerLines.slice(0, 8)
        };
    }
    function stripAdSegments(textStr, stripAllSegments, streamInfo) {
        let hasStrippedAdSegments = false;
        let stripNextSegment = false;
        const lines = textStr.replaceAll('\r', '').split('\n');
        const newAdUrl = 'https://twitch.tv';
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            if (isAdMarkerLine(line)) {
                hasStrippedAdSegments = true;
                stripNextSegment = true;
            }
            // Remove tracking urls which appear in the overlay UI
            line = line
                .replaceAll(/(X-TV-TWITCH-AD-URL=")(?:[^"]*)(")/g, `$1${newAdUrl}$2`)
                .replaceAll(/(X-TV-TWITCH-AD-CLICK-TRACKING-URL=")(?:[^"]*)(")/g, `$1${newAdUrl}$2`);
            lines[i] = line;
            if (i < lines.length - 1 && line.startsWith('#EXTINF') && (!line.includes(',live') || stripAllSegments || AllSegmentsAreAdSegments || stripNextSegment)) {
                const segmentUrl = lines[i + 1];
                cacheAdSegment(segmentUrl, streamInfo);
                hasStrippedAdSegments = true;
                stripNextSegment = false;
            } else if (stripNextSegment && isSegmentUrlLine(line)) {
                cacheAdSegment(line, streamInfo);
                hasStrippedAdSegments = true;
                stripNextSegment = false;
            }
        }
        if (hasStrippedAdSegments) {
            for (let i = 0; i < lines.length; i++) {
                // No low latency during ads (otherwise it's possible for the player to prefetch and display ad segments)
                if (lines[i].startsWith('#EXT-X-TWITCH-PREFETCH:')) {
                    lines[i] = '';
                }
            }
        } else {
            streamInfo.NumStrippedAdSegments = 0;
        }
        streamInfo.IsStrippingAdSegments = hasStrippedAdSegments;
        AdSegmentCache.forEach((value, key, map) => {
            if (value < Date.now() - 120000) {
                map.delete(key);
            }
        });
        return lines.join('\n');
    }
    function getStreamUrlForResolution(encodingsM3u8, resolutionInfo) {
        const encodingsLines = encodingsM3u8.replaceAll('\r', '').split('\n');
        const [targetWidth, targetHeight] = resolutionInfo.Resolution.split('x').map(Number);
        let matchedResolutionUrl = null;
        let matchedFrameRate = false;
        let closestResolutionUrl = null;
        let closestResolutionDifference = Infinity;
        for (let i = 0; i < encodingsLines.length - 1; i++) {
            if (encodingsLines[i].startsWith('#EXT-X-STREAM-INF') && encodingsLines[i + 1].includes('.m3u8')) {
                const attributes = parseAttributes(encodingsLines[i]);
                const resolution = attributes['RESOLUTION'];
                const frameRate = attributes['FRAME-RATE'];
                if (resolution) {
                    if (resolution == resolutionInfo.Resolution && (!matchedResolutionUrl || (!matchedFrameRate && frameRate == resolutionInfo.FrameRate))) {
                        matchedResolutionUrl = encodingsLines[i + 1];
                        matchedFrameRate = frameRate == resolutionInfo.FrameRate;
                        if (matchedFrameRate) {
                            return matchedResolutionUrl;
                        }
                    }
                    const [width, height] = resolution.split('x').map(Number);
                    const difference = Math.abs((width * height) - (targetWidth * targetHeight));
                    if (difference < closestResolutionDifference) {
                        closestResolutionUrl = encodingsLines[i + 1];
                        closestResolutionDifference = difference;
                    }
                }
            }
        }
        return closestResolutionUrl;
    }
    function getVariantKey(resolutionInfo) {
        if (!resolutionInfo) {
            return null;
        }
        return resolutionInfo.Resolution + '|' + resolutionInfo.FrameRate + '|' + resolutionInfo.Codecs;
    }
    function getVariantKeyForUrl(encodingsM3u8, streamM3u8Url) {
        const encodingsLines = encodingsM3u8.replaceAll('\r', '').split('\n');
        for (let i = 1; i < encodingsLines.length; i++) {
            if (encodingsLines[i] == streamM3u8Url && encodingsLines[i - 1].startsWith('#EXT-X-STREAM-INF')) {
                const attributes = parseAttributes(encodingsLines[i - 1].substring(encodingsLines[i - 1].indexOf(':') + 1));
                return getVariantKey({
                    Resolution: attributes['RESOLUTION'],
                    FrameRate: attributes['FRAME-RATE'],
                    Codecs: attributes['CODECS']
                });
            }
        }
        return null;
    }
    function isDroppedPlaylistTag(line, playlistHasAds) {
        return line.startsWith('#EXT-X-START')
            || isAdMarkerLine(line)
            || (line.includes('X-TV-TWITCH-STREAM-SOURCE=') && !line.includes('X-TV-TWITCH-STREAM-SOURCE="live"'))
            || (playlistHasAds && line.includes('CLASS="twitch-trigger"'));
    }
    function parseM3u8Playlist(textStr) {
        // Splits a media playlist into header tags, segments and low latency prefetch hints.
        const playlist = {
            header: [],
            segments: [],
            prefetch: [],
            mediaSequence: null,
            liveSequence: null,
            targetDuration: null,
            hasAds: hasAdMarkers(textStr),
            hasEndList: false
        };
        const lines = textStr.replaceAll('\r', '').split('\n');
        let pending = null;
        let currentMap = null;
        let isInSegments = false;
        const getPending = () => pending || (pending = { tags: [], pdt: NaN, discontinuity: false, extinf: null });
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) {
                continue;
            }
            if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
                playlist.mediaSequence = parseInt(line.substring(line.indexOf(':') + 1), 10);
            } else if (line.startsWith('#EXT-X-TWITCH-LIVE-SEQUENCE:')) {
                playlist.liveSequence = parseInt(line.substring(line.indexOf(':') + 1), 10);
            } else if (line.startsWith('#EXT-X-TARGETDURATION:')) {
                playlist.targetDuration = parseInt(line.substring(line.indexOf(':') + 1), 10);
            } else if (line.startsWith('#EXT-X-DISCONTINUITY-SEQUENCE:')) {
                // Regenerated when rendering
            } else if (line == '#EXT-X-ENDLIST') {
                playlist.hasEndList = true;
            } else if (line.startsWith('#EXT-X-TWITCH-PREFETCH:')) {
                playlist.prefetch.push(line);
            } else if (line.startsWith('#EXT-X-MAP:')) {
                currentMap = line;
                isInSegments = true;
            } else if (line.startsWith('#EXT-X-PROGRAM-DATE-TIME:')) {
                getPending().pdt = Date.parse(line.substring(line.indexOf(':') + 1));
                isInSegments = true;
            } else if (line == '#EXT-X-DISCONTINUITY') {
                getPending().discontinuity = true;
                isInSegments = true;
            } else if (line.startsWith('#EXTINF:')) {
                const segment = getPending();
                segment.extinf = line;
                segment.duration = parseFloat(line.substring(line.indexOf(':') + 1)) || 2;
                segment.isLive = line.includes(',live');
                isInSegments = true;
            } else if (line.startsWith('#')) {
                if (!isInSegments) {
                    playlist.header.push(line);
                } else if (!isDroppedPlaylistTag(line, true)) {
                    getPending().tags.push(line);
                }
            } else if (pending && pending.extinf) {
                pending.uri = line;
                pending.map = currentMap;
                pending.seq = null;
                playlist.segments.push(pending);
                pending = null;
            }
        }
        for (let i = 1; i < playlist.segments.length; i++) {
            const segment = playlist.segments[i];
            if (!Number.isFinite(segment.pdt) && Number.isFinite(playlist.segments[i - 1].pdt)) {
                segment.pdt = playlist.segments[i - 1].pdt + playlist.segments[i - 1].duration * 1000;
            }
        }
        return playlist;
    }
    function mapLiveSequences(playlist) {
        // Gives every usable segment its global live sequence number. Twitch numbers live segments identically in
        // every session, but a session that had an ad stitched in restarts MEDIA-SEQUENCE and shifts its timestamps.
        // EXT-X-TWITCH-LIVE-SEQUENCE is the live sequence of the first live segment in the playlist, so it lets us
        // translate any session back onto the shared live numbering.
        const segments = playlist.segments;
        if (!playlist.hasAds) {
            const baseSequence = playlist.liveSequence !== null ? playlist.liveSequence : playlist.mediaSequence;
            if (baseSequence === null || Number.isNaN(baseSequence)) {
                return false;
            }
            segments.forEach((segment, index) => {
                segment.seq = baseSequence + index;
            });
            return segments.length > 0;
        }
        if (playlist.liveSequence === null || Number.isNaN(playlist.liveSequence)) {
            return false;
        }
        let runCount = 0;
        let runStart = -1;
        for (let i = 0; i < segments.length; i++) {
            if (segments[i].isLive && (i == 0 || !segments[i - 1].isLive || segments[i].discontinuity)) {
                runCount++;
                runStart = i;
            }
        }
        if (runCount != 1) {
            // Live content on both sides of an ad. Which side LIVE-SEQUENCE refers to is ambiguous, so let the
            // backup streams cover this window instead of guessing.
            return false;
        }
        for (let i = runStart; i < segments.length && segments[i].isLive && (i == runStart || !segments[i].discontinuity); i++) {
            segments[i].seq = playlist.liveSequence + (i - runStart);
        }
        return true;
    }
    function getSeamlessState(streamInfo, url) {
        const now = Date.now();
        let state = streamInfo.SeamlessStates[url];
        if (state && state.lastRequestAt < now - 10000) {
            // The player stopped polling this variant (quality switch / pause). Start fresh rather than resuming a stale timeline.
            state = null;
        }
        if (!state) {
            state = streamInfo.SeamlessStates[url] = {
                segments: [],
                discontinuitySequence: 0,
                hadLegacyOutput: false,
                lastAdvanceAt: now,
                mainProgressAt: now,
                mainLastUri: null,
                lastRequestAt: now
            };
        }
        state.lastRequestAt = now;
        return state;
    }
    function isSourceAligned(state, playlist) {
        // Guards against a bad sequence mapping: a source's timestamps must agree with the timeline we've already
        // shown (sessions differ by under a segment, so a few seconds of tolerance is plenty).
        if (state.segments.length == 0) {
            return true;
        }
        const tail = state.segments[state.segments.length - 1];
        let closest = null;
        for (const segment of playlist.segments) {
            if (segment.seq !== null && Number.isFinite(segment.pdt) && (!closest || Math.abs(segment.seq - tail.seq) < Math.abs(closest.seq - tail.seq))) {
                closest = segment;
            }
        }
        if (!closest) {
            return true;
        }
        const known = state.segments.find((entry) => entry.seq == closest.seq);
        const expectedPdt = known ? known.pdt : tail.pdt + (closest.seq - tail.seq) * tail.duration * 1000;
        return Math.abs(closest.pdt - expectedPdt) <= SeamlessMaxPdtDriftMs;
    }
    function buildSeamlessPlaylist(streamInfo, url, mainText, haveAdTags, backupResults) {
        // Instead of handing the player a different session's playlist during ads (whose numbering and timestamps
        // don't match what it was playing, which makes it freeze, rebuffer or repeat segments), keep one continuous
        // playlist per variant. Segments are keyed by their live sequence number and taken from whichever source has
        // them without ads: the player's own session first, then backups. Returns null to fall back to legacy output.
        const main = parseM3u8Playlist(mainText);
        if (main.hasEndList) {
            delete streamInfo.SeamlessStates[url];
            return null;
        }
        const state = getSeamlessState(streamInfo, url);
        const now = Date.now();
        const mainVariantKey = getVariantKey(streamInfo.Urls[url]);
        const sources = [];
        if (SimulatedAdsDepth == 0) {
            sources.push({ name: 'main', playlist: main, variantKey: mainVariantKey });
        }
        const sortedBackups = backupResults
            .filter((result) => result && result.text)
            .sort((a, b) => (a.variantKey == mainVariantKey ? 0 : 1) - (b.variantKey == mainVariantKey ? 0 : 1));
        for (const result of sortedBackups) {
            const playlist = parseM3u8Playlist(result.text);
            if (result.hasAds && !playlist.hasAds) {
                continue;// Simulated ad
            }
            sources.push({ name: result.playerType, playlist, variantKey: result.variantKey || mainVariantKey });
        }
        const candidates = new Map();
        const usedSources = [];
        let maxSeq = -Infinity;
        for (const source of sources) {
            if (!mapLiveSequences(source.playlist)) {
                continue;
            }
            if (!isSourceAligned(state, source.playlist)) {
                debugLog('seamless-source-rejected', {
                    channelName: streamInfo.ChannelName,
                    source: source.name,
                    tailSeq: state.segments.length ? state.segments[state.segments.length - 1].seq : null
                });
                continue;
            }
            usedSources.push(source);
            for (const segment of source.playlist.segments) {
                if (segment.seq !== null && !candidates.has(segment.seq)) {
                    candidates.set(segment.seq, { segment, source });
                    maxSeq = Math.max(maxSeq, segment.seq);
                }
            }
        }
        const appendSegment = (seq, isJump) => {
            const { segment, source } = candidates.get(seq);
            const previous = state.segments[state.segments.length - 1];
            const entry = {
                seq,
                uri: segment.uri,
                extinf: segment.extinf,
                duration: segment.duration,
                tags: segment.tags,
                map: segment.map,
                variantKey: source.variantKey,
                source: source.name,
                pdt: Number.isFinite(segment.pdt) ? segment.pdt : now,
                discontinuity: state.hadLegacyOutput && !previous
            };
            if (previous) {
                // Keep timestamps on one linear timeline; sessions disagree by a fraction of a segment
                entry.pdt = previous.pdt + (seq - previous.seq) * previous.duration * 1000;
                entry.discontinuity = isJump || previous.variantKey != entry.variantKey || previous.map != entry.map;
            }
            if (isJump) {
                // The playlist must stay contiguous, so everything before the gap goes
                for (const removed of state.segments) {
                    if (removed.discontinuity) {
                        state.discontinuitySequence++;
                    }
                }
                state.segments = [];
            }
            state.segments.push(entry);
            while (state.segments.length > SeamlessWindowSize) {
                if (state.segments.shift().discontinuity) {
                    state.discontinuitySequence++;
                }
            }
        };
        let appendedCount = 0;
        if (state.segments.length == 0) {
            if (candidates.size == 0) {
                if (haveAdTags) {
                    state.hadLegacyOutput = true;
                }
                return null;
            }
            let firstSeq = maxSeq;
            while (candidates.has(firstSeq - 1) && maxSeq - firstSeq + 1 < SeamlessWindowSize) {
                firstSeq--;
            }
            for (let seq = firstSeq; seq <= maxSeq; seq++) {
                appendSegment(seq, false);
                appendedCount++;
            }
        } else {
            let tailSeq = state.segments[state.segments.length - 1].seq;
            while (true) {
                if (candidates.has(tailSeq + 1)) {
                    appendSegment(++tailSeq, false);
                    appendedCount++;
                } else if (maxSeq >= tailSeq + SeamlessGapJumpSegments) {
                    // Nothing will ever fill the gap (ad with no ad-free backup). Rejoin close to the live edge.
                    let nextSeq = Math.max(tailSeq + 2, maxSeq - 2);
                    while (!candidates.has(nextSeq)) {
                        nextSeq++;
                    }
                    debugLog('seamless-gap-jump', {
                        channelName: streamInfo.ChannelName,
                        fromSeq: tailSeq,
                        toSeq: nextSeq
                    });
                    appendSegment(nextSeq, true);
                    appendedCount++;
                    tailSeq = nextSeq;
                } else {
                    break;
                }
            }
        }
        if (appendedCount > 0) {
            state.lastAdvanceAt = now;
        }
        const mainLastUri = main.segments.length ? main.segments[main.segments.length - 1].uri : null;
        if (mainLastUri && mainLastUri != state.mainLastUri) {
            state.mainLastUri = mainLastUri;
            state.mainProgressAt = now;
        }
        if (!haveAdTags && state.mainProgressAt - state.lastAdvanceAt > SeamlessStallResetMs) {
            // The real stream is moving but nothing maps onto our timeline any more. Start over from the main
            // playlist and reload the player so it accepts the new numbering cleanly.
            console.log('Seamless playlist stalled; resetting');
            debugLog('seamless-reset', {
                channelName: streamInfo.ChannelName,
                tailSeq: state.segments.length ? state.segments[state.segments.length - 1].seq : null,
                mainMediaSequence: main.mediaSequence,
                mainLiveSequence: main.liveSequence
            });
            delete streamInfo.SeamlessStates[url];
            if (LastSeamlessReload < now - 30000) {
                LastSeamlessReload = now;
                streamInfo.LastPlayerReload = now;
                postMessage({
                    key: 'ReloadPlayer'
                });
            }
            return null;
        }
        const segments = state.segments;
        const tail = segments[segments.length - 1];
        debugLog('seamless-playlist', {
            channelName: streamInfo.ChannelName,
            haveAdTags,
            appendedCount,
            firstSeq: segments[0].seq,
            tailSeq: tail.seq,
            tailSource: tail.source,
            sources: usedSources.map((source) => source.name)
        });
        if (!haveAdTags && !main.hasAds && state.discontinuitySequence == 0 && main.segments.length > 0 && main.mediaSequence + main.segments.length - 1 == tail.seq) {
            // Nothing to fix: hand the player Twitch's playlist untouched
            const isUnchanged = main.segments.every((segment, index) => {
                const entry = segments.find((item) => item.seq == main.mediaSequence + index);
                return entry && entry.uri == segment.uri && entry.pdt == segment.pdt && !entry.discontinuity;
            });
            if (isUnchanged) {
                return mainText;
            }
        }
        let prefetchLines = [];
        for (const source of usedSources) {
            const sourceSegments = source.playlist.segments;
            const sourceTail = sourceSegments[sourceSegments.length - 1];
            if (!source.playlist.hasAds && sourceTail && sourceTail.seq == tail.seq && source.variantKey == tail.variantKey) {
                prefetchLines = source.playlist.prefetch;
                break;
            }
        }
        return renderSeamlessPlaylist(state, main, prefetchLines);
    }
    function renderSeamlessPlaylist(state, main, prefetchLines) {
        const segments = state.segments;
        let targetDuration = main.targetDuration || 0;
        for (const segment of segments) {
            targetDuration = Math.max(targetDuration, Math.ceil(segment.duration));
        }
        const lines = ['#EXTM3U'];
        const headerLines = [];
        for (const line of main.header) {
            if (line == '#EXTM3U' || isDroppedPlaylistTag(line, main.hasAds)) {
                continue;
            }
            if (line.startsWith('#EXT-X-VERSION:')) {
                lines.push(line);
            } else {
                headerLines.push(line);
            }
        }
        if (lines.length == 1) {
            lines.push('#EXT-X-VERSION:3');
        }
        lines.push('#EXT-X-TARGETDURATION:' + targetDuration);
        lines.push('#EXT-X-MEDIA-SEQUENCE:' + segments[0].seq);
        lines.push('#EXT-X-TWITCH-LIVE-SEQUENCE:' + segments[0].seq);
        if (state.discontinuitySequence > 0) {
            lines.push('#EXT-X-DISCONTINUITY-SEQUENCE:' + state.discontinuitySequence);
        }
        lines.push(...headerLines);
        let currentMap = null;
        for (const segment of segments) {
            if (segment.discontinuity) {
                lines.push('#EXT-X-DISCONTINUITY');
            }
            if (segment.map && segment.map != currentMap) {
                lines.push(segment.map);
                currentMap = segment.map;
            }
            lines.push(...segment.tags);
            lines.push('#EXT-X-PROGRAM-DATE-TIME:' + new Date(segment.pdt).toISOString());
            lines.push(segment.extinf);
            lines.push(segment.uri);
        }
        lines.push(...prefetchLines);
        return lines.join('\n') + '\n';
    }
    function getBackupState(streamInfo, playerType) {
        if (!streamInfo.BackupStates[playerType]) {
            streamInfo.BackupStates[playerType] = {
                Encodings: null,
                EncodingsAt: 0,
                EncodingsPromise: null,
                AdsSince: 0
            };
        }
        return streamInfo.BackupStates[playerType];
    }
    function ensureBackupEncodings(streamInfo, playerType, forceFresh, realFetch) {
        const backupState = getBackupState(streamInfo, playerType);
        if (!forceFresh && backupState.Encodings && backupState.EncodingsAt > Date.now() - BackupEncodingsMaxAgeMs) {
            return Promise.resolve(backupState.Encodings);
        }
        if (!backupState.EncodingsPromise) {
            // Shared so concurrent callers (ad polls, warmups, other variants) don't each request a token
            backupState.EncodingsPromise = (async () => {
                try {
                    const accessTokenResponse = await getAccessToken(streamInfo.ChannelName, playerType);
                    if (accessTokenResponse.status !== 200) {
                        return null;
                    }
                    const accessToken = await accessTokenResponse.json();
                    const urlInfo = new URL('https://usher.ttvnw.net/api/' + (V2API ? 'v2/' : '') + 'channel/hls/' + streamInfo.ChannelName + '.m3u8' + streamInfo.UsherParams);
                    urlInfo.searchParams.set('sig', accessToken.data.streamPlaybackAccessToken.signature);
                    urlInfo.searchParams.set('token', accessToken.data.streamPlaybackAccessToken.value);
                    const encodingsM3u8Response = await realFetch(urlInfo.href);
                    if (encodingsM3u8Response.status !== 200) {
                        return null;
                    }
                    backupState.Encodings = await encodingsM3u8Response.text();
                    backupState.EncodingsAt = Date.now();
                    backupState.AdsSince = 0;
                    return backupState.Encodings;
                } catch (err) {
                    return null;
                } finally {
                    backupState.EncodingsPromise = null;
                }
            })();
        }
        return backupState.EncodingsPromise;
    }
    async function fetchBackupPlaylist(streamInfo, playerType, resolutionInfo, realFetch) {
        const backupState = getBackupState(streamInfo, playerType);
        // A session that keeps showing ads gets a new token now and then; a new session may be ad free
        let forceFresh = backupState.AdsSince > 0 && backupState.AdsSince < Date.now() - BackupSessionRefreshMs;
        if (forceFresh && backupState.Encodings && backupState.EncodingsAt > Date.now() - BackupEncodingsMaxAgeMs) {
            // Swap sessions in the background. This poll still uses the current one so the player's playlist
            // request isn't held up by a token round trip.
            ensureBackupEncodings(streamInfo, playerType, true, realFetch);
            forceFresh = false;
        }
        for (let attempt = 0; attempt < 2; attempt++) {
            const encodingsM3u8 = await ensureBackupEncodings(streamInfo, playerType, forceFresh, realFetch);
            if (!encodingsM3u8) {
                return null;
            }
            const streamM3u8Url = getStreamUrlForResolution(encodingsM3u8, resolutionInfo);
            if (!streamM3u8Url) {
                return null;
            }
            let response = null;
            try {
                response = await realFetch(streamM3u8Url);
            } catch (err) {}
            if (response && response.status === 200) {
                const text = await response.text();
                const hasAds = hasAdMarkers(text);
                if (!hasAds) {
                    backupState.AdsSince = 0;
                } else if (!backupState.AdsSince) {
                    backupState.AdsSince = Date.now();
                }
                debugLog('backup-playlist', {
                    channelName: streamInfo.ChannelName,
                    playerType,
                    forceFresh,
                    streamM3u8Url: summarizeUrl(streamM3u8Url),
                    hasAdMarkers: hasAds,
                    summary: getAdMarkerSummary(text)
                });
                return {
                    playerType,
                    text,
                    hasAds,
                    variantKey: getVariantKeyForUrl(encodingsM3u8, streamM3u8Url)
                };
            }
            // Expired token or the stream restarted. Try once more with a fresh session.
            forceFresh = true;
        }
        return null;
    }
    async function getBackupPlaylists(streamInfo, resolutionInfo, realFetch) {
        // Returns every backup playlist we could get, best first. Sessions we already hold a token for are
        // queried in parallel (one request each); new tokens are only requested if none of those are ad free.
        const playerTypes = BackupPlayerTypes.map((playerType) => playerType.replace('-CACHED', ''));
        const preferred = streamInfo.PreferredBackupType;
        const orderedTypes = preferred && playerTypes.includes(preferred) ? [preferred].concat(playerTypes.filter((playerType) => playerType != preferred)) : playerTypes;
        const fetchAll = async (types) => {
            // All requests start together, but we only wait until the best ad-free one is in. Slower ones
            // (e.g. a token refresh) finish in the background and still update their session state.
            const promises = types.map((playerType) => fetchBackupPlaylist(streamInfo, playerType, resolutionInfo, realFetch).catch(() => null));
            const results = [];
            for (const promise of promises) {
                const result = await promise;
                if (!result) {
                    continue;
                }
                if (SimulatedAdsDepth > 0 && playerTypes.indexOf(result.playerType) < SimulatedAdsDepth - 1) {
                    result.hasAds = true;
                }
                results.push(result);
                if (!result.hasAds) {
                    break;
                }
            }
            return results;
        };
        const warmTypes = orderedTypes.filter((playerType) => getBackupState(streamInfo, playerType).Encodings);
        let results = warmTypes.length > 0 ? await fetchAll(warmTypes) : [];
        if (!results.some((result) => !result.hasAds)) {
            const coldTypes = orderedTypes.filter((playerType) => !warmTypes.includes(playerType));
            if (coldTypes.length > 0) {
                results = results.concat(await fetchAll(coldTypes));
            }
        }
        results.sort((a, b) => orderedTypes.indexOf(a.playerType) - orderedTypes.indexOf(b.playerType));
        const adFreeResult = results.find((result) => !result.hasAds);
        if (adFreeResult) {
            streamInfo.PreferredBackupType = adFreeResult.playerType;
        }
        return results;
    }
    function warmBackupPlaylist(streamInfo, resolutionInfo, realFetch) {
        // Keeps backup sessions (tokens + a polled playlist) ready ahead of time so the first ad poll costs one
        // request instead of three. Polling a backup also lets its own preroll play out in the background.
        const now = Date.now();
        if (!BackupWarmIntervalMs || streamInfo.CreatedAt > now - BackupWarmStartDelayMs || streamInfo.BackupWarmAt > now - BackupWarmIntervalMs) {
            return;
        }
        streamInfo.BackupWarmAt = now;
        const playerTypes = BackupPlayerTypes.map((playerType) => playerType.replace('-CACHED', ''));
        if (streamInfo.BackupWarmIndex == 0) {
            // First warmup gets a session for every type, so whichever one is ad free when an ad starts is a
            // single request away. After that, one type per interval keeps them all polled and their tokens fresh.
            streamInfo.BackupWarmIndex = playerTypes.length;
            for (const playerType of playerTypes) {
                fetchBackupPlaylist(streamInfo, playerType, resolutionInfo, realFetch).catch(() => {});
            }
            return;
        }
        const playerType = playerTypes[streamInfo.BackupWarmIndex++ % playerTypes.length];
        fetchBackupPlaylist(streamInfo, playerType, resolutionInfo, realFetch).catch(() => {});
    }
    async function processM3U8(url, textStr, realFetch, backupPromise) {
        const streamInfo = StreamInfosByUrl[url];
        if (!streamInfo) {
            return textStr;
        }
        if (HasTriggeredPlayerReload) {
            HasTriggeredPlayerReload = false;
            streamInfo.LastPlayerReload = Date.now();
            streamInfo.SeamlessStates = {};
        }
        const haveAdTags = hasAdMarkers(textStr) || SimulatedAdsDepth > 0;
        const currentResolution = streamInfo.Urls[url];
        let backupResults = [];
        let isHevc = false;
        if (haveAdTags) {
            streamInfo.IsMidroll = textStr.toLowerCase().includes('midroll');
            debugLog('ad-playlist', {
                channelName: streamInfo.ChannelName,
                playlistUrl: summarizeUrl(url),
                isMidroll: streamInfo.IsMidroll,
                activeBackupPlayerType: streamInfo.ActiveBackupPlayerType,
                summary: getAdMarkerSummary(textStr)
            });
            if (!streamInfo.IsShowingAd) {
                streamInfo.IsShowingAd = true;
                postMessage({
                    key: 'UpdateAdBlockBanner',
                    isMidroll: streamInfo.IsMidroll,
                    hasAds: streamInfo.IsShowingAd,
                    isStrippingAdSegments: false
                });
            }
            if (!streamInfo.IsMidroll) {
                const lines = textStr.replaceAll('\r', '').split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.startsWith('#EXTINF') && lines.length > i + 1) {
                        if (!line.includes(',live') && !streamInfo.RequestedAds.has(lines[i + 1])) {
                            // Only request one .ts file per .m3u8 request to avoid making too many requests
                            //console.log('Fetch ad .ts file');
                            streamInfo.RequestedAds.add(lines[i + 1]);
                            fetch(lines[i + 1]).then((response)=>{response.blob()});
                            break;
                        }
                    }
                }
            }
            if (!currentResolution) {
                console.log('Ads will leak due to missing resolution info for ' + url);
                debugLog('missing-resolution-info', {
                    playlistUrl: summarizeUrl(url),
                    knownUrlCount: Object.keys(streamInfo.Urls).length,
                    summary: getAdMarkerSummary(textStr)
                });
                return textStr;
            }
            isHevc = currentResolution.Codecs.startsWith('hev') || currentResolution.Codecs.startsWith('hvc');
            if (((isHevc && !SkipPlayerReloadOnHevc) || AlwaysReloadPlayerOnAd) && streamInfo.ModifiedM3U8 && !streamInfo.IsUsingModifiedM3U8) {
                streamInfo.IsUsingModifiedM3U8 = true;
                streamInfo.LastPlayerReload = Date.now();
                postMessage({
                    key: 'ReloadPlayer'
                });
            }
            backupResults = await (backupPromise || getBackupPlaylists(streamInfo, currentResolution, realFetch));
            const adFreeResult = backupResults.find((result) => !result.hasAds);
            const backupPlayerType = adFreeResult ? adFreeResult.playerType : null;
            streamInfo.IsStrippingAdSegments = !adFreeResult;
            if (streamInfo.ActiveBackupPlayerType != backupPlayerType) {
                streamInfo.ActiveBackupPlayerType = backupPlayerType;
                if (backupPlayerType) {
                    console.log(`Blocking${(streamInfo.IsMidroll ? ' midroll ' : ' ')}ads (${backupPlayerType})`);
                }
            }
        } else {
            if (streamInfo.IsShowingAd) {
                console.log('Finished blocking ads');
                debugLog('ad-finished', {
                    channelName: streamInfo.ChannelName,
                    activeBackupPlayerType: streamInfo.ActiveBackupPlayerType,
                    totalStrippedSegments: streamInfo.NumStrippedAdSegments
                });
                streamInfo.IsShowingAd = false;
                streamInfo.IsStrippingAdSegments = false;
                streamInfo.NumStrippedAdSegments = 0;
                streamInfo.ActiveBackupPlayerType = null;
                if (streamInfo.IsUsingModifiedM3U8 || ReloadPlayerAfterAd) {
                    streamInfo.IsUsingModifiedM3U8 = false;
                    streamInfo.LastPlayerReload = Date.now();
                    debugLog('post-ad-recovery', { action: 'reload' });
                    postMessage({
                        key: 'ReloadPlayer'
                    });
                } else if (PauseResumePlayerAfterAd) {
                    debugLog('post-ad-recovery', { action: 'pause-resume' });
                    postMessage({
                        key: 'PauseResumePlayer'
                    });
                }
            }
            if (backupPromise) {
                // Started while the ad was still running; it can still bridge the hand back to the main stream
                backupResults = await backupPromise;
            }
            if (currentResolution) {
                warmBackupPlaylist(streamInfo, currentResolution, realFetch);
            }
        }
        let outputText = SeamlessPlaylists ? buildSeamlessPlaylist(streamInfo, url, textStr, haveAdTags, backupResults) : null;
        if (outputText === null) {
            outputText = textStr;
            if (haveAdTags) {
                // Legacy behaviour: swap in a backup playlist and blank out any remaining ad segments
                const backupResult = backupResults.find((result) => !result.hasAds)
                    || backupResults.find((result) => result.playerType == FallbackPlayerType)
                    || backupResults[0];
                if (backupResult) {
                    outputText = backupResult.text;
                    debugLog('backup-selected', {
                        channelName: streamInfo.ChannelName,
                        playerType: backupResult.playerType,
                        isMidroll: streamInfo.IsMidroll,
                        summary: getAdMarkerSummary(backupResult.text)
                    });
                }
                // TODO: Improve hevc stripping. It should always strip when there is a codec mismatch (both ways)
                const stripHevc = isHevc && streamInfo.ModifiedM3U8;
                if (IsAdStrippingEnabled || stripHevc) {
                    const strippedBefore = streamInfo.NumStrippedAdSegments;
                    outputText = stripAdSegments(outputText, stripHevc, streamInfo);
                    debugLog('strip-result', {
                        channelName: streamInfo.ChannelName,
                        stripHevc,
                        isStrippingAdSegments: streamInfo.IsStrippingAdSegments,
                        newlyStrippedSegments: streamInfo.NumStrippedAdSegments - strippedBefore,
                        totalStrippedSegments: streamInfo.NumStrippedAdSegments,
                        outputSummary: getAdMarkerSummary(outputText)
                    });
                }
            }
        }
        postMessage({
            key: 'UpdateAdBlockBanner',
            isMidroll: streamInfo.IsMidroll,
            hasAds: streamInfo.IsShowingAd,
            isStrippingAdSegments: streamInfo.IsStrippingAdSegments,
            numStrippedAdSegments: streamInfo.NumStrippedAdSegments
        });
        return outputText;
    }
    function parseAttributes(str) {
        return Object.fromEntries(
            str.split(/(?:^|,)((?:[^=]*)=(?:"[^"]*"|[^,]*))/)
            .filter(Boolean)
            .map(x => {
                const idx = x.indexOf('=');
                const key = x.substring(0, idx);
                const value = x.substring(idx + 1);
                const num = Number(value);
                return [key, Number.isNaN(num) ? value.startsWith('"') ? JSON.parse(value) : value : num];
            }));
    }
    function getAccessToken(channelName, playerType) {
        const body = {
            operationName: 'PlaybackAccessToken',
            variables: {
                isLive: true,
                login: channelName,
                isVod: false,
                vodID: "",
                playerType: playerType,
                platform: playerType == 'autoplay' ? 'android' : 'web'
            },
            extensions: {
                persistedQuery: {
                    version:1,
                    sha256Hash:"ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9"
                }
            }
        };
        return gqlRequest(body, playerType);
    }
    function gqlRequest(body, playerType) {
        if (!GQLDeviceID) {
            GQLDeviceID = '';
            const dcharacters = 'abcdefghijklmnopqrstuvwxyz0123456789';
            const dcharactersLength = dcharacters.length;
            for (let i = 0; i < 32; i++) {
                GQLDeviceID += dcharacters.charAt(Math.floor(Math.random() * dcharactersLength));
            }
        }
        let headers = {
            'Client-ID': ClientID,
            'X-Device-Id': GQLDeviceID,
            'Authorization': AuthorizationHeader,
            ...(ClientIntegrityHeader && {'Client-Integrity': ClientIntegrityHeader}),
            ...(ClientVersion && {'Client-Version': ClientVersion}),
            ...(ClientSession && {'Client-Session-Id': ClientSession})
        };
        return new Promise((resolve, reject) => {
            const requestId = Math.random().toString(36).substring(2, 15);
            const fetchRequest = {
                id: requestId,
                url: 'https://gql.twitch.tv/gql',
                options: {
                    method: 'POST',
                    body: JSON.stringify(body),
                    headers
                }
            };
            pendingFetchRequests.set(requestId, {
                resolve,
                reject
            });
            postMessage({
                key: 'FetchRequest',
                value: fetchRequest
            });
        });
    }
    let playerForMonitoringBuffering = null;
    const playerBufferState = {
        channelName: null,
        hasStreamStarted: false,
        position: 0,
        bufferedPosition: 0,
        bufferDuration: 0,
        numSame: 0,
        lastFixTime: 0,
        isLive: true
    };
    function monitorPlayerBuffering() {
        if (playerForMonitoringBuffering) {
            try {
                const player = playerForMonitoringBuffering.player;
                const state = playerForMonitoringBuffering.state;
                if (!player.core) {
                    playerForMonitoringBuffering = null;
                } else if (state.props?.content?.type === 'live' && !player.isPaused() && !player.getHTMLVideoElement()?.ended && playerBufferState.lastFixTime <= Date.now() - PlayerBufferingMinRepeatDelay && !isActivelyStrippingAds) {
                    const m3u8Url = player.core?.state?.path;
                    if (m3u8Url) {
                      const fileName = new URL(m3u8Url).pathname.split('/').pop();
                      if (fileName?.endsWith('.m3u8')) {
                          const channelName = fileName.slice(0, -5);
                          if (playerBufferState.channelName != channelName) {
                              playerBufferState.channelName = channelName;
                              playerBufferState.hasStreamStarted = false;
                              playerBufferState.numSame = 0;
                              //console.log('Channel changed to ' + channelName);
                          }
                      }
                    }
                    if (player.getState() === 'Playing') {
                        playerBufferState.hasStreamStarted = true;
                    }
                    const position = player.core?.state?.position;
                    const bufferedPosition = player.core?.state?.bufferedPosition;
                    const bufferDuration = player.getBufferDuration();
                    if (position !== undefined && bufferedPosition !== undefined) {
                        //console.log('position:' + position + ' bufferDuration:' + bufferDuration + ' bufferPosition:' + bufferedPosition + ' state: ' + player.core?.state?.state + ' started: ' + playerBufferState.hasStreamStarted);
                        // NOTE: This could be improved. It currently lets the player fully eat the full buffer before it triggers pause/play
                        if (playerBufferState.hasStreamStarted &&
                            (!PlayerBufferingPrerollCheckEnabled || position > PlayerBufferingPrerollCheckOffset) &&
                            (playerBufferState.position == position || bufferDuration < PlayerBufferingDangerZone)  &&
                            playerBufferState.bufferedPosition == bufferedPosition &&
                            playerBufferState.bufferDuration >= bufferDuration &&
                            (position != 0 || bufferedPosition != 0 || bufferDuration != 0)
                        ) {
                            playerBufferState.numSame++;
                            if (playerBufferState.numSame == PlayerBufferingSameStateCount) {
                                console.log('Attempt to fix buffering position:' + playerBufferState.position + ' bufferedPosition:' + playerBufferState.bufferedPosition + ' bufferDuration:' + playerBufferState.bufferDuration);
                                const isPausePlay = !PlayerBufferingDoPlayerReload;
                                const isReload = PlayerBufferingDoPlayerReload;
                                doTwitchPlayerTask(isPausePlay, isReload);
                                playerBufferState.lastFixTime = Date.now();
                                playerBufferState.numSame = 0;
                            }
                        } else {
                            playerBufferState.numSame = 0;
                        }
                        playerBufferState.position = position;
                        playerBufferState.bufferedPosition = bufferedPosition;
                        playerBufferState.bufferDuration = bufferDuration;
                    } else {
                        playerBufferState.numSame = 0;
                    }
                }
            } catch (err) {
                console.error('error when monitoring player for buffering: ' + err);
                playerForMonitoringBuffering = null;
            }
        }
        if (!playerForMonitoringBuffering) {
            const playerAndState = getPlayerAndState();
            if (playerAndState && playerAndState.player && playerAndState.state) {
                playerForMonitoringBuffering = {
                    player: playerAndState.player,
                    state: playerAndState.state
                };
            }
        }
        const isLive = playerForMonitoringBuffering?.state?.props?.content?.type === 'live';
        if (playerBufferState.isLive && !isLive) {
            updateAdblockBanner({
                hasAds: false
            });
        }
        playerBufferState.isLive = isLive;
        setTimeout(monitorPlayerBuffering, PlayerBufferingDelay);
    }
    function updateAdblockBanner(data) {
        const playerRootDiv = document.querySelector('.video-player');
        if (playerRootDiv != null) {
            let adBlockDiv = null;
            adBlockDiv = playerRootDiv.querySelector('.adblock-overlay');
            if (adBlockDiv == null) {
                adBlockDiv = document.createElement('div');
                adBlockDiv.className = 'adblock-overlay';
                adBlockDiv.innerHTML = '<div class="player-adblock-notice" style="color: white; background-color: rgba(0, 0, 0, 0.8); position: absolute; top: 0px; left: 0px; padding: 5px;"><p></p></div>';
                adBlockDiv.style.display = 'none';
                adBlockDiv.P = adBlockDiv.querySelector('p');
                playerRootDiv.appendChild(adBlockDiv);
            }
            if (adBlockDiv != null) {
                isActivelyStrippingAds = data.isStrippingAdSegments;
                const overlayText = 'Blocking' + (data.isMidroll ? ' midroll' : '') + ' ads' + (data.isStrippingAdSegments ? ' (stripping)' : '') + ` v${twitchAdblockVersion}`;// + (data.numStrippedAdSegments > 0 ? ` (${data.numStrippedAdSegments})` : '');
                const overlayDisplay = data.hasAds && playerBufferState.isLive ? 'block' : 'none';
                if (lastAdblockOverlayText !== overlayText) {
                    adBlockDiv.P.textContent = overlayText;
                    lastAdblockOverlayText = overlayText;
                }
                if (lastAdblockOverlayDisplay !== overlayDisplay) {
                    adBlockDiv.style.display = overlayDisplay;
                    lastAdblockOverlayDisplay = overlayDisplay;
                }
            }
        }
    }
    function getPlayerAndState() {
        function findReactNode(root, constraint) {
            if (root.stateNode && constraint(root.stateNode)) {
                return root.stateNode;
            }
            let node = root.child;
            while (node) {
                const result = findReactNode(node, constraint);
                if (result) {
                    return result;
                }
                node = node.sibling;
            }
            return null;
        }
        function findReactRootNode() {
            let reactRootNode = null;
            const rootNode = document.querySelector('#root');
            if (rootNode && rootNode._reactRootContainer && rootNode._reactRootContainer._internalRoot && rootNode._reactRootContainer._internalRoot.current) {
                reactRootNode = rootNode._reactRootContainer._internalRoot.current;
            }
            if (reactRootNode == null && rootNode != null) {
                const containerName = Object.keys(rootNode).find(x => x.startsWith('__reactContainer'));
                if (containerName != null) {
                    reactRootNode = rootNode[containerName];
                }
            }
            return reactRootNode;
        }
        const reactRootNode = findReactRootNode();
        if (!reactRootNode) {
            return null;
        }
        let player = findReactNode(reactRootNode, node => node.setPlayerActive && node.props && node.props.mediaPlayerInstance);
        player = player && player.props && player.props.mediaPlayerInstance ? player.props.mediaPlayerInstance : null;
        if (player?.playerInstance) {
            player = player.playerInstance;
        }
        const playerState = findReactNode(reactRootNode, node => node.setSrc && node.setInitialPlaybackSettings);
        return  {
            player: player,
            state: playerState
        };
    }
    function doTwitchPlayerTask(isPausePlay, isReload) {
        const playerAndState = getPlayerAndState();
        if (!playerAndState) {
            console.log('Could not find react root');
            recordTwitchAdblockDebug('page', 'player-task-skipped', { reason: 'missing-react-root', isPausePlay, isReload });
            return;
        }
        const player = playerAndState.player;
        const playerState = playerAndState.state;
        if (!player) {
            console.log('Could not find player');
            recordTwitchAdblockDebug('page', 'player-task-skipped', { reason: 'missing-player', isPausePlay, isReload });
            return;
        }
        if (!playerState) {
            console.log('Could not find player state');
            recordTwitchAdblockDebug('page', 'player-task-skipped', { reason: 'missing-player-state', isPausePlay, isReload });
            return;
        }
        if (player.isPaused() || player.core?.paused) {
            recordTwitchAdblockDebug('page', 'player-task-skipped', { reason: 'player-paused', isPausePlay, isReload });
            return;
        }
        playerBufferState.lastFixTime = Date.now();
        playerBufferState.numSame = 0;
        if (isPausePlay) {
            recordTwitchAdblockDebug('page', 'player-task-run', { task: 'pause-resume' });
            player.pause();
            player.play();
            return;
        }
        if (isReload) {
            const lsKeyQuality = 'video-quality';
            const lsKeyMuted = 'video-muted';
            const lsKeyVolume = 'volume';
            let currentQualityLS = null;
            let currentMutedLS = null;
            let currentVolumeLS = null;
            try {
                currentQualityLS = localStorage.getItem(lsKeyQuality);
                currentMutedLS = localStorage.getItem(lsKeyMuted);
                currentVolumeLS = localStorage.getItem(lsKeyVolume);
                if (localStorageHookFailed && player?.core?.state) {
                    localStorage.setItem(lsKeyMuted, JSON.stringify({default:player.core.state.muted}));
                    localStorage.setItem(lsKeyVolume, player.core.state.volume);
                }
                if (localStorageHookFailed && player?.core?.state?.quality?.group) {
                    localStorage.setItem(lsKeyQuality, JSON.stringify({default:player.core.state.quality.group}));
                }
            } catch {}
            console.log('Reloading Twitch player');
            recordTwitchAdblockDebug('page', 'player-task-run', { task: 'reload' });
            playerState.setSrc({ isNewMediaPlayerInstance: true, refreshAccessToken: true });
            postTwitchWorkerMessage('TriggeredPlayerReload');
            player.play();
            if (localStorageHookFailed && (currentQualityLS || currentMutedLS || currentVolumeLS)) {
                setTimeout(() => {
                    try {
                        if (currentQualityLS) {
                            localStorage.setItem(lsKeyQuality, currentQualityLS);
                        }
                        if (currentMutedLS) {
                            localStorage.setItem(lsKeyMuted, currentMutedLS);
                        }
                        if (currentVolumeLS) {
                            localStorage.setItem(lsKeyVolume, currentVolumeLS);
                        }
                    } catch {}
                }, 3000);
            }
            return;
        }
    }
    window.reloadTwitchPlayer = () => {
        doTwitchPlayerTask(false, true);
    };
    function postTwitchWorkerMessage(key, value) {
        twitchWorkers.forEach((worker) => {
            worker.postMessage({key: key, value: value});
        });
    }
    async function handleWorkerFetchRequest(fetchRequest) {
        try {
            const response = await window.realFetch(fetchRequest.url, fetchRequest.options);
            const responseBody = await response.text();
            const responseObject = {
                id: fetchRequest.id,
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                body: responseBody
            };
            return responseObject;
        } catch (error) {
            return {
                id: fetchRequest.id,
                error: error.message
            };
        }
    }
    function hookFetch() {
        const realFetch = window.fetch;
        window.realFetch = realFetch;
        window.fetch = function(url, init, ...args) {
            if (typeof url === 'string') {
                if (url.includes('gql')) {
                    let deviceId = init.headers['X-Device-Id'];
                    if (typeof deviceId !== 'string') {
                        deviceId = init.headers['Device-ID'];
                    }
                    if (typeof deviceId === 'string' && GQLDeviceID != deviceId) {
                        GQLDeviceID = deviceId;
                        postTwitchWorkerMessage('UpdateDeviceId', GQLDeviceID);
                    }
                    if (typeof init.headers['Client-Version'] === 'string' && init.headers['Client-Version'] !== ClientVersion) {
                        postTwitchWorkerMessage('UpdateClientVersion', ClientVersion = init.headers['Client-Version']);
                    }
                    if (typeof init.headers['Client-Session-Id'] === 'string' && init.headers['Client-Session-Id'] !== ClientSession) {
                        postTwitchWorkerMessage('UpdateClientSession', ClientSession = init.headers['Client-Session-Id']);
                    }
                    if (typeof init.headers['Client-Integrity'] === 'string' && init.headers['Client-Integrity'] !== ClientIntegrityHeader) {
                        postTwitchWorkerMessage('UpdateClientIntegrityHeader', ClientIntegrityHeader = init.headers['Client-Integrity']);
                    }
                    if (typeof init.headers['Authorization'] === 'string' && init.headers['Authorization'] !== AuthorizationHeader) {
                        postTwitchWorkerMessage('UpdateAuthorizationHeader', AuthorizationHeader = init.headers['Authorization']);
                    }
                    // Get rid of mini player above chat - TODO: Reject this locally instead of having server reject it
                    if (init && typeof init.body === 'string' && init.body.includes('PlaybackAccessToken') && init.body.includes('picture-by-picture')) {
                        init.body = '';
                    }
                    if (ForceAccessTokenPlayerType && typeof init.body === 'string' && init.body.includes('PlaybackAccessToken')) {
                        let replacedPlayerType = '';
                        const newBody = JSON.parse(init.body);
                        if (Array.isArray(newBody)) {
                            for (let i = 0; i < newBody.length; i++) {
                                if (newBody[i]?.variables?.playerType && newBody[i].variables.playerType !== ForceAccessTokenPlayerType) {
                                    replacedPlayerType = newBody[i].variables.playerType;
                                    newBody[i].variables.playerType = ForceAccessTokenPlayerType;
                                }
                            }
                        } else {
                            if (newBody?.variables?.playerType && newBody.variables.playerType !== ForceAccessTokenPlayerType) {
                                replacedPlayerType = newBody.variables.playerType;
                                newBody.variables.playerType = ForceAccessTokenPlayerType;
                            }
                        }
                        if (replacedPlayerType) {
                            console.log(`Replaced '${replacedPlayerType}' player type with '${ForceAccessTokenPlayerType}' player type`);
                            init.body = JSON.stringify(newBody);
                        }
                    }
                }
            }
            return realFetch.apply(this, arguments);
        };
    }
    function onContentLoaded() {
        // This stops Twitch from pausing the player when in another tab and an ad shows.
        // Taken from https://github.com/saucettv/VideoAdBlockForTwitch/blob/cefce9d2b565769c77e3666ac8234c3acfe20d83/chrome/content.js#L30
        try {
            Object.defineProperty(document, 'visibilityState', {
                get() {
                    return 'visible';
                }
            });
        }catch{}
        let hidden = document.__lookupGetter__('hidden');
        let webkitHidden = document.__lookupGetter__('webkitHidden');
        try {
            Object.defineProperty(document, 'hidden', {
                get() {
                    return false;
                }
            });
        }catch{}
        const block = e => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        };
        let wasVideoPlaying = true;
        const visibilityChange = e => {
            const isChrome = typeof chrome !== 'undefined';
            const videos = document.getElementsByTagName('video');
            if (videos.length > 0) {
                if (hidden.apply(document) === true || (webkitHidden && webkitHidden.apply(document) === true)) {
                    wasVideoPlaying = !videos[0].paused && !videos[0].ended;
                } else {
                    if (!playerBufferState.hasStreamStarted) {
                        //console.log('Tab focused. Stream should be active');
                        playerBufferState.hasStreamStarted = true;
                    }
                    if (isChrome && wasVideoPlaying && !videos[0].ended && videos[0].paused && videos[0].muted) {
                        videos[0].play();
                    }
                }
            }
            block(e);
        };
        document.addEventListener('visibilitychange', visibilityChange, true);
        document.addEventListener('webkitvisibilitychange', visibilityChange, true);
        document.addEventListener('mozvisibilitychange', visibilityChange, true);
        document.addEventListener('hasFocus', block, true);
        try {
            if (/Firefox/.test(navigator.userAgent)) {
                Object.defineProperty(document, 'mozHidden', {
                    get() {
                        return false;
                    }
                });
            } else {
                Object.defineProperty(document, 'webkitHidden', {
                    get() {
                        return false;
                    }
                });
            }
        }catch{}
        // Hooks for preserving volume / resolution
        try {
            const keysToCache = [
                'video-quality',
                'video-muted',
                'volume',
                'lowLatencyModeEnabled',// Low Latency
                'persistenceEnabled',// Mini Player
            ];
            const cachedValues = new Map();
            for (let i = 0; i < keysToCache.length; i++) {
                cachedValues.set(keysToCache[i], localStorage.getItem(keysToCache[i]));
            }
            const realSetItem = localStorage.setItem;
            localStorage.setItem = function(key, value) {
                if (cachedValues.has(key)) {
                    cachedValues.set(key, value);
                }
                realSetItem.apply(this, arguments);
            };
            const realGetItem = localStorage.getItem;
            localStorage.getItem = function(key) {
                if (cachedValues.has(key)) {
                    return cachedValues.get(key);
                }
                return realGetItem.apply(this, arguments);
            };
            if (!localStorage.getItem.toString().includes(Object.keys({cachedValues})[0])) {
                // These hooks are useful to preserve player state on player reload
                // Firefox doesn't allow hooking of localStorage functions but chrome does
                localStorageHookFailed = true;
            }
        } catch (err) {
            console.log('localStorageHooks failed ' + err)
            localStorageHookFailed = true;
        }
    }
    declareOptions(window);
    hookWindowWorker();
    hookFetch();
    if (PlayerBufferingFix) {
        monitorPlayerBuffering();
    }
    if (document.readyState === "complete" || document.readyState === "loaded" || document.readyState === "interactive") {
        onContentLoaded();
    } else {
        window.addEventListener("DOMContentLoaded", function() {
            onContentLoaded();
        });
    }
    window.simulateAds = (depth) => {
        if (depth === undefined || depth < 0) {
            console.log('Ad depth paramter required (0 = no simulated ad, 1+ = use backup player for given depth)');
            return;
        }
        postTwitchWorkerMessage('SimulateAds', depth);
    };
    window.allSegmentsAreAdSegments = () => {
        postTwitchWorkerMessage('AllSegmentsAreAdSegments');
    };
})();
