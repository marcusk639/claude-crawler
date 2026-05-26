# SEO-1 Technical Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a static pre-rendering layer so every tool, category, and job in the catalog has an indexable URL with full SEO metadata, without breaking the existing SPA.

**Architecture:** A new `src/seo/` module hooks into `scoreCatalog` completion. Fire-and-forget `generateStaticPages(scored)` writes per-tool, per-category, per-job HTML plus `sitemap.xml` and `robots.txt` to `data/static/`. Express mounts a second `express.static` middleware ahead of `public/` with `extensions: ["html"]` so `/tools/{category}/{slug}` resolves to a pre-rendered file. The SPA at `/` gets the top 50 tools rendered into `#catalog-grid` server-side; `app.js` reads `body[data-static-page]` and either skips its first render (landing pages) or replaces the seed content (homepage).

**Tech Stack:** Node 18+, CommonJS, Express 4, fs-extra (already a dep), node:test (built-in). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-26-seo-1-technical-foundation-design.md`

---

## File Structure

**Create:**

- `src/seo/slug.js` — `slugify(name)`, `toolUrl(tool)`, `categoryUrl(category)`, `jobUrl(job)`
- `src/seo/slug.test.js`
- `src/seo/templates.js` — pure render functions, no I/O
- `src/seo/templates.test.js`
- `src/seo/sitemap.js` — `renderSitemap(catalog, siteUrl)`, `renderRobotsTxt(siteUrl)`
- `src/seo/sitemap.test.js`
- `src/seo/generator.js` — `generateStaticPages(catalog)` orchestrator
- `src/seo/generator.test.js`
- `src/seo/constants.js` — category/job display names, intro copy, top-N caps
- `public/og-default.png` — placeholder OpenGraph image (1200x630, repo-friendly tiny PNG; deferred — Task 12 only references it)

**Modify:**

- `src/server.js` — add static mount, hook generator into both catalog routes
- `public/app.js` — read `body.dataset.staticPage` early in `DOMContentLoaded`; conditionally skip `loadCatalog`/render
- `env.example` — add `SITE_URL`
- `.gitignore` — add `data/static/`
- `CLAUDE.md` — document the new module and the mount-order invariant

---

## Task 1: Slug module — pure URL generation

**Files:**

- Create: `src/seo/slug.js`
- Create: `src/seo/slug.test.js`

- [ ] **Step 1.1: Write the failing tests**

Create `src/seo/slug.test.js`:

```js
"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { slugify, toolUrl, categoryUrl, jobUrl } = require("./slug");

test("slugify lowercases", () => {
  assert.strictEqual(slugify("PG-MCP"), "pg-mcp");
});

test("slugify strips diacritics", () => {
  assert.strictEqual(slugify("Café Tool"), "cafe-tool");
});

test("slugify collapses non-alphanumeric runs to single dash", () => {
  assert.strictEqual(slugify("Some Tool (v2)!!"), "some-tool-v2");
});

test("slugify trims leading and trailing dashes", () => {
  assert.strictEqual(slugify("--foo--bar--"), "foo-bar");
});

test("slugify caps at 60 chars", () => {
  const long = "a".repeat(120);
  assert.strictEqual(slugify(long).length, 60);
});

test("slugify returns empty string for empty/whitespace input", () => {
  assert.strictEqual(slugify(""), "");
  assert.strictEqual(slugify("   "), "");
  assert.strictEqual(slugify(null), "");
  assert.strictEqual(slugify(undefined), "");
});

test("slugify handles unicode that loses all chars", () => {
  // String of only emoji/symbols slugifies to empty
  assert.strictEqual(slugify("🚀✨"), "");
});

test("toolUrl produces /tools/{category}/{slug}", () => {
  const tool = { name: "pg-mcp", category: "mcp-servers" };
  assert.strictEqual(toolUrl(tool), "/tools/mcp-servers/pg-mcp");
});

test("toolUrl falls back to 'tools' when category is missing", () => {
  const tool = { name: "lonely" };
  assert.strictEqual(toolUrl(tool), "/tools/tools/lonely");
});

test("categoryUrl produces /categories/{category}", () => {
  assert.strictEqual(categoryUrl("mcp-servers"), "/categories/mcp-servers");
});

test("jobUrl produces /jobs/{job}", () => {
  assert.strictEqual(jobUrl("code-quality"), "/jobs/code-quality");
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `node --test src/seo/slug.test.js`
Expected: FAIL — `Cannot find module './slug'`.

- [ ] **Step 1.3: Implement `src/seo/slug.js`**

```js
"use strict";

const MAX_SLUG_LEN = 60;
const VALID_CATEGORIES = new Set([
  "agents",
  "skills",
  "templates",
  "hooks",
  "mcp-servers",
  "tools",
  "plugins",
]);

function slugify(name) {
  if (typeof name !== "string") return "";
  const stripped = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return stripped.slice(0, MAX_SLUG_LEN);
}

function toolUrl(tool) {
  const category = VALID_CATEGORIES.has(tool && tool.category)
    ? tool.category
    : "tools";
  return `/tools/${category}/${slugify(tool && tool.name)}`;
}

function categoryUrl(category) {
  return `/categories/${category}`;
}

function jobUrl(job) {
  return `/jobs/${job}`;
}

module.exports = { slugify, toolUrl, categoryUrl, jobUrl, MAX_SLUG_LEN };
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `node --test src/seo/slug.test.js`
Expected: PASS (11 tests).

- [ ] **Step 1.5: Commit**

```bash
git add src/seo/slug.js src/seo/slug.test.js
git commit -m "feat(seo): add slug + URL helpers with unicode-safe slugify"
```

---

## Task 2: Constants module — display names and copy

**Files:**

- Create: `src/seo/constants.js`

- [ ] **Step 2.1: Write the module**

Create `src/seo/constants.js`:

```js
"use strict";

const CATEGORY_DISPLAY = {
  "mcp-servers": "MCP Servers",
  agents: "Agents",
  skills: "Skills",
  templates: "Templates",
  hooks: "Hooks",
  tools: "Tools",
  plugins: "Plugins",
};

const JOB_DISPLAY = {
  "automate-workflow": "Automate Workflow",
  "code-quality": "Code Quality",
  "language-support": "Language Support",
  "external-services": "External Services",
  "ai-enhancement": "AI Enhancement",
  "project-management": "Project Management",
};

// One paragraph of static intro copy per category landing page.
// Hand-written so each page has unique, indexable prose (not a templated stub).
const CATEGORY_INTRO = {
  "mcp-servers":
    "Model Context Protocol servers extend Claude Code with new tool surfaces — databases, APIs, browsers, file systems. Each one runs as a local process Claude talks to over stdio, giving sessions structured access to systems beyond the working directory.",
  agents:
    "Subagents are specialized Claude personas Claude Code can dispatch in parallel — code reviewers, planners, debuggers, security auditors. Each agent has its own tool allowlist and system prompt, letting you parallelize complex work without polluting your main session's context.",
  skills:
    "Skills are slash-invokable workflows that bundle instructions, tool permissions, and progressive-disclosure references. A well-written skill turns a recurring task — writing tests, reviewing PRs, debugging a class of bug — into one consistent command.",
  templates:
    "CLAUDE.md templates give Claude Code session-level instructions: architecture, conventions, invariants, who to ask. A good template means new contributors and new sessions both onboard in the first message instead of the tenth.",
  hooks:
    "Hooks are shell commands the harness runs on tool events — PreToolUse to block dangerous writes, PostToolUse to auto-format, Stop to verify before exiting. They turn Claude Code from a chat tool into a guarded production-grade harness.",
  tools:
    "Standalone CLI tools and utilities that complement Claude Code workflows — installers, validators, log analyzers, deployment helpers. Not technically Claude Code extensions, but the daily tools developers reach for alongside.",
  plugins:
    "Bundles of skills, agents, and MCP servers distributed as a single installable unit. Plugins are how you share a complete workflow — domain knowledge plus tools plus discipline — with the rest of your team.",
};

const JOB_INTRO = {
  "automate-workflow":
    "Tools that take repetitive Claude Code workflows — running tests, formatting, reviewing, committing — and turn them into one-command pipelines.",
  "code-quality":
    "Reviewers, linters, type-checkers, and refactoring assistants that catch issues before they ship.",
  "language-support":
    "Skills, agents, and MCP servers that give Claude Code idiomatic mastery of a specific language or framework.",
  "external-services":
    "MCP servers and integrations that connect Claude Code to APIs, databases, cloud platforms, and SaaS tools.",
  "ai-enhancement":
    "Tools that improve how Claude itself plans, reasons, retrieves context, and self-corrects across long sessions.",
  "project-management":
    "Skills and agents for planning, status tracking, decomposition, and team coordination from inside Claude Code.",
};

const TOP_N_CATEGORY = 20;
const TOP_N_JOB = 20;
const TOP_N_RELATED = 6;
const TOP_N_HOMEPAGE_SEED = 50;
const WRITE_BATCH_SIZE = 50;

module.exports = {
  CATEGORY_DISPLAY,
  JOB_DISPLAY,
  CATEGORY_INTRO,
  JOB_INTRO,
  TOP_N_CATEGORY,
  TOP_N_JOB,
  TOP_N_RELATED,
  TOP_N_HOMEPAGE_SEED,
  WRITE_BATCH_SIZE,
};
```

- [ ] **Step 2.2: Commit**

```bash
git add src/seo/constants.js
git commit -m "feat(seo): add display-name and intro-copy constants"
```

---

## Task 3: Templates module — tool detail page

**Files:**

- Create: `src/seo/templates.js`
- Create: `src/seo/templates.test.js`

- [ ] **Step 3.1: Write the failing tests for `renderToolPage`**

Create `src/seo/templates.test.js`:

```js
"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { renderToolPage } = require("./templates");

const fixtureTool = {
  id: "github:vendor/pg-mcp",
  name: "pg-mcp",
  displayName: "pg-mcp",
  author: "vendor",
  source: "github",
  category: "mcp-servers",
  jobCategory: "external-services",
  description: "Postgres MCP server with read-only query access.",
  stars: 1234,
  weeklyDownloads: 0,
  updatedAt: "2026-04-01T00:00:00Z",
  url: "https://github.com/vendor/pg-mcp",
  license: "MIT",
  contentWarnings: [],
  llmScore: null,
  score: 87,
  installConfig: {
    type: "github-repo",
    repoFullName: "vendor/pg-mcp",
  },
};

const siteUrl = "https://example.com";
const relatedTools = [];

test("renderToolPage emits <title> with name and category", () => {
  const html = renderToolPage(fixtureTool, { siteUrl, relatedTools });
  assert.match(html, /<title>pg-mcp — MCP Servers for Claude Code<\/title>/);
});

test("renderToolPage emits description meta truncated to 155 chars", () => {
  const longTool = { ...fixtureTool, description: "x".repeat(300) };
  const html = renderToolPage(longTool, { siteUrl, relatedTools });
  const m = html.match(/<meta name="description" content="([^"]+)"/);
  assert.ok(m, "description meta present");
  assert.ok(m[1].length <= 155, `description length ${m[1].length} <= 155`);
  assert.ok(m[1].endsWith("…"), "ends with ellipsis when truncated");
});

test("renderToolPage emits canonical absolute URL", () => {
  const html = renderToolPage(fixtureTool, { siteUrl, relatedTools });
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.com\/tools\/mcp-servers\/pg-mcp"\/>/,
  );
});

