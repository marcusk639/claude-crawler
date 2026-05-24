"use strict";

const axios = require("axios");

const NPM_SEARCH = "https://registry.npmjs.org/-/v1/search";
const NPM_PKG = "https://registry.npmjs.org";

const QUERIES = [
  { text: "scope:modelcontextprotocol", size: 50 },
  { text: "mcp-server keywords:mcp", size: 50 },
  { text: "keywords:mcp-server", size: 50 },
  { text: "keywords:claude-code", size: 30 },
  { text: "keywords:claude-agent", size: 30 },
  { text: "keywords:model-context-protocol", size: 30 },
];

async function crawlNpm() {
  const seen = new Map();

  for (const { text, size } of QUERIES) {
    try {
      const pkgs = await searchNpm(text, size);
      pkgs.forEach((p) => seen.set(p.name, p));
      console.log(`[npm] "${text}": ${pkgs.length} packages`);
    } catch (err) {
      console.warn(`[npm] Query "${text}" failed: ${err.message}`);
    }
  }

  return [...seen.values()].map(normalizePackage);
}

async function searchNpm(text, size) {
  const { data } = await axios.get(NPM_SEARCH, {
    params: { text, size },
    timeout: 10000,
  });
  return (data.objects || []).map((o) => o.package);
}

function normalizePackage(pkg) {
  const isOfficial =
    pkg.name.startsWith("@modelcontextprotocol/") ||
    pkg.name.startsWith("@anthropic-ai/");
  const category = detectNpmCategory(pkg);

  return {
    id: `npm:${pkg.name}`,
    name: pkg.name,
    displayName: toDisplayName(pkg.name),
    description: pkg.description || "",
    category,
    jobCategory: detectNpmJobCategory(pkg),
    source: "npm",
    url: `https://www.npmjs.com/package/${pkg.name}`,
    rawUrl: null,
    author: pkg.publisher?.username || (pkg.maintainers?.[0]?.username ?? ""),
    authorUrl: pkg.publisher?.username
      ? `https://www.npmjs.com/~${pkg.publisher.username}`
      : "",
    stars: 0,
    forks: 0,
    weeklyDownloads: pkg.downloads?.weekly || 0,
    updatedAt: pkg.date || new Date().toISOString(),
    hasReadme: true,
    readme: "",
    topics: pkg.keywords || [],
    language: "JavaScript",
    license: pkg.license || "",
    installConfig: {
      type: "npm-package",
      npmPackage: pkg.name,
      npmInstallCmd: `npm install -g ${pkg.name}`,
    },
    isOfficial,
    contentWarnings: [],
    score: 0,
    installed: false,
    links: pkg.links || {},
  };
}

function detectNpmCategory(pkg) {
  const name = pkg.name.toLowerCase();
  const keywords = pkg.keywords || [];

  if (
    name.includes("mcp") ||
    keywords.includes("mcp-server") ||
    keywords.includes("model-context-protocol")
  ) {
    return "mcp-servers";
  }
  if (keywords.includes("claude-agent") || name.includes("agent"))
    return "agents";
  if (keywords.includes("claude-skill") || name.includes("skill"))
    return "skills";
  return "tools";
}

function detectNpmJobCategory(pkg) {
  const text =
    `${pkg.name} ${pkg.description || ""} ${(pkg.keywords || []).join(" ")}`.toLowerCase();

  if (/test|lint|quality|format/.test(text)) return "code-quality";
  if (/python|typescript|golang|rust|java/.test(text))
    return "language-support";
  if (/database|postgres|redis|sqlite|mysql/.test(text))
    return "external-services";
  if (/slack|github|jira|stripe|google|aws|filesystem|fetch|browser/.test(text))
    return "external-services";
  if (/prompt|rag|embed|vector|reasoning/.test(text)) return "ai-enhancement";
  return "automate-workflow";
}

function toDisplayName(name) {
  return name
    .replace(/^@[^/]+\//, "") // remove scope
    .replace(/^(mcp-server-|server-)/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

module.exports = { crawlNpm };
