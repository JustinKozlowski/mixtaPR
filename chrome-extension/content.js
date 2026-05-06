/**
 * MixtaPR — content script
 * Injected into GitHub PR pages. Extracts PR info, fetches tracks, renders panel.
 */

(function () {
  "use strict";

  // Only run on PR conversation/files tabs, not on PR creation page
  const match = location.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) return;

  const [, owner, repo, prNumber] = match;

  // Avoid double-injection on Turbo navigation
  if (document.getElementById("mixtapr-panel")) return;

  // ── Panel HTML ────────────────────────────────────────────────────────────

  function createPanel() {
    const panel = document.createElement("div");
    panel.id = "mixtapr-panel";
    panel.innerHTML = `
      <div class="mixtapr-header">
        <span class="mixtapr-title">🎵 MixtaPR</span>
        <button class="mixtapr-collapse" title="Collapse">−</button>
      </div>
      <div class="mixtapr-body">
        <div class="mixtapr-loading">Loading commit tracks…</div>
      </div>
    `;
    return panel;
  }

  function renderTracks(tracks) {
    if (!tracks.length) {
      return `<p class="mixtapr-empty">No tracks found for this PR's commits.<br>
        Make sure contributors have the git hook installed.</p>`;
    }
    const items = tracks.map(t => `
      <div class="mixtapr-track" data-track-id="${t.trackId}">
        ${t.albumArt ? `<img class="mixtapr-art" src="${escapeHtml(t.albumArt)}" alt="">` : '<div class="mixtapr-art mixtapr-art-placeholder"></div>'}
        <div class="mixtapr-track-info">
          <a class="mixtapr-track-name" href="${escapeHtml(t.spotifyUrl)}" target="_blank" rel="noopener">${escapeHtml(t.name)}</a>
          <span class="mixtapr-artist">${escapeHtml(t.artists)}</span>
        </div>
      </div>
    `).join("");

    const trackIds = tracks.map(t => t.trackId);
    return `
      <div class="mixtapr-tracks">${items}</div>
      <button class="mixtapr-queue-btn" data-track-ids='${JSON.stringify(trackIds)}'>
        Queue all in Spotify
      </button>
      <p class="mixtapr-status"></p>
    `;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // ── Mount panel ───────────────────────────────────────────────────────────

  function mountPanel() {
    // Insert after the PR title / sidebar area
    const sidebar = document.querySelector(".Layout-sidebar") ||
                    document.querySelector("[data-target='diff-layout.sidebar']") ||
                    document.querySelector(".discussion-sidebar");
    const panel = createPanel();

    if (sidebar) {
      sidebar.prepend(panel);
    } else {
      // Fallback: floating panel
      panel.classList.add("mixtapr-floating");
      document.body.appendChild(panel);
    }

    // Collapse toggle
    panel.querySelector(".mixtapr-collapse").addEventListener("click", () => {
      const body = panel.querySelector(".mixtapr-body");
      const btn = panel.querySelector(".mixtapr-collapse");
      const collapsed = body.style.display === "none";
      body.style.display = collapsed ? "" : "none";
      btn.textContent = collapsed ? "−" : "+";
    });

    return panel;
  }

  function bindQueueButton(panel) {
    const btn = panel.querySelector(".mixtapr-queue-btn");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      const trackIds = JSON.parse(btn.dataset.trackIds);
      const status = panel.querySelector(".mixtapr-status");
      btn.disabled = true;
      status.textContent = "Queueing…";
      try {
        const resp = await chrome.runtime.sendMessage({ type: "QUEUE_TRACKS", trackIds });
        if (resp.error) throw new Error(resp.error);
        status.textContent = `Queued ${resp.queued} track${resp.queued !== 1 ? "s" : ""} in Spotify!`;
      } catch (e) {
        status.textContent = `Error: ${e.message}`;
        btn.disabled = false;
      }
    });
  }

  // ── Main ──────────────────────────────────────────────────────────────────

  function scrapeCommitHashes() {
    const links = document.querySelectorAll('a[href*="/commit"]');
    const hashes = new Set();
    for (const a of links) {
      const m = a.getAttribute("href")?.match(/\/commits?\/([0-9a-f]{40})/);
      if (m) hashes.add(m[1]);
    }
    return [...hashes];
  }

  async function waitForCommitHashes(maxAttempts = 20, interval = 500) {
    for (let i = 0; i < maxAttempts; i++) {
      const allCommitLinks = [...document.querySelectorAll('a[href*="commit"]')].map(a => a.getAttribute("href"));
      console.log(`[mixtaPR] attempt ${i + 1}: found ${allCommitLinks.length} commit links`, allCommitLinks);
      const hashes = scrapeCommitHashes();
      if (hashes.length) return hashes;
      await new Promise(r => setTimeout(r, interval));
    }
    return [];
  }

  async function init() {
    const panel = mountPanel();
    const body = panel.querySelector(".mixtapr-body");

    const hashes = await waitForCommitHashes();
    console.log("[mixtaPR] Scraped commit hashes:", hashes);

    try {
      const resp = await chrome.runtime.sendMessage({
        type: "GET_PR_TRACKS",
        hashes,
      });
      console.log("[mixtaPR] Response:", resp);

      if (resp.error) throw new Error(resp.error);

      body.innerHTML = renderTracks(resp.tracks);
      bindQueueButton(panel);
    } catch (e) {
      body.innerHTML = `<p class="mixtapr-error">MixtaPR error: ${escapeHtml(e.message)}</p>`;
    }
  }

  // Run on page load; also re-run on GitHub's Turbo navigation
  init();

  document.addEventListener("turbo:load", () => {
    const existing = document.getElementById("mixtapr-panel");
    if (existing) existing.remove();
    const newMatch = location.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (newMatch) init();
  });
})();