test("renderToolPage emits SoftwareApplication JSON-LD", () => {
  const html = renderToolPage(fixtureTool, { siteUrl, relatedTools });
  const m = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  );
  assert.ok(m, "ld+json block present");
  const parsed = JSON.parse(m[1]);
  assert.strictEqual(parsed["@type"], "SoftwareApplication");
  assert.strictEqual(parsed.name, "pg-mcp");
  assert.strictEqual(parsed.applicationCategory, "DeveloperApplication");
});

test("renderToolPage emits BreadcrumbList JSON-LD with 3 items", () => {
  const html = renderToolPage(fixtureTool, { siteUrl, relatedTools });
  const matches = [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ];
  const breadcrumb = matches
    .map((m) => JSON.parse(m[1]))
    .find((j) => j["@type"] === "BreadcrumbList");
  assert.ok(breadcrumb, "BreadcrumbList present");
  assert.strictEqual(breadcrumb.itemListElement.length, 3);
});

test("renderToolPage sets body[data-static-page=tool]", () => {
  const html = renderToolPage(fixtureTool, { siteUrl, relatedTools });
  assert.match(html, /<body[^>]*data-static-page="tool"/);
});

test("renderToolPage escapes HTML in tool name and description", () => {
  const xssTool = {
    ...fixtureTool,
    name: '<script>alert("xss")</script>',
    description: '<img src=x onerror="alert(1)">',
  };
  const html = renderToolPage(xssTool, { siteUrl, relatedTools });
  assert.ok(
    !html.includes('<script>alert("xss")</script>'),
    "raw script tag not present",
  );
  assert.ok(
    !html.includes('onerror="alert(1)"'),
    "raw onerror attribute not present",
  );
  assert.ok(html.includes("&lt;script&gt;"), "escaped script entity present");
});

test("renderToolPage emits related tools section when provided", () => {
  const related = [
    { ...fixtureTool, id: "github:other/x", name: "other-tool" },
  ];
  const html = renderToolPage(fixtureTool, { siteUrl, relatedTools: related });
  assert.match(html, /class="related-tools"/);
  assert.match(html, /other-tool/);
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `node --test src/seo/templates.test.js`
Expected: FAIL — `Cannot find module './templates'`.

- [ ] **Step 3.3: Implement `src/seo/templates.js` with `renderToolPage` and helpers**

Create `src/seo/templates.js`:

```js
"use strict";

const { toolUrl, categoryUrl } = require("./slug");
const { CATEGORY_DISPLAY } = require("./constants");

const DESC_LEN = 155;

function escHtml(s) {
  if (s === undefined || s === null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escAttr(s) {
  return escHtml(s);
}

function truncate(s, n) {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

function safeJsonLd(obj) {
  // </ inside a <script> block would close the tag; escape the slash.
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

function categoryDisplay(category) {
  return CATEGORY_DISPLAY[category] || "Tools";
}

function renderHead({
  title,
  description,
  canonical,
  ogType = "website",
  ogImage,
  jsonLd = [],
}) {
  const ldBlocks = jsonLd
    .map(
      (obj) => `<script type="application/ld+json">${safeJsonLd(obj)}</script>`,
    )
    .join("\n");
  return `
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escHtml(title)}</title>
    <meta name="description" content="${escAttr(description)}" />
    <link rel="canonical" href="${escAttr(canonical)}"/>
    <meta property="og:title" content="${escAttr(title)}" />
    <meta property="og:description" content="${escAttr(description)}" />
    <meta property="og:url" content="${escAttr(canonical)}" />
    <meta property="og:type" content="${escAttr(ogType)}" />
    <meta property="og:image" content="${escAttr(ogImage)}" />
    <meta name="twitter:card" content="summary" />
    <link rel="stylesheet" href="/style.css" />
    ${ldBlocks}
    <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
    <script>
      firebase.initializeApp({
        apiKey: "AIzaSyAUsJpw-ybyn0wx4S2BJ5eham0gBCK0Byc",
        authDomain: "claude-crawler.firebaseapp.com",
        projectId: "claude-crawler",
        storageBucket: "claude-crawler.firebasestorage.app",
        messagingSenderId: "1023340404356",
        appId: "1:1023340404356:web:b8607023e1b27394f26cd1",
      });
    </script>`;
}

function renderSiteHeader() {
  // Markup IDs match public/index.html so app.js bindings still work.
  return `
    <header class="site-header">
      <div class="header-left">
        <a href="/" class="logo-link"><h1 class="logo">⚡ Claude Crawler</h1></a>
        <span class="tagline">Discover &amp; install the best Claude Code tools</span>
      </div>
      <div class="header-right">
        <div class="search-wrap">
          <input type="search" id="search" placeholder="Search tools…" autocomplete="off" />
        </div>
        <span id="bridge-chip" class="bridge-chip hidden">✓ Installer</span>
        <button id="btn-signin" class="btn btn-secondary">Sign In</button>
        <div id="user-menu" class="user-menu hidden">
          <img id="user-avatar" class="user-avatar" src="" alt="" width="28" height="28" />
          <span id="user-name" class="user-name"></span>
          <button id="btn-signout" class="btn-ghost btn-sm">Sign Out</button>
        </div>
        <div id="status-dot" class="status-dot"></div>
      </div>
    </header>`;
}

function renderBreadcrumbNav(items) {
  // items: [{ label, href }] — last item has no href (current page)
  const links = items
    .map((it, i) => {
      const isLast = i === items.length - 1;
      if (isLast || !it.href)
        return `<span aria-current="page">${escHtml(it.label)}</span>`;
      return `<a href="${escAttr(it.href)}">${escHtml(it.label)}</a>`;
    })
    .join(' <span class="crumb-sep">›</span> ');
  return `<nav class="breadcrumb" aria-label="Breadcrumb">${links}</nav>`;
}

function renderRelatedTools(tools) {
  if (!tools || tools.length === 0) return "";
  const cards = tools
    .map(
      (t) => `
        <a class="related-card" href="${escAttr(toolUrl(t))}">
          <div class="related-name">${escHtml(t.displayName || t.name)}</div>
          <div class="related-desc">${escHtml(truncate(t.description, 100))}</div>
        </a>`,
    )
    .join("");
  return `
    <section class="related-tools">
      <h2>Related tools</h2>
      <div class="related-grid">${cards}</div>
    </section>`;
}

function renderToolPage(tool, { siteUrl, relatedTools = [] }) {
  const canonical = `${siteUrl}${toolUrl(tool)}`;
  const catDisplay = categoryDisplay(tool.category);
  const title = `${tool.name} — ${catDisplay} for Claude Code`;
  const description = truncate(
    tool.description || `${tool.name}: ${catDisplay} for Claude Code`,
    DESC_LEN,
  );

  const ldSoftware = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: tool.name,
    description: tool.description || "",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Cross-platform",
    url: canonical,
    author: tool.author ? { "@type": "Person", name: tool.author } : undefined,
    downloadUrl: tool.url || undefined,
  };
  const stats = [];
  if (tool.stars > 0) {
    stats.push({
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/LikeAction",
      userInteractionCount: tool.stars,
    });
  }
  if (tool.weeklyDownloads > 0) {
    stats.push({
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/DownloadAction",
      userInteractionCount: tool.weeklyDownloads,
    });
  }
  if (stats.length > 0) ldSoftware.interactionStatistic = stats;

  const ldBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: catDisplay,
        item: `${siteUrl}${categoryUrl(tool.category)}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: tool.name,
        item: canonical,
      },
    ],
  };

  const warnings =
    (tool.contentWarnings || []).length === 0
      ? ""
      : `<section class="warnings"><h2>Security warnings</h2><ul>${tool.contentWarnings
          .map(
            (w) =>
              `<li class="warning warning-${escAttr(w.severity)}">${escHtml(w.message || w.pattern || "warning")}</li>`,
          )
          .join("")}</ul></section>`;

  return `<!doctype html>
<html lang="en">
  <head>${renderHead({
    title,
    description,
    canonical,
    ogType: "article",
    ogImage: `${siteUrl}/og-default.png`,
    jsonLd: [ldSoftware, ldBreadcrumb],
  })}</head>
  <body data-static-page="tool">
    ${renderSiteHeader()}
    <main class="tool-detail">
      ${renderBreadcrumbNav([
        { label: "Home", href: "/" },
        { label: catDisplay, href: categoryUrl(tool.category) },
        { label: tool.name },
      ])}
      <article class="tool-card detail" data-id="${escAttr(tool.id)}">
        <header class="card-header">
          <h1 class="card-name">${escHtml(tool.displayName || tool.name)}</h1>
          <div class="card-author">${escHtml(tool.author || "")}${
            tool.source && tool.source !== tool.author
              ? ` · ${escHtml(tool.source)}`
              : ""
          }</div>
          <div class="card-badges">
            <span class="badge badge-${escAttr(tool.category)}">${escHtml(catDisplay)}</span>
            ${tool.score !== undefined ? `<span class="badge badge-score">Score ${escHtml(tool.score)}</span>` : ""}
          </div>
        </header>
        <p class="card-description">${escHtml(tool.description || "")}</p>
        ${warnings}
        <div class="card-actions">
          <button class="btn btn-save" data-action="save" data-tool-id="${escAttr(tool.id)}">♡ Save</button>
          <a class="btn btn-install" href="/">Install via Claude Crawler →</a>
        </div>
      </article>
      ${renderRelatedTools(relatedTools)}
    </main>
    <script src="/app.js"></script>
  </body>
</html>`;
}

