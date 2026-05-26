# SEO-1: Technical Foundation Design

**Date:** 2026-05-26
**Status:** Approved
**Part of:** Full-lifecycle SEO program (SEO-1 foundation → SEO-2 content → SEO-3 analytics)

---

## Goal

Make claude-crawler crawlable and rankable for the queries developers use to discover Claude Code tools. Today the app is a single-page application served from one URL, with no per-tool URLs, no sitemap, no meta tags, and no structured data — meaning Google has essentially nothing to index. SEO-1 adds a static-rendering layer to the existing pipeline so every tool, category, and job has an indexable URL with full SEO metadata, without abandoning the SPA experience.

---

## Architecture

A new `src/seo/` module hooks into the catalog pipeline at `scoreCatalog` completion. When the scored catalog is ready, the generator writes a tree of pre-rendered HTML files plus a sitemap to `data/static/`. Express adds a second `express.static` middleware pointing at that directory, with `extensions: ["html"]` so clean URLs (`/tools/mcp-servers/pg-mcp`) resolve to the matching file.

```
┌────────────────────────────────────────────────────────────────┐
│                    Existing pipeline                            │
│   crawlAll → scoreCatalog → cache.set("catalog", scored)        │
│                              │                                  │
│                              ▼  NEW                             │
│                    generateStaticPages(scored)  (async)         │
│                              │                                  │
│              ┌───────────────┼───────────────┐                  │
│              ▼               ▼               ▼                  │
│        per-tool HTML    category HTML    sitemap.xml            │
│        job HTML         index.html       robots.txt             │
│                              │                                  │
│                              ▼                                  │
│                       data/static/                              │
└──────────────────────────────────┬─────────────────────────────┘
                                   │
                                   ▼
                    Express static middleware
                    (mounted before `public/`)
                                   │
                                   ▼
                    GET /tools/{category}/{slug}
                    GET /categories/{category}
                    GET /jobs/{job}
                    GET /sitemap.xml
                    GET /robots.txt
```

**Boundaries — every module has one clear job:**

| File                   | Responsibility                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/seo/generator.js` | Orchestrator: `generateStaticPages(catalog)`. Manages file I/O, parallelism, collision detection.           |
| `src/seo/templates.js` | Pure render functions: `renderToolPage`, `renderCategoryPage`, `renderJobPage`, `renderHomepage`. No I/O.   |
| `src/seo/sitemap.js`   | `renderSitemap(catalog)` → XML string.                                                                      |
| `src/seo/slug.js`      | `slugify(name)`, `toolUrl(tool)`. Single source of truth for URL generation, used by templates AND sitemap. |
| `data/static/`         | Gitignored output directory (similar to `data/cache/`).                                                     |

**Generation is async fire-and-forget.** Inside the refresh handler, after `scoreCatalog` succeeds: `generateStaticPages(scored).catch(err => console.error("SEO generation failed:", err))`. The API response returns immediately; pages appear shortly after. Failures get logged but never block the API.

---

## Pages generated

### Per-tool detail page — `/tools/{category}/{slug}`

One per tool. Highest-volume surface, captures long-tail `{tool name} claude code` queries.

**`<head>`:**

- `<title>` — `{tool.name} — {Category Display Name} for Claude Code` (~55 chars)
- `<meta name="description">` — `tool.description` truncated to 155 chars with ellipsis
- `<link rel="canonical">` to the absolute URL (uses `SITE_URL` env var)
- OpenGraph: `og:title`, `og:description`, `og:url`, `og:type=article`, `og:image=/og-default.png`
- Twitter Card: `twitter:card=summary`
- JSON-LD `SoftwareApplication` (name, description, applicationCategory, downloadUrl from install command, author from `tool.author`). `interactionStatistic` carries stars and weekly downloads when present. Skips `aggregateRating` — Google Rich Results requires `reviewCount`/`ratingCount`, which the catalog does not produce.
- JSON-LD `BreadcrumbList` (Home › Category › Tool)

**`<body data-static-page="tool">`:**

- Same site header as the SPA (logo, search input, sign-in button, bridge chip, status dot — unchanged markup so app.js can bind to existing IDs)
- Breadcrumb nav above the tool card
- Tool detail card: name, author, source badges, full description, score breakdown (LLM panel if `tool.llmScore`), security warnings list if any, save button (heart). For npm tools the install command is shown with a copy button. For github tools a static "Install via Claude Crawler →" link points to `/` (the install modal flow stays in the SPA — keeping the modal markup out of static pages keeps the generator simple).
- "Related tools" section: top 6 tools in the same category (excluding this one), as small cards
- Footer

**Scripts:** Firebase compat scripts + `app.js` (unchanged). Save/install/auth work because the markup IDs match.

### Category landing page — `/categories/{category}`

One per category (7 pages total: `mcp-servers, agents, skills, templates, hooks, tools, plugins`).

**`<head>`:**

- `<title>` — `Best {Category Display Name} for Claude Code (2026)`
- `<meta name="description">` — `Discover the top {N} {category-name} for Claude Code, ranked by quality and security. Updated {date}.`
- Canonical, OG, Twitter as above
- JSON-LD `ItemList` of top 20 tools (each as `ListItem` with position, url, name)
- JSON-LD `BreadcrumbList` (Home › Category)

**`<body data-static-page="category">`:**

- H1: `Best {Category Display Name} for Claude Code`
- 2-3 sentence intro (one written paragraph per category, defined as static text in `templates.js`)
- Grid of top 20 tool cards
- "Browse all {category} →" link to `/` (the SPA homepage; filter-by-URL is deferred to a later iteration)

### Job/task landing page — `/jobs/{job}`

One per job (6 pages: `automate-workflow, code-quality, language-support, external-services, ai-enhancement, project-management`).

Same template as category but the `ItemList` filters by `tool.jobCategory` and the "Browse all" link points at `/` (the SPA homepage). H1: `Claude Code Tools for {Job Display Name}`.

### Homepage — `/`

Replaces the current `public/index.html` for production. Initial HTML response includes:

- Full SEO meta (site title, description, canonical = `SITE_URL`, OG defaults)
- JSON-LD `WebSite` with `SearchAction` pointing at the NL search endpoint (`/?q={search_term_string}`)
- Full SPA chrome (header, sidebar filters, toolbar)
- **The top 50 tools rendered into `#catalog-grid` before app.js boots** — so bots and slow-JS users see content immediately
- Firebase compat scripts + `app.js` as before

