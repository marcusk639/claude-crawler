"use strict";

const axios = require("axios");

const GOOGLE_BASE = "https://www.googleapis.com/customsearch/v1";
const REDDIT_BASE = "https://www.reddit.com";

const SEARCH_QUERIES = [
  "best claude code MCP server github",
  "claude code agent skill open source github stars",
  "model context protocol server awesome list",
  "CLAUDE.md template best practices github",
];

const REDDIT_QUERIES = [
  { sub: "ClaudeAI", q: "MCP server recommended", sort: "top", t: "year" },
  {
    sub: "ClaudeAI",
    q: "claude code best tools agents",
    sort: "top",
    t: "year",
  },
  { sub: "LocalLLaMA", q: "MCP server claude", sort: "relevance", t: "year" },
];

async function crawlWeb() {
  const tools = [];

  if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID) {
    tools.push(...(await crawlGoogle()));
  } else {
    console.log(
      "[web] Google Search disabled — set GOOGLE_API_KEY + GOOGLE_CSE_ID to enable (100 free queries/day)",
    );
  }

  tools.push(...(await crawlReddit()));

  return tools;
}

async function crawlGoogle() {
  const seen = new Map();

  for (const query of SEARCH_QUERIES) {
    try {
      const { data } = await axios.get(GOOGLE_BASE, {
        params: {
          key: process.env.GOOGLE_API_KEY,
          cx: process.env.GOOGLE_CSE_ID,
          q: query,
          num: 10,
        },
        timeout: 8000,
      });

      for (const item of data.items || []) {
        const tool = normalizeGoogleResult(item);
        if (tool && !seen.has(tool.id)) seen.set(tool.id, tool);
      }
      console.log(
        `[web/google] "${query}": ${data.items?.length || 0} results`,
      );
    } catch (err) {
      if (err.response?.status === 429) {
        console.warn(
          "[web/google] Daily quota exceeded (100 queries/day free tier)",
        );
        break;
      }
      console.warn(`[web/google] Query failed: ${err.message}`);
    }
  }

  return [...seen.values()];
}

function normalizeGoogleResult(item) {
  const url = item.link || "";

  // Only surface GitHub repos — filter out docs, blogs, etc.
  const ghMatch = url.match(/github\.com\/([^/]+)\/([^/?\s#]+)/);
  if (!ghMatch) return null;

  const [, org, repo] = ghMatch;
  // Skip GitHub meta-pages
  if (["topics", "search", "explore", "orgs", "marketplace"].includes(repo))
    return null;

  return {
    id: `github:${org}/${repo}`,
    name: repo,
    displayName: toDisplayName(repo),
    description: item.snippet || "",
    category: guessCategoryFromUrl(url, item.title, item.snippet),
    jobCategory: "automate-workflow",
    source: "web",
    url: `https://github.com/${org}/${repo}`,
    rawUrl: null,
    author: org,
    authorUrl: `https://github.com/${org}`,
    stars: 0,
    forks: 0,
    weeklyDownloads: 0,
    updatedAt: new Date().toISOString(),
    hasReadme: false,
    readme: item.snippet || "",
    topics: [],
    language: "",
    license: "",
    installConfig: {
      type: "github-repo",
      repoFullName: `${org}/${repo}`,
      cloneUrl: `https://github.com/${org}/${repo}.git`,
    },
    isOfficial: ["anthropics", "modelcontextprotocol", "anthropic-ai"].includes(
      org.toLowerCase(),
    ),
    contentWarnings: [],
    score: 0,
    installed: false,
    communityMentions: 1,
  };
}

async function crawlReddit() {
  const seen = new Map();

  for (const { sub, q, sort, t } of REDDIT_QUERIES) {
    try {
      const { data } = await axios.get(`${REDDIT_BASE}/r/${sub}/search.json`, {
        params: { q, sort, t, limit: 25, restrict_sr: sub !== "all" },
        headers: { "User-Agent": "claude-crawler/1.0" },
        timeout: 8000,
      });

      const posts = data?.data?.children || [];
      for (const { data: post } of posts) {
        extractGithubLinksFromPost(post).forEach((link) => {
          const existing = seen.get(link.id);
          if (existing) {
            existing.communityMentions = (existing.communityMentions || 0) + 1;
            existing.communityScore = Math.max(
              existing.communityScore || 0,
              post.score,
            );
          } else {
            seen.set(link.id, {
              ...link,
              communityMentions: 1,
              communityScore: post.score,
              communityContext: [
                {
                  title: post.title,
                  url: `https://reddit.com${post.permalink}`,
                  score: post.score,
                  subreddit: post.subreddit,
                },
              ],
            });
          }
        });
      }
      console.log(`[web/reddit] r/${sub} "${q}": ${posts.length} posts`);
    } catch (err) {
      console.warn(`[web/reddit] r/${sub} failed: ${err.message}`);
    }
  }

  return [...seen.values()];
}

function extractGithubLinksFromPost(post) {
  const text = `${post.selftext || ""} ${post.url || ""}`;
  const ghPattern = /github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)/g;
  const tools = [];
  let match;

  while ((match = ghPattern.exec(text)) !== null) {
    const [, org, repo] = match;
    if (["topics", "search", "explore", "orgs", "marketplace"].includes(repo))
      continue;
    tools.push({
      id: `github:${org}/${repo}`,
      name: repo,
      displayName: toDisplayName(repo),
      description: post.title,
      category: guessCategoryFromUrl("", post.title, post.selftext),
      jobCategory: "automate-workflow",
      source: "web",
      url: `https://github.com/${org}/${repo}`,
      rawUrl: null,
      author: org,
      authorUrl: `https://github.com/${org}`,
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
        type: "github-repo",
        repoFullName: `${org}/${repo}`,
        cloneUrl: `https://github.com/${org}/${repo}.git`,
      },
      isOfficial: false,
      contentWarnings: [],
      score: 0,
      installed: false,
    });
  }

  return tools;
}

function guessCategoryFromUrl(url, title = "", desc = "") {
  const text = `${url} ${title} ${desc}`.toLowerCase();
  if (/mcp.server|model.context.protocol/.test(text)) return "mcp-servers";
  if (/agent|subagent/.test(text)) return "agents";
  if (/skill|slash.command/.test(text)) return "skills";
  if (/claude\.md|template/.test(text)) return "templates";
  if (/hook/.test(text)) return "hooks";
  return "tools";
}

function toDisplayName(slug) {
  return slug
    .replace(/^(mcp-server-|server-)/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

module.exports = { crawlWeb };
