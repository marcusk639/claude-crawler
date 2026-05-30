# Spike Conventions

## Stack

- **Runtime:** Node.js (CommonJS, no build step) — matches the project
- **HTTP:** Node built-in `https` module only (no axios) — keeps spikes dependency-free
- **Auth:** `process.env.GITHUB_TOKEN` optional; all spikes work without it for public repos
- **Output:** `results.json` in the spike directory for persistence; stdout for human review

## Structure

Each spike has:
- `spike-script.js` — the runnable experiment
- `README.md` — frontmatter + investigation trail + verdict
- `results.json` — output (gitignored or not, as needed)

## Patterns

### GitHub Tree API pattern (collection repos)
```js
GET /repos/{owner}/{repo}/git/trees/main?recursive=1
// then filter tree[] by path pattern
```

### File patterns for Claude Code tools
- SKILL_PATTERN: `skills/{name}/SKILL.md` (directory-per-skill)
- AGENT_PATTERN: `categories/{cat}/{name}.md` (flat .md per agent)

### Frontmatter parsing
```js
function parseFrontmatter(content) { ... } // in each spike
// Keys: name, description, tools, model, risk, source
```

## Token Handling

- Never extract GITHUB_TOKEN via `grep .env | cut` — shell quoting issues yield empty tokens
- Pass via env: `GITHUB_TOKEN=xxx node script.js`
- Raw GitHub content (raw.githubusercontent.com) works without auth for public repos
- GitHub API (api.github.com) has stricter rate limits without auth (60 req/hr vs 5000/hr)
