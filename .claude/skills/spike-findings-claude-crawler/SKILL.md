---
name: spike-findings-claude-crawler
description: Implementation blueprint from spike experiments for building a 10x+ corpus of Claude Code tooling. Proven patterns for collection-repo crawling, awesome-list discovery, and file-search. Auto-load during any work on src/crawlers/.
---

<context>
## Project: claude-crawler

Claude-crawler currently treats each GitHub repo as one tool entry (~240 tools). The ecosystem has evolved to massive collection repos (one repo = hundreds of individual .md tool files) and curated awesome-lists. Spiking validated that 3 collection repos alone yield 5,007 individual tools — a 21× corpus multiplier. The implementation requires a new collection.js crawler and enhancements to github.js and a new awesome.js.

Spike session wrapped: 2026-05-30
</context>

<requirements>
## Requirements

- Must treat individual `.md` files within collection repos as separate tool entries (not the repo itself)
- Must parse awesome-list-style READMEs to extract individual tool links + descriptions
- Must deduplicate across sources (same tool found via collection + direct repo link)
- Must not break existing crawl pipeline — new crawlers compose with existing ones
</requirements>

<findings_index>
## Feature Areas

| Area | Reference | Key Finding |
|------|-----------|-------------|
| Collection repo crawling | references/collection-repo-crawling.md | Tree API + SKILL_PATTERN/AGENT_PATTERN yields ~1,900 tools from 4 repos. Antigravity depth-2 filter critical. |
| Awesome list discovery | references/awesome-list-discovery.md | rohitg00 yields 333 repos. Table desc extraction unreliable — use GitHub API. Skip hesreallyhim (in reconstruction). |
| File search discovery | references/file-search-discovery.md | `path:.claude/skills` and `path:.claude/agents` are high-signal. Stars missing from code search — must enrich. |

## Source Files

Original spike scripts preserved in `sources/` for complete reference.
</findings_index>

<metadata>
## Processed Spikes

- 001-collection-repo-expander (VALIDATED)
- 002-awesome-list-parser (PARTIAL)
- 003ab-github-file-search (PARTIAL)
- 004-anthropics-official-tree (VALIDATED)
</metadata>
