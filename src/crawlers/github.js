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

// Repository search queries that surface Claude ecosystem tools
const REPO_QUERIES = [
  { q: "topic:claude-code", label: "claude-code topic" },
  { q: "topic:mcp-server", label: "mcp-server topic" },
  { q: "topic:model-context-protocol", label: "model-context-protocol topic" },
  { q: "topic:claude-agent", label: "claude-agent topic" },
  { q: "org:modelcontextprotocol", label: "modelcontextprotocol org" },
  { q: "claude mcp in:name,description stars:>10", label: "claude mcp repos" },
  {
    q: "claude-code skill agent in:name,description stars:>5",
    label: "claude skill/agent repos",
  },
  {
    q: "CLAUDE.md template in:name,description stars:>20",
    label: "CLAUDE.md templates",
  },
];

async function crawlGitHub() {
  const allRepos = new Map();

  for (const { q, label } of REPO_QUERIES) {
    try {
      const repos = await searchRepos(q);
      repos.forEach((r) => allRepos.set(r.full_name, r));
      console.log(`[github] ${label}: ${repos.length} repos`);
      await sleep(300); // stay well under rate limit
    } catch (err) {
      if (err.response?.status === 403) {
        console.warn(`[github] Rate limit hit, stopping early`);
        break;
      }
      console.warn(`[github] Query "${label}" failed: ${err.message}`);
    }
  }

  return [...allRepos.values()].map(normalizeRepo);
}

async function searchRepos(q) {
  const { data } = await axios.get(`${BASE}/search/repositories`, {
    headers: HEADERS,
    params: { q, sort: "stars", order: "desc", per_page: 30 },
    timeout: 10000,
  });
  return data.items || [];
}

function normalizeRepo(repo) {
  const category = detectCategory(repo);
  return {
    id: `github:${repo.full_name}`,
    name: repo.name,
    displayName: toDisplayName(repo.name),
    description: repo.description || "",
    category,
    jobCategory: detectJobCategory(repo),
    source: "github",
    url: repo.html_url,
    rawUrl: null, // populated by installer on-demand
    author: repo.owner?.login || "",
    authorUrl: repo.owner?.html_url || "",
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    weeklyDownloads: 0,
    updatedAt: repo.pushed_at || repo.updated_at,
    hasReadme: true, // assume true; installer fetches actual content
    readme: "",
    topics: repo.topics || [],
    language: repo.language || "",
    license: repo.license?.spdx_id || "",
    installConfig: buildInstallConfig(repo, category),
    isOfficial: isOfficialOrg(repo.owner?.login),
    contentWarnings: [],
    score: 0,
    installed: false,
  };
}

function detectCategory(repo) {
  const topics = repo.topics || [];
  const name = repo.name.toLowerCase();
  const desc = (repo.description || "").toLowerCase();

  if (
    topics.includes("mcp-server") ||
    topics.includes("model-context-protocol") ||
    name.includes("mcp-server") ||
    name.startsWith("mcp-")
  )
    return "mcp-servers";
  if (
    topics.includes("claude-agent") ||
    (name.includes("agent") &&
      (name.includes("claude") || desc.includes("claude code")))
  )
    return "agents";
  if (
    topics.includes("claude-skill") ||
    (name.includes("skill") && desc.includes("claude"))
  )
    return "skills";
  if (
    name.includes("claude.md") ||
    name.includes("claudemd") ||
    desc.includes("claude.md template")
  )
    return "templates";
  if (desc.includes("hook") && desc.includes("claude")) return "hooks";
  if (topics.includes("claude-code") || desc.includes("claude code"))
    return "tools";
  return "tools";
}

function detectJobCategory(repo) {
  const text =
    `${repo.name} ${repo.description || ""} ${(repo.topics || []).join(" ")}`.toLowerCase();

  if (/test|lint|review|quality|coverage|format/.test(text))
    return "code-quality";
  if (/python|typescript|go|rust|java|kotlin|swift|dart/.test(text))
    return "language-support";
  if (/database|db|postgres|mysql|redis|sqlite|supabase/.test(text))
    return "external-services";
  if (/slack|github|jira|notion|stripe|google|aws|azure/.test(text))
    return "external-services";
  if (/filesystem|file|browser|web|search|fetch/.test(text))
    return "external-services";
  if (/prompt|reasoning|think|chain|rag|embed|vector/.test(text))
    return "ai-enhancement";
  if (/plan|project|task|todo|issue|ticket|sprint/.test(text))
    return "project-management";
  return "automate-workflow";
}

function buildInstallConfig(repo, category) {
  const base = { repoFullName: repo.full_name, cloneUrl: repo.clone_url };

  if (category === "mcp-servers") {
    // Many MCP servers are also on npm — installer will check
    return { ...base, type: "mcp-server", npmPackage: null };
  }
  if (category === "agents") {
    return { ...base, type: "github-file", destDir: "~/.claude/agents" };
  }
  if (category === "skills") {
    return { ...base, type: "github-dir", destDir: "~/.claude/skills" };
  }
  if (category === "templates") {
    return { ...base, type: "github-file", destDir: "~/.claude" };
  }
  return { ...base, type: "github-repo" };
}

function isOfficialOrg(login) {
  return ["anthropics", "modelcontextprotocol", "anthropic-ai"].includes(
    (login || "").toLowerCase(),
  );
}

function toDisplayName(slug) {
  return slug
    .replace(/^(mcp-server-|claude-|anthropic-)/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { crawlGitHub };