module.exports = {
  renderToolPage,
  // exported for testing and reuse by later tasks
  escHtml,
  truncate,
  safeJsonLd,
  renderHead,
  renderSiteHeader,
  renderBreadcrumbNav,
  categoryDisplay,
};
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `node --test src/seo/templates.test.js`
Expected: PASS (8 tests).

- [ ] **Step 3.5: Commit**

```bash
git add src/seo/templates.js src/seo/templates.test.js
git commit -m "feat(seo): add renderToolPage with JSON-LD, breadcrumbs, XSS escaping"
```

---

## Task 4: Templates — category landing page

**Files:**

- Modify: `src/seo/templates.js`
- Modify: `src/seo/templates.test.js`

- [ ] **Step 4.1: Append failing tests for `renderCategoryPage`**

Append to `src/seo/templates.test.js`:

```js
const { renderCategoryPage } = require("./templates");

test("renderCategoryPage emits H1 with category display name", () => {
  const html = renderCategoryPage("mcp-servers", [fixtureTool], {
    siteUrl,
    generatedAt: "2026-05-26",
  });
  assert.match(html, /<h1[^>]*>Best MCP Servers for Claude Code<\/h1>/);
});

test("renderCategoryPage emits ItemList JSON-LD with one entry per tool", () => {
  const tools = [fixtureTool, { ...fixtureTool, id: "x", name: "two" }];
  const html = renderCategoryPage("mcp-servers", tools, {
    siteUrl,
    generatedAt: "2026-05-26",
  });
  const matches = [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ];
  const itemList = matches
    .map((m) => JSON.parse(m[1]))
    .find((j) => j["@type"] === "ItemList");
  assert.ok(itemList, "ItemList present");
  assert.strictEqual(itemList.itemListElement.length, 2);
  assert.strictEqual(itemList.itemListElement[0].position, 1);
});

test("renderCategoryPage sets body[data-static-page=category]", () => {
  const html = renderCategoryPage("mcp-servers", [fixtureTool], {
    siteUrl,
    generatedAt: "2026-05-26",
  });
  assert.match(html, /<body[^>]*data-static-page="category"/);
});

test("renderCategoryPage canonical is /categories/{slug}", () => {
  const html = renderCategoryPage("mcp-servers", [fixtureTool], {
    siteUrl,
    generatedAt: "2026-05-26",
  });
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.com\/categories\/mcp-servers"\/>/,
  );
});
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `node --test src/seo/templates.test.js`
Expected: FAIL on the 4 new tests (`renderCategoryPage is not a function`).

- [ ] **Step 4.3: Implement `renderCategoryPage`**

In `src/seo/templates.js`, add to the imports near the top:

```js
const { CATEGORY_INTRO, JOB_INTRO, JOB_DISPLAY } = require("./constants");
```

Then add the function above `module.exports`:

```js
function renderListingCard(tool) {
  return `
    <a class="listing-card" href="${escAttr(toolUrl(tool))}">
      <div class="listing-name">${escHtml(tool.displayName || tool.name)}</div>
      <div class="listing-meta">
        ${tool.author ? `<span>${escHtml(tool.author)}</span>` : ""}
        ${tool.score !== undefined ? `<span>Score ${escHtml(tool.score)}</span>` : ""}
        ${tool.stars > 0 ? `<span>★ ${escHtml(tool.stars)}</span>` : ""}
      </div>
      <p class="listing-desc">${escHtml(truncate(tool.description, 140))}</p>
    </a>`;
}

