"use strict";

/**
 * Spike 002: Awesome List Parser
 *
 * Tests parsing curated README awesome lists to extract individual tool links.
 * Each markdown link in these lists points to a GitHub repo that IS a tool.
 */

const https = require("https");
const fs = require("fs");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

const AWESOME_LISTS = [
  {
    repo: "rohitg00/awesome-claude-code-toolkit",
    label: "Rohitg00 Claude Code Toolkit",
  },
  {
    repo: "travisvn/awesome-claude-skills",
    label: "Travis VN Awesome Claude Skills",
  },
  {
    repo: "hesreallyhim/awesome-claude-code",
    label: "Hesreallyhim Awesome Claude Code",
  },
];

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
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function parseAwesomeLinks(content) {
  const results = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const linkPattern =
      /\[([^\]]+)\]\((https:\/\/github\.com\/[^/\s)]+\/[^/\s)]+)\)/g;
    let match;
    while ((match = linkPattern.exec(line)) !== null) {
      const [, name, url] = match;
      // Skip badges, CI icons, and non-repo links
      if (
        url.includes("/actions/") ||
        url.includes("/releases/") ||
        url.includes("/issues/") ||
        url.includes("/pull/") ||
        url.includes("/blob/") ||
        url.includes("/tree/") ||
        url.includes("/commit/") ||
        name.toLowerCase().includes("badge") ||
        name.length < 2
      ) {
        continue;
      }

      let description = "";
      // Table format: | [name](url) | stars | description |
      const tableMatch = line.match(/\|\s*\[.+\]\(.+\)\s*\|[^|]*\|([^|]*)\|/);
      if (tableMatch) {
        description = tableMatch[1].trim().replace(/\*\*/g, "");
      } else {
        // List format: - **[name](url)** - description
        const listMatch = line.match(/\)\*?\*?\s*[-—]\s*(.+)$/);
        if (listMatch) {
          description = listMatch[1].trim().replace(/\*\*/g, "");
        }
      }

      const repoPath = url.replace("https://github.com/", "");
      if (repoPath.split("/").length === 2) {
        results.push({ name, url, repoPath, description });
      }
    }
  }

  const seen = new Map();
  for (const r of results) {
    if (!seen.has(r.repoPath)) seen.set(r.repoPath, r);
  }
  return [...seen.values()];
}

async function enrichRepo(repoPath) {
  try {
    const data = await fetchJson(`https://api.github.com/repos/${repoPath}`);
    if (data.message) return null;
    return {
      stars: data.stargazers_count,
      description: data.description,
      topics: data.topics || [],
      updatedAt: data.updated_at,
    };
  } catch {
    return null;
  }
}

async function parseList({ repo, label }) {
  console.log(`\n[parse] Processing ${label} (${repo})...`);
  const readmeUrl = `https://raw.githubusercontent.com/${repo}/main/README.md`;
  let content;
  try {
    content = await fetchText(readmeUrl);
  } catch (e) {
    console.error(`[parse] Failed to fetch README: ${e.message}`);
    return { label, repo, total: 0, sample: [] };
  }

  const links = parseAwesomeLinks(content);
  console.log(`[parse] Extracted ${links.length} unique GitHub tool links`);

  const sample = [];
  for (const link of links.slice(0, 5)) {
    const enriched = await enrichRepo(link.repoPath);
    sample.push({
      ...link,
      stars: enriched?.stars ?? "?",
      githubDescription: enriched?.description || "",
      hasDescription:
        link.description.length > 10 ||
        (enriched?.description || "").length > 10,
    });
  }

  return { label, repo, total: links.length, sample, allLinks: links };
}

async function main() {
  console.log("=== Spike 002: Awesome List Parser ===\n");
  console.log(
    "Testing whether awesome-list READMEs yield structured tool entries.\n"
  );

  const results = [];
  for (const config of AWESOME_LISTS) {
    const result = await parseList(config);
    results.push(result);
  }

  console.log("\n\n=== RESULTS ===\n");
  const allRepos = new Set();

  for (const r of results) {
    console.log(`\n## ${r.label}`);
    console.log(`Total unique GitHub tool links: ${r.total}`);
    (r.allLinks || []).forEach((l) => allRepos.add(l.repoPath));
    console.log("Sample (first 5 enriched):");
    for (const t of r.sample) {
      const desc = t.description || t.githubDescription || "(none)";
      console.log(`  - [${t.stars}★] ${t.name} | ${desc.slice(0, 70)}`);
    }
  }

  const totalUnique = results.reduce((s, r) => s + r.total, 0);

  console.log(`\n\n=== DEDUP ACROSS LISTS ===`);
  console.log(`Total tool links (with duplicates): ${totalUnique}`);
  console.log(`Unique repos across all lists: ${allRepos.size}`);
  console.log(`Overlap: ${totalUnique - allRepos.size} duplicates`);

  console.log(`\n=== CORPUS PROJECTION ===`);
  console.log(`Spike 001 (collection expansion): 5,007 tool files`);
  console.log(
    `Spike 002 (awesome lists): ${allRepos.size} unique external repos`
  );

  fs.writeFileSync(
    __dirname + "/results.json",
    JSON.stringify(
      {
        results: results.map((r) => ({
          ...r,
          allLinks: (r.allLinks || []).slice(0, 20),
        })),
        totalUnique,
        uniqueRepos: allRepos.size,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log("\nResults written to results.json");
}

main().catch(console.error);
