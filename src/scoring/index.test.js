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

// ── P1a additions: integer / +10 official / -20 penalty / recency / sort ─────

const baseClean = {
  stars: 0,
  weeklyDownloads: 0,
  updatedAt: new Date().toISOString(),
  hasReadme: false,
  readme: "",
  description: "A useful tool",
  isOfficial: false,
  communityMentions: 0,
  communityScore: 0,
  contentWarnings: [],
  license: "MIT",
  source: "github",
};

test("score is a non-negative integer", () => {
  const s = computeScore(baseClean);
  assert.ok(Number.isInteger(s), "score must be integer");
  assert.ok(s >= 0, "score must be >= 0");
});

test("official tools get +10 pts over identical non-official", () => {
  const unofficial = computeScore(baseClean);
  const official = computeScore({ ...baseClean, isOfficial: true });
  assert.strictEqual(official - unofficial, 10);
});

test("each content warning applies a -20pt penalty", () => {
  const clean = computeScore(baseClean);
  const oneFlag = computeScore({
    ...baseClean,
    contentWarnings: [{ severity: "critical", label: "test" }],
  });
  assert.strictEqual(clean - oneFlag, 20);
});

test("score is clamped to 0 — never goes negative", () => {
  const manyFlags = computeScore({
    ...baseClean,
    contentWarnings: Array(10).fill({ severity: "critical", label: "x" }),
    description: "",
  });
  assert.strictEqual(manyFlags, 0);
});

test("recent tool scores higher on recency than 400-day-old tool", () => {
  const recent = computeScore({
    ...baseClean,
    updatedAt: new Date().toISOString(),
  });
  const old = computeScore({
    ...baseClean,
    updatedAt: new Date(Date.now() - 400 * 86_400_000).toISOString(),
  });
  assert.ok(recent > old, `recent=${recent} should be > old=${old}`);
});

test("tool older than 365 days gets 0 recency pts", () => {
  const veryOld = computeScore({
    ...baseClean,
    updatedAt: new Date(Date.now() - 400 * 86_400_000).toISOString(),
  });
  const evenOlder = computeScore({
    ...baseClean,
    updatedAt: new Date(Date.now() - 800 * 86_400_000).toISOString(),
  });
  assert.strictEqual(veryOld, evenOlder, "both should get 0 recency pts");
});

test("tool with stars scores higher than identical tool with 0 stars", () => {
  const withStars = computeScore({ ...baseClean, stars: 1000 });
  const noStars = computeScore(baseClean);
  assert.ok(withStars > noStars);
});

test("scoreCatalog adds contentWarnings and score fields", async () => {
  delete process.env.LLM_API_KEY;
  const tools = [{ ...baseClean, id: "a" }];
  const [result] = await scoreCatalog(tools);
  assert.ok(Array.isArray(result.contentWarnings));
  assert.ok(typeof result.score === "number");
});
