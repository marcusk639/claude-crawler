"use strict";

// ── State ──────────────────────────────────────
const state = {
  catalog: [],
  filtered: [],
  loading: false,
  error: null,
  filters: {
    category: "all",
    job: "all",
    source: "all",
    search: "",
    hideInstalled: false,
    officialOnly: false,
    savedOnly: false,
  },
  sort: "score",
  installTool: null,
  installPreview: null,
  installState: "idle", // idle | loading | ready | executing | done
  nlQuery: "",
  nlResults: null, // null = inactive; array = LLM search results
  nlLoading: false,
  localBridge: false, // true when localhost:3737 is reachable
  currentUser: null, // Firebase user object or null
  savedToolIds: new Set(), // IDs of tools saved by current user
};

// Current Firebase ID token — refreshed automatically by Firebase SDK
let idToken = null;

// ── Boot ───────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  bindControls();
  checkStatus();
  loadHealth();
  const staticPage = document.body.dataset.staticPage;
  if (
    staticPage === "tool" ||
    staticPage === "category" ||
    staticPage === "job"
  ) {
    // Pre-rendered landing page — skip the catalog fetch and grid render.
    // Auth, save buttons, and bridge detection still bind below so the
    // visible heart on this page updates once auth resolves and
    // loadSavedTools() populates state.savedToolIds.
  } else {
    loadCatalog();
  }
  initAuth();
  detectLocalBridge();
});

// ── API helpers ────────────────────────────────
async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
  const res = await fetch(path, { headers, ...opts });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "API error");
  return data;
}

// ── Auth ───────────────────────────────────────
// Module-level handle so re-initialization (hot reload, tests) doesn't leak intervals
let tokenRefreshInterval = null;

function initAuth() {
  firebase.auth().onAuthStateChanged(async (user) => {
    state.currentUser = user;
    idToken = user ? await user.getIdToken() : null;

    const btnSignin = document.getElementById("btn-signin");
    const userMenu = document.getElementById("user-menu");
    const userAvatar = document.getElementById("user-avatar");
    const userName = document.getElementById("user-name");

    if (user) {
      btnSignin.classList.add("hidden");
      userMenu.classList.remove("hidden");
      userAvatar.src = user.photoURL || "";
      userAvatar.alt = user.displayName || "";
      userName.textContent = user.displayName || user.email || "";
      await loadSavedTools();
    } else {
      btnSignin.classList.remove("hidden");
      userMenu.classList.add("hidden");
      state.savedToolIds = new Set();
    }
    applyFiltersAndRender();
  });

  // Refresh token silently before it expires (Firebase tokens expire after 1hr)
  if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);
  tokenRefreshInterval = setInterval(
    async () => {
      if (state.currentUser) {
        idToken = await state.currentUser.getIdToken(true);
      }
    },
    55 * 60 * 1000,
  );
}

async function loadSavedTools() {
  try {
    const { tools } = await api("/api/user/saved-tools");
    state.savedToolIds = new Set(tools.map((t) => t.id));
  } catch (err) {
    console.warn("Could not load saved tools:", err.message);
    state.savedToolIds = new Set();
  }
}

// Per-tool in-flight guard prevents double-tap races (both intents firing before either resolves)
const pendingSaveIds = new Set();

async function toggleSave(toolId) {
  if (!state.currentUser) {
    document.getElementById("auth-modal-overlay").classList.remove("hidden");
    return;
  }
  if (pendingSaveIds.has(toolId)) return; // already in flight — ignore double-tap
  pendingSaveIds.add(toolId);

  const wasSaved = state.savedToolIds.has(toolId);
  // Optimistic mutation
  if (wasSaved) state.savedToolIds.delete(toolId);
  else state.savedToolIds.add(toolId);
  applyFiltersAndRender();

  try {
    if (wasSaved) {
      await api(`/api/user/saved-tools/${encodeURIComponent(toolId)}`, {
        method: "DELETE",
      });
    } else {
      const tool = state.catalog.find((t) => t.id === toolId);
      if (!tool) throw new Error("Tool not found in catalog");
      await api("/api/user/saved-tools", {
        method: "POST",
        body: JSON.stringify({
          toolId,
          name: tool.name || tool.displayName || "",
          description: tool.description || "",
          source: tool.source || "",
        }),
      });
    }
  } catch (err) {
    // Roll back the optimistic update so UI matches server truth
    if (wasSaved) state.savedToolIds.add(toolId);
    else state.savedToolIds.delete(toolId);
    applyFiltersAndRender();
    console.warn(`Save toggle failed for ${toolId}:`, err.message);
  } finally {
    pendingSaveIds.delete(toolId);
  }
}

