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

  // For sitemap.xml: pass tool-shaped objects where `name === _slug`, so that
  // sitemap.js's internal `toolUrl(t)` (which does slugify(t.name)) yields the
  // collision-rewritten URL. slugify is idempotent on already-slugified input.
  const toolUrlsForSitemap = tools.map((t) => ({
    name: t._slug,
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
