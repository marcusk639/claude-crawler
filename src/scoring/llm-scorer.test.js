"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const longReadme = "x".repeat(300);
const baseTool = {
  id: "test:pkg",
  name: "test-pkg",
  description: "A test package",
  readme: longReadme,
  topics: [],
  stars: 0,
  weeklyDownloads: 0,
  updatedAt: new Date().toISOString(),
};

test("scoreWithLLM returns null when LLM_API_KEY is not set", async () => {
  delete process.env.LLM_API_KEY;
  const { scoreWithLLM } = require("./llm-scorer");
  const result = await scoreWithLLM(baseTool);
  assert.strictEqual(result, null, "Should return null when no API key");
});

test("scoreWithLLM returns null for readme shorter than 200 chars", async () => {
  delete process.env.LLM_API_KEY;
  const { scoreWithLLM } = require("./llm-scorer");
  const result = await scoreWithLLM({ ...baseTool, readme: "too short" });
  assert.strictEqual(result, null);
});

test("scoreWithLLM returns null when readme is missing entirely", async () => {
  delete process.env.LLM_API_KEY;
  const { scoreWithLLM } = require("./llm-scorer");
  const result = await scoreWithLLM({ ...baseTool, readme: undefined });
  assert.strictEqual(result, null);
});
