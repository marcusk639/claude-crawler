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
