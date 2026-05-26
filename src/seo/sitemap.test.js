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
