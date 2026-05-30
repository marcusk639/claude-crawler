# Spike Wrap-Up Summary

**Date:** 2026-05-30
**Spikes processed:** 4
**Feature areas:** collection-repo-crawling, awesome-list-discovery, file-search-discovery
**Skill output:** `./.claude/skills/spike-findings-claude-crawler/`

## Processed Spikes

| # | Name | Type | Verdict | Feature Area |
|---|------|------|---------|--------------|
| 001 | collection-repo-expander | standard | VALIDATED ✓ | collection-repo-crawling |
| 002 | awesome-list-parser | standard | PARTIAL ⚠ | awesome-list-discovery |
| 003a+b | github-file-search | comparison | PARTIAL ⚠ | file-search-discovery |
| 004 | anthropics-official-tree | standard | VALIDATED ✓ | collection-repo-crawling |

## Key Findings

The fundamental problem is an architectural mismatch: the crawler indexes one-repo=one-tool, but the ecosystem now stores tools as individual .md files within collection repos. Three collection repos (VoltAgent, antigravity, ECC) plus the official anthropics/skills repo yield ~1,900 individually-addressable tools — an ~8× improvement. This requires a new `src/crawlers/collection.js` using the GitHub tree API with two patterns (SKILL_PATTERN, AGENT_PATTERN). Awesome-list parsing adds 333+ more repos. File search fills the long tail with `path:.claude/skills` and `path:.claude/agents` queries.
