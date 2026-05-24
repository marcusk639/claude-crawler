"use strict";

const axios = require("axios");

const BASE = "https://api.github.com";
const HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(process.env.GITHUB_TOKEN && {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  }),
};

// Pinned high-value repos to always include regardless of search results
const PINNED_REPOS = [
  "anthropics/anthropic-quickstarts",
  "anthropics/claude-code",
  "modelcontextprotocol/servers",
  "modelcontextprotocol/typescript-sdk",
  "modelcontextprotocol/python-sdk",
  "modelcontextprotocol/specification",
];

const ORGS = ["modelcontextprotocol"];

async function crawlAnthropicOrg() {
  const seen = new Map();

  // Fetch pinned repos first
  await Promise.allSettled(
    PINNED_REPOS.map(async (fullName) => {
      try {
        const { data } = await axios.get(`${BASE}/repos/${fullName}`, {
          headers: HEADERS,
          timeout: 8000,
        });
        seen.set(data.full_name, normalizeRepo(data, true));
      } catch (err) {
        console.warn(`[anthropic] Pinned repo ${fullName}: ${err.message}`);
      }
    }),
  );

  // Fetch all public repos from key orgs
  for (const org of ORGS) {
    try {
      const repos = await getOrgRepos(org);
      repos.forEach((r) => {
        if (!seen.has(r.full_name))
          seen.set(r.full_name, normalizeRepo(r, true));
      });
      console.log(`[anthropic] org:${org}: ${repos.length} repos`);
    } catch (err) {
      console.warn(`[anthropic] Org ${org} failed: ${err.message}`);
    }
  }

  return [...seen.values()];
}

async function getOrgRepos(org) {
  const { data } = await axios.get(`${BASE}/orgs/${org}/repos`, {
    headers: HEADERS,
    params: { type: "public", sort: "updated", per_page: 50 },
    timeout: 10000,
  });
  return data || [];
}

function normalizeRepo(repo, isOfficial = false) {
  const topics = repo.topics || [];
  const name = repo.name.toLowerCase();

  let category = "tools";
  if (
    topics.includes("mcp-server") ||
    name.includes("mcp-server") ||
    name.startsWith("server-")
  ) {
    category = "mcp-servers";
  } else if (name.includes("sdk") || name.includes("specification")) {
    category = "tools";
  } else if (name.includes("quickstart") || name.includes("example")) {
    category = "templates";
  }

  return {
    id: `github:${repo.full_name}`,
    name: repo.name,
    displayName: toDisplayName(repo.name),
    description: repo.description || "",
    category,
    jobCategory: "external-services",
    source: "anthropic",
    url: repo.html_url,
    rawUrl: null,
    author: repo.owner?.login || "",
    authorUrl: repo.owner?.html_url || "",
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    weeklyDownloads: 0,
    updatedAt: repo.pushed_at || repo.updated_at,
    hasReadme: true,
    readme: "",
    topics,
    language: repo.language || "",
    license: repo.license?.spdx_id || "",
    installConfig: buildInstallConfig(repo, category),
    isOfficial,
    contentWarnings: [],
    score: 0,
    installed: false,
  };
}

function buildInstallConfig(repo, category) {
  if (category === "mcp-servers") {
    return {
      type: "mcp-server",
      repoFullName: repo.full_name,
      cloneUrl: repo.clone_url,
      npmPackage: null,
    };
  }
  return {
    type: "github-repo",
    repoFullName: repo.full_name,
    cloneUrl: repo.clone_url,
  };
}

function toDisplayName(slug) {
  return slug
    .replace(/^(mcp-server-|server-|claude-|anthropic-)/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

module.exports = { crawlAnthropicOrg };
