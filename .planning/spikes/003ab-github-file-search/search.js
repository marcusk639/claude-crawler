"use strict";

/**
 * Spike 003a+b: GitHub File Search
 *
 * Tests GitHub Code Search API for:
 *   003a: filename:SKILL.md — finds skill repos not tagged with claude-code topic
 *   003b: path:.claude/agents — finds repos with agent .md files
 */

const https = require("https");
const fs = require("fs");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

const KNOWN_REPOS = new Set([
  "VoltAgent/awesome-claude-code-subagents",
  "sickn33/antigravity-awesome-skills",
  "affaan-m/ECC",
  "anthropics/claude-code",
  "modelcontextprotocol/servers",
]);

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
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            reject(new Error(`JSON parse: ${e.message}`));
          }
        });
      })
      .on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function codeSearch(query, label) {
  const encoded = encodeURIComponent(query);
  const url = `https://api.github.com/search/code?q=${encoded}&per_page=30`;
  console.log(`\n[search] ${label}`);

  const { status, data } = await fetchJson(url);

  if (status === 403) {
    const resetAt = data.message?.includes("rate limit") ? " (rate limited)" : "";
    console.warn(`[search] HTTP 403${resetAt}: ${data.message}`);
    return { total: 0, items: [], rateLimited: true };
  }
  if (status !== 200) {
    console.warn(`[search] HTTP ${status}: ${data.message}`);
    return { total: 0, items: [] };
  }

  const items = data.items || [];
  console.log(`[search] total_count=${data.total_count}, returned=${items.length}`);
  return { total: data.total_count || 0, items };
}

function extractUniqueRepos(items) {
  const repos = new Map();
  for (const item of items) {
    const repo = item.repository;
    if (!repo) continue;
    const key = repo.full_name;
    if (!repos.has(key)) {
      repos.set(key, {
        fullName: key,
        stars: repo.stargazers_count,
        description: repo.description || "",
        url: repo.html_url,
        isNew: !KNOWN_REPOS.has(key),
        filePath: item.path,
      });
    }
  }
  return [...repos.values()];
}

async function main() {
  console.log("=== Spike 003a+b: GitHub File Search ===\n");

  const SEARCHES = [
    {
      query: "filename:SKILL.md description language:Markdown",
      label: "003a: SKILL.md with description field",
    },
    {
      query: "path:.claude/skills filename:SKILL.md",
      label: "003a: SKILL.md in .claude/skills path",
    },
    {
      query: "path:.claude/agents extension:md tools",
      label: "003b: .claude/agents .md files with tools field",
    },
  ];

  const allResults = [];
  const allNewRepos = new Map();

  for (const { query, label } of SEARCHES) {
    await sleep(2000);
    const result = await codeSearch(query, label);
    const repos = extractUniqueRepos(result.items);
    const newRepos = repos.filter((r) => r.isNew);

    console.log(
      `  Unique repos: ${repos.length}, new: ${newRepos.length}`
    );
    newRepos.slice(0, 3).forEach((r) => {
      console.log(
        `    - [${r.stars}★] ${r.fullName}: ${r.description.slice(0, 60)}`
      );
    });

    allResults.push({
      label,
      query,
      totalCount: result.total,
      reposFound: repos.length,
      newRepos: newRepos.length,
      rateLimited: !!result.rateLimited,
      sampleNew: newRepos.slice(0, 5),
    });

    newRepos.forEach((r) => allNewRepos.set(r.fullName, r));
  }

  console.log("\n\n=== RESULTS SUMMARY ===\n");
  for (const r of allResults) {
    const flag = r.rateLimited ? " [RATE LIMITED]" : "";
    console.log(
      `${r.label}${flag}: totalCount=${r.totalCount}, new repos=${r.newRepos}`
    );
  }

  console.log(`\nTotal unique new repos from file search: ${allNewRepos.size}`);
  [...allNewRepos.values()].slice(0, 8).forEach((r) => {
    console.log(`  - [${r.stars}★] ${r.fullName} (${r.filePath})`);
  });

  fs.writeFileSync(
    __dirname + "/results.json",
    JSON.stringify(
      {
        results: allResults,
        totalNewRepos: allNewRepos.size,
        sampleNewRepos: [...allNewRepos.values()].slice(0, 20),
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log("\nResults written to results.json");
}

main().catch(console.error);
