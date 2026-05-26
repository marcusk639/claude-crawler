# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Node.js/Express service that crawls GitHub, npm, Reddit, Anthropic's org, and (optionally) Google CSE to build a scored catalog of Claude Code ecosystem tools (agents, skills, MCP servers, CLAUDE.md templates, hooks). Serves a REST API and a vanilla-JS dashboard at `http://localhost:3737`. Can preview and install tools directly into `~/.claude/` after a security scan.

CommonJS, no TypeScript, no build step. Node's built-in test runner.

## Commands

```bash
npm start            # production: node src/server.js
npm run dev          # development: node --watch (auto-reloads on changes)
npm test             # runs node --test src/**/*.test.js

node --test src/scoring/scanner.test.js          # single test file
node --test --test-name-pattern="injection" src/**/*.test.js  # filter by test name

pm2 start ecosystem.config.js   # production-style supervision (see Deployment)
```

There is no linter or type-checker configured. Prettier runs as a PostToolUse hook in the parent `~/.claude/` settings — expect `.js`/`.json`/`.md` files to be reformatted after edits.

## Architecture

The system is a **two-stage pipeline** with **graceful degradation** at every external dependency.

### Stage 1: Crawl + score (read-only)

`src/crawlers/index.js` fans out to 5 source crawlers via `Promise.allSettled`:

- `github.js` — GitHub Search API (8 topic/keyword queries)
- `npm.js` — npm registry search (6 keyword queries)
- `anthropic.js` — repos under `anthropics`, `anthropic-ai`, `modelcontextprotocol`
- `ecc.js` — locally installed plugins in `~/.claude/plugins/cache/` (always reports as `installed: true`)
- `web.js` — Google CSE + Reddit r/ClaudeAI for community mentions

Results are deduplicated by `id` (higher stars wins, community signals merged immutably) and passed to `src/scoring/index.js`. Scoring uses a heuristic (log-scaled stars, downloads, recency, official-org bonus, community signals) plus content-scanner penalties. If `LLM_API_KEY` is set, `src/scoring/llm-scorer.js` adds an LLM-based README quality score; otherwise it's heuristic-only.

The result is cached in-memory (`src/cache/index.js`, TTL via `CACHE_TTL_MINUTES`, default 60). Concurrent cache misses share a single in-flight crawl via the `catalogInFlight` promise in `server.js` — **this is why the process must run single-instance** (see Deployment).

### Stage 2: Preview + install (writes to ~/.claude/)

`src/installer/index.js` exposes two operations:

- `getInstallPreview(tool)` — read-only, fetches file list from GitHub API, checks path traversal, excludes protected filenames
- `executeInstall(tool)` — downloads each file, re-runs the content scanner on actual bytes, backs up existing files, writes to `~/.claude/<category>/`

`src/scoring/scanner.js` defines pattern sets (`INJECTION_PATTERNS`, `EXFILTRATION_PATTERNS`, `OBFUSCATION_PATTERNS`, `HOOK_PATTERNS`) used by both stages. `INJECTION_PATTERNS` and `EXFILTRATION_PATTERNS` produce `severity: "critical"` warnings, which block install.

### Authentication and user data (optional layer)

`src/firebase.js` initializes the Firebase Admin SDK if `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` are set. Without them the SDK is uninitialized and `src/routes/users.js` returns 503 for protected endpoints. `src/middleware/auth.js` verifies Firebase ID tokens on `/api/user/*` routes. User saves live in Firestore at `users/{uid}/savedTools/{toolId}`.

### LLM-powered semantic search (optional layer)

`src/search/llm-search.js` (POST `/api/search/natural`) sends the cached catalog plus a user query to an OpenAI-compatible endpoint (defaults to OpenRouter free-tier Hermes 3 405B). Strips hallucinated IDs by intersecting LLM output with the actual catalog before responding.

## Critical invariants

These are non-obvious and easy to break.

**Single-process only.** The `catalogInFlight` dedup state in `server.js` is process-local. PM2 must run in fork mode with `instances: 1` (see `ecosystem.config.js`). Cluster mode would multiply external-API traffic.

**Binding rule.** `server.js` binds to `127.0.0.1` locally and `0.0.0.0` only when `RAILWAY_ENVIRONMENT` is set (or `HOST` is overridden). The install endpoint must never be reachable from the LAN without authentication.

