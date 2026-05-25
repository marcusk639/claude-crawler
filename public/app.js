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
  },
  sort: "score",
  installTool: null,
  installPreview: null,
  installState: "idle", // idle | loading | ready | executing | done
};

// ── Boot ───────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  bindControls();
  checkStatus();
  loadHealth();
  loadCatalog();
});

// ── API helpers ────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "API error");
  return data;
}

// ── Control binding ────────────────────────────
function bindControls() {
  // Search (debounced)
  let searchTimer;
  document.getElementById("search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.search = e.target.value.trim().toLowerCase();
      applyFiltersAndRender();
    }, 200);
  });

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
function applyFiltersAndRender() {
  const { category, job, source, search, hideInstalled, officialOnly } =
    state.filters;

  state.filtered = state.catalog.filter((t) => {
    if (category !== "all" && t.category !== category) return false;
    if (job !== "all" && t.jobCategory !== job) return false;
    if (source !== "all" && t.source !== source) return false;
    if (hideInstalled && t.installed) return false;
    if (officialOnly && !t.isOfficial) return false;
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
  const grid = document.getElementById("catalog-grid");
  const countEl = document.getElementById("result-count");

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
    grid.innerHTML = `<div class="empty-state"><p>No tools match your filters.</p><button class="btn btn-ghost btn-sm" onclick="clearFilters()">Clear filters</button></div>`;
    countEl.textContent = `0 of ${state.catalog.length} tools`;
    return;
  }

  countEl.textContent = `${state.filtered.length} of ${state.catalog.length} tools`;
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
      <div class="card-meta">${metaItems}</div>
      <div class="score-bar-wrap">
        <div class="score-bar-bg">
          <div class="score-bar-fill ${scoreClass}" style="width:${tool.score}%"></div>
        </div>
        <span class="score-label">${tool.score}</span>
      </div>
      <div class="card-footer">
        ${tool.url ? `<a class="card-link" href="${escHtml(tool.url)}" target="_blank" rel="noopener">${escHtml(shortUrl(tool.url))}</a>` : '<span class="card-link"></span>'}
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

    confirmBtn.disabled = files.length === 0;
    confirmBtn.textContent = "Confirm Install";
    confirmBtn.onclick = executeInstall;
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
    const { result } = await api("/api/install/execute", {
      method: "POST",
      body: JSON.stringify({ tool: state.installTool }),
    });

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
    body.innerHTML = `<div class="install-result error">${escHtml(err.message)}</div>`;
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
