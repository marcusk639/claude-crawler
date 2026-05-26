# Claude Crawler — Roadmap

_Generated: 2026-05-24 | Based on competitive research, code review, and Hermes AI strategy_

---

## Current State

The core product is fully functional:

- 5 crawlers (GitHub, npm, Anthropic org, ECC, Google/web)
- Heuristic scoring with content security scanner
- Install preview + one-click install to `~/.claude/`
- Install detection, config health panel
- Web dashboard with filters and install modal
- Security hardening: CORS localhost-only, loopback bind, path traversal protection, payload limits, refresh cooldown, npm package name validation
- SEO: server-side pre-rendered HTML for every tool, category, and job; sitemap.xml + robots.txt

---

## Shipped

### SEO-1: Technical foundation (2026-05-26)

Pre-renders the full catalog as static HTML so search engines can index every tool. Generator runs fire-and-forget after each crawl; Express serves `data/static/` ahead of `public/` so `/tools/{category}/{slug}` resolves to a real HTML file (656 tool pages, 2682-line sitemap on first live run).

- Spec: `docs/superpowers/specs/2026-05-26-seo-1-technical-foundation-design.md`
- Plan: `docs/superpowers/plans/2026-05-26-seo-1-technical-foundation.md`

SEO-2 (content depth: guides, comparison pages, search-intent landing copy) and SEO-3 (analytics + Search Console setup, indexing monitoring) remain open.

---

## P0 — Ship Now (Security & Correctness)

### Rate limit install endpoints

Writes to `~/.claude/` without any throttle. 10 installs/min cap needed.

- **Growth:** Usability L | Acquisition L | Revenue L — but writes to filesystem without throttle
- [ ] `npm install express-rate-limit`
- [ ] 10 req/min on `POST /api/install/execute`
- [ ] 30 req/min on `POST /api/install/preview`

**Acceptance criteria:**

- [ ] 11th install request within 60s returns `429 Too Many Requests`
- [ ] Preview endpoint not blocked under normal usage

### Auth token for `/api/catalog/refresh`

Unauthenticated endpoint burns GitHub API quota (60 req/hr unauth).

- **Growth:** Usability L | Acquisition L | Revenue L — but protects rate limits
- [ ] Add `REFRESH_SECRET` env var check (`Authorization: Bearer`)
- [ ] Skip check if env var not set (dev mode)
- [ ] Add to `env.example` and startup log: `Refresh endpoint: ${secret ? 'protected' : 'open (set REFRESH_SECRET)'}`

**Acceptance criteria:**

- [ ] With secret set, unauthed POST returns 401
- [ ] Without secret set, endpoint works (dev-friendly default)

---

## P1 — Next Sprint (Key Differentiators)

### LLM-powered README scoring

Replaces fragile name-regex with actual README comprehension. A package named `nexus-mcp-adapter` scores identically to a well-documented server under current heuristics if they have the same stars — LLM scoring fixes this.

- **Growth:** Usability H | Acquisition M | Revenue M
- **Model:** Hermes 4 70B via OpenRouter (`nousresearch/hermes-4-405b`) — $0.13/M input tokens. **Hermes 3 405B Instruct is free tier** (no credit card) — start there.
- **Cost:** ~$0.13/full 500-tool catalog refresh at paid tier. Effectively free.
- **Effort:** 1–2 days
- **Depends on:** nothing (falls back gracefully if `LLM_API_KEY` not set)

**What to build:**

- [ ] `npm install openai`
- [ ] Create `src/scoring/llm-scorer.js` — calls Hermes with a structured 5-dimension schema:
  - `documentationQuality` (0–20): README completeness, examples, setup instructions
  - `installabilityScore` (0–20): clear install steps, working config examples
  - `maintenanceSignals` (0–20): recent commits, open issues addressed, changelogs
  - `securityRisk` (0–20): suspicious patterns, excessive permissions, unknown origins
  - `relevanceToClaudeCode` (0–20): genuinely useful to Claude Code users
  - `reasoning` (string): brief explanation of scores
  - `flags` (string[]): specific concerns to surface in UI
- [ ] Add `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` to `env.example`
- [ ] 7-day content-addressed cache: key = `llm-score:${tool.id}:${hash(tool.readme)}` — READMEs don't change daily
- [ ] Modify `src/scoring/index.js` to call `scoreWithLLM()` for tools with README > 200 chars; merge into final score
- [ ] Graceful fallback: if `LLM_API_KEY` not set, skip without error
- [ ] Expose `llmScore` sub-scores in tool modal (expandable breakdown panel)

**Acceptance criteria:**

- [ ] Tool with rich README + active maintenance scores higher than bare-repo tool with same star count
- [ ] Without `LLM_API_KEY`: catalog loads identically to current behavior
- [ ] LLM call errors (rate limit, timeout) don't crash the catalog endpoint — caught and logged

