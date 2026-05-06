/**
 * MixtaPR — background service worker
 * Handles: Spotify PKCE OAuth via chrome.identity, token refresh, GitHub API, MixtaPR API.
 */

const SPOTIFY_CLIENT_ID = "3ab017e03cd044809636a87e5749293a";

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_QUEUE_URL = "https://api.spotify.com/v1/me/player/queue";
const SPOTIFY_TRACK_URL = "https://api.spotify.com/v1/tracks";
const SCOPE = "user-modify-playback-state";

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generateRandom(length) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function pkceChallenge(verifier) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ── Storage helpers ───────────────────────────────────────────────────────────

async function getSettings() {
  return new Promise(resolve =>
    chrome.storage.local.get(
      { serviceUrl: "http://localhost:5226", accessToken: "", refreshToken: "", tokenExpiry: 0 },
      resolve
    )
  );
}

async function saveSettings(data) {
  return new Promise(resolve => chrome.storage.local.set(data, resolve));
}

function serviceUrl(settings) {
  return settings.serviceUrl.replace(/\/$/, "");
}

// ── OAuth flow ────────────────────────────────────────────────────────────────

async function spotifyAuth() {
  const clientId = SPOTIFY_CLIENT_ID;

  const verifier = generateRandom(32);
  const challenge = await pkceChallenge(verifier);
  const state = generateRandom(8);
  const redirectUri = chrome.identity.getRedirectURL();

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPE,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
  });

  const authUrl = `${SPOTIFY_AUTH_URL}?${params}`;

  const responseUrl = await new Promise((resolve, reject) =>
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, url => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      resolve(url);
    })
  );

  const url = new URL(responseUrl);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  if (returnedState !== state) throw new Error("State mismatch — possible CSRF.");
  if (!code) throw new Error("No code in Spotify response.");

  return exchangeCode(clientId, code, verifier, redirectUri);
}

async function exchangeCode(clientId, code, verifier, redirectUri) {
  const resp = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
  if (!resp.ok) throw new Error(`Token exchange failed: ${resp.status}`);
  return resp.json();
}

async function refreshToken(clientId, refreshTok) {
  const resp = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshTok,
      client_id: clientId,
    }),
  });
  if (!resp.ok) throw new Error(`Token refresh failed: ${resp.status}`);
  return resp.json();
}

async function ensureValidToken() {
  const settings = await getSettings();
  const now = Date.now();

  if (settings.accessToken && settings.tokenExpiry > now + 60_000) {
    return settings.accessToken;
  }

  let tokenData;
  if (settings.refreshToken) {
    try {
      tokenData = await refreshToken(SPOTIFY_CLIENT_ID, settings.refreshToken);
    } catch {
      tokenData = await spotifyAuth();
    }
  } else {
    tokenData = await spotifyAuth();
  }

  await saveSettings({
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || settings.refreshToken,
    tokenExpiry: now + tokenData.expires_in * 1000,
  });
  return tokenData.access_token;
}

// ── Spotify API ───────────────────────────────────────────────────────────────

async function fetchTrackDetails(accessToken, trackIds) {
  if (!trackIds.length) return [];
  const responses = await Promise.all(
    trackIds.map(id =>
      fetch(`${SPOTIFY_TRACK_URL}/${id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(async resp => {
        if (!resp.ok) {
          const body = await resp.text().catch(() => "");
          throw new Error(`Spotify track API error ${resp.status} for ${id}: ${body}`);
        }
        return resp.json();
      })
    )
  );
  return responses;
}

async function queueTrack(accessToken, trackId) {
  const resp = await fetch(`${SPOTIFY_QUEUE_URL}?uri=spotify:track:${trackId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok && resp.status !== 204) {
    throw new Error(`Queue failed for ${trackId}: ${resp.status}`);
  }
}

// ── GitHub API ────────────────────────────────────────────────────────────────

// ── MixtaPR service ───────────────────────────────────────────────────────────

async function fetchCommitTracks(svc, hashes) {
  const resp = await fetch(`${svc}/commits/tracks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hashes }),
  });
  if (!resp.ok) throw new Error(`MixtaPR service error: ${resp.status}`);
  return resp.json();
}

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => sendResponse({ error: err.message }));
  return true;
});

async function handleMessage(message) {
  const { type } = message;

  if (type === "GET_PR_TRACKS") {
    const { hashes } = message;
    const settings = await getSettings();
    const svc = serviceUrl(settings);

    const { queuedCommits = [] } = await new Promise(resolve => chrome.storage.local.get({ queuedCommits: [] }, resolve));
    const newHashes = hashes.filter(h => !queuedCommits.includes(h));

    console.log("[mixtaPR] Hashes received:", hashes, "| New (not yet queued):", newHashes);
    if (!newHashes.length) return { tracks: [] };

    const commitTracks = await fetchCommitTracks(svc, newHashes);
    console.log("[mixtaPR] Commit tracks from service:", commitTracks);
    if (!commitTracks.length) return { tracks: [] };

    const accessToken = await ensureValidToken();
    const trackIds = [...new Set(commitTracks.map(ct => ct.spotifyTrackId))];
    console.log("[mixtaPR] Fetching Spotify details for track IDs:", trackIds);
    const spotifyTracks = await fetchTrackDetails(accessToken, trackIds);
    console.log("[mixtaPR] Spotify track details:", spotifyTracks);

    const trackMap = Object.fromEntries(spotifyTracks.filter(Boolean).map(t => [t.id, t]));

    const seen = new Set();
    const orderedTracks = [];
    for (const ct of commitTracks) {
      const track = trackMap[ct.spotifyTrackId];
      if (track && !seen.has(ct.spotifyTrackId)) {
        seen.add(ct.spotifyTrackId);
        orderedTracks.push({
          commitHash: ct.commitHash,
          trackId: ct.spotifyTrackId,
          name: track.name,
          artists: track.artists.map(a => a.name).join(", "),
          albumArt: track.album.images[0]?.url ?? null,
          albumName: track.album.name,
          spotifyUrl: track.external_urls?.spotify,
        });
      }
    }
    return { tracks: orderedTracks };
  }

  if (type === "QUEUE_TRACKS") {
    const { trackIds, commitHashes = [] } = message;
    const accessToken = await ensureValidToken();
    for (const id of trackIds) {
      await queueTrack(accessToken, id);
    }
    if (commitHashes.length) {
      const { queuedCommits = [] } = await new Promise(resolve => chrome.storage.local.get({ queuedCommits: [] }, resolve));
      const updated = [...new Set([...queuedCommits, ...commitHashes])];
      await new Promise(resolve => chrome.storage.local.set({ queuedCommits: updated }, resolve));
    }
    return { queued: trackIds.length };
  }

  if (type === "SPOTIFY_AUTH") {
    await ensureValidToken();
    return { ok: true };
  }

  throw new Error(`Unknown message type: ${type}`);
}
