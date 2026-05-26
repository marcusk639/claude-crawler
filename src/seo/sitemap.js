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