function renderCategoryPage(category, tools, { siteUrl, generatedAt }) {
  const catDisplay = categoryDisplay(category);
  const canonical = `${siteUrl}${categoryUrl(category)}`;
  const title = `Best ${catDisplay} for Claude Code (2026)`;
  const intro = CATEGORY_INTRO[category] || "";
  const description = `Discover the top ${tools.length} ${catDisplay.toLowerCase()} for Claude Code, ranked by quality and security. Updated ${generatedAt}.`;

  const ldItemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    itemListElement: tools.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${siteUrl}${toolUrl(t)}`,
      name: t.name,
    })),
  };
  const ldBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: catDisplay,
        item: canonical,
      },
    ],
  };

  return `<!doctype html>
<html lang="en">
  <head>${renderHead({
    title,
    description,
    canonical,
    ogType: "website",
    ogImage: `${siteUrl}/og-default.png`,
    jsonLd: [ldItemList, ldBreadcrumb],
  })}</head>
  <body data-static-page="category">
    ${renderSiteHeader()}
    <main class="landing">
      ${renderBreadcrumbNav([{ label: "Home", href: "/" }, { label: catDisplay }])}
      <h1>Best ${escHtml(catDisplay)} for Claude Code</h1>
      <p class="landing-intro">${escHtml(intro)}</p>
      <div class="listing-grid">${tools.map(renderListingCard).join("")}</div>
      <p class="landing-footer"><a href="/">Browse all ${escHtml(catDisplay.toLowerCase())} →</a></p>
    </main>
    <script src="/app.js"></script>
  </body>
</html>`;
}
```

Add `renderCategoryPage` and `renderListingCard` to the `module.exports` block.

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `node --test src/seo/templates.test.js`
Expected: PASS (12 tests).

- [ ] **Step 4.5: Commit**

```bash
git add src/seo/templates.js src/seo/templates.test.js
git commit -m "feat(seo): add renderCategoryPage with ItemList JSON-LD"
```

---

## Task 5: Templates — job landing page

**Files:**

- Modify: `src/seo/templates.js`
- Modify: `src/seo/templates.test.js`

- [ ] **Step 5.1: Append failing tests**

Append to `src/seo/templates.test.js`:

```js
const { renderJobPage } = require("./templates");

test("renderJobPage emits H1 with job display name", () => {
  const html = renderJobPage("code-quality", [fixtureTool], {
    siteUrl,
    generatedAt: "2026-05-26",
  });
  assert.match(html, /<h1[^>]*>Claude Code Tools for Code Quality<\/h1>/);
});

test("renderJobPage canonical is /jobs/{slug}", () => {
  const html = renderJobPage("code-quality", [fixtureTool], {
    siteUrl,
    generatedAt: "2026-05-26",
  });
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.com\/jobs\/code-quality"\/>/,
  );
});

test("renderJobPage sets body[data-static-page=job]", () => {
  const html = renderJobPage("code-quality", [fixtureTool], {
    siteUrl,
    generatedAt: "2026-05-26",
  });
  assert.match(html, /<body[^>]*data-static-page="job"/);
});
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run: `node --test src/seo/templates.test.js`
Expected: FAIL on the 3 new tests.

- [ ] **Step 5.3: Implement `renderJobPage`**

Add to `src/seo/templates.js` above `module.exports`:

```js
function renderJobPage(job, tools, { siteUrl, generatedAt }) {
  const jobDisplay = JOB_DISPLAY[job] || job;
  const canonical = `${siteUrl}${jobUrl(job)}`;
  const title = `Claude Code Tools for ${jobDisplay} (2026)`;
  const intro = JOB_INTRO[job] || "";
  const description = `Top ${tools.length} Claude Code tools for ${jobDisplay.toLowerCase()}, ranked by quality. Updated ${generatedAt}.`;

  const ldItemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    itemListElement: tools.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${siteUrl}${toolUrl(t)}`,
      name: t.name,
    })),
  };
  const ldBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: jobDisplay,
        item: canonical,
      },
    ],
  };

  return `<!doctype html>
<html lang="en">
  <head>${renderHead({
    title,
    description,
    canonical,
    ogType: "website",
    ogImage: `${siteUrl}/og-default.png`,
    jsonLd: [ldItemList, ldBreadcrumb],
  })}</head>
  <body data-static-page="job">
    ${renderSiteHeader()}
    <main class="landing">
      ${renderBreadcrumbNav([{ label: "Home", href: "/" }, { label: jobDisplay }])}
      <h1>Claude Code Tools for ${escHtml(jobDisplay)}</h1>
      <p class="landing-intro">${escHtml(intro)}</p>
      <div class="listing-grid">${tools.map(renderListingCard).join("")}</div>
      <p class="landing-footer"><a href="/">Browse all tools →</a></p>
    </main>
    <script src="/app.js"></script>
  </body>
</html>`;
}
```

Add `renderJobPage` to `module.exports`. Also add `jobUrl` to the slug import at the top of the file:

```js
const { toolUrl, categoryUrl, jobUrl } = require("./slug");
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `node --test src/seo/templates.test.js`
Expected: PASS (15 tests).

- [ ] **Step 5.5: Commit**

```bash
git add src/seo/templates.js src/seo/templates.test.js
git commit -m "feat(seo): add renderJobPage matching category template structure"
```

---

## Task 6: Templates — homepage with seeded top 50

**Files:**

- Modify: `src/seo/templates.js`
- Modify: `src/seo/templates.test.js`

- [ ] **Step 6.1: Append failing tests**

Append to `src/seo/templates.test.js`:

```js
const { renderHomepage } = require("./templates");

test("renderHomepage embeds seed tool cards into #catalog-grid", () => {
  const tools = [fixtureTool, { ...fixtureTool, id: "y", name: "second" }];
  const html = renderHomepage(tools, { siteUrl });
  const gridMatch = html.match(
    /<div id="catalog-grid"[^>]*>([\s\S]*?)<\/div>\s*<\/main>/,
  );
  assert.ok(gridMatch, "catalog-grid present");
  assert.match(gridMatch[1], /pg-mcp/);
  assert.match(gridMatch[1], /second/);
});

test("renderHomepage omits data-static-page attribute on body", () => {
  const html = renderHomepage([fixtureTool], { siteUrl });
  assert.doesNotMatch(html, /<body[^>]*data-static-page=/);
});

test("renderHomepage emits WebSite JSON-LD with SearchAction", () => {
  const html = renderHomepage([fixtureTool], { siteUrl });
  const matches = [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ];
  const website = matches
    .map((m) => JSON.parse(m[1]))
    .find((j) => j["@type"] === "WebSite");
  assert.ok(website, "WebSite JSON-LD present");
  assert.strictEqual(website.potentialAction["@type"], "SearchAction");
});

test("renderHomepage canonical equals siteUrl + /", () => {
  const html = renderHomepage([fixtureTool], { siteUrl });
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.com\/"\/>/,
  );
});
```

- [ ] **Step 6.2: Run tests to verify they fail**

Run: `node --test src/seo/templates.test.js`
Expected: FAIL on the 4 new tests.

- [ ] **Step 6.3: Implement `renderHomepage`**

Add to `src/seo/templates.js` above `module.exports`:

```js
function renderHomepage(tools, { siteUrl }) {
  const canonical = `${siteUrl}/`;
  const title =
    "Claude Crawler — Discover & install the best Claude Code tools";
  const description =
    "A curated, security-scanned catalog of MCP servers, agents, skills, hooks, and templates for Claude Code — ranked by quality and updated continuously.";

  const ldWebsite = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Claude Crawler",
    url: canonical,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  // Seed the SPA grid so bots and slow-JS users see content immediately.
  // app.js detects the seed and replaces it on first applyFiltersAndRender().
  const seedCards = tools.map(renderListingCard).join("");

  return `<!doctype html>
<html lang="en">
  <head>${renderHead({
    title,
    description,
    canonical,
    ogType: "website",
    ogImage: `${siteUrl}/og-default.png`,
    jsonLd: [ldWebsite],
  })}</head>
  <body>
    ${renderSiteHeader()}
    <div class="layout">
      <aside class="sidebar">
        <section class="filter-section">
          <h3 class="filter-label">Category</h3>
          <div class="filter-group" id="filter-category">
            <button class="filter-btn active" data-value="all">All</button>
            <button class="filter-btn" data-value="mcp-servers">MCP Servers</button>
            <button class="filter-btn" data-value="agents">Agents</button>
            <button class="filter-btn" data-value="skills">Skills</button>
            <button class="filter-btn" data-value="templates">Templates</button>
            <button class="filter-btn" data-value="hooks">Hooks</button>
            <button class="filter-btn" data-value="tools">Tools</button>
            <button class="filter-btn" data-value="plugins">Plugins</button>
          </div>
        </section>
        <section class="filter-section">
          <h3 class="filter-label">Job</h3>
          <div class="filter-group" id="filter-job">
            <button class="filter-btn active" data-value="all">All</button>
            <button class="filter-btn" data-value="automate-workflow">Automate Workflow</button>
            <button class="filter-btn" data-value="code-quality">Code Quality</button>
            <button class="filter-btn" data-value="language-support">Language Support</button>
            <button class="filter-btn" data-value="external-services">External Services</button>
            <button class="filter-btn" data-value="ai-enhancement">AI Enhancement</button>
            <button class="filter-btn" data-value="project-management">Project Management</button>
          </div>
        </section>
        <section class="filter-section">
          <h3 class="filter-label">Source</h3>
          <div class="filter-group" id="filter-source">
            <button class="filter-btn active" data-value="all">All</button>
            <button class="filter-btn" data-value="github">GitHub</button>
            <button class="filter-btn" data-value="npm">npm</button>
            <button class="filter-btn" data-value="anthropic">Official</button>
            <button class="filter-btn" data-value="web">Community</button>
            <button class="filter-btn" data-value="ecc">Local</button>
          </div>
        </section>
        <section class="filter-section">
          <h3 class="filter-label">Sort by</h3>
          <select id="sort-select" class="sort-select">
            <option value="score">Score</option>
            <option value="stars">Stars</option>
            <option value="downloads">Downloads</option>
            <option value="updated">Newest</option>
            <option value="name">Name</option>
          </select>
        </section>
      </aside>
      <main class="main-content">
        <div id="toolbar" class="toolbar">
          <span id="result-count" class="result-count">Loading…</span>
          <label class="toggle-wrap"><input type="checkbox" id="hide-installed" /><span>Hide installed</span></label>
          <label class="toggle-wrap"><input type="checkbox" id="official-only" /><span>Official only</span></label>
        </div>
        <div id="catalog-grid" class="catalog-grid" data-seeded="true">${seedCards}</div>
      </main>
    </div>
    <script src="/app.js"></script>
  </body>
</html>`;
}
```

Add `renderHomepage` to `module.exports`.

- [ ] **Step 6.4: Run tests to verify they pass**

Run: `node --test src/seo/templates.test.js`
Expected: PASS (19 tests).

- [ ] **Step 6.5: Commit**

```bash
git add src/seo/templates.js src/seo/templates.test.js
git commit -m "feat(seo): add renderHomepage with seeded top-50 grid for crawlers"
```

---

## Task 7: Sitemap and robots.txt

**Files:**

- Create: `src/seo/sitemap.js`
- Create: `src/seo/sitemap.test.js`

- [ ] **Step 7.1: Write the failing tests**

Create `src/seo/sitemap.test.js`:

```js
"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { renderSitemap, renderRobotsTxt } = require("./sitemap");

const t1 = {
  name: "alpha",
  category: "mcp-servers",
  jobCategory: "external-services",
  updatedAt: "2026-04-01T00:00:00Z",
};
const t2 = {
  name: "beta",
  category: "mcp-servers",
  jobCategory: "code-quality",
  updatedAt: "2026-05-01T00:00:00Z",
};
const siteUrl = "https://example.com";

test("renderSitemap returns valid XML envelope", () => {
  const xml = renderSitemap([t1, t2], siteUrl);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org/);
  assert.match(xml, /<\/urlset>$/);
});

