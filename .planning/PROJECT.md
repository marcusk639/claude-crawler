# Claude Crawler

## What This Is

A Node.js/Express service that crawls GitHub, npm, Reddit, Anthropic's org, and Google CSE to build a scored catalog of Claude Code ecosystem tools (agents, skills, MCP servers, CLAUDE.md templates, hooks). Serves a REST API and a vanilla-JS dashboard at `http://localhost:3737` with one-click install to `~/.claude/` behind a content security scan. Targeting a Show HN launch once LLM-powered scoring and natural language search are live.

## Core Value

The only tool in the Claude ecosystem that can answer "find me something for database migrations" and surface the right result — unified cross-type discovery with download-time security scanning and natural language search.

## Requirements

### Validated

<!-- Shipped and confirmed working. -->

- ✓ 5 source crawlers (GitHub, npm, Anthropic org, ECC local, Google/Reddit web) — existing
- ✓ Heuristic scoring (log-scaled stars, downloads, recency, org bonus, community signals) — existing
- ✓ Content security scanner (injection, exfiltration, obfuscation, hook abuse patterns) — existing
- ✓ Install preview + one-click install to `~/.claude/` — existing
- ✓ Install detection (detects already-installed tools) — existing
- ✓ Config health panel — existing
- ✓ Web dashboard with filters, search, install modal — existing
- ✓ Security hardening (CORS localhost-only, loopback bind, path traversal, payload limits, refresh cooldown, npm name validation) — existing
- ✓ SEO: server-side pre-rendered HTML for every tool, category, job; sitemap.xml + robots.txt (656 tool pages) — SEO-1
- ✓ Rate limiting on install/preview endpoints (express-rate-limit) — P0
- ✓ Auth token gate on `/api/catalog/refresh` (REFRESH_SECRET env var) — P0

### Active

<!-- HN launch milestone: LLM scoring + NL search = differentiated product -->

- [ ] Unit tests for scanner, scoring, cache (confidence foundation for LLM work)
- [ ] LLM-powered README scoring via Hermes/OpenRouter (5-dimension quality schema + 7-day content-hash cache)
- [ ] LLM score breakdown panel in tool modal (expandable)
- [ ] Natural language search (`POST /api/search/natural`) — "find me a database migration tool"
- [ ] NL search UI: input in dashboard header with debounce, reasoning excerpts, clear button

### Out of Scope

<!-- Explicit boundaries for this milestone. -->

- Railway hosted deployment — already running informally; not a formal phase (local-first focus)
- CLI (`npx claude-crawler install <tool>`) — P3, requires hosted backend
- Enterprise governance console — P3, requires multi-user model
- Monetization/creator submission — P3, requires trust/review workflow
- Hermes Agent crawl orchestration — P3, strategic moat but not HN-launch-blocking
- Bulk install (checkbox select) — P2, nice-to-have

## Context

- **Stack:** CommonJS, no TypeScript, no build step, Node built-in test runner. Express app, vanilla JS dashboard.
- **In-memory architecture:** Single-process only (`catalogInFlight` dedup state is process-local). PM2 fork mode, `instances: 1`.
- **Firebase (optional):** Admin SDK for user saves in Firestore; graceful no-op without env vars.
- **LLM (optional):** OpenAI-compatible client; Hermes 3 405B free tier on OpenRouter is the default target. Falls back to heuristic-only if `LLM_API_KEY` not set.
- **Spike findings:** Corpus expansion validated via 4 spikes — collection-repo-expander achieves 5,007 tools (21× current corpus). Packaged in `.claude/skills/spike-findings-claude-crawler/`.
- **SEO foundation shipped:** Static pre-rendering generates 656 tool pages fire-and-forget after each crawl.
- **Competitive context:** Glama (23K MCP), PulseMCP (15K MCP), Smithery — none have NL search, security scanning, or multi-type discovery. Claude Crawler's moat is exactly these three.

## Constraints

- **Tech Stack:** CommonJS only — no TypeScript, no bundler, no build step
- **Single process:** PM2 fork mode with `instances: 1` — cluster mode multiplies external API traffic
- **Security:** Scanner must run on full file content (no truncation); downloads only from allowlisted hosts (`raw.githubusercontent.com`, `objects.githubusercontent.com`)
- **LLM cost:** Hermes 3 405B free tier → $0/refresh. Paid tier ~$0.13/refresh at 500 tools. Stay on free tier until validated.
- **SSRF guard:** `maxRedirects: 0` on axios download calls; `isAllowedDownloadUrl()` must gate all new download paths

## Key Decisions

| Decision                                        | Rationale                                                                                        | Outcome   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| Hermes 3 405B via OpenRouter (free tier first)  | $0/refresh to validate LLM scoring quality before committing to paid API                         | — Pending |
| 7-day content-hash cache for LLM scores         | READMEs don't change daily; key = `llm-score:${id}:${hash(readme)}` prevents redundant API calls | — Pending |
| NL search uses catalog slice (not full catalog) | Cost ~$0.0013/query for 100-tool summaries; acceptable at expected volume                        | — Pending |
| No TypeScript                                   | Existing codebase constraint — adding TS would require build step and break existing infra       | ✓ Good    |
| Fire-and-forget SEO generation                  | Slow filesystem (Railway cold start, full disk) must not block API responses                     | ✓ Good    |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-05-30 after project initialization_
