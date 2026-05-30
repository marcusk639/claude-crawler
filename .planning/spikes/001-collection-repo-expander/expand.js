"use strict";

/**
 * Spike 001: Collection Repo Expander
 *
 * Tests extracting individual tools from "collection" repos where each .md file is a tool.
 * Supports two patterns:
 *   - SKILL_PATTERN: collection/skills/{name}/SKILL.md  (antigravity, ECC-style)
 *   - AGENT_PATTERN: collection/categories/{cat}/{name}.md  (VoltAgent-style)
 */

const https = require("https");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

const COLLECTION_REPOS = [
  {
    repo: "VoltAgent/awesome-claude-code-subagents",
    pattern: "agent_voltagent", // categories/*/name.md
    label: "VoltAgent Subagents",
  },
  {
    repo: "sickn33/antigravity-awesome-skills",
    pattern: "skill_antigravity", // plugins/.../skills/name/SKILL.md
    label: "Antigravity Skills",
  },
  {
    repo: "affaan-m/ECC",
    pattern: "skill_ecc", // skills/name/SKILL.md
    label: "ECC Skills",
  },
];

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        "User-Agent": "claude-crawler-spike",
        Accept: "application/vnd.github+json",
        ...(GITHUB_TOKEN && { Authorization: `Bearer ${GITHUB_TOKEN}` }),
      },
    };
    https
      .get(url, opts, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse failed: ${e.message}`));
          }
        });
      })
      .on("error", reject);
  });
}

async function fetchText(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        "User-Agent": "claude-crawler-spike",
        ...(GITHUB_TOKEN && { Authorization: `Bearer ${GITHUB_TOKEN}` }),
      },
    };
    https
      .get(url, opts, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          fetchText(res.headers.location).then(resolve).catch(reject);
          return;
        }
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const meta = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  return meta;
}

function toDisplayName(slug) {
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function getRepoTree(repo) {
  const url = `https://api.github.com/repos/${repo}/git/trees/main?recursive=1`;
  try {
    const data = await fetchJson(url);
    if (data.message) throw new Error(data.message);
    return data.tree || [];
  } catch (e) {
    console.error(`[expand] Failed to get tree for ${repo}: ${e.message}`);
    return [];
  }
}

async function expandRepo({ repo, pattern, label }) {
  console.log(`\n[expand] Processing ${label} (${repo})...`);
  const tree = await getRepoTree(repo);

  let toolFiles = [];

  if (pattern === "agent_voltagent") {
    // VoltAgent: categories/01-core-development/api-designer.md
    toolFiles = tree.filter(
      (f) =>
        f.type === "blob" &&
        f.path.match(/^categories\/[^/]+\/[^/]+\.md$/) &&
        !f.path.endsWith("README.md")
    );
  } else if (pattern === "skill_antigravity") {
    // Antigravity: plugins/.../skills/{name}/SKILL.md
    toolFiles = tree.filter(
      (f) => f.type === "blob" && f.path.endsWith("/SKILL.md")
    );
  } else if (pattern === "skill_ecc") {
    // ECC: skills/{name}/SKILL.md
    toolFiles = tree.filter(
      (f) =>
        f.type === "blob" &&
        f.path.match(/^skills\/[^/]+\/SKILL\.md$/)
    );
  }

  console.log(`[expand] Found ${toolFiles.length} tool files in ${label}`);

  // Sample first 5 to validate metadata quality
  const sample = toolFiles.slice(0, 5);
  const tools = [];

  for (const file of sample) {
    const rawUrl = `https://raw.githubusercontent.com/${repo}/main/${file.path}`;
    try {
      const content = await fetchText(rawUrl);
      const meta = parseFrontmatter(content);
      const pathParts = file.path.split("/");
      const slug =
        pattern === "skill_antigravity"
          ? pathParts[pathParts.length - 2] // parent dir name
          : pathParts[pathParts.length - 1].replace(/\.md$/, "");

      tools.push({
        id: `${repo.replace("/", ":")}:${slug}`,
        name: slug,
        displayName: meta.name || toDisplayName(slug),
        description: meta.description || "(no description)",
        source: repo,
        path: file.path,
        hasDescription: !!meta.description && meta.description.length > 20,
      });
    } catch (e) {
      console.warn(`[expand] Failed to fetch ${file.path}: ${e.message}`);
    }
  }

  return { label, repo, total: toolFiles.length, sample: tools };
}

async function main() {
  console.log("=== Spike 001: Collection Repo Expander ===\n");
  console.log(
    "Testing whether collection repos yield quality individual tool entries.\n"
  );

  const results = [];

  for (const config of COLLECTION_REPOS) {
    const result = await expandRepo(config);
    results.push(result);
  }

  console.log("\n\n=== RESULTS ===\n");
  let totalTools = 0;
  for (const r of results) {
    console.log(`\n## ${r.label} (${r.repo})`);
    console.log(`Total tool files found: ${r.total}`);
    console.log("Sample (first 5):");
    for (const t of r.sample) {
      console.log(
        `  - ${t.displayName} | desc quality: ${t.hasDescription ? "✓" : "✗"} | "${t.description.slice(0, 80)}"`
      );
    }
    totalTools += r.total;
  }

  console.log(`\n\n=== CORPUS PROJECTION ===`);
  console.log(
    `Current approach (8 queries × 30 results): ~240 repos as tools`
  );
  console.log(`Collection expansion potential: ${totalTools} individual tools`);
  console.log(
    `Multiplier: ~${Math.round(totalTools / 240)}× corpus growth from these 3 repos alone`
  );

  const fs = require("fs");
  fs.writeFileSync(
    __dirname + "/results.json",
    JSON.stringify(
      { results, totalTools, timestamp: new Date().toISOString() },
      null,
      2
    )
  );
  console.log("\nResults written to results.json");
}

main().catch(console.error);
