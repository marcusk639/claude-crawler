# Awesome List Discovery

## Requirements

- Must parse awesome-list-style READMEs to extract individual tool links + descriptions
- Must deduplicate across sources

## How to Build It

Create `src/crawlers/awesome.js`. Fetches README from curated awesome-list repos, parses GitHub links, then enriches each via the GitHub API.

**Awesome list repos (validated):**
```js
const AWESOME_LISTS = [
  { repo: "rohitg00/awesome-claude-code-toolkit", branch: "main" },
  { repo: "travisvn/awesome-claude-skills",       branch: "main" },
  // hesreallyhim/awesome-claude-code — skip until out of reconstruction
];
```

**Link extraction (do NOT use a token for raw.githubusercontent.com fetches):**
```js
function parseAwesomeLinks(content) {
  const results = [];
  for (const line of content.split("\n")) {
    const pat = /\[([^\]]+)\]\((https:\/\/github\.com\/[^/\s)]+\/[^/\s)]+)\)/g;
    let m;
    while ((m = pat.exec(line)) !== null) {
      const [, name, url] = m;
      if (url.includes("/actions/") || url.includes("/blob/") ||
          url.includes("/tree/")    || url.includes("/issues/") ||
          url.includes("/pull/")    || name.toLowerCase().includes("badge") ||
          name.length < 2) continue;
      const repoPath = url.replace("https://github.com/", "");
      if (repoPath.split("/").length === 2)
        results.push({ name, url, repoPath });
    }
  }
  // Deduplicate by repoPath
  const seen = new Map();
  for (const r of results) if (!seen.has(r.repoPath)) seen.set(r.repoPath, r);
  return [...seen.values()];
}
```

**Description extraction from markdown tables is unreliable** — skip it and rely on GitHub API enrichment:
```js
async function enrichFromGitHub(repoPath) {
  const { data } = await axios.get(`https://api.github.com/repos/${repoPath}`, { headers: HEADERS });
  return { description: data.description, stars: data.stargazers_count, topics: data.topics };
}
```

**Wire into crawlers/index.js** alongside existing crawlers.

## What to Avoid

- **Do not attempt to parse table-cell descriptions from markdown** — the regex is brittle and most entries lack inline descriptions anyway. GitHub API description is more reliable.
- **Do not pass GITHUB_TOKEN to raw.githubusercontent.com fetches** — it's unnecessary and broken token strings cause silent failures.
- **Do not include hesreallyhim/awesome-claude-code yet** — its README is under reconstruction (just placeholder text as of 2026-05-30). Watch the repo for updates.
- **Do not follow link redirects blindly** — use `maxRedirects: 0` per the existing SSRF guard in installer/index.js.

## Constraints

- rohitg00 toolkit yields 333 unique repos; travisvn yields 16
- ~4 duplicates across the two lists — deduplication by repoPath handles this
- These repos need full GitHub API enrichment (stars, description, topics) — counts against rate limit

## Origin

Synthesized from spike: 002
Source files: `sources/002-awesome-list-parser/`
