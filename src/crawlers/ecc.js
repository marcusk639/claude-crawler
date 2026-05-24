"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const ECC_CACHE = path.join(CLAUDE_DIR, "plugins", "cache");

async function crawlEcc() {
  const tools = [];

  tools.push(...readInstalledSkills());
  tools.push(...readInstalledAgents());
  tools.push(...readEccPlugins());

  console.log(`[ecc] Found ${tools.length} local ECC tools`);
  return tools;
}

function readInstalledSkills() {
  const skillsDir = path.join(CLAUDE_DIR, "skills");
  if (!fs.existsSync(skillsDir)) return [];

  return safeReadDirs(skillsDir)
    .map((name) => {
      const skillFile = path.join(skillsDir, name, "SKILL.md");
      if (!fs.existsSync(skillFile)) return null;

      const content = fs.readFileSync(skillFile, "utf8");
      const meta = parseFrontmatter(content);

      return {
        id: `ecc:skill:${name}`,
        name,
        displayName: meta.name || toDisplayName(name),
        description: meta.description || "",
        category: "skills",
        jobCategory: "automate-workflow",
        source: "ecc",
        url: "",
        rawUrl: null,
        author: "local",
        authorUrl: "",
        stars: 0,
        forks: 0,
        weeklyDownloads: 0,
        updatedAt: new Date().toISOString(),
        hasReadme: content.length > 100,
        readme: content.slice(0, 1000),
        topics: [],
        language: "",
        license: "",
        installConfig: { type: "local", path: path.join(skillsDir, name) },
        isOfficial: false,
        contentWarnings: [],
        score: 0,
        installed: true,
      };
    })
    .filter(Boolean);
}

function readInstalledAgents() {
  const agentsDir = path.join(CLAUDE_DIR, "agents");
  if (!fs.existsSync(agentsDir)) return [];

  const agentFiles = [];
  collectMdFiles(agentsDir, agentFiles);

  return agentFiles.map((filePath) => {
    const content = fs.readFileSync(filePath, "utf8");
    const meta = parseFrontmatter(content);
    const name = path.basename(filePath, ".md");

    return {
      id: `ecc:agent:${name}`,
      name,
      displayName: meta.name || toDisplayName(name),
      description: meta.description || "",
      category: "agents",
      jobCategory: "automate-workflow",
      source: "ecc",
      url: "",
      rawUrl: null,
      author: "local",
      authorUrl: "",
      stars: 0,
      forks: 0,
      weeklyDownloads: 0,
      updatedAt: new Date().toISOString(),
      hasReadme: content.length > 50,
      readme: content.slice(0, 1000),
      topics: [],
      language: "",
      license: "",
      installConfig: { type: "local", path: filePath },
      isOfficial: false,
      contentWarnings: [],
      score: 0,
      installed: true,
    };
  });
}

function readEccPlugins() {
  if (!fs.existsSync(ECC_CACHE)) return [];

  const plugins = [];
  for (const vendor of safeReadDirs(ECC_CACHE)) {
    const vendorDir = path.join(ECC_CACHE, vendor);
    for (const pluginName of safeReadDirs(vendorDir)) {
      plugins.push({
        id: `ecc:plugin:${vendor}:${pluginName}`,
        name: pluginName,
        displayName: toDisplayName(pluginName),
        description: `ECC plugin: ${pluginName}`,
        category: "plugins",
        jobCategory: "automate-workflow",
        source: "ecc",
        url: "",
        rawUrl: null,
        author: vendor,
        authorUrl: "",
        stars: 0,
        forks: 0,
        weeklyDownloads: 0,
        updatedAt: new Date().toISOString(),
        hasReadme: false,
        readme: "",
        topics: [],
        language: "",
        license: "",
        installConfig: {
          type: "local",
          path: path.join(vendorDir, pluginName),
        },
        isOfficial: false,
        contentWarnings: [],
        score: 0,
        installed: true,
      });
    }
  }
  return plugins;
}

// --- helpers ---

function safeReadDirs(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function collectMdFiles(dir, result) {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collectMdFiles(full, result);
      else if (entry.isFile() && entry.name.endsWith(".md")) result.push(full);
    }
  } catch {
    /* ignore unreadable dirs */
  }
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const meta = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    if (key && rest.length) meta[key.trim()] = rest.join(":").trim();
  }
  return meta;
}

function toDisplayName(slug) {
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

module.exports = { crawlEcc };
