"use strict";

/**
 * Spike 004: Anthropics Official Tree Walk
 *
 * Walks the anthropics/skills repo tree to surface each skill as a first-class
 * tool entry with isOfficial=true for higher trust scoring.
 */

const https = require("https");
const fs = require("fs");

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { "User-Agent": "claude-crawler-spike", Accept: "application/vnd.github+json" } };
    https.get(url, opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}

async function fetchText(url) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { "User-Agent": "claude-crawler-spike" } };
    https.get(url, opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const meta = {};
  for (const line of match[1].split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    meta[key] = val;
  }
  return meta;
}

async function main() {
  console.log("=== Spike 004: Anthropics Official Tree Walk ===\n");

  const repo = "anthropics/skills";
  console.log(`[official] Walking ${repo}...`);
  const tree = await fetchJson(`https://api.github.com/repos/${repo}/git/trees/main?recursive=1`);

  const skillFiles = (tree.tree || []).filter(
    (f) => f.type === "blob" && f.path.match(/^skills\/[^/]+\/SKILL\.md$/)
  );

  console.log(`[official] Found ${skillFiles.length} skill files\n`);

  const tools = [];
  for (const file of skillFiles) {
    const rawUrl = `https://raw.githubusercontent.com/${repo}/main/${file.path}`;
    const content = await fetchText(rawUrl);
    const meta = parseFrontmatter(content);
    const name = file.path.split("/")[1];

    tools.push({
      id: `anthropics:skill:${name}`,
      name,
      displayName: meta.name || name,
      description: meta.description || "",
      isOfficial: true,
      license: meta.license || "",
      hasDescription: (meta.description || "").length > 20,
    });

    console.log(`  ✓ ${name}: "${(meta.description || "").slice(0, 70)}"`);
  }

  console.log("\n\n=== RESULTS ===\n");
  console.log(`Total official skills: ${tools.length}`);
  console.log(`All have descriptions: ${tools.every((t) => t.hasDescription)}`);
  console.log(`All isOfficial=true: ${tools.every((t) => t.isOfficial)}`);

  console.log("\n=== VERDICT ===");
  console.log("Current anthropic.js crawler treats anthropics/skills as 1 repo entry.");
  console.log(`Should be ${tools.length} individual skill entries with isOfficial=true.`);
  console.log("Impact: better trust scoring + individually discoverable official tools.");

  fs.writeFileSync(
    __dirname + "/results.json",
    JSON.stringify({ tools, total: tools.length, timestamp: new Date().toISOString() }, null, 2)
  );
  console.log("\nResults written to results.json");
}

main().catch(console.error);
