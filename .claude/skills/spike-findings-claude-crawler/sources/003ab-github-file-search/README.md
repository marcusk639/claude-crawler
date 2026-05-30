---
spike: "003"
name: github-file-search
type: comparison
validates: "Given GitHub Code Search, when querying for SKILL.md and .claude/agents paths, then undiscovered repos surface beyond what topic/keyword search finds"
verdict: PARTIAL
related: ["001-collection-repo-expander"]
tags: [github, code-search, skills, agents, corpus]
---

# Spike 003a+b: GitHub File Search

## What This Validates

Given GitHub's Code Search API, when querying by filename (SKILL.md) or path pattern (.claude/agents), then repos that haven't tagged themselves with claude-code topics still surface in results.

## How to Run

```bash
GITHUB_TOKEN=your_token node .planning/spikes/003ab-github-file-search/search.js
```

## Investigation Trail

Three queries tested:
1. `filename:SKILL.md description language:Markdown` → 319,936 total results (too noisy — includes non-Claude repos)
2. `path:.claude/skills filename:SKILL.md` → 81,216 results (high signal — .claude/skills path is Claude-specific)
3. `path:.claude/agents extension:md tools` → 15,632 results (high signal)

Stars are undefined in Code Search results — the `repository.stargazers_count` field is not populated by the Code Search API. Requires a follow-up `GET /repos/{owner}/{repo}` call per result.

Generic `filename:SKILL.md` is too broad — many non-Claude repos use SKILL.md as a skill listing file (LinkedIn, RPG systems, etc.).

## Results

**Verdict: PARTIAL**

| Query | Total Count | New Repos (30 result sample) | Signal Quality |
|-------|-------------|------------------------------|----------------|
| filename:SKILL.md description | 319,936 | 30 | Low — too generic |
| path:.claude/skills filename:SKILL.md | 81,216 | 29 | High — Claude-specific path |
| path:.claude/agents extension:md | 15,632 | 29 | High — Claude-specific path |

Key issue: Stars not in Code Search response — needs repo API enrichment (adds latency).
Key value: path:.claude/* searches are Claude-specific and surface a genuinely new long tail.
Recommendation: Add these as supplementary queries to github.js crawler with rate-limited repo enrichment.