**`validateTool()` in `server.js` is the single gate.** All field validation for install endpoints lives there — `VALID_INSTALL_TYPES`, `VALID_CATEGORIES`, `VALID_NPM_PKG_RE`, `VALID_NPM_CMD_RE`, and length caps. Do not add install-related validation elsewhere; extend `validateTool()`.

**`PROTECTED_FILENAMES` is enforced in TWO places.** `previewGithub()` filters them out via `flatMap` returning `[]`; `executeInstall()` rejects them again before `fs.outputFile`. Both paths must stay in sync. The set covers `settings.json`, `settings.local.json`, `.mcp.json`, `CLAUDE.md`, `claude.md`.

**Scanner runs on full content, not a slice.** `buildScanTarget()` deliberately does not truncate — a previous truncation cap was a security bypass. File size is capped upstream (512 KB in `MAX_FILE_BYTES`) so the scanner never sees enormous inputs.

**Crawler dedup must be immutable.** `deduplicateById` in `crawlers/index.js` uses immutable Map updates (`seen.set(id, { ...existing, ...merge })`). Direct mutation of map values has historically caused subtle scoring drift.

**Errors are sanitized at the response boundary.** All 500 responses return generic messages (`"X failed. Check server logs."`); full error objects go to `console.error`. Do not propagate `err.message` to clients — axios errors can leak request URLs containing tokens.

**Rate limiters protect external API budgets.** `installLimiter` (10/min), `previewLimiter` (30/min), `searchLimiter` (20/min), and a 60s `REFRESH_COOLDOWN_MS` on `/api/catalog/refresh`. The refresh endpoint also accepts an optional `REFRESH_SECRET` Bearer token (`requireRefreshSecret` uses `timingSafeEqual`).

**Frontend Firebase init uses the compat CDN, not the modular ESM SDK.** `public/index.html` loads `firebase-app-compat.js`, `firebase-auth-compat.js`, and `firebase-firestore-compat.js` from `gstatic.com`, which exposes a global `firebase` object. `public/app.js` then calls `firebase.auth()`, `firebase.auth.GithubAuthProvider`, `firebase.auth.GoogleAuthProvider`, and `firebase.auth.OAuthProvider("apple.com")`. Switching to the modular `import { initializeApp } from "firebase/app"` SDK would break every auth call in `app.js`. There is no bundler — the `firebase` npm package is not used at runtime.

## Deployment

**Local:** `npm run dev` or `pm2 start ecosystem.config.js`. The crawler is intended to be permanently up so a future MCP wrapper can call `localhost:3737` from any Claude session.

**Hosted (Railway):** Sets `RAILWAY_ENVIRONMENT` automatically; the server binds to `0.0.0.0`. `ALLOWED_ORIGIN` must be set to the hosted frontend URL so CORS allows it alongside `localhost:PORT`. Firebase env vars use literal `\n` for newlines in `FIREBASE_PRIVATE_KEY` (normalized in `firebase.js`).

**Logs:** PM2 writes to `./logs/out.log` and `./logs/err.log`. Install `pm2-logrotate` separately to cap size.

## Repository layout (quick map)

- `src/server.js` — Express app, routes, middleware wiring, validation
- `src/crawlers/` — 5 source crawlers + orchestrator (`index.js`)
- `src/scoring/` — heuristic scorer, LLM scorer, security scanner
- `src/installer/` — preview + execute (writes to `~/.claude/`), `detect.js` (what's already installed), `health.js` (scans `~/.claude/` for status)
- `src/cache/` — in-memory TTL cache
- `src/firebase.js` — Admin SDK init (no-op without env vars)
- `src/routes/users.js`, `src/middleware/auth.js` — auth-protected user data routes
- `src/search/llm-search.js` — natural-language catalog search
- `public/` — vanilla JS dashboard (no build step)
- `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json` — Firebase CLI config and Firestore security rules (default-deny outside `users/{uid}/**`)
- `ecosystem.config.js` — PM2 fork-mode supervisor config
- `docs/ROADMAP.md`, `docs/superpowers/plans/` — current roadmap and implementation plans

## Reference docs

- `docs/ROADMAP.md` — prioritized backlog grouped by Growth × Effort
- `docs/hermes-ai-strategy.md` — why Hermes is the chosen LLM (uncensored, free tier viable)
- `docs/superpowers/plans/` — P0/P1 plans (security, tests, LLM scoring, NL search, hosted MVP)
- `docs/superpowers/HOSTED-MVP-SETUP-CHECKLIST.md` — manual Firebase + Railway setup walkthrough
