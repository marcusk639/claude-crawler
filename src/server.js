"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { crawlAll } = require("./crawlers");
const { scoreCatalog } = require("./scoring");
const { naturalLanguageSearch } = require("./search/llm-search");
const { getInstallPreview, executeInstall } = require("./installer");
const { scanLocalConfig } = require("./installer/health");
const { generateStaticPages } = require("./seo/generator");
const cache = require("./cache");
require("./firebase"); // initialize Firebase Admin SDK (no-op if env vars not set)
const userRoutes = require("./routes/users");
const rateLimit = require("express-rate-limit");

const installLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many install requests. Try again in a minute.",
  },
});

const previewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many preview requests. Try again in a minute.",
  },
});

const app = express();
const PORT = process.env.PORT || 3737;

// Restrict CORS to same-origin localhost only — prevents cross-site install trigger
// Allow localhost for local dev, plus the hosted frontend origin when deployed
const ALLOWED_ORIGINS = [
  `http://localhost:${PORT}`,
  process.env.ALLOWED_ORIGIN,
].filter(Boolean);
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: "10kb" }));
// SEO static pages — must be mounted BEFORE public/ so /tools/... resolves
// to the pre-rendered HTML files instead of falling through to the SPA.
// `extensions: ["html"]` lets `/tools/x/y` resolve to `tools/x/y.html`.
app.use(
  express.static(path.join(__dirname, "..", "data/static"), {
    extensions: ["html"],
  }),
);
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/api/user", userRoutes);

// In-flight deduplication: concurrent cache misses share one crawl instead of racing
let catalogInFlight = null;

// Minimum interval between full re-crawls to protect external API rate limits
const REFRESH_COOLDOWN_MS = 60_000;
let lastRefresh = 0;

// GET /api/catalog — returns scored tool catalog (cached)
app.get("/api/catalog", async (req, res) => {
  try {
    const cached = cache.get("catalog");
    if (cached) return res.json({ ok: true, data: cached, fromCache: true });

    if (!catalogInFlight) {
      catalogInFlight = crawlAll()
        .then(async (raw) => {
          const scored = await scoreCatalog(raw);
          cache.set("catalog", scored);
          generateStaticPages(scored).catch((err) =>
            console.error("SEO generation failed:", err),
          );
          return scored;
        })
        .finally(() => {
          catalogInFlight = null;
        });
    }
    const scored = await catalogInFlight;
    res.json({ ok: true, data: scored, fromCache: false });
  } catch (err) {
    console.error("Catalog error:", err);
    res
      .status(500)
      .json({ ok: false, error: "Catalog load failed. Check server logs." });
  }
});

// POST /api/catalog/refresh — clears cache and re-crawls

// Middleware: validate Bearer token for refresh endpoint
function requireRefreshSecret(req, res, next) {
  const secret = process.env.REFRESH_SECRET;
  if (!secret) return next(); // no secret configured — open in dev mode
  const auth = req.headers.authorization;
  const expected = `Bearer ${secret}`;
  if (
    !auth ||
    auth.length !== expected.length ||
    !require("crypto").timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
  ) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  return next();
}

// POST /api/catalog/refresh — clears cache and re-crawls
app.post("/api/catalog/refresh", requireRefreshSecret, async (req, res) => {
  const now = Date.now();
  if (now - lastRefresh < REFRESH_COOLDOWN_MS) {
    const waitSec = Math.ceil(
      (REFRESH_COOLDOWN_MS - (now - lastRefresh)) / 1000,
    );
    return res.status(429).json({
      ok: false,
      error: `Refresh throttled. Try again in ${waitSec}s.`,
    });
  }
  lastRefresh = now;
  try {
    cache.clear();
    const raw = await crawlAll();
    const scored = await scoreCatalog(raw);
    cache.set("catalog", scored);
    generateStaticPages(scored).catch((err) =>
      console.error("SEO generation failed:", err),
    );
    res.json({ ok: true, data: scored, count: scored.length });
  } catch (err) {
    console.error("Refresh error:", err);
    res
      .status(500)
      .json({ ok: false, error: "Refresh failed. Check server logs." });
  }
});

const VALID_INSTALL_TYPES = new Set([
  "npm-package",
  "github-file",
  "github-dir",
  "github-repo",
  "mcp-server",
  "local",
]);

const VALID_CATEGORIES = new Set([
  "agents",
  "skills",
  "templates",
  "hooks",
  "mcp-servers",
  "tools",
  "plugins",
]);

// npm package names: no semicolons, pipes, or shell metacharacters
const VALID_NPM_PKG_RE = /^@?[a-zA-Z0-9][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9._-]+)?$/;
const VALID_NPM_CMD_RE =
  /^npm install -g @?[a-zA-Z0-9][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9._-]+)?$/;

// GitHub repo names: "owner/repo" — no path traversal, no query-param injection
const VALID_REPO_RE =
  /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

const GITHUB_INSTALL_TYPES = new Set([
  "github-file",
  "github-dir",
  "github-repo",
  "mcp-server",
]);

