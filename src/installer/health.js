"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const CLAUDE_DIR = path.join(os.homedir(), ".claude");

async function scanLocalConfig() {
  const agents = collectAgents();
  const skills = collectSkills();
  const settings = readSettings();
  const issues = [];

  checkSettingsJson(settings, issues);
  checkDuplicateNames(agents, skills, issues);
  checkMissingDescriptions(agents, issues);
  checkHookConflicts(settings, issues);

  return {
    claudeDir: CLAUDE_DIR.replace(os.homedir(), "~"),
    counts: {
      agents: agents.length,
      skills: skills.length,
      hooks: countHooks(settings),
      mcpServers: countMcpServers(settings),
    },
    issues,
    healthy: issues.filter((i) => i.severity === "error").length === 0,
  };
}

function collectAgents() {
  const agents = [];
  const dir = path.join(CLAUDE_DIR, "agents");
  if (!fs.existsSync(dir)) return agents;
  walkMdFiles(dir, (filePath, content) => {
    const meta = parseFrontmatter(content);
    agents.push({
      name: meta.name || path.basename(filePath, ".md"),
      path: filePath,
      hasDescription: !!meta.description,
    });
  });
  return agents;
}

function collectSkills() {
  const skills = [];
  const dir = path.join(CLAUDE_DIR, "skills");
  if (!fs.existsSync(dir)) return skills;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(dir, entry.name, "SKILL.md");
      if (fs.existsSync(skillFile)) {
        const content = fs.readFileSync(skillFile, "utf8");
        const meta = parseFrontmatter(content);
        skills.push({
          name: meta.name || entry.name,
          path: skillFile,
          hasDescription: !!meta.description,
        });
      }
    }
  } catch {
    /* ignore */
  }
  return skills;
}

function readSettings() {
  const settingsPath = path.join(CLAUDE_DIR, "settings.json");
  if (!fs.existsSync(settingsPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    return "invalid";
  }
}

function checkSettingsJson(settings, issues) {
  if (settings === "invalid") {
    issues.push({
      severity: "error",
      category: "settings",
      message:
        "settings.json is not valid JSON — Claude Code may fail to start.",
    });
  }
  if (settings === null) {
    issues.push({
      severity: "info",
      category: "settings",
      message:
        "No settings.json found. This is fine for default configurations.",
    });
  }
}

function checkDuplicateNames(agents, skills, issues) {
  const agentNames = agents.map((a) => a.name.toLowerCase());
  const dupes = agentNames.filter((n, i) => agentNames.indexOf(n) !== i);
  if (dupes.length > 0) {
    issues.push({
      severity: "warning",
      category: "agents",
      message: `Duplicate agent names detected: ${[...new Set(dupes)].join(", ")}`,
    });
  }

  const skillNames = skills.map((s) => s.name.toLowerCase());
  const skillDupes = skillNames.filter((n, i) => skillNames.indexOf(n) !== i);
  if (skillDupes.length > 0) {
    issues.push({
      severity: "warning",
      category: "skills",
      message: `Duplicate skill names detected: ${[...new Set(skillDupes)].join(", ")}`,
    });
  }
}

function checkMissingDescriptions(agents, issues) {
  const missing = agents.filter((a) => !a.hasDescription).map((a) => a.name);
  if (missing.length > 0) {
    issues.push({
      severity: "info",
      category: "agents",
      message: `Agents missing descriptions (Claude uses these for routing): ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` +${missing.length - 5} more` : ""}`,
    });
  }
}

function checkHookConflicts(settings, issues) {
  if (!settings || typeof settings !== "object") return;
  // hooks is an object: { PreToolUse: [...], PostToolUse: [...] }
  const hooks = settings.hooks || {};
  const preToolUse = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
  if (preToolUse.length > 3) {
    issues.push({
      severity: "warning",
      category: "hooks",
      message: `${preToolUse.length} PreToolUse hooks configured — many hooks slow down every tool call.`,
    });
  }
}

function countHooks(settings) {
  if (!settings || typeof settings !== "object") return 0;
  const hooks = settings.hooks || {};
  // Sum all hook type arrays
  return Object.values(hooks).reduce(
    (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
    0,
  );
}

function countMcpServers(settings) {
  if (!settings || typeof settings !== "object") return 0;
  return Object.keys(settings.mcpServers || {}).length;
}

function walkMdFiles(dir, cb) {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkMdFiles(full, cb);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        try {
          cb(full, fs.readFileSync(full, "utf8"));
        } catch {
          /* skip unreadable */
        }
      }
    }
  } catch {
    /* ignore */
  }
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const meta = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) {
      meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  return meta;
}

module.exports = { scanLocalConfig };