function openAuthModal() {
  document.getElementById("auth-modal-overlay").classList.remove("hidden");
}

function closeAuthModal() {
  document.getElementById("auth-modal-overlay").classList.add("hidden");
}

async function signInWith(provider) {
  let authProvider;
  if (provider === "github") {
    authProvider = new firebase.auth.GithubAuthProvider();
  } else if (provider === "google") {
    authProvider = new firebase.auth.GoogleAuthProvider();
  } else if (provider === "apple") {
    authProvider = new firebase.auth.OAuthProvider("apple.com");
  } else {
    return;
  }
  try {
    await firebase.auth().signInWithPopup(authProvider);
    closeAuthModal();
  } catch (err) {
    console.error("Sign-in error:", err);
    alert(`Sign-in failed: ${err.message}`);
  }
}

// ── Local Bridge ───────────────────────────────
async function detectLocalBridge() {
  try {
    await fetch("http://localhost:3737/api/health", {
      signal: AbortSignal.timeout(1000),
    });
    state.localBridge = true;
  } catch {
    state.localBridge = false;
  }
  const chip = document.getElementById("bridge-chip");
  if (state.localBridge) {
    chip.classList.remove("hidden");
  } else {
    chip.classList.add("hidden");
  }
}

// ── Control binding ────────────────────────────
function bindControls() {
  // Keyword search (debounced, client-side filter)
  let searchTimer;
  document.getElementById("search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.search = e.target.value.trim().toLowerCase();
      // Keyword search and NL search are mutually exclusive
      if (state.nlResults !== null) clearNlSearch({ skipInputReset: false });
      applyFiltersAndRender();
    }, 200);
  });

  // Natural language search (debounced, server-side LLM)
  document.getElementById("nlSearchInput").addEventListener("input", (e) => {
    onNlSearch(e.target.value);
  });
  document
    .getElementById("nlSearchClear")
    .addEventListener("click", () => clearNlSearch());

  // Sort
  document.getElementById("sort-select").addEventListener("change", (e) => {
    state.sort = e.target.value;
    applyFiltersAndRender();
  });

  // Toggles
  document.getElementById("hide-installed").addEventListener("change", (e) => {
    state.filters.hideInstalled = e.target.checked;
    applyFiltersAndRender();
  });

  document.getElementById("official-only").addEventListener("change", (e) => {
    state.filters.officialOnly = e.target.checked;
    applyFiltersAndRender();
  });

  // Filter groups
  bindFilterGroup("filter-category", "category");
  bindFilterGroup("filter-job", "job");
  bindFilterGroup("filter-source", "source");

  // Refresh button
  document
    .getElementById("btn-refresh")
    .addEventListener("click", () => refreshCatalog());

  // Modal close
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Install confirm — managed entirely via .onclick in renderInstallPreview / closeModal
  // (do NOT add an addEventListener here; that causes double-fire with .onclick assignment)

  // Install buttons — event delegation so card innerHTML doesn't need JSON in attributes
  document.getElementById("catalog-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-install-id]");
    if (!btn) return;
    const tool = state.catalog.find((t) => t.id === btn.dataset.installId);
    if (tool) openInstallModal(tool);
  });

  // Auth
  document
    .getElementById("btn-signin")
    .addEventListener("click", openAuthModal);
  document
    .getElementById("auth-modal-close")
    .addEventListener("click", closeAuthModal);
  document
    .getElementById("auth-modal-overlay")
    .addEventListener("click", (e) => {
      if (e.target === document.getElementById("auth-modal-overlay"))
        closeAuthModal();
    });
  document.getElementById("btn-signout").addEventListener("click", () => {
    firebase.auth().signOut();
  });
  document.querySelectorAll(".auth-provider-btn").forEach((btn) => {
    btn.addEventListener("click", () => signInWith(btn.dataset.provider));
  });

  // No-bridge modal
  document.getElementById("no-bridge-close").addEventListener("click", () => {
    document.getElementById("no-bridge-modal-overlay").classList.add("hidden");
  });
  document
    .getElementById("no-bridge-retry")
    .addEventListener("click", async () => {
      await detectLocalBridge();
      if (state.localBridge) {
        document
          .getElementById("no-bridge-modal-overlay")
          .classList.add("hidden");
      }
    });

  // Save/unsave button (delegated from catalog grid)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-save-id]");
    if (btn) toggleSave(btn.dataset.saveId);
  });
}

