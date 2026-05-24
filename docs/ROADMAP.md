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
- Security hardening: CORS localhost-only, loopback bind, path traversal protection, payload limits, refresh cooldown

---

## P0 — Ship Now (Security & Correctness)

### Rate limit install endpoints

Writes to `~/.claude/` without any throttle. 10 installs/min cap needed.

- [ ] `npm install express-rate-limit`
- [ ] 10 req/min on `POST /api/install/execute`
- [ ] 30 req/min on `POST /api/install/preview`

### Auth token for `/api/catalog/refresh`

Unauthenticated endpoint burns GitHub API quota (60 req/hr unauth).

- [ ] Add `REFRESH_SECRET` env var check (`Authorization: Bearer`)
- [ ] Skip check if env var not set (dev mode)
- [ ] Add to `env.example` and startup log

---

## P1 — Next Sprint (Key Differentiators)

### LLM-powered README scoring

Replaces fragile name-regex with actual README comprehension. Biggest quality gap vs. competitors.

- **Growth:** Usability H | Acquisition M | Revenue M
- **Cost:** ~$0.13/full catalog refresh (Hermes 4 70B via OpenRouter). Hermes 3 405B is free tier.
- **Effort:** 1–2 days
- [ ] `npm install openai`
- [ ] Create `src/scoring/llm-scorer.js` with structured JSON schema (see `docs/hermes-ai-strategy.md`)
- [ ] Add `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` to `env.example`
- [ ] 7-day content-addressed LLM score cache
- [ ] Modify `src/scoring/index.js` to merge `llmScore` into final score
- [ ] Graceful fallback when `LLM_API_KEY` not set
- [ ] Expose score breakdown sub-scores in tool modal

### Natural language search

"Find me a tool for database migrations" — no competitor has this.

- **Growth:** Usability H | Acquisition H | Revenue M
- **Cost:** ~$0.0013/query
- **Effort:** 2–3 days | **Depends on:** LLM scoring (shares infrastructure)
- [ ] Create `src/search/llm-search.js`
- [ ] Add `POST /api/search/natural` endpoint
- [ ] Search input in dashboard header with 400ms debounce
- [ ] Results show reasoning excerpt per card
- [ ] Mutually exclusive with sidebar filters

### Unit tests

Zero test coverage on the highest-risk modules.

- **Effort:** < 1 day
- [ ] `src/scoring/scanner.test.js` — pattern categories with known-bad/safe inputs
- [ ] `src/scoring/index.test.js` — score normalization, recency decay, penalties
- [ ] `src/cache/index.test.js` — TTL expiry, `size()` accuracy
- [ ] Add `"test": "node --test src/**/*.test.js"` to `package.json`

---

## P2 — Next 60 Days (Competitive Parity + Stickiness)

| Feature                            | Growth       | Effort | Notes                                                                         |
| ---------------------------------- | ------------ | ------ | ----------------------------------------------------------------------------- |
| "Similar tools" panel in modal     | Usability H  | S      | Reuses LLM layer; 5 semantic matches                                          |
| Reddit score age weighting         | Usability M  | S      | Old posts skew scores unfairly                                                |
| Version tracking + "updated" badge | Usability M  | M      | Requires persistent store (SQLite or JSON)                                    |
| Multi-platform: Cursor rules       | Acq H, Rev H | L      | New crawler for cursor.directory + awesome-cursorrules; 2-3x market expansion |
| Bulk install (checkbox select)     | Usability M  | M      | "Install selected (3)" action                                                 |

---

## P3 — Backlog / Strategic

| Feature                                  | Growth             | Notes                                               |
| ---------------------------------------- | ------------------ | --------------------------------------------------- |
| Hermes Agent crawl orchestration         | Usability M, Rev M | Self-improving crawler; strategic moat              |
| CLI: `npx claude-crawler install <tool>` | Acq H              | Biggest acquisition lever; embeds in daily workflow |
| Hosted/cloud version                     | Acq H, Rev H       | Removes local-only constraint                       |
| Enterprise governance console            | Rev H              | Approve/block tools per org; $50K–500K/yr TAM       |
| Creator submission + publish flow        | Rev H              | Enables marketplace model                           |
| Monetization layer                       | Rev H              | 15–20% commission (Agensi model)                    |

---

## Launch Sequencing

```
Local tool (now)
  → P0 hardening        → safe to share with teammates
    → P1 LLM scoring    → better results than Glama/PulseMCP
      → P1 NL search    → HN launch candidate ("Show HN: AI tool that finds Claude tools")
        → P2 Cursor      → 2-3x addressable market
          → P3 CLI        → embedding in daily dev workflow
            → P3 hosted   → removes local-only constraint
              → P3 enterprise → revenue
```

**The HN launch gate:** LLM scoring + natural language search together. Without them, this is a better-looking Glama. With them, it's the only tool in the ecosystem that can answer "find me something for database migrations" and surface the right result.

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

Key uncontested ground: unified cross-type discovery (agents + skills + MCP servers + hooks) + local install awareness + download-time security scan + natural language search.

---

## References

- `docs/hermes-ai-strategy.md` — LLM integration strategy and cost analysis
- Competitive research session (2026-05-24) — 77 sources across MCP/skills/AI tool directories
- Code review findings (2026-05-24) — security hardening already applied