test("renderSitemap includes one <url> per tool", () => {
  const xml = renderSitemap([t1, t2], siteUrl);
  const urls = xml.match(/<url>/g) || [];
  // 2 tools + 1 category + 2 jobs + 1 homepage = 6
  assert.strictEqual(urls.length, 6);
  assert.match(xml, /https:\/\/example\.com\/tools\/mcp-servers\/alpha/);
  assert.match(xml, /https:\/\/example\.com\/tools\/mcp-servers\/beta/);
});

test("renderSitemap category lastmod is the max of its tools", () => {
  const xml = renderSitemap([t1, t2], siteUrl);
  const catBlock = xml.match(
    /<loc>https:\/\/example\.com\/categories\/mcp-servers<\/loc>[\s\S]*?<\/url>/,
  );
  assert.ok(catBlock);
  assert.match(catBlock[0], /<lastmod>2026-05-01/);
});

test("renderSitemap escapes XML entities in URLs", () => {
  const tricky = {
    name: "a&b",
    category: "mcp-servers",
    jobCategory: "external-services",
    updatedAt: "2026-04-01",
  };
  const xml = renderSitemap([tricky], siteUrl);
  assert.ok(!xml.includes("a&b"), "raw ampersand not present");
  // slugify already strips & to dash so the URL is safe regardless;
  // this test guards against future URL components containing entities.
});

test("renderSitemap handles empty catalog", () => {
  const xml = renderSitemap([], siteUrl);
  // Just the homepage URL, no errors.
  assert.match(xml, /<urlset/);
  const urls = xml.match(/<url>/g) || [];
  assert.strictEqual(urls.length, 1);
});

