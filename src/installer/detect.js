"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const CLAUDE_DIR = path.join(os.homedir(), ".claude");

async function detectInstalled(tools) {
  const installed = await buildInstalledSet();
  return tools.map((tool) => ({
    ...tool,
    installed: isInstalled(tool, installed),
  }));
}

async function buildInstalledSet() {
  return {
    agentNames: collectNames(path.join(CLAUDE_DIR, "agents"), ".md"),
    skillNames: collectDirNames(path.join(CLAUDE_DIR, "skills")),
    pluginIds: collectPluginIds(),
    npmPackages: await collectNpmPackages(),
  };
}

function isInstalled(tool, installed) {
  // ECC tools report themselves as installed
  if (tool.source === "ecc") return true;

  const name = (tool.name || "").toLowerCase();

  if (tool.category === "agents") return installed.agentNames.has(name);
  if (tool.category === "skills") return installed.skillNames.has(name);
  if (tool.category === "plugins") return installed.pluginIds.has(tool.id);
  if (tool.category === "mcp-servers" && tool.installConfig?.npmPackage) {
    return installed.npmPackages.has(tool.installConfig.npmPackage);
  }
  return false;
}

function collectNames(dir, ext) {
  const names = new Set();
  if (!fs.existsSync(dir)) return names;
  walkDir(dir, (filePath) => {
    if (filePath.endsWith(ext)) {
      names.add(path.basename(filePath, ext).toLowerCase());
    }
  });
  return names;
}

function collectDirNames(dir) {
  const names = new Set();
  if (!fs.existsSync(dir)) return names;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) names.add(entry.name.toLowerCase());
    }
  } catch {
    /* ignore */
  }
  return names;
}

function collectPluginIds() {
  const ids = new Set();
  const pluginsDir = path.join(CLAUDE_DIR, "plugins", "cache");
  if (!fs.existsSync(pluginsDir)) return ids;
  try {
    for (const vendor of fs.readdirSync(pluginsDir)) {
      const vendorDir = path.join(pluginsDir, vendor);
      for (const name of fs.readdirSync(vendorDir)) {
        ids.add(`ecc:plugin:${vendor}:${name}`);
      }
    }
  } catch {
    /* ignore */
  }
  return ids;
}

async function collectNpmPackages() {
  const pkgs = new Set();
  try {
    const { execFile } = require("child_process");
    const { promisify } = require("util");
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync(
      "npm",
      ["list", "-g", "--depth=0", "--json"],
      {
        timeout: 5000,
      },
    );
    const parsed = JSON.parse(stdout);
    Object.keys(parsed.dependencies || {}).forEach((p) => pkgs.add(p));
  } catch {
    /* npm not available or failed — non-critical */
  }
  return pkgs;
}

function walkDir(dir, cb) {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkDir(full, cb);
      else cb(full);
    }
  } catch {
    /* ignore unreadable */
  }
}

module.exports = { detectInstalled };
