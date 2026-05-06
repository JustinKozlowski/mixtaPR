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
    panel.className = "font-sans text-sm bg-white dark:bg-[#0d1117] border border-[#d0d7de] dark:border-[#30363d] rounded-md mb-4 overflow-hidden";
    panel.innerHTML = `
      <div class="mixtapr-header flex items-center justify-between px-3 py-2 bg-[#f6f8fa] dark:bg-[#161b22] border-b border-[#d0d7de] dark:border-[#30363d]">
        <span class="font-semibold text-[#24292f] dark:text-[#e6edf3]">🎵 MixtaPR</span>
        <button class="mixtapr-collapse bg-transparent border-0 cursor-pointer text-lg leading-none text-[#57606a] dark:text-[#8b949e] hover:text-[#24292f] dark:hover:text-[#e6edf3] px-1" title="Collapse">−</button>
      </div>
      <div class="mixtapr-body p-3">
        <div class="text-[#57606a] dark:text-[#8b949e] text-center py-2">Loading commit tracks…</div>
      </div>
    `;
    return panel;
  }

  function renderTracks(tracks) {
    if (!tracks.length) {
      return `<p class="text-[#57606a] dark:text-[#8b949e] text-center py-2">No tracks found for this PR's commits.<br>
        Make sure contributors have the git hook installed.</p>`;
    }
    const items = tracks.map(t => `
      <div class="flex items-center gap-2.5 px-2 py-1.5 rounded transition-colors hover:bg-[#f6f8fa] dark:hover:bg-[#161b22]" data-track-id="${t.trackId}">
        ${t.albumArt
          ? `<img class="w-10 h-10 rounded flex-shrink-0 object-cover" src="${escapeHtml(t.albumArt)}" alt="">`
          : '<div class="w-10 h-10 rounded flex-shrink-0 bg-[#d0d7de] dark:bg-[#30363d]"></div>'}
        <div class="flex flex-col min-w-0">
          <a class="mixtapr-track-name font-medium text-[#24292f] dark:text-[#e6edf3] no-underline truncate hover:underline hover:text-[#0969da] dark:hover:text-[#58a6ff]" href="${escapeHtml(t.spotifyUrl)}" target="_blank" rel="noopener">${escapeHtml(t.name)}</a>
          <span class="text-[#57606a] dark:text-[#8b949e] text-xs truncate">${escapeHtml(t.artists)}</span>
        </div>
      </div>
    `).join("");

    const trackIds = tracks.map(t => t.trackId);
    const commitHashes = tracks.map(t => t.commitHash);
    return `
      <div class="flex flex-col gap-2 mb-2.5 max-h-80 overflow-y-auto">${items}</div>
      <button class="mixtapr-queue-btn w-full px-3 py-1.5 bg-[#1DB954] text-white font-semibold border-0 rounded-full cursor-pointer text-[13px] transition-colors hover:bg-[#1aa34a] disabled:opacity-60 disabled:cursor-not-allowed" data-track-ids='${JSON.stringify(trackIds)}' data-commit-hashes='${JSON.stringify(commitHashes)}'>
        Queue all in Spotify
      </button>
      <p class="mixtapr-status text-center text-[#57606a] dark:text-[#8b949e] text-xs mt-1.5 min-h-[1em]"></p>
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

  function renderAuthPrompt() {
    return `
      <p class="text-[#57606a] dark:text-[#8b949e] text-center text-xs mb-2">Authorize Spotify to see what your teammates were listening to.</p>
      <button class="mixtapr-auth-btn w-full px-3 py-1.5 bg-[#1DB954] text-white font-semibold border-0 rounded-full cursor-pointer text-[13px] transition-colors hover:bg-[#1aa34a] disabled:opacity-60 disabled:cursor-not-allowed">
        Authorize Spotify
      </button>
      <p class="mixtapr-status text-center text-[#57606a] dark:text-[#8b949e] text-xs mt-1.5 min-h-[1em]"></p>
    `;
  }

  function bindAuthButton(panel, hashes) {
    const btn = panel.querySelector(".mixtapr-auth-btn");
    if (!btn) return;
    const status = panel.querySelector(".mixtapr-status");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      status.textContent = "Opening Spotify authorization…";
      try {
        const resp = await chrome.runtime.sendMessage({ type: "SPOTIFY_AUTH" });
        if (resp.error) throw new Error(resp.error);
        const body = panel.querySelector(".mixtapr-body");
        body.innerHTML = `<div class="text-[#57606a] dark:text-[#8b949e] text-center py-2">Loading tracks…</div>`;
        await fetchAndRender(panel, hashes);
      } catch (e) {
        status.textContent = `Error: ${e.message}`;
        btn.disabled = false;
      }
    });
  }

  function bindQueueButton(panel) {
    const btn = panel.querySelector(".mixtapr-queue-btn");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      const trackIds = JSON.parse(btn.dataset.trackIds);
      const commitHashes = JSON.parse(btn.dataset.commitHashes);
      const status = panel.querySelector(".mixtapr-status");
      btn.disabled = true;
      status.textContent = "Queueing…";
      try {
        const resp = await chrome.runtime.sendMessage({ type: "QUEUE_TRACKS", trackIds, commitHashes });
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

  async function fetchAndRender(panel, hashes) {
    const body = panel.querySelector(".mixtapr-body");
    try {
      const resp = await chrome.runtime.sendMessage({ type: "GET_PR_TRACKS", hashes });
      console.log("[mixtaPR] Response:", resp);

      if (resp.needsAuth) {
        body.innerHTML = renderAuthPrompt();
        bindAuthButton(panel, hashes);
        return;
      }

      if (resp.error) throw new Error(resp.error);

      if (!resp.tracks.length) {
        panel.remove();
        return;
      }

      body.innerHTML = renderTracks(resp.tracks);
      bindQueueButton(panel);
    } catch (e) {
      body.innerHTML = `<p class="text-[#cf222e] dark:text-[#f85149] text-center py-2">MixtaPR error: ${escapeHtml(e.message)}</p>`;
    }
  }

  async function init() {
    const panel = mountPanel();

    const hashes = await waitForCommitHashes();
    console.log("[mixtaPR] Scraped commit hashes:", hashes);

    await fetchAndRender(panel, hashes);
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