function bindFilterGroup(groupId, filterKey) {
  document.getElementById(groupId).addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    document
      .querySelectorAll(`#${groupId} .filter-btn`)
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.filters[filterKey] = btn.dataset.value;
    applyFiltersAndRender();
  });
}

// ── Data loading ───────────────────────────────
async function loadCatalog() {
  state.loading = true;
  renderGrid();

  try {
    const { data } = await api("/api/catalog");
    state.catalog = data;
    applyFiltersAndRender();
  } catch (err) {
    state.error = err.message;
    renderGrid();
  } finally {
    state.loading = false;
  }
}

async function refreshCatalog() {
  const btn = document.getElementById("btn-refresh");
  btn.classList.add("refreshing");
  btn.disabled = true;

  try {
    const { data } = await api("/api/catalog/refresh", { method: "POST" });
    state.catalog = data;
    applyFiltersAndRender();
  } catch (err) {
    alert(`Refresh failed: ${err.message}`);
  } finally {
    btn.classList.remove("refreshing");
    btn.disabled = false;
  }
}

async function loadHealth() {
  try {
    const { data } = await api("/api/health");
    renderHealth(data);
  } catch {
    document.getElementById("health-content").innerHTML =
      '<p style="color:var(--text-muted);font-size:12px;">Health check unavailable</p>';
  }
}

async function checkStatus() {
  try {
    await api("/api/status");
    document.getElementById("status-dot").classList.add("online");
    document.getElementById("status-dot").title = "Server connected";
  } catch {
    document.getElementById("status-dot").classList.add("offline");
    document.getElementById("status-dot").title = "Server offline";
  }
}

// ── Filtering & sorting ────────────────────────
// ── Natural language search ────────────────────
let nlDebounceTimer = null;

async function onNlSearch(value) {
  clearTimeout(nlDebounceTimer);
  const trimmed = (value || "").trim();

  if (!trimmed) {
    clearNlSearch();
    return;
  }

  if (trimmed.length < 3) return;

  // Clear keyword search when activating NL search (mutually exclusive)
  if (state.filters.search) {
    state.filters.search = "";
    document.getElementById("search").value = "";
  }

  nlDebounceTimer = setTimeout(async () => {
    state.nlQuery = trimmed;
    state.nlLoading = true;
    document.getElementById("nlSearchSpinner").hidden = false;
    document.getElementById("nlSearchClear").hidden = false;
    applyFiltersAndRender();

    try {
      const data = await api("/api/search/natural", {
        method: "POST",
        body: JSON.stringify({ query: trimmed }),
      });
      state.nlResults = Array.isArray(data.results) ? data.results : [];
    } catch (err) {
      state.nlResults = [];
      console.warn("[nl-search]", err.message);
    } finally {
      state.nlLoading = false;
      document.getElementById("nlSearchSpinner").hidden = true;
      applyFiltersAndRender();
    }
  }, 400);
}

function clearNlSearch(opts = {}) {
  clearTimeout(nlDebounceTimer);
  if (!opts.skipInputReset) {
    document.getElementById("nlSearchInput").value = "";
  }
  state.nlQuery = "";
  state.nlResults = null;
  state.nlLoading = false;
  document.getElementById("nlSearchClear").hidden = true;
  document.getElementById("nlSearchSpinner").hidden = true;
  applyFiltersAndRender();
}

