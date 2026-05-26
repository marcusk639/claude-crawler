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
