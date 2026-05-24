"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { crawlAll } = require("./crawlers");
const { scoreCatalog } = require("./scoring");
const { getInstallPreview, executeInstall } = require("./installer");
const { scanLocalConfig } = require("./installer/health");
const cache = require("./cache");

const app = express();
const PORT = process.env.PORT || 3737;

// Restrict CORS to same-origin localhost only — prevents cross-site install trigger
app.use(cors({ origin: `http://localhost:${PORT}` }));
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

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
        .then((raw) => {
          const scored = scoreCatalog(raw);
          cache.set("catalog", scored);
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
app.post("/api/catalog/refresh", async (req, res) => {
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
    const scored = scoreCatalog(raw);
    cache.set("catalog", scored);
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
  return null;
}

// POST /api/install/preview — returns diff of what would be installed
app.post("/api/install/preview", async (req, res) => {
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
app.post("/api/install/execute", async (req, res) => {
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
app.listen(PORT, "127.0.0.1", () => {
  console.log(`\nClaude Crawler running at http://localhost:${PORT}`);
  console.log(
    `GitHub API: ${process.env.GITHUB_TOKEN ? "authenticated (5000 req/hr)" : "unauthenticated (60 req/hr)"}`,
  );
  console.log(
    `Google Search: ${process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID ? "enabled" : "disabled"}\n`,
  );
});

module.exports = app;
