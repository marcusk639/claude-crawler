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