function applyFiltersAndRender() {
  // Natural language search results override filter state when active
  if (state.nlResults !== null) {
    state.filtered = state.nlResults;
    renderGrid();
    return;
  }

  const { category, job, source, search, hideInstalled, officialOnly } =
    state.filters;

  state.filtered = state.catalog.filter((t) => {
    if (category !== "all" && t.category !== category) return false;
    if (job !== "all" && t.jobCategory !== job) return false;
    if (source !== "all" && t.source !== source) return false;
    if (hideInstalled && t.installed) return false;
    if (officialOnly && !t.isOfficial) return false;
    if (state.filters.savedOnly && !state.savedToolIds.has(t.id)) return false;
    if (search) {
      const hay =
        `${t.displayName || t.name} ${t.description} ${t.author} ${(t.topics || []).join(" ")}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  // Sort
  state.filtered.sort((a, b) => {
    switch (state.sort) {
      case "score":
        return b.score - a.score;
      case "stars":
        return b.stars - a.stars;
      case "downloads":
        return b.weeklyDownloads - a.weeklyDownloads;
      case "updated":
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      case "name":
        return (a.displayName || a.name).localeCompare(b.displayName || b.name);
      default:
        return 0;
    }
  });

  renderGrid();
}

// ── Rendering ──────────────────────────────────
function renderGrid() {
  // If the page was static-seeded (homepage has data-seeded="true" on the
  // grid), the first render replaces those cards with the live, filterable
  // catalog — no extra handling needed because we always assign innerHTML
  // below.
  const grid = document.getElementById("catalog-grid");
  const countEl = document.getElementById("result-count");

  if (state.nlLoading) {
    grid.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Searching with AI for "${escHtml(state.nlQuery)}"…</p></div>`;
    countEl.textContent = "Searching…";
    return;
  }

  if (state.loading) {
    grid.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Crawling sources…</p></div>`;
    countEl.textContent = "Loading…";
    return;
  }

  if (state.error) {
    grid.innerHTML = `<div class="empty-state"><p>⚠ ${escHtml(state.error)}</p><p style="font-size:12px">Make sure the server is running on port ${location.port || 3737}</p></div>`;
    countEl.textContent = "Error";
    return;
  }

  if (!state.filtered.length) {
    const msg =
      state.nlResults !== null
        ? `No tools matched "${escHtml(state.nlQuery)}". Try a broader query.`
        : "No tools match your filters.";
    const action =
      state.nlResults !== null
        ? `<button class="btn btn-ghost btn-sm" onclick="clearNlSearch()">Clear search</button>`
        : `<button class="btn btn-ghost btn-sm" onclick="clearFilters()">Clear filters</button>`;
    grid.innerHTML = `<div class="empty-state"><p>${msg}</p>${action}</div>`;
    countEl.textContent = `0 of ${state.catalog.length} tools`;
    return;
  }

  const label =
    state.nlResults !== null
      ? `${state.filtered.length} AI-matched ${state.filtered.length === 1 ? "tool" : "tools"} for "${state.nlQuery}"`
      : `${state.filtered.length} of ${state.catalog.length} tools`;
  countEl.textContent = label;
  grid.innerHTML = state.filtered.map(renderCard).join("");
}

function renderCard(tool) {
  const scoreClass =
    tool.score >= 70 ? "high" : tool.score >= 40 ? "mid" : "low";
  const categoryLabel = tool.category.replace(/-/g, " ");
  const updatedLabel = relativeDate(tool.updatedAt);
  const starsLabel = tool.stars > 0 ? `★ ${formatNum(tool.stars)}` : "";
  const dlLabel =
    tool.weeklyDownloads > 0 ? `↓ ${formatNum(tool.weeklyDownloads)}/wk` : "";
  const warningCount = (tool.contentWarnings || []).length;

  const badges = [
    `<span class="badge badge-${escHtml(tool.category)}">${escHtml(categoryLabel)}</span>`,
    tool.isOfficial ? `<span class="badge badge-official">Official</span>` : "",
    tool.installed
      ? `<span class="badge badge-installed">Installed</span>`
      : "",
    warningCount > 0
      ? `<span class="badge badge-warning">⚠ ${warningCount} warning${warningCount > 1 ? "s" : ""}</span>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const metaItems = [starsLabel, dlLabel, updatedLabel]
    .filter(Boolean)
    .map((m) => `<span class="meta-item">${escHtml(m)}</span>`)
    .join("");

  const installBtnLabel = tool.installed ? "Reinstall" : "Install";
  const canInstall = tool.installConfig?.type !== "local";

  return `
    <article class="tool-card${tool.installed ? " installed" : ""}" data-id="${escHtml(tool.id)}">
      <div class="card-top">
        <div class="card-badges">${badges}</div>
      </div>
      <div>
        <div class="card-name">${escHtml(tool.displayName || tool.name)}</div>
        <div class="card-author">${escHtml(tool.author)}${tool.source !== tool.author ? ` · ${escHtml(tool.source)}` : ""}</div>
      </div>
      <p class="card-description">${escHtml(tool.description || "No description available.")}</p>
      ${tool.searchReasoning ? `<p class="search-reasoning">${escHtml(tool.searchReasoning)}</p>` : ""}
      <div class="card-meta">${metaItems}</div>
      <div class="score-bar-wrap">
        <div class="score-bar-bg">
          <div class="score-bar-fill ${scoreClass}" style="width:${tool.score}%"></div>
        </div>
        <span class="score-label">${tool.score}</span>
      </div>
      <div class="card-footer">
        ${tool.url ? `<a class="card-link" href="${escHtml(tool.url)}" target="_blank" rel="noopener">${escHtml(shortUrl(tool.url))}</a>` : '<span class="card-link"></span>'}
        <button
          class="btn-save${state.savedToolIds.has(tool.id) ? " saved" : ""}"
          data-save-id="${escHtml(tool.id)}"
          title="${state.savedToolIds.has(tool.id) ? "Remove from saved" : "Save tool"}"
          aria-label="${state.savedToolIds.has(tool.id) ? "Remove from saved" : "Save tool"}"
        >&#9825;</button>
        ${canInstall ? `<button class="btn btn-primary btn-sm" data-install-id="${escHtml(tool.id)}">${installBtnLabel}</button>` : ""}
      </div>
    </article>`;
}

function renderHealth(data) {
  const el = document.getElementById("health-content");

  const countsHtml = `
    <div class="health-counts">
      ${healthCountItem(data.counts.agents, "Agents")}
      ${healthCountItem(data.counts.skills, "Skills")}
      ${healthCountItem(data.counts.hooks, "Hooks")}
      ${healthCountItem(data.counts.mcpServers, "MCP Servers")}
    </div>`;

  const issuesHtml =
    data.issues.length === 0
      ? `<div class="health-ok">✓ No issues found</div>`
      : `<div class="health-issues">
        ${data.issues
          .map(
            (i) => `
          <div class="health-issue ${escHtml(i.severity)}">
            ${escHtml(i.message)}
          </div>`,
          )
          .join("")}
      </div>`;

  el.innerHTML = countsHtml + issuesHtml;
}

function healthCountItem(num, label) {
  return `<div class="health-count-item">
    <div class="health-count-num">${num ?? 0}</div>
    <div class="health-count-label">${label}</div>
  </div>`;
}

// ── Install modal ──────────────────────────────
function openInstallModal(tool) {
  state.installTool = tool;
  state.installPreview = null;
  state.installState = "loading";

  document.getElementById("modal-title").textContent =
    `Install: ${tool.displayName || tool.name}`;
  document.getElementById("modal-body").innerHTML =
    `<div class="loading-state"><div class="spinner"></div><p>Fetching install preview…</p></div>`;
  document.getElementById("modal-confirm").disabled = true;
  document.getElementById("modal-overlay").classList.remove("hidden");

  fetchInstallPreview(tool);
}

async function fetchInstallPreview(tool) {
  try {
    const { preview } = await api("/api/install/preview", {
      method: "POST",
      body: JSON.stringify({ tool }),
    });
    state.installPreview = preview;
    state.installState = "ready";
    renderInstallPreview(preview, tool);
  } catch (err) {
    document.getElementById("modal-body").innerHTML =
      `<div class="install-result error">Failed to fetch preview: ${escHtml(err.message)}</div>`;
  }
}

function renderLlmPanel(tool) {
  const s = tool.llmScore;
  if (!s) return "";
  const dim = (label, value, riskClass = "") => `
    <div class="llm-dim">
      <span>${escHtml(label)}</span>
      <span class="llm-bar${riskClass}" style="--pct:${(Number(value) || 0) * 5}%"></span>
      <span>${escHtml(String(value ?? 0))}/20</span>
    </div>`;
  const flagsHtml =
    Array.isArray(s.flags) && s.flags.length
      ? `<ul class="llm-flags">${s.flags.map((f) => `<li>${escHtml(String(f))}</li>`).join("")}</ul>`
      : "";
  const reasoningHtml = s.reasoning
    ? `<p class="llm-reasoning">${escHtml(String(s.reasoning))}</p>`
    : "";
  return `
    <details class="llm-score-panel" open>
      <summary>AI Analysis <span class="llm-badge">Hermes</span></summary>
      <div class="llm-dims">
        ${dim("Documentation", s.documentationQuality)}
        ${dim("Installability", s.installabilityScore)}
        ${dim("Maintenance", s.maintenanceSignals)}
        ${dim("Security Risk", s.securityRisk, " risk")}
        ${dim("Claude Relevance", s.relevanceToClaudeCode)}
      </div>
      ${reasoningHtml}
      ${flagsHtml}
    </details>`;
}

function renderInstallPreview(preview, tool) {
  const body = document.getElementById("modal-body");
  const confirmBtn = document.getElementById("modal-confirm");
  let html = renderLlmPanel(tool);

  // Security warnings first
  const warnings = preview.warnings || [];
  if (warnings.length > 0) {
    const criticals = warnings.filter((w) => w.severity === "critical");
    html += `
      <div class="preview-section">
        <h3>⚠ Security Warnings</h3>
        <div class="warning-list">
          ${warnings.map((w) => `<div class="warning-item ${escHtml(w.severity)}">⚠ ${escHtml(w.label)}</div>`).join("")}
        </div>
      </div>`;
    if (criticals.length > 0) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Blocked (critical warnings)";
      body.innerHTML = html;
      return;
    }
  }

  if (preview.type === "npm") {
    html += `
      <div class="preview-section">
        <h3>npm Install Command</h3>
        <div class="npm-command">${escHtml(preview.command)}</div>
        <p class="preview-message">${escHtml(preview.message)}</p>
      </div>`;
    confirmBtn.textContent = "Copy Command";
    confirmBtn.disabled = false;
    confirmBtn.onclick = () => {
      navigator.clipboard.writeText(preview.command);
      confirmBtn.textContent = "Copied!";
      setTimeout(() => (confirmBtn.textContent = "Copy Command"), 2000);
    };
  } else if (preview.type === "github") {
    const files = preview.files || [];
    const fileListHtml =
      files.length === 0
        ? '<p style="color:var(--text-muted);font-size:13px">No installable files found in this repository.</p>'
        : `<ul class="file-list">
        ${files
          .map(
            (f) => `
          <li class="file-item ${escHtml(f.action)}">
            <span class="file-action-badge">${escHtml(f.action)}</span>
            <span>${escHtml(f.dest.replace(/^\/Users\/[^/]+/, "~"))}</span>
          </li>`,
          )
          .join("")}
      </ul>`;

    html += `
      <div class="preview-section">
        <h3>Files</h3>
        <div class="preview-message">${escHtml(preview.message || "")}</div>
        ${fileListHtml}
      </div>`;

    if (!state.localBridge) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "No local installer";
      const hint = document.createElement("p");
      hint.style.cssText =
        "margin-top:8px;font-size:12px;color:var(--text-muted)";
      hint.innerHTML =
        '<a href="#" id="open-no-bridge" style="color:var(--accent)">Set up the local installer</a> to enable one-click installs.';
      body.appendChild(hint);
      document
        .getElementById("open-no-bridge")
        ?.addEventListener("click", (e) => {
          e.preventDefault();
          document
            .getElementById("no-bridge-modal-overlay")
            .classList.remove("hidden");
        });
    } else {
      confirmBtn.disabled = files.length === 0;
      confirmBtn.textContent = "Confirm Install";
      confirmBtn.onclick = executeInstall;
    }
  } else {
    html += `<div class="preview-message">${escHtml(preview.message || "Nothing to install.")}</div>`;
    confirmBtn.disabled = true;
  }

  body.innerHTML = html;
}

async function executeInstall() {
  if (!state.installTool) return;

  const confirmBtn = document.getElementById("modal-confirm");
  const body = document.getElementById("modal-body");

  confirmBtn.disabled = true;
  confirmBtn.textContent = "Installing…";
  body.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Installing…</p></div>`;

  try {
    const installUrl = state.localBridge
      ? "http://localhost:3737/api/install/execute"
      : "/api/install/execute";
    const r = await fetch(installUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: state.installTool }),
    });
    if (!r.ok) {
      // Non-JSON error bodies (e.g. proxy 502) would crash .json() — surface status instead
      let msg = `Install failed (HTTP ${r.status})`;
      try {
        const body = await r.json();
        if (body && body.error) msg = body.error;
      } catch {}
      throw new Error(msg);
    }
    const installRes = await r.json();
    if (!installRes.ok) throw new Error(installRes.error || "Install failed");
    const { result } = installRes;

    const cls = result.success ? "success" : "error";
    const installedFiles = (result.installed || [])
      .map((f) => `<li>${escHtml(f)}</li>`)
      .join("");
    const errorItems = (result.errors || [])
      .map((e) => `<li>${escHtml(e.error)}</li>`)
      .join("");

    body.innerHTML = `
      <div class="install-result ${cls}">
        <strong>${escHtml(result.message)}</strong>
        ${installedFiles ? `<ul style="margin-top:8px;padding-left:16px;font-size:12px">${installedFiles}</ul>` : ""}
        ${errorItems ? `<ul style="margin-top:8px;padding-left:16px;font-size:12px;color:var(--error)">${errorItems}</ul>` : ""}
      </div>`;

    confirmBtn.textContent = "Done";
    confirmBtn.disabled = false;
    confirmBtn.onclick = closeModal;

    // Refresh health after install
    if (result.success) {
      setTimeout(loadHealth, 500);
      // Mark tool as installed in catalog
      const tool = state.catalog.find((t) => t.id === state.installTool.id);
      if (tool) tool.installed = true;
    }
  } catch (err) {
    // If we thought the bridge was up but the install failed, re-probe it so the UI
    // can show the no-bridge state on retry instead of looping on the same failure.
    if (state.localBridge) {
      await detectLocalBridge();
    }
    const bridgeNote = !state.localBridge
      ? '<p style="margin-top:8px;font-size:12px;color:var(--text-muted)">Local installer is no longer reachable. Start it locally and try again.</p>'
      : "";
    body.innerHTML = `<div class="install-result error">${escHtml(err.message)}</div>${bridgeNote}`;
    confirmBtn.textContent = "Retry";
    confirmBtn.disabled = false;
    confirmBtn.onclick = executeInstall;
  }
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  document.getElementById("modal-confirm").onclick = executeInstall;
  state.installTool = null;
  state.installPreview = null;
  state.installState = "idle";
}

// ── Utilities ──────────────────────────────────
function clearFilters() {
  state.filters = {
    category: "all",
    job: "all",
    source: "all",
    search: "",
    hideInstalled: false,
    officialOnly: false,
  };
  document.getElementById("search").value = "";
  document.querySelectorAll(".filter-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.value === "all");
  });
  document.getElementById("hide-installed").checked = false;
  document.getElementById("official-only").checked = false;
  applyFiltersAndRender();
}

function escHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    return (u.hostname + u.pathname).replace(/\/$/, "").slice(0, 42);
  } catch {
    return url.slice(0, 42);
  }
}

function formatNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

function relativeDate(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