test("renderRobotsTxt includes sitemap line", () => {
  const txt = renderRobotsTxt(siteUrl);
  assert.match(txt, /User-agent: \*/);
  assert.match(txt, /Allow: \//);
  assert.match(txt, /Disallow: \/api\/user\//);
  assert.match(txt, /Disallow: \/api\/install\//);
  assert.match(txt, /Sitemap: https:\/\/example\.com\/sitemap\.xml/);
});
```

- [ ] **Step 7.2: Run tests to verify they fail**

Run: `node --test src/seo/sitemap.test.js`
Expected: FAIL — `Cannot find module './sitemap'`.

- [ ] **Step 7.3: Implement `src/seo/sitemap.js`**

```js
"use strict";

const { toolUrl, categoryUrl, jobUrl } = require("./slug");

function escXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isoDate(d) {
  if (!d) return new Date().toISOString().slice(0, 10);
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime()))
    return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function maxLastmod(tools) {
  if (!tools.length) return new Date().toISOString().slice(0, 10);
  const max = tools
    .map((t) => new Date(t.updatedAt || 0).getTime())
    .reduce((a, b) => (a > b ? a : b), 0);
  if (!max) return new Date().toISOString().slice(0, 10);
  return new Date(max).toISOString().slice(0, 10);
}

function groupBy(tools, key) {
  const map = new Map();
  for (const t of tools) {
    const k = t[key];
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(t);
  }
  return map;
}

function urlEntry(loc, lastmod) {
  return `  <url>\n    <loc>${escXml(loc)}</loc>\n    <lastmod>${escXml(lastmod)}</lastmod>\n  </url>`;
}

function renderSitemap(tools, siteUrl) {
  const entries = [];
  entries.push(urlEntry(`${siteUrl}/`, maxLastmod(tools)));

  for (const t of tools) {
    entries.push(urlEntry(`${siteUrl}${toolUrl(t)}`, isoDate(t.updatedAt)));
  }

  const byCategory = groupBy(tools, "category");
  for (const [cat, list] of byCategory) {
    entries.push(urlEntry(`${siteUrl}${categoryUrl(cat)}`, maxLastmod(list)));
  }

  const byJob = groupBy(tools, "jobCategory");
  for (const [job, list] of byJob) {
    entries.push(urlEntry(`${siteUrl}${jobUrl(job)}`, maxLastmod(list)));
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>`;
}

function renderRobotsTxt(siteUrl) {
  return `User-agent: *
Allow: /
Disallow: /api/user/
Disallow: /api/install/

Sitemap: ${siteUrl}/sitemap.xml
`;
}

module.exports = { renderSitemap, renderRobotsTxt };
```

- [ ] **Step 7.4: Run tests to verify they pass**

Run: `node --test src/seo/sitemap.test.js`
Expected: PASS (6 tests).

- [ ] **Step 7.5: Commit**

```bash
git add src/seo/sitemap.js src/seo/sitemap.test.js
git commit -m "feat(seo): add sitemap.xml + robots.txt renderers"
```

---

## Task 8: Generator — orchestrate file emission with collision handling

**Files:**

- Create: `src/seo/generator.js`
- Create: `src/seo/generator.test.js`

- [ ] **Step 8.1: Write the failing tests**

Create `src/seo/generator.test.js`:

```js
"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const os = require("node:os");
const fs = require("fs-extra");
const { generateStaticPages } = require("./generator");

const siteUrl = "https://example.com";

function makeTool(over) {
  return {
    id: `github:${over.author || "vendor"}/${over.name}`,
    name: over.name,
    displayName: over.name,
    author: over.author || "vendor",
    source: over.source || "github",
    category: over.category || "mcp-servers",
    jobCategory: over.jobCategory || "external-services",
    description: over.description || "desc",
    stars: 10,
    weeklyDownloads: 0,
    updatedAt: "2026-04-01T00:00:00Z",
    url: `https://github.com/${over.author || "vendor"}/${over.name}`,
    license: "MIT",
    contentWarnings: [],
    llmScore: null,
    score: 50,
    installConfig: { type: "github-repo", repoFullName: `vendor/${over.name}` },
    ...over,
  };
}

async function mkTmp() {
  return await fs.mkdtemp(path.join(os.tmpdir(), "seo-gen-"));
}

test("generateStaticPages writes one HTML per tool", async () => {
  const outDir = await mkTmp();
  try {
    const tools = [makeTool({ name: "alpha" }), makeTool({ name: "beta" })];
    await generateStaticPages(tools, { outDir, siteUrl });
    assert.ok(
      await fs.pathExists(path.join(outDir, "tools/mcp-servers/alpha.html")),
    );
    assert.ok(
      await fs.pathExists(path.join(outDir, "tools/mcp-servers/beta.html")),
    );
  } finally {
    await fs.remove(outDir);
  }
});

test("generateStaticPages writes index.html, sitemap.xml, robots.txt", async () => {
  const outDir = await mkTmp();
  try {
    await generateStaticPages([makeTool({ name: "alpha" })], {
      outDir,
      siteUrl,
    });
    assert.ok(await fs.pathExists(path.join(outDir, "index.html")));
    assert.ok(await fs.pathExists(path.join(outDir, "sitemap.xml")));
    assert.ok(await fs.pathExists(path.join(outDir, "robots.txt")));
  } finally {
    await fs.remove(outDir);
  }
});

test("generateStaticPages writes category and job landing pages", async () => {
  const outDir = await mkTmp();
  try {
    await generateStaticPages(
      [
        makeTool({
          name: "alpha",
          category: "mcp-servers",
          jobCategory: "external-services",
        }),
      ],
      { outDir, siteUrl },
    );
    assert.ok(
      await fs.pathExists(path.join(outDir, "categories/mcp-servers.html")),
    );
    assert.ok(
      await fs.pathExists(path.join(outDir, "jobs/external-services.html")),
    );
  } finally {
    await fs.remove(outDir);
  }
});

test("generateStaticPages disambiguates colliding slugs by appending source", async () => {
  const outDir = await mkTmp();
  try {
    const tools = [
      makeTool({ name: "auth-helper", source: "github", author: "a" }),
      makeTool({ name: "auth-helper", source: "npm", author: "b" }),
    ];
    await generateStaticPages(tools, { outDir, siteUrl });
    const dir = path.join(outDir, "tools/mcp-servers");
    const files = await fs.readdir(dir);
    assert.strictEqual(
      files.length,
      2,
      "two distinct files produced for colliding slugs",
    );
    assert.ok(files.includes("auth-helper.html"));
    assert.ok(files.some((f) => f.startsWith("auth-helper-")));
  } finally {
    await fs.remove(outDir);
  }
});

test("generateStaticPages sitemap references the rewritten collision URL", async () => {
  const outDir = await mkTmp();
  try {
    const tools = [
      makeTool({ name: "auth-helper", source: "github", author: "a" }),
      makeTool({ name: "auth-helper", source: "npm", author: "b" }),
    ];
    await generateStaticPages(tools, { outDir, siteUrl });
    const xml = await fs.readFile(path.join(outDir, "sitemap.xml"), "utf8");
    assert.match(xml, /\/tools\/mcp-servers\/auth-helper</);
    assert.match(xml, /\/tools\/mcp-servers\/auth-helper-/);
  } finally {
    await fs.remove(outDir);
  }
});

test("generateStaticPages skips tools that slugify to empty", async () => {
  const outDir = await mkTmp();
  try {
    const tools = [
      makeTool({ name: "🚀" }), // slugifies to ""
      makeTool({ name: "valid" }),
    ];
    const result = await generateStaticPages(tools, { outDir, siteUrl });
    assert.strictEqual(result.toolsWritten, 1);
    assert.strictEqual(result.toolsSkipped, 1);
  } finally {
    await fs.remove(outDir);
  }
});
```

- [ ] **Step 8.2: Run tests to verify they fail**

Run: `node --test src/seo/generator.test.js`
Expected: FAIL — `Cannot find module './generator'`.

- [ ] **Step 8.3: Implement `src/seo/generator.js`**

```js
"use strict";

const fs = require("fs-extra");
const path = require("node:path");
const {
  renderToolPage,
  renderCategoryPage,
  renderJobPage,
  renderHomepage,
} = require("./templates");
const { renderSitemap, renderRobotsTxt } = require("./sitemap");
const { slugify } = require("./slug");
const {
  CATEGORY_DISPLAY,
  JOB_DISPLAY,
  TOP_N_CATEGORY,
  TOP_N_JOB,
  TOP_N_RELATED,
  TOP_N_HOMEPAGE_SEED,
  WRITE_BATCH_SIZE,
} = require("./constants");

const DEFAULT_OUT_DIR = path.join(__dirname, "..", "..", "data/static");

// Resolve slug collisions per (category, slug) bucket.
// Returns a NEW array of tools with `_slug` (final slug) and `_url` set.
// Tools that slugify to empty are filtered out.
function assignSlugs(tools) {
  const seen = new Map();
  const result = [];
  let skipped = 0;
  for (const tool of tools) {
    const base = slugify(tool.name);
    if (!base) {
      skipped += 1;
      continue;
    }
    const category = tool.category || "tools";
    const key = `${category}/${base}`;
    const count = seen.get(key) || 0;
    seen.set(key, count + 1);
    const slug =
      count === 0 ? base : `${base}-${slugify(tool.source || String(count))}`;
    const finalUrl = `/tools/${category}/${slug}`;
    result.push({ ...tool, _slug: slug, _url: finalUrl });
  }
  return { tools: result, skipped };
}

async function writeBatched(tasks, batchSize) {
  // Bound parallelism to avoid EMFILE / file-handle exhaustion.
  for (let i = 0; i < tasks.length; i += batchSize) {
    await Promise.all(tasks.slice(i, i + batchSize).map((fn) => fn()));
  }
}

async function generateStaticPages(catalog, opts = {}) {
  const outDir = opts.outDir || DEFAULT_OUT_DIR;
  const siteUrl =
    opts.siteUrl ||
    process.env.SITE_URL ||
    `http://localhost:${process.env.PORT || 3737}`;
  const generatedAt = new Date().toISOString().slice(0, 10);

  await fs.ensureDir(outDir);

  const { tools, skipped } = assignSlugs(catalog);

  // For sitemap.xml: a parallel `toolUrl`-shaped accessor that uses `_url`.
  // We pass a shimmed array where `toolUrl(t)` would return `t._url` — but
  // because sitemap.js calls slug.toolUrl directly, we instead pre-render
  // the sitemap entries by replacing tool objects with ones that round-trip
  // through slugify(t.name) === t._slug. Simpler: build sitemap inline here
  // using `_url`.
  const toolUrlsForSitemap = tools.map((t) => ({
    name: t._slug, // slugify(_slug) === _slug, so toolUrl() yields t._url
    category: t.category,
    jobCategory: t.jobCategory,
    updatedAt: t.updatedAt,
  }));

  // Tool pages
  const writeTasks = [];
  for (const tool of tools) {
    const related = tools
      .filter(
        (other) =>
          other !== tool &&
          other.category === tool.category &&
          other._slug !== tool._slug,
      )
      .slice(0, TOP_N_RELATED);
    const html = renderToolPage(
      { ...tool, name: tool._slug, displayName: tool.displayName || tool.name },
      { siteUrl, relatedTools: related.map((r) => ({ ...r, name: r._slug })) },
    );
    const filePath = path.join(
      outDir,
      "tools",
      tool.category,
      `${tool._slug}.html`,
    );
    writeTasks.push(async () => {
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, html);
    });
  }

  // Category pages
  for (const category of Object.keys(CATEGORY_DISPLAY)) {
    const list = tools
      .filter((t) => t.category === category)
      .slice(0, TOP_N_CATEGORY)
      .map((t) => ({ ...t, name: t._slug }));
    if (list.length === 0) continue;
    const html = renderCategoryPage(category, list, { siteUrl, generatedAt });
    const filePath = path.join(outDir, "categories", `${category}.html`);
    writeTasks.push(async () => {
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, html);
    });
  }

  // Job pages
  for (const job of Object.keys(JOB_DISPLAY)) {
    const list = tools
      .filter((t) => t.jobCategory === job)
      .slice(0, TOP_N_JOB)
      .map((t) => ({ ...t, name: t._slug }));
    if (list.length === 0) continue;
    const html = renderJobPage(job, list, { siteUrl, generatedAt });
    const filePath = path.join(outDir, "jobs", `${job}.html`);
    writeTasks.push(async () => {
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, html);
    });
  }

  // Homepage
  const seed = tools
    .slice(0, TOP_N_HOMEPAGE_SEED)
    .map((t) => ({ ...t, name: t._slug }));
  const homeHtml = renderHomepage(seed, { siteUrl });
  writeTasks.push(async () =>
    fs.writeFile(path.join(outDir, "index.html"), homeHtml),
  );

  // Sitemap + robots
  const sitemapXml = renderSitemap(toolUrlsForSitemap, siteUrl);
  writeTasks.push(async () =>
    fs.writeFile(path.join(outDir, "sitemap.xml"), sitemapXml),
  );
  writeTasks.push(async () =>
    fs.writeFile(path.join(outDir, "robots.txt"), renderRobotsTxt(siteUrl)),
  );

  await writeBatched(writeTasks, WRITE_BATCH_SIZE);

  return {
    toolsWritten: tools.length,
    toolsSkipped: skipped,
    outDir,
    siteUrl,
  };
}

