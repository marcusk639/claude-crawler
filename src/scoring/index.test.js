"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { scoreCatalog, computeScore } = require("./index");

const base = {
  id: "test:base",
  name: "base-tool",
  description: "A reasonably described tool",
  readme: "README content here, long enough.",
  topics: [],
  stars: 100,
  weeklyDownloads: 0,
  updatedAt: new Date().toISOString(),
  hasReadme: true,
  isOfficial: false,
  communityMentions: 0,
  communityScore: 0,
  license: "MIT",
  source: "github",
};

test("computeScore stays within 0..100 bounds", () => {
  const s1 = computeScore({ ...base, stars: 0, weeklyDownloads: 0 });
  assert.ok(s1 >= 0 && s1 <= 100, `lower bound: got ${s1}`);
  const s2 = computeScore({
    ...base,
    stars: 100000,
    weeklyDownloads: 1000000,
    isOfficial: true,
    communityMentions: 50,
    communityScore: 10000,
  });
  assert.ok(s2 >= 0 && s2 <= 100, `upper bound: got ${s2}`);
});

test("scoreCatalog returns tools sorted by score descending", async () => {
  delete process.env.LLM_API_KEY;
  const tools = [
    { ...base, id: "low", stars: 1 },
    { ...base, id: "high", stars: 5000 },
    { ...base, id: "mid", stars: 100 },
  ];
  const scored = await scoreCatalog(tools);
  assert.strictEqual(scored.length, 3);
  assert.ok(
    scored[0].score >= scored[1].score && scored[1].score >= scored[2].score,
    `not sorted desc: ${scored.map((t) => t.score).join(", ")}`,
  );
  assert.strictEqual(scored[0].id, "high");
});

test("scoreCatalog yields null llmScore when LLM_API_KEY is absent", async () => {
  delete process.env.LLM_API_KEY;
  const tools = [{ ...base, id: "no-llm" }];
  const [result] = await scoreCatalog(tools);
  assert.ok(typeof result.score === "number");
  assert.strictEqual(result.llmScore, null);
});

test("computeScore applies LLM penalty for high securityRisk", () => {
  const safe = computeScore({
    ...base,
    llmScore: {
      documentationQuality: 15,
      installabilityScore: 15,
      maintenanceSignals: 15,
      securityRisk: 0,
      relevanceToClaudeCode: 15,
    },
  });
  const risky = computeScore({
    ...base,
    llmScore: {
      documentationQuality: 15,
      installabilityScore: 15,
      maintenanceSignals: 15,
      securityRisk: 20,
      relevanceToClaudeCode: 15,
    },
  });
  assert.ok(safe > risky, `safe (${safe}) should beat risky (${risky})`);
});
