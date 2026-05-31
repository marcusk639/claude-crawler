# Roadmap: Claude Crawler

## Overview

Brownfield HN-launch milestone. The crawler, scoring, dashboard, and SEO foundation are shipped. This milestone adds the confidence foundation (unit tests), LLM-powered README scoring, and natural language search — the three capabilities that differentiate Claude Crawler from every competitor. Three phases, each delivering a complete, verifiable capability.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Unit Tests** - Establish a passing test suite covering scanner, scorer, and cache so the codebase is safe to extend
- [ ] **Phase 2: LLM Scoring** - Add LLM-powered README quality scoring with 7-day cache and a collapsible score breakdown panel in the tool modal
- [ ] **Phase 3: Natural Language Search** - Ship `POST /api/search/natural` and the NL search UI so users can find tools by intent

## Phase Details

### Phase 1: Unit Tests

**Goal**: The codebase has a passing test suite covering the three core modules, giving us confidence to build on top of them
**Depends on**: Nothing (first phase)
**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04
**Success Criteria** (what must be TRUE):

- `npm test` exits 0 with no failures
- Scanner correctly flags inputs containing injection, exfiltration, obfuscation, and hook-abuse patterns, and passes known-safe inputs
- Scorer produces deterministic output for fixture inputs — normalization, recency decay, and penalties all tested
- Cache TTL expiry works correctly and `size()` only counts live (non-expired) entries

**Plans**: TBD

### Phase 2: LLM Scoring

**Goal**: Tools with substantial READMEs get an LLM-evaluated quality score cached for 7 days, and the score breakdown is visible in the tool modal
**Depends on**: Phase 1
**Requirements**: SCORE-01, SCORE-02, SCORE-03, SCORE-04, SCORE-05, SCORE-06, SCOREUI-01, SCOREUI-02
**Success Criteria** (what must be TRUE):

- Tools with READMEs over 200 characters show an LLM score with 5 sub-dimensions (documentationQuality, installabilityScore, maintenanceSignals, securityRisk, relevanceToClaudeCode) in the catalog response
- Running a second crawl within 7 days for the same tool does not trigger a new LLM API call (content-hash cache hit is logged)
- When `LLM_API_KEY` is absent, the catalog loads with heuristic scores and no errors — identical behavior to today
- Tool modal has a collapsible "LLM Score" panel showing sub-scores and reasoning text; panel is absent when no LLM score exists

**Plans**: TBD
**UI hint**: yes

### Phase 3: Natural Language Search

**Goal**: Users can type intent ("find me a database migration tool") into the dashboard and get ranked results with reasoning, bypassing keyword filtering
**Depends on**: Phase 2
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05, SRCHUI-01, SRCHUI-02, SRCHUI-03, SRCHUI-04
**Success Criteria** (what must be TRUE):

- `POST /api/search/natural` with "database migration tool" returns MCP servers with postgres/sqlite topics ranked above unrelated tools, with per-result reasoning, in under 3 seconds
- Hallucinated tool IDs never appear in responses — results are intersection-validated against the live catalog
- Dashboard header has a natural language search input; typing triggers a 400ms-debounced search with a loading spinner
- NL search results show a reasoning excerpt under each card; activating NL search clears sidebar filters, and the clear button restores browse mode

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase                      | Plans Complete | Status      | Completed |
| -------------------------- | -------------- | ----------- | --------- |
| 1. Unit Tests              | 0/?            | Not started | -         |
| 2. LLM Scoring             | 0/?            | Not started | -         |
| 3. Natural Language Search | 0/?            | Not started | -         |
