# Collection Repo Crawling

## Requirements

- Must treat individual `.md` files within collection repos as separate tool entries (not the repo itself)
- Must deduplicate across sources (same tool found via collection + direct repo link)
- Must not break existing crawl pipeline — new crawlers compose with existing ones

## How to Build It

Create `src/crawlers/collection.js`. Uses GitHub tree API to walk known collection repos.

**Repo list (hardcode these — all validated):**
```js
const COLLECTION_REPOS = [
  { repo: "VoltAgent/awesome-claude-code-subagents", pattern: "agent_voltagent",   isOfficial: false },
  { repo: "sickn33/antigravity-awesome-skills",      pattern: "skill_antigravity", isOfficial: false },
  { repo: "affaan-m/ECC",                            pattern: "skill_ecc",         isOfficial: false },
  { repo: "anthropics/skills",                       pattern: "skill_anthropics",  isOfficial: true  },
];
```

**SKILL_PATTERN** (antigravity, ECC, anthropics/skills): `skills/{name}/SKILL.md`
```js
toolFiles = tree.filter(f =>
  f.type === "blob" &&
  /^(?:plugins\/[^/]+\/)?skills\/([^/]+)\/SKILL\.md$/.test(f.path)
);
const name = parts[parts.indexOf("skills") + 1]; // parent dir name
```

**AGENT_PATTERN** (VoltAgent): `categories/{cat}/{name}.md`
```js
toolFiles = tree.filter(f =>
  f.type === "blob" &&
  /^categories\/[^/]+\/[^/]+\.md$/.test(f.path) &&
  !f.path.endsWith("README.md")
);
const name = file.path.split("/").pop().replace(/\.md$/, "");
```

**Frontmatter parser:**
```js
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const meta = {};
  for (const line of match[1].split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    meta[key] = val;
  }
  return meta;
}
```

Wire into `src/crawlers/index.js` alongside existing crawlers in Promise.allSettled.

## What to Avoid

- **Do not use `endsWith('/SKILL.md')` alone** — antigravity has 4,604 SKILL.md files including nested sub-skills. Use the depth-2 regex above.
- **Do not extract GITHUB_TOKEN via grep/cut in shell** — quoting issues yield empty tokens. Use dotenv.
- **Do not fetch all file contents upfront** — fetch only the files you need to normalize; tree API paths are free.

## Constraints

- GitHub tree API handles repos up to ~100k files (antigravity: 8,453 nodes — fine)
- Unauthenticated: 60 req/hr; with GITHUB_TOKEN: 5,000/hr
- raw.githubusercontent.com works without auth for public repos

## Corpus Impact

| Collection Repo | Pattern | Tools |
|----------------|---------|-------|
| VoltAgent/awesome-claude-code-subagents | AGENT_PATTERN | 154 agents |
| sickn33/antigravity-awesome-skills | SKILL_PATTERN | ~1,480 canonical skills |
| affaan-m/ECC | SKILL_PATTERN | 249 skills |
| anthropics/skills | SKILL_PATTERN | 17 (isOfficial=true) |
| **Total** | | **~1,900 individual tools** |

Previous approach: ~240 repos treated as 240 tools. This approach: ~1,900 individually-addressable tools from 4 repos alone.

## Origin

Synthesized from spikes: 001, 004
Source files: `sources/001-collection-repo-expander/`, `sources/004-anthropics-official-tree/`
