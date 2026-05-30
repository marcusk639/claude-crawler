# File Search Discovery

## Requirements

- Must not break existing crawl pipeline — new queries compose with existing ones

## How to Build It

Add two supplementary queries to `src/crawlers/github.js` REPO_QUERIES, plus a new Code Search block:

```js
// In github.js — add to existing code search (separate from repo search)
const CODE_SEARCH_QUERIES = [
  { q: "path:.claude/skills filename:SKILL.md", label: "claude skills path" },
  { q: "path:.claude/agents extension:md", label: "claude agents path" },
];

async function crawlGitHubCodeSearch() {
  const seen = new Map();
  for (const { q, label } of CODE_SEARCH_QUERIES) {
    await sleep(2000); // code search has stricter rate limits
    const { data } = await axios.get(`${BASE}/search/code`, {
      headers: HEADERS,
      params: { q, per_page: 30 },
    });
    for (const item of data.items || []) {
      const repo = item.repository?.full_name;
      if (!repo || seen.has(repo)) continue;
      // Code Search doesn't include stargazers_count — must enrich
      const repoData = await axios.get(`${BASE}/repos/${repo}`, { headers: HEADERS });
      seen.set(repo, normalizeRepo(repoData.data));
      await sleep(200);
    }
  }
  return [...seen.values()];
}
```

Keep as a supplementary source — merge results into the main dedup map in `crawlers/index.js`.

## What to Avoid

- **Do not use `filename:SKILL.md` without path scope** — returns 319,936 results, most not Claude tools (LinkedIn skills, RPG systems, etc.)
- **Do not use `stargazers_count` from Code Search results** — it's always undefined. Must call `GET /repos/{owner}/{repo}` separately.
- **Do not run code search in every crawl cycle** — it consumes rate limit quickly. Gate behind a longer TTL or run only when catalog is stale.

## Constraints

- Code Search API: 10 requests/minute unauthenticated, 30/minute with token
- `path:.claude/skills` = 81,216 results (sample 30, returns real tools)
- `path:.claude/agents` = 15,632 results (high signal, Claude-specific path)
- Requires follow-up repo API call per result for star count

## Origin

Synthesized from spike: 003
Source files: `sources/003ab-github-file-search/`
