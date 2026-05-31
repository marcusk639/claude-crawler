# Requirements: Claude Crawler

**Defined:** 2026-05-31
**Core Value:** The only tool that answers "find me a database migration tool" and returns the right result — unified discovery with security scanning and natural language search.

---

## v1 Requirements

Requirements for the HN launch milestone. Maps to roadmap phases.

### Quality

- [ ] **QUAL-01**: `npm test` passes with zero failures covering the scanner, scorer, and cache modules
- [ ] **QUAL-02**: Scanner correctly flags all 4 pattern categories (injection, exfiltration, obfuscation, hook abuse) with known-bad inputs and passes known-safe inputs
- [ ] **QUAL-03**: Scorer normalization, recency decay, and penalty application are tested with deterministic fixtures
- [ ] **QUAL-04**: Cache TTL expiry is tested; `size()` only counts live entries

### Scoring

- [ ] **SCORE-01**: LLM scorer calls an OpenAI-compatible endpoint (Hermes/OpenRouter) with a 5-dimension schema: `documentationQuality`, `installabilityScore`, `maintenanceSignals`, `securityRisk`, `relevanceToClaudeCode`, `reasoning`, `flags`
- [ ] **SCORE-02**: LLM scores are cached for 7 days using a content-hash key (`llm-score:${id}:${hash(readme)}`) so READMEs that haven't changed don't trigger redundant API calls
- [ ] **SCORE-03**: LLM scorer only runs for tools with README > 200 characters; heuristic score is used otherwise
- [ ] **SCORE-04**: When `LLM_API_KEY` is not set, catalog loads identically to current heuristic-only behavior (graceful fallback)
- [ ] **SCORE-05**: LLM call errors (rate limit, timeout, parse failure) are caught and logged; they do not crash the catalog endpoint
- [ ] **SCORE-06**: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` are documented in `env.example` with working OpenRouter defaults

### Scoring UI

- [ ] **SCOREUI-01**: Tool modal shows an expandable LLM score breakdown panel with the 5 sub-scores and reasoning text
- [ ] **SCOREUI-02**: Panel is hidden (collapsed by default) and does not appear when `llmScore` is absent (heuristic-only mode)

### Search

- [ ] **SRCH-01**: `POST /api/search/natural` accepts a query string (3–500 chars), sends the cached catalog slice + query to the LLM endpoint, and returns ranked tool IDs with per-result reasoning
- [ ] **SRCH-02**: Response is validated against the live catalog (hallucinated IDs stripped by intersection before responding)
- [ ] **SRCH-03**: "database migration tool" query returns MCP servers with postgres/sqlite topics ranked above unrelated tools
- [ ] **SRCH-04**: Response time is under 3 seconds for a 100-tool catalog slice
- [ ] **SRCH-05**: Empty results shows "No tools matched — try different keywords" (not a blank screen)

### Search UI

- [ ] **SRCHUI-01**: Dashboard header has a natural language search input with 400ms debounce and loading spinner
- [ ] **SRCHUI-02**: NL search results render with a reasoning excerpt below each card
- [ ] **SRCHUI-03**: NL search and sidebar filters are mutually exclusive (NL search overrides filter state)
- [ ] **SRCHUI-04**: Clear button returns to filtered browse mode

---

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Discovery

- **DISC-01**: "Similar tools" panel in tool modal showing 5 semantically similar tools with reasoning (P2 — reuses LLM infra)
- **DISC-02**: Version tracking with "recently updated" badge on cards; "what's new" filtering (P2 — requires persistent store)
- **DISC-03**: Reddit score age weighting (`ageDecayFactor` in `communityScore`) to down-weight pre-MCP-era posts (P2 — simple, not urgent)

### Platform

- **PLAT-01**: Multi-platform support: Cursor rules category; crawl `cursor.directory` and `awesome-cursorrules` (P2 — 2-3x addressable market)
- **PLAT-02**: Bulk install: checkbox select with "Install selected (N)" action (P2 — UX improvement)
- **PLAT-03**: Local-only inference: document Ollama setup; surface "Local mode" indicator (P2 — enterprise/privacy story)

### Scale

- **SCALE-01**: Corpus expansion using collection-repo-expander pattern (5,007 tools validated in spike) (P3 — strategic moat)
- **SCALE-02**: CLI: `npx claude-crawler install <tool>` (P3 — requires hosted backend)

---

## Out of Scope

| Feature                           | Reason                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| Railway hosted deployment         | Already running informally; not a formal phase — local-first focus for this milestone |
| Enterprise governance console     | P3 — requires multi-user model; out of scope until revenue phase                      |
| Monetization / creator submission | P3 — requires trust/review workflow first                                             |
| Hermes Agent crawl orchestration  | P3 — strategic moat but post-HN-launch priority                                       |
| TypeScript migration              | Breaking change; existing CommonJS infra is the constraint                            |
| Cluster mode / horizontal scaling | Single-process invariant required by `catalogInFlight` dedup                          |

---

## Traceability

| Requirement | Phase   | Status  |
| ----------- | ------- | ------- |
| QUAL-01     | Phase 1 | Pending |
| QUAL-02     | Phase 1 | Pending |
| QUAL-03     | Phase 1 | Pending |
| QUAL-04     | Phase 1 | Pending |
| SCORE-01    | Phase 2 | Pending |
| SCORE-02    | Phase 2 | Pending |
| SCORE-03    | Phase 2 | Pending |
| SCORE-04    | Phase 2 | Pending |
| SCORE-05    | Phase 2 | Pending |
| SCORE-06    | Phase 2 | Pending |
| SCOREUI-01  | Phase 2 | Pending |
| SCOREUI-02  | Phase 2 | Pending |
| SRCH-01     | Phase 3 | Pending |
| SRCH-02     | Phase 3 | Pending |
| SRCH-03     | Phase 3 | Pending |
| SRCH-04     | Phase 3 | Pending |
| SRCH-05     | Phase 3 | Pending |
| SRCHUI-01   | Phase 3 | Pending |
| SRCHUI-02   | Phase 3 | Pending |
| SRCHUI-03   | Phase 3 | Pending |
| SRCHUI-04   | Phase 3 | Pending |

**Coverage:**

- v1 requirements: 21 total
- Mapped to phases: 21/21
- Unmapped: 0

---

_Requirements defined: 2026-05-31_
_Last updated: 2026-05-31 after roadmap creation_
