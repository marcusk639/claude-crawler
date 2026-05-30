---
spike: "001"
name: collection-repo-expander
type: standard
validates: "Given a collection repo (VoltAgent, antigravity, ECC), when we enumerate .md files via GitHub tree API, then each file becomes an individually indexable tool"
verdict: VALIDATED
related: ["004-anthropics-official-tree"]
tags: [github, agents, skills, corpus, collection]
---

# Spike 001: Collection Repo Expander

## What This Validates

Given large "collection" repos where each .md file is a deployable tool, when we walk the GitHub tree API recursively and filter for tool-definition files, then each file becomes an individually indexable catalog entry with high-quality metadata.

## How to Run

```bash
node .planning/spikes/001-collection-repo-expander/expand.js
```

## Investigation Trail

Scanned 3 repos with matching patterns. VoltAgent: 154 agents, all with frontmatter name+description+tools. Antigravity: 4,604 SKILL.md files found (CATALOG.md claims 1,480 canonical skills — nested sub-skills explain the discrepancy). ECC: 249 SKILL.md files, all with rich descriptions.

## Results

**Verdict: VALIDATED**

| Repo | Files Found | Sample Quality |
|------|-------------|----------------|
| VoltAgent/awesome-claude-code-subagents | 154 agents | 5/5 descriptions present |
| sickn33/antigravity-awesome-skills | 4,604 SKILL.md | 5/5 descriptions present |
| affaan-m/ECC | 249 SKILL.md | 5/5 descriptions present |

Total: 5,007 individual tools from 3 repos alone (~21x current corpus).

Key finding: SKILL_PATTERN (SKILL.md in named directory) and AGENT_PATTERN (flat .md with frontmatter) both work. These patterns should drive a new `collection.js` crawler.
