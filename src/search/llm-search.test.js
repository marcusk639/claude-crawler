"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { naturalLanguageSearch } = require("./llm-search");

const fakeCatalog = [
  {
    id: "npm:pg-mcp",
    name: "pg-mcp",
    description: "PostgreSQL MCP server for database queries",
    topics: ["postgres", "database", "mcp-server"],
    stars: 100,
    weeklyDownloads: 500,
    score: 70,
  },
  {
    id: "github:weather-agent",
    name: "weather-agent",
    description: "Fetches weather forecasts via Claude Code",
    topics: ["weather", "agent"],
    stars: 50,
    weeklyDownloads: 0,
    score: 40,
  },
];

test("naturalLanguageSearch throws when LLM_API_KEY is not set", async () => {
  delete process.env.LLM_API_KEY;
  await assert.rejects(
    () => naturalLanguageSearch("find me a database tool", fakeCatalog),
    { message: /LLM_API_KEY/ },
  );
});

test("naturalLanguageSearch rejects query shorter than 3 chars", async () => {
  process.env.LLM_API_KEY = "fake";
  await assert.rejects(() => naturalLanguageSearch("db", fakeCatalog), {
    message: /3/,
  });
  delete process.env.LLM_API_KEY;
});

test("naturalLanguageSearch rejects query longer than 500 chars", async () => {
  process.env.LLM_API_KEY = "fake";
  await assert.rejects(
    () => naturalLanguageSearch("x".repeat(501), fakeCatalog),
    { message: /500/ },
  );
  delete process.env.LLM_API_KEY;
});

test("naturalLanguageSearch rejects empty/whitespace query", async () => {
  process.env.LLM_API_KEY = "fake";
  await assert.rejects(() => naturalLanguageSearch("   ", fakeCatalog), {
    message: /3/,
  });
  delete process.env.LLM_API_KEY;
});

test("naturalLanguageSearch rejects non-string query", async () => {
  process.env.LLM_API_KEY = "fake";
  await assert.rejects(() => naturalLanguageSearch(null, fakeCatalog), {
    message: /3/,
  });
  delete process.env.LLM_API_KEY;
});
