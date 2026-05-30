# Spike Manifest

## Idea

Claude-crawler currently retrieves tools by treating each GitHub repository as one tool entry, using 8 generic search queries. The ecosystem has evolved to massive "collection" repos (one repo = hundreds/thousands of individual `.md` tool files) and curated awesome-lists that link to external tools. A new corpus-building strategy is needed to go from ~200 tools to 1000+ high-quality, individually-addressable tools.

## Requirements

- Must treat individual `.md` files within collection repos as separate tool entries (not the repo itself)
- Must parse awesome-list-style READMEs to extract individual tool links + descriptions
- Must deduplicate across sources (same tool found via collection + direct repo link)
- Must not break existing crawl pipeline — new crawlers compose with existing ones

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 001 | collection-repo-expander | standard | Given a collection repo (VoltAgent, antigravity), when we enumerate `.md` files via GitHub tree API, then each file = individually indexable tool | VALIDATED ✓ | github, agents, skills, corpus |
| 002 | awesome-list-parser | standard | Given a curated README with link lists, when parsed, then structured tool entries pointing to external repos | PARTIAL ⚠ | github, awesome-list, corpus |
| 003a+b | github-file-search | comparison | Given GitHub Code Search, when querying path:.claude/* patterns, then undiscovered repos surface | PARTIAL ⚠ | github, code-search, skills, agents |
| 004 | anthropics-official-tree | standard | Given anthropics/skills repo, when tree-walked, then all 17 official Anthropic skills surface as first-class entries | VALIDATED ✓ | github, official, skills |