**See:** `docs/hermes-ai-strategy.md` → Phase 1 for full code implementation

### Natural language search

"Find me a tool for database migrations" — no competitor has this. Every existing directory (Glama, PulseMCP, Claude Marketplaces) requires keyword-exact search.

- **Growth:** Usability H | Acquisition H | Revenue M
- **Cost:** ~$0.0013/query (100 tool summaries × 100 tokens × $0.13/M)
- **Effort:** 2–3 days
- **Depends on:** LLM scoring (shares `openai` package + env vars)

**What to build:**

- [ ] Create `src/search/llm-search.js` — takes query + catalog slice, returns ranked tool IDs with per-result reasoning
- [ ] `POST /api/search/natural` in `src/server.js` — validate query: string, 3–500 chars
- [ ] Search input in dashboard header with 400ms debounce + spinner
- [ ] Results render with reasoning excerpt below each card
- [ ] Mutually exclusive with sidebar filters (NL search overrides filter state)
- [ ] Clear button returns to filtered browse mode

**Acceptance criteria:**

- [ ] "database migration tool" returns MCP servers with postgres/sqlite topics ranked above unrelated tools
- [ ] Response time < 3s for 100-tool catalog slice
- [ ] Empty results shows "No tools matched — try different keywords" not a blank screen

### Unit tests

Zero test coverage on the highest-risk modules. Required before LLM scoring adds complexity.

- **Growth:** Usability M | Acquisition L | Revenue L
- **Effort:** < 1 day
- **Depends on:** nothing — do first, enables confident P1 refactoring

**What to build:**

- [ ] `src/scoring/scanner.test.js` — test each pattern category with known-bad and known-safe inputs (prompt injection phrase → critical warning; clean text → no warnings; `eval(Buffer.from(...))` → obfuscation flag)
- [ ] `src/scoring/index.test.js` — score normalization, recency decay, penalty application
- [ ] `src/cache/index.test.js` — TTL expiry, `size()` only counts live entries
- [ ] Add `"test": "node --test src/**/*.test.js"` to `package.json`

**Acceptance criteria:**

- [ ] `npm test` passes with zero failures
- [ ] Scanner catches all 4 pattern categories (injection, exfiltration, obfuscation, hook abuse)

---

## P2 — Next 60 Days (Competitive Parity + Stickiness)

### "Similar tools" recommendations panel

Shown in tool modal — 5 semantically similar tools, not just same-category. Same-problem matching beats same-taxonomy matching.

- **Growth:** Usability H | Acquisition M | Revenue L
- **Effort:** S (1 day — reuses LLM infrastructure from P1)
- Give Hermes the target tool + compact summaries of catalog; ask for 5 matches with similarity reasoning
- **See:** `docs/hermes-ai-strategy.md` → Phase 2 for implementation pattern

### Local-only inference (privacy mode)

Claude-crawler reads `~/.claude/` — potentially including API keys and personal project context. Sending this to a cloud LLM is a legitimate concern for enterprise users and security-conscious developers.

- **Growth:** Usability M | Acquisition M | Revenue H (enterprise gate)
- **Effort:** S (env var only — no code changes needed)
- All inference already routes through the OpenAI-compatible client; pointing it at Ollama is a config change:

```
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=hf.co/NousResearch/Hermes-4.3-36B-GGUF:Q4_K_M
```

- [ ] Document Ollama setup in README (pull command, `OLLAMA_NUM_CTX=32768` env var — default 4K context is too small)
- [ ] Add `# Local inference (Ollama)` block to `env.example`
- [ ] Surface "Local mode" indicator in dashboard status bar when `LLM_BASE_URL` points to localhost
- **Hardware:** Hermes 4.3 36B at Q4_K_M quantization requires ~25GB RAM (fits Mac Studio M2 Ultra)

### Reddit score age weighting

Old Reddit posts from pre-MCP-maturity era unfairly penalize or boost tools. Add `ageDecayFactor` to `communityScore` in `src/scoring/index.js`.

- **Growth:** Usability M | Acquisition L | Revenue L
- **Effort:** S (< half day)

### Version tracking + "updated" badge

Store `updatedAt` from previous crawl; surface a "recently updated" badge on cards. Enables "what's new" filtering.

- **Growth:** Usability M | Acquisition L | Revenue L
- **Effort:** M — requires persistent store (SQLite or JSON file in `data/`)

### Multi-platform support: Cursor rules

Add a `cursor` category; crawl `cursor.directory` and `awesome-cursorrules`. Repositions product as "AI coding tools" not just "Claude Code tools" — 2–3x addressable market.

- **Growth:** Usability M | Acquisition H | Revenue H
- **Effort:** L (new crawler + category badges in UI)

### Bulk install (checkbox select)

"Install selected (3)" action for power users who want to set up a full config in one pass.