function validateTool(tool) {
  if (!tool || typeof tool !== "object") return "tool must be an object";
  if (typeof tool.name !== "string" || !tool.name.trim())
    return "tool.name is required";
  if (tool.name.length > 200) return "tool.name too long";
  if (tool.category !== undefined && !VALID_CATEGORIES.has(tool.category))
    return `unknown category: ${tool.category}`;
  const config = tool.installConfig;
  if (!config || typeof config !== "object")
    return "tool.installConfig is required";
  if (!VALID_INSTALL_TYPES.has(config.type))
    return `unknown install type: ${config.type}`;
  if (config.type === "npm-package") {
    if (config.npmPackage && !VALID_NPM_PKG_RE.test(config.npmPackage)) {
      return "invalid npmPackage name";
    }
    if (config.npmInstallCmd && !VALID_NPM_CMD_RE.test(config.npmInstallCmd)) {
      return "invalid npmInstallCmd format";
    }
  }
  if (GITHUB_INSTALL_TYPES.has(config.type)) {
    if (config.repoFullName && !VALID_REPO_RE.test(config.repoFullName)) {
      return "invalid repoFullName format (expected owner/repo)";
    }
    if (config.repoFullName && config.repoFullName.length > 140) {
      return "repoFullName too long";
    }
  }
  return null;
}

// POST /api/install/preview — returns diff of what would be installed
app.post("/api/install/preview", previewLimiter, async (req, res) => {
  try {
    const { tool } = req.body;
    const err = validateTool(tool);
    if (err) return res.status(400).json({ ok: false, error: err });
    const preview = await getInstallPreview(tool);
    res.json({ ok: true, preview });
  } catch (err) {
    console.error("Preview error:", err);
    res
      .status(500)
      .json({ ok: false, error: "Preview failed. Check server logs." });
  }
});

// POST /api/install/execute — performs the install after user confirms
app.post("/api/install/execute", installLimiter, async (req, res) => {
  try {
    const { tool } = req.body;
    const err = validateTool(tool);
    if (err) return res.status(400).json({ ok: false, error: err });
    const result = await executeInstall(tool);
    // Invalidate health cache after install
    cache.del("health");
    res.json({ ok: true, result });
  } catch (err) {
    console.error("Install error:", err);
    res
      .status(500)
      .json({ ok: false, error: "Install failed. Check server logs." });
  }
});

// GET /api/health — scans ~/.claude/ and reports config health
app.get("/api/health", async (req, res) => {
  try {
    const cached = cache.get("health");
    if (cached) return res.json({ ok: true, data: cached });
    const data = await scanLocalConfig();
    cache.set("health", data, 5); // 5-minute TTL for health
    res.json({ ok: true, data });
  } catch (err) {
    console.error("Health error:", err);
    res
      .status(500)
      .json({ ok: false, error: "Health check failed. Check server logs." });
  }
});

// POST /api/search/natural — LLM-powered semantic search over the catalog
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many search requests. Try again in a minute.",
  },
});

app.post("/api/search/natural", searchLimiter, async (req, res) => {
  try {
    const { query } = req.body || {};
    if (typeof query !== "string") {
      return res
        .status(400)
        .json({ ok: false, error: "query must be a string" });
    }
    const catalog = cache.get("catalog");
    if (!catalog) {
      return res.status(503).json({
        ok: false,
        error: "Catalog not loaded yet. Visit /api/catalog first.",
      });
    }
    const results = await naturalLanguageSearch(query, catalog);
    res.json({ ok: true, results, query });
  } catch (err) {
    const isInputError = /characters/i.test(err.message);
    const isConfigError = /LLM_API_KEY/.test(err.message);
    const status = isInputError ? 400 : isConfigError ? 503 : 500;
    const message = isInputError
      ? err.message
      : isConfigError
        ? "Natural language search is not configured on this server."
        : "Search failed. Check server logs.";
    if (!isInputError && !isConfigError) console.error("Search error:", err);
    res.status(status).json({ ok: false, error: message });
  }
});

// GET /api/status — server info
app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    version: "1.0.0",
    githubAuth: !!process.env.GITHUB_TOKEN,
    googleSearch: !!(process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID),
    cacheSize: cache.size(),
  });
});

// Bind to loopback only — prevents LAN access to the install endpoint
// On Railway (RAILWAY_ENVIRONMENT is set), bind to 0.0.0.0 for external traffic.
// Locally, default to 127.0.0.1 loopback. Override with HOST env var if needed.
const HOST = process.env.RAILWAY_ENVIRONMENT
  ? "0.0.0.0"
  : process.env.HOST || "127.0.0.1";
app.listen(PORT, HOST, () => {
  console.log(`\nClaude Crawler running at http://localhost:${PORT}`);
  console.log(
    `GitHub API: ${process.env.GITHUB_TOKEN ? "authenticated (5000 req/hr)" : "unauthenticated (60 req/hr)"}`,
  );
  console.log(
    `Google Search: ${process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID ? "enabled" : "disabled"}`,
  );
  console.log(
    `Refresh endpoint: ${process.env.REFRESH_SECRET ? "protected (REFRESH_SECRET set)" : "open (set REFRESH_SECRET to protect)"}\n`,
  );
});

module.exports = app;