module.exports = { generateStaticPages, assignSlugs };
```

> Note: passing `name: t._slug` to the templates is a deliberate trick — it makes `toolUrl(t)` in templates return the same collision-rewritten URL the generator writes to disk. The display name comes from `displayName`. This keeps slug/URL logic centralized in `slug.js`.

- [ ] **Step 8.4: Run tests to verify they pass**

Run: `node --test src/seo/generator.test.js`
Expected: PASS (6 tests).

- [ ] **Step 8.5: Verify full SEO test suite passes**

Run: `node --test src/seo/*.test.js`
Expected: PASS (all SEO tests; ~36 total).

- [ ] **Step 8.6: Commit**

```bash
git add src/seo/generator.js src/seo/generator.test.js
git commit -m "feat(seo): add generator with batched writes and slug-collision rewrite"
```

---

## Task 9: Wire generator into Express pipeline

**Files:**

- Modify: `src/server.js`
- Modify: `env.example`
- Modify: `.gitignore`

- [ ] **Step 9.1: Add `data/static/` to `.gitignore`**

Open `.gitignore`. If `data/static/` is not already present, append:

```
data/static/
```

- [ ] **Step 9.2: Add `SITE_URL` documentation to `env.example`**

Open `env.example`. Append (or merge with existing block):

```bash
# Absolute site URL used for canonical, OG, and sitemap.
# Defaults to http://localhost:${PORT} if unset.
# REQUIRED for production indexing — Google ignores non-absolute canonicals.
SITE_URL=https://your-app.up.railway.app
```

- [ ] **Step 9.3: Add the static mount and generator hook in `src/server.js`**

In `src/server.js`, add near the other `require()`s at the top:

```js
const { generateStaticPages } = require("./seo/generator");
```

Replace the current static mount block:

```js
app.use(express.static(path.join(__dirname, "..", "public")));
```

with the two-mount form (order matters — `data/static/` first, `public/` falls through for `/app.js`, `/style.css`, etc.):

```js
// SEO static pages — must be mounted BEFORE public/ so /tools/... resolves
// to the pre-rendered HTML files instead of falling through to the SPA.
// `extensions: ["html"]` lets `/tools/x/y` resolve to `tools/x/y.html`.
app.use(
  express.static(path.join(__dirname, "..", "data/static"), {
    extensions: ["html"],
  }),
);
app.use(express.static(path.join(__dirname, "..", "public")));
```

In the `GET /api/catalog` handler, after `cache.set("catalog", scored)` and before `return scored`, add the fire-and-forget hook:

```js
generateStaticPages(scored).catch((err) =>
  console.error("SEO generation failed:", err),
);
```

In the `POST /api/catalog/refresh` handler, after `cache.set("catalog", scored)` and before `res.json(...)`, add the same line:

```js
generateStaticPages(scored).catch((err) =>
  console.error("SEO generation failed:", err),
);
```

- [ ] **Step 9.4: Verify server starts and writes static files**

Run in one terminal: `npm run dev`
In another: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3737/api/catalog`
Expected: `200`.

Wait ~3 seconds for fire-and-forget generation, then:

```bash
ls data/static/
ls data/static/tools/
test -f data/static/sitemap.xml && echo "sitemap OK"
test -f data/static/robots.txt && echo "robots OK"
test -f data/static/index.html && echo "homepage OK"
```

Expected: each `echo` line prints. `data/static/tools/` contains category subdirectories.

- [ ] **Step 9.5: Verify a pre-rendered tool page is served**

Pick one tool URL from the catalog (e.g., the first generated):

```bash
ls data/static/tools/mcp-servers/ | head -1
# Suppose it printed "pg-mcp.html". Then:
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3737/tools/mcp-servers/pg-mcp
```

Expected: `200` (the extension-less URL resolves via `extensions: ["html"]`).

```bash
curl -s http://localhost:3737/tools/mcp-servers/pg-mcp | grep -o '<title>[^<]*</title>'
```

Expected: a title that includes the tool name (not the SPA's `<title>Claude Crawler</title>`).

- [ ] **Step 9.6: Verify sitemap and robots are served**

```bash
curl -s http://localhost:3737/sitemap.xml | head -3
curl -s http://localhost:3737/robots.txt
```

Expected: well-formed XML; robots.txt body matching the template.

- [ ] **Step 9.7: Stop the dev server**

Press `Ctrl+C` in the `npm run dev` terminal.

- [ ] **Step 9.8: Commit**

```bash
git add src/server.js env.example .gitignore
git commit -m "feat(seo): wire generator into catalog pipeline and serve via static mount"
```

---

## Task 10: SPA hydration — make app.js aware of static pages

**Files:**

- Modify: `public/app.js`

- [ ] **Step 10.1: Read the current `DOMContentLoaded` block**

Read `public/app.js` lines 30-80 to confirm the boot sequence. The early-init block calls `loadCatalog()` unconditionally; we need to skip it on tool/category/job pages.

- [ ] **Step 10.2: Insert the static-page guard**

In `public/app.js`, find this section near the top of `DOMContentLoaded`:

```js
document.addEventListener("DOMContentLoaded", () => {
  // ... existing setup ...
  loadCatalog();
```

Replace the `loadCatalog();` call site with:

```js
const staticPage = document.body.dataset.staticPage;
if (
  staticPage === "tool" ||
  staticPage === "category" ||
  staticPage === "job"
) {
  // Pre-rendered landing — skip the catalog fetch and grid render.
  // Auth, save buttons, and bridge detection still bind below.
  if (typeof loadSavedTools === "function") {
    // After auth resolves, loadSavedTools() runs and the save heart on this
    // page updates via the existing delegate listener.
  }
} else {
  loadCatalog();
}
```

> If `loadCatalog();` is invoked from elsewhere on initial load, leave those call sites alone — they only run after user actions and the staticPage check above only protects the boot path.

- [ ] **Step 10.3: Make the homepage seed reconcile with the live catalog**

Find `applyFiltersAndRender` (around line 431) and the `renderGrid` it calls (around line 479). The grid element may have `data-seeded="true"` from the static homepage. The default render already calls `grid.innerHTML = ...`, which naturally replaces the seed. No code change required — but add an assertion comment near the start of `renderGrid`:

```js
function renderGrid() {
  const grid = document.getElementById("catalog-grid");
  if (!grid) return;
  // If the page was static-seeded, the first render replaces those cards
  // with the live, filterable catalog — no extra handling needed because
  // we always assign innerHTML below.
```

(Place the comment above the existing first line of the function body; do not change behavior.)

- [ ] **Step 10.4: Smoke-test the homepage and a tool page in the browser**

Run: `npm run dev`

Open `http://localhost:3737/` in a browser.

Verify:

- View source: the initial HTML contains tool cards inside `#catalog-grid` (visible without JS).
- After a moment, the live SPA grid replaces the seed cards.
- Filters, sign-in, refresh, NL search still work.

Open `http://localhost:3737/tools/mcp-servers/<some-slug>` (use one from `ls data/static/tools/mcp-servers/`).

Verify:

- Page renders with tool name, description, breadcrumb.
- Browser console shows no errors.
- Clicking the save heart triggers auth flow (sign in), then the heart fills.

Open the homepage again and click a category link → confirms `/categories/mcp-servers` resolves to a landing page with a tool grid.

Stop the dev server when done.

- [ ] **Step 10.5: Commit**

```bash
git add public/app.js
git commit -m "feat(seo): skip catalog fetch on static landing pages"
```

---

## Task 11: Style adjustments for new page types

**Files:**

- Modify: `public/style.css`

- [ ] **Step 11.1: Inspect current styles**

Read the existing classes referenced by the new templates (`tool-card`, `landing-grid`, etc.) in `public/style.css`. Most reuse existing classes (`tool-card`, `card-header`, `badge-mcp-servers`); the new ones introduced by templates are: `tool-detail`, `breadcrumb`, `crumb-sep`, `related-tools`, `related-grid`, `related-card`, `related-name`, `related-desc`, `landing`, `landing-intro`, `landing-footer`, `listing-grid`, `listing-card`, `listing-name`, `listing-meta`, `listing-desc`, `warnings`, `warning`, `warning-critical`.

- [ ] **Step 11.2: Append the missing styles**

Append to `public/style.css`:

```css
/* ── SEO landing + detail page styles ── */
.tool-detail,
.landing {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 32px;
}
.breadcrumb {
  font-size: 14px;
  color: var(--text-muted, #888);
  margin-bottom: 16px;
}
.breadcrumb a {
  color: var(--text-muted, #888);
  text-decoration: none;
}
.breadcrumb a:hover {
  color: var(--text, #ddd);
  text-decoration: underline;
}
.crumb-sep {
  margin: 0 6px;
}
.tool-card.detail {
  padding: 24px;
}
.tool-card.detail .card-name {
  font-size: 28px;
  margin: 0 0 4px;
}
.warnings {
  margin-top: 16px;
  padding: 12px 16px;
  background: rgba(255, 100, 100, 0.08);
  border-left: 3px solid rgba(255, 100, 100, 0.6);
  border-radius: 4px;
}
.warnings ul {
  margin: 8px 0 0;
  padding-left: 20px;
}
.warning-critical {
  color: #ff7070;
}
.related-tools {
  margin-top: 32px;
}
.related-grid,
.listing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
  margin-top: 12px;
}
.related-card,
.listing-card {
  display: block;
  padding: 12px 14px;
  background: var(--card-bg, #1a1a1a);
  border: 1px solid var(--border, #2a2a2a);
  border-radius: 6px;
  color: inherit;
  text-decoration: none;
  transition:
    border-color 120ms,
    transform 120ms;
}
.related-card:hover,
.listing-card:hover {
  border-color: var(--accent, #6c8eff);
  transform: translateY(-1px);
}
.related-name,
.listing-name {
  font-weight: 600;
  font-size: 15px;
}
.related-desc,
.listing-desc {
  font-size: 13px;
  color: var(--text-muted, #999);
  margin-top: 6px;
}
.listing-meta {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted, #888);
  margin-top: 4px;
}
.landing h1 {
  margin: 8px 0 12px;
}
.landing-intro {
  font-size: 15px;
  color: var(--text-muted, #aaa);
  max-width: 720px;
}
.landing-footer {
  margin-top: 24px;
  font-size: 14px;
}
.logo-link {
  text-decoration: none;
  color: inherit;
}
```

(If existing CSS variable names differ — `--text`, `--text-muted`, `--card-bg`, `--border`, `--accent` — adapt to the names actually in use. Inspect the top of `public/style.css` for the `:root` block before saving.)

- [ ] **Step 11.3: Reload and visually verify**

Run: `npm run dev`. Open a tool page, category page, and the homepage. Confirm cards are styled, breadcrumb is readable, and the layout doesn't shift visibly when the SPA hydrates the homepage grid.

Stop the dev server.

- [ ] **Step 11.4: Commit**

```bash
git add public/style.css
git commit -m "feat(seo): style landing pages, breadcrumbs, and related tool cards"
```

---

## Task 12: Placeholder OG image

**Files:**

- Create: `public/og-default.png`

- [ ] **Step 12.1: Add a placeholder 1200×630 PNG**

Generate a tiny solid-color PNG (any 1200×630 image will satisfy crawlers; a real branded image is out of scope and tracked separately):

```bash
# Use any image source — ImageMagick if available, else a Node one-liner:
node -e '
const fs = require("fs");
// Minimal valid 1x1 PNG, browsers and Facebook accept it as a fallback;
// crawlers prefer a real image, but anything > 0 bytes is non-blocking.
// 1x1 transparent PNG, base64-decoded:
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);
fs.writeFileSync("public/og-default.png", png);
'
```

Verify: `file public/og-default.png` (or equivalent) reports a PNG.

> Replacing this with a branded 1200×630 image is a content task, not a code task — it can be swapped without code changes.

- [ ] **Step 12.2: Commit**

```bash
git add public/og-default.png
git commit -m "feat(seo): add placeholder og-default.png (replace with brand asset later)"
```

---

## Task 13: Update CLAUDE.md and ROADMAP

**Files:**

- Modify: `CLAUDE.md`
- Modify: `docs/ROADMAP.md`

- [ ] **Step 13.1: Document the SEO module in CLAUDE.md**

Open `CLAUDE.md`. In the **Architecture** section, add a new subsection after "Stage 2: Preview + install":

```markdown
### Stage 3: Static pre-rendering (SEO)

`src/seo/generator.js` runs as a fire-and-forget side effect after `scoreCatalog` completes in both `GET /api/catalog` and `POST /api/catalog/refresh`. It writes pre-rendered HTML for every tool, category, and job, plus `sitemap.xml`, `robots.txt`, and the homepage `index.html` (with the top 50 tools seeded into `#catalog-grid`), to `data/static/`. Express mounts `data/static/` ahead of `public/` with `extensions: ["html"]`, so `/tools/{category}/{slug}` resolves to a static file while `/app.js` and `/style.css` fall through to `public/`.

`src/seo/slug.js` is the single source of truth for URL generation (`toolUrl`, `categoryUrl`, `jobUrl`). `src/seo/templates.js` contains pure render functions (no I/O). `src/seo/sitemap.js` produces the XML. The generator handles slug collisions per-category by appending `-${slugify(source)}` to the duplicate.
```

In the **Critical invariants** section, append:

```markdown
**SEO generation must stay fire-and-forget.** `generateStaticPages(scored).catch(...)` is called without `await` so HTTP responses are not delayed. Errors are logged but never propagate. Do not switch this to `await` — a slow filesystem (Railway cold start, full disk, etc.) would block the API.

**Static mount order matters.** `data/static/` is mounted in `server.js` BEFORE `public/`. Reversing the order would serve the SPA shell for every `/tools/...` URL and silently break SEO.

**`SITE_URL` is required for production.** Canonical URLs, OG tags, and sitemap `<loc>` entries all use it. Without it, Google ignores canonicals (because relative URLs are not allowed there) and ranking suffers. Defaults to `http://localhost:${PORT}` in dev.
```

In the **Repository layout** section, add:

```markdown
- `src/seo/` — generator, templates, sitemap, slug helpers (pre-renders catalog into `data/static/`)
- `data/static/` — gitignored output: per-tool HTML, category/job landings, sitemap.xml, robots.txt, homepage
```

- [ ] **Step 13.2: Update ROADMAP**

Open `docs/ROADMAP.md`. Find the SEO entry and mark SEO-1 as shipped, with a pointer to this plan and the spec. Add a one-line note that SEO-2 (content) and SEO-3 (analytics) are still open.

- [ ] **Step 13.3: Commit**

```bash
git add CLAUDE.md docs/ROADMAP.md
git commit -m "docs: document SEO module, static mount invariants, and SITE_URL"
```

---

## Task 14: Validation pass — full test suite + Lighthouse + Rich Results

**Files:** none (verification only)

- [ ] **Step 14.1: Run the full test suite**

Run: `npm test`
Expected: all existing tests still pass; the new ~30 SEO tests pass; zero failures.

- [ ] **Step 14.2: Cold-start generation timing**

Delete `data/static/` and start the server cold:

```bash
rm -rf data/static
npm run dev
```

In another terminal, time the catalog request:

```bash
time curl -s -o /dev/null http://localhost:3737/api/catalog
sleep 5
ls data/static/tools/mcp-servers/ | wc -l
ls data/static/categories/ | wc -l
ls data/static/jobs/ | wc -l
```

Expected: API responds in roughly the same time as before SEO-1 (fire-and-forget); after 5 seconds the static dirs are populated.

- [ ] **Step 14.3: Lighthouse SEO score**

In Chrome devtools → Lighthouse → run an SEO-only audit on:

- `http://localhost:3737/`
- `http://localhost:3737/tools/mcp-servers/<some-slug>`

Expected: SEO score ≥ 95 on both.

If a check fails, fix in `templates.js` and re-run. Common fixes:

- Missing `<meta name="viewport">` → already present.
- Document does not have a meta description → already present (truncate logic).
- Links do not have descriptive text → use tool name as link text (already true).

- [ ] **Step 14.4: Rich Results validation**

Open https://search.google.com/test/rich-results in a browser. Paste a rendered tool page HTML (copy from `data/static/tools/.../*.html`) into the "Code" tab.

Expected: at least one detected item (SoftwareApplication or BreadcrumbList) reports as valid with zero errors. Warnings (`aggregateRating recommended`) are acceptable.

- [ ] **Step 14.5: Stop the server**

Press `Ctrl+C`.

- [ ] **Step 14.6: Final commit if any fixes were applied**

If steps 14.3 or 14.4 surfaced fixes, commit them:

```bash
git add <fixed files>
git commit -m "fix(seo): address Lighthouse/Rich Results validation findings"
```

Otherwise, no commit needed for this task.

---

## Self-Review Checklist (done before handoff)

- **Spec coverage:** Every success-criteria checkbox from `2026-05-26-seo-1-technical-foundation-design.md` maps to at least one task above. Tool URLs → Task 1 + 8. Category/job pages → Tasks 4, 5, 8. Sitemap → Task 7. robots.txt → Task 7. Homepage seed → Task 6 + 8. Lighthouse ≥95 → Task 14.3. Rich Results validation → Task 14.4. Existing tests pass → Task 14.1. SPA regressions → Task 10.4.
- **Placeholders:** No "TBD", no "add appropriate handling", no "similar to Task N" without code. Every code step contains the actual code to write.
- **Type/method consistency:** Function names line up across tasks — `slugify`, `toolUrl`, `categoryUrl`, `jobUrl` (Task 1) used by templates (Tasks 3–6), sitemap (Task 7), and generator (Task 8). `generateStaticPages` signature `(catalog, opts)` matches between Task 8 implementation and Task 9 wire-up. The `_slug`/`_url`/`displayName` trick (Task 8.3 note) is the documented contract between generator and templates.

---

## Plan complete

Plan saved to `docs/superpowers/plans/2026-05-26-seo-1-technical-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
