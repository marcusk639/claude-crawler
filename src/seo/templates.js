"use strict";

const { toolUrl, categoryUrl, jobUrl } = require("./slug");
const { CATEGORY_DISPLAY } = require("./constants");
const { CATEGORY_INTRO, JOB_INTRO, JOB_DISPLAY } = require("./constants");

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

module.exports = {
  renderToolPage,
  renderCategoryPage,
  renderJobPage,
  renderListingCard,
  // exported for testing and reuse by later tasks
  escHtml,
  truncate,
  safeJsonLd,
  renderHead,
  renderSiteHeader,
  renderBreadcrumbNav,
  categoryDisplay,
};