`app.js` detects the static-rendered initial state and either skips its first render or replaces the static content with the live SPA grid. (See Hydration below.)

### sitemap.xml — `/sitemap.xml`

One `<url>` per tool (`lastmod` = `tool.updatedAt`), per category (`lastmod` = max of category tools), per job (same), plus `/` (lastmod = max overall). Generated by `renderSitemap(catalog)` as a pure XML string.

### robots.txt — `/robots.txt`

```
User-agent: *
Allow: /
Disallow: /api/user/
Disallow: /api/install/

Sitemap: {SITE_URL}/sitemap.xml
```

Same content regardless of catalog state — written once on first run, or shipped as a static file.

---

## URL structure and slugs

**`src/seo/slug.js` exports two functions:**

```js
slugify(name) → string
  // lowercase, strip diacritics, replace non-alphanumeric runs with "-",
  // trim leading/trailing dashes, cap at 60 chars
  //
  // Examples:
  //   "pg-mcp"                        → "pg-mcp"
  //   "Some Tool (v2)"                → "some-tool-v2"
  //   "Café Tool"                     → "cafe-tool"

toolUrl(tool) → string
  // Single source of truth: /tools/{category}/{slug}
  // Used by templates AND sitemap so they never diverge
```

**Collision handling.** Multiple tools can share a slug within a category (e.g., two tools both named "auth-helper"). The generator detects collisions during page emission using a `Map<categorySlugKey, count>` and appends `-${slugify(tool.source)}` to all but the first. The collision-rewritten URL is also what gets emitted into the sitemap. A small `seo-redirects.json` artifact records original→final slug mappings so future runs can keep slugs stable when collisions appear in new tools.

---

## Hydration

Each static page sets `<body data-static-page="tool|category|job">`. The homepage omits this attribute (since it IS the SPA entry point with pre-rendered top-50).

`app.js` reads `document.body.dataset.staticPage` early in `DOMContentLoaded`:

| Page type           | app.js behavior                                                                                                                                                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool`              | Skip `loadCatalog`. Skip catalog grid render. Still: `initAuth`, `detectLocalBridge`, save-button delegate listener, install-button delegate listener. The visible heart on the tool card updates after auth resolves and `loadSavedTools` populates `state.savedToolIds`. |
| `category` / `job`  | Same as `tool` — landing pages are read-only listings; the SPA grid lives at `/`.                                                                                                                                                                                          |
| (absent — homepage) | Full SPA flow unchanged. The pre-rendered grid is replaced by the live `state.filtered` grid on first `applyFiltersAndRender()`.                                                                                                                                           |

---

## Integration with the existing pipeline

**Refresh handler change** (in `src/server.js`):

```js
// After scoreCatalog succeeds, BEFORE responding
const { generateStaticPages } = require("./seo/generator");
generateStaticPages(scored).catch((err) =>
  console.error("SEO generation failed:", err),
);
```

Identical hook in both `GET /api/catalog` (cold path) and `POST /api/catalog/refresh`.

**Express middleware mounting** (in `src/server.js`):

```js
app.use(cors(...));
app.use(express.json(...));
app.use("/api/user", userRoutes);
// ...api routes...
app.use(express.static(path.join(__dirname, "..", "data/static"), { extensions: ["html"] }));  // NEW
app.use(express.static(path.join(__dirname, "..", "public")));  // existing — provides app.js, style.css, etc.
```

Order matters: `data/static/` is mounted **before** `public/`. A URL like `/tools/...` is served from `data/static/`. A URL like `/app.js` falls through to `public/`.

**Environment** (in `env.example`):

```bash
# Absolute site URL used for canonical, OG, and sitemap. Defaults to http://localhost:${PORT} if unset.
# Required for production indexing — Google ignores non-absolute canonical URLs.
SITE_URL=https://your-app.up.railway.app
```

**Gitignore** (in `.gitignore`):

```
data/static/
```

---

## Performance

| Concern                                    | Impact                                                            | Mitigation                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| File-handle exhaustion on parallel writes  | Crashes generation at scale                                       | `Promise.all` in batches of 50                                                    |
| Disk usage                                 | ~500-2000 files × ~5 KB ≈ 2.5–10 MB                               | Negligible; well within Railway's free tier                                       |
| Generation latency                         | 1-2 seconds for ~1000 files on a hot machine                      | Async fire-and-forget so the API never blocks                                     |
| Stale pages between refreshes              | Acceptable — catalog refresh is the source of truth for freshness | Sitemap `lastmod` always reflects the most recent run                             |
| Redundant generation on identical catalogs | Wasted I/O                                                        | (Optional) Hash the scored catalog; skip if unchanged. Defer until proven needed. |

---

## Testing strategy

Additions to the existing `node:test` setup (no new framework):

| File                        | What it covers                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/seo/slug.test.js`      | `slugify` edge cases (diacritics, special chars, length cap, empty input); `toolUrl` produces stable URLs                                               |
| `src/seo/templates.test.js` | Render functions produce HTML containing the expected `<title>`, canonical, JSON-LD blocks, breadcrumb markup. Renders against a small fixture catalog. |
| `src/seo/sitemap.test.js`   | XML is well-formed (parses without error); includes one `<url>` per tool; `lastmod` present                                                             |
| `src/seo/generator.test.js` | Given a mock catalog, writes the expected files to a temp dir; collision case produces both slug variants and both URLs appear in the sitemap           |

Integration tests are deferred — the existing manual smoke-test pattern (start server, curl a URL) is sufficient until the unit tests are in place.

---

## Out of scope (deferred to SEO-2 / SEO-3)

- **SEO-2** — written content (long-form blog posts, comparison articles, category narratives beyond the intro paragraph, internal cross-linking between content pieces, editorial calendar)
- **SEO-3** — Google Search Console setup, analytics events for catalog interactions, ranking/CTR dashboards, refresh-detection feedback loop, A/B testing of titles
- **Migration** — there are no existing public URLs to redirect from; this is greenfield SEO
- **Internationalization** — single-language (English) for MVP
- **AMP / instant articles** — not relevant for a developer-tool catalog
- **CDN edge caching** — Railway serves static files directly; CDN is a later optimization once traffic justifies it

---

## Success criteria

- [ ] Every tool in the catalog has a stable indexable URL under `/tools/{category}/{slug}`
- [ ] Every category and job has a landing page with proper schema and a top-20 list
- [ ] `/sitemap.xml` returns a valid XML sitemap referencing every generated page
- [ ] `/robots.txt` allows public crawling and disallows `/api/user/*` and `/api/install/*`
- [ ] Homepage initial HTML contains the top 50 tools rendered (visible in `view-source:` without JS)
- [ ] Lighthouse SEO score ≥ 95 on a representative tool page and the homepage
- [ ] Google Rich Results Test validates the JSON-LD on a representative tool page
- [ ] On a hosted deployment, submitting `sitemap.xml` to Google Search Console produces zero validation errors
- [ ] Existing 47-test suite still passes; new tests added for slug, templates, sitemap, generator
- [ ] No regression in SPA behavior at `/` (filters, NL search, sign-in, save/install all work)
