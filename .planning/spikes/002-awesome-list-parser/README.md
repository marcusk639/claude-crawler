---
spike: "002"
name: awesome-list-parser
type: standard
validates: "Given a curated README with link tables, when parsed for GitHub links, then structured tool entries pointing to external repos are extractable"
verdict: PARTIAL
related: ["001-collection-repo-expander"]
tags: [github, awesome-list, corpus, parser]
---

# Spike 002: Awesome List Parser

## What This Validates

Given curated awesome-list README files that contain markdown link tables, when we regex-parse GitHub links and optionally enrich via the repo API, then we get additional tool entries pointing to repos not in the main collection crawl.

## How to Run

```bash
node .planning/spikes/002-awesome-list-parser/parse.js
```

## Investigation Trail

Initial run: 0 results due to env var token issue (GITHUB_TOKEN with quotes). Fixed by running without token (raw.githubusercontent.com doesn't need auth). After fix: rohitg00 yielded 333 repos, travisvn yielded 16, hesreallyhim yielded 0.

hesreallyhim's README is currently mid-reconstruction ("I. TODO / hm.") — no parseable content. This is temporary.

Description extraction from table rows `| [name](url) | stars | description |` works but is inconsistent. The GitHub API provides description anyway during enrichment.

## Results

**Verdict: PARTIAL**

| Source | Unique Repos Extracted | Notes |
|--------|------------------------|-------|
| rohitg00/awesome-claude-code-toolkit | 333 | High quality, includes 212k★ repos |
| travisvn/awesome-claude-skills | 16 | Smaller but official-leaning |
| hesreallyhim/awesome-claude-code | 0 | README in reconstruction (temporary) |

Total: 345 unique repos, 4 duplicates across lists.

Concerns:
1. Description extraction from markdown tables is inconsistent — needs cleanup
2. hesreallyhim is temporarily empty (watch for update)
3. These repos may overlap with collection crawl (both rohitg00 and VoltAgent may link to each other)

Signal: rohitg00 list includes repos with star counts the current crawler would never find (no claude-code topic, no correct keywords).