- **Growth:** Usability M | Acquisition L | Revenue L
- **Effort:** M (UI state + sequential install loop)

---

## P3 — Backlog / Strategic

| Feature                                  | Growth             | Notes                                                                                                                                                                   |
| ---------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hermes Agent crawl orchestration         | Usability M, Rev M | Self-improving crawler: agent remembers which queries return quality results, writes skills, no code changes needed. Strategic moat — competitors have static crawlers. |
| CLI: `npx claude-crawler install <tool>` | Acq H              | Biggest acquisition lever; embeds in daily dev workflow                                                                                                                 |
| Hosted/cloud version                     | Acq H, Rev H       | Removes local-only constraint; broader adoption                                                                                                                         |
| Enterprise governance console            | Rev H              | Approve/block tools per org; $50K–500K/yr TAM; needs multi-user model first                                                                                             |
| Creator submission + publish flow        | Rev H              | Enables marketplace model; needs trust/review workflow                                                                                                                  |
| Monetization layer                       | Rev H              | 15–20% commission (Agensi model); requires creator flow first                                                                                                           |

---

## LLM Inference Cost Reference

For a typical workload: 500 tools scored on catalog refresh, 4 refreshes/day.

| Option                          | Per Refresh | Per Month | Notes                              |
| ------------------------------- | ----------- | --------- | ---------------------------------- |
| Hermes 3 405B (OpenRouter free) | $0.00       | $0.00     | Start here — no credit card        |
| Hermes 4 70B (OpenRouter)       | ~$0.13      | ~$18      | Best cost/quality                  |
| Hermes 4 405B (OpenRouter)      | ~$1.20      | ~$144     | Near-frontier quality              |
| Claude Sonnet 4.6               | ~$3.50      | ~$420     | 23x more expensive than Hermes 70B |
| GPT-4o                          | ~$5.50      | ~$660     | Most expensive                     |
| Hermes 4.3 36B (local Ollama)   | $0.00       | $0.00     | Requires ~25GB RAM; fully private  |

**Default recommendation:** Hermes 4 70B via OpenRouter. Expose `LLM_MODEL` as env var so users can override for local Ollama or higher quality.

---

## Launch Sequencing

```
Local tool (now)
  → P0 hardening            → safe to share with teammates
    → P1 unit tests         → confident foundation for LLM work
      → P1 LLM scoring      → better results than Glama/PulseMCP
        → P1 NL search      → HN launch candidate ("Show HN: AI tool that finds Claude tools")
          → P2 local mode   → enterprise/privacy story unlocked
            → P2 Cursor     → 2-3x addressable market
              → P3 CLI      → embedding in daily dev workflow
                → P3 hosted → removes local-only constraint
                  → P3 enterprise → revenue
```

**The HN launch gate:** LLM scoring + natural language search together. Without them, this is a better-looking Glama. With them, it's the only tool in the ecosystem that can answer "find me something for database migrations" and surface the right result.

**The enterprise gate:** Local-only inference (P2). Once data can stay on-machine, the pitch to security-conscious teams becomes viable. That gate must open before the enterprise governance console (P3) makes sense to build.

---

## Quick Start: Enable LLM Features

```bash
# 1. Install the OpenAI-compatible client
npm install openai

# 2. Get a free API key at openrouter.ai
# Hermes 3 405B Instruct is on the free tier — no credit card required

# 3. Add to .env
echo "LLM_API_KEY=sk-or-..." >> .env
echo "LLM_BASE_URL=https://openrouter.ai/api/v1" >> .env
echo "LLM_MODEL=nousresearch/hermes-3-llama-3.1-405b-instruct:free" >> .env

# 4. Restart
npm start
```

Without `LLM_API_KEY`, the app falls back to heuristic scoring — no breaking change.

---

## Competitive Context

| Competitor          | Servers/Skills | Install?     | Security Scan? | NL Search?     |
| ------------------- | -------------- | ------------ | -------------- | -------------- |
| Glama               | 23,968 MCP     | GitHub link  | No             | No             |
| PulseMCP            | 15,870 MCP     | GitHub link  | No             | No             |
| Smithery            | ?              | CLI          | No             | No             |
| Claude Marketplaces | 6,700 skills   | Copy-paste   | No             | No             |
| Agensi              | 200 skills     | curl \| bash | Yes (8-point)  | No             |
| **claude-crawler**  | All types      | One-click    | **Yes**        | **Planned P1** |

Key uncontested ground: unified cross-type discovery (agents + skills + MCP servers + hooks) + local install awareness + download-time security scan + natural language search + local-only inference option.

---

## References

- `docs/hermes-ai-strategy.md` — Full Hermes integration guide: code, cost analysis, model specs, risk mitigations
- Competitive research session (2026-05-24) — 77 sources across MCP/skills/AI tool directories
- Code review findings (2026-05-24) — security hardening already applied
