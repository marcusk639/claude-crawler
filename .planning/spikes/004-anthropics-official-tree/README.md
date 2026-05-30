---
spike: "004"
name: anthropics-official-tree
type: standard
validates: "Given the anthropics/skills repo, when tree-walked, then all 17 official Anthropic skills surface as individually discoverable entries with isOfficial=true"
verdict: VALIDATED
related: ["001-collection-repo-expander"]
tags: [github, official, skills, anthropic]
---

# Spike 004: Anthropics Official Tree Walk

## What This Validates

Given the official `anthropics/skills` GitHub repo, when we apply the same SKILL_PATTERN tree walk from Spike 001, then all 17 official Anthropic-published skills surface as individually addressable catalog entries with `isOfficial: true`.

## How to Run

```bash
node .planning/spikes/004-anthropics-official-tree/official.js
```

## Investigation Trail

Straightforward application of Spike 001's SKILL_PATTERN to a single trusted repo. All 17 SKILL.md files have proper frontmatter (name, description). Current anthropic.js crawler likely indexes anthropics/skills as one repo entry rather than 17 individual skills.

## Results

**Verdict: VALIDATED**

17 official Anthropic skills found:
algorithmic-art, brand-guidelines, canvas-design, claude-api, doc-coauthoring, docx, frontend-design, internal-comms, mcp-builder, pdf, pptx, skill-creator, slack-gif-creator, theme-factory, web-artifacts-builder, webapp-testing, xlsx

All 17 have descriptions. All get isOfficial=true.

Impact: small count (17) but maximum trust signal. These should appear at the top of search results.
