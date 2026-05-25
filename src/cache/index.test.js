"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const cache = require("./index");

test("get returns null for unknown key", () => {
  cache.clear();
  assert.strictEqual(cache.get("missing"), null);
});

test("set and get round-trips a value", () => {
  cache.clear();
  cache.set("k", { data: 42 });
  assert.deepStrictEqual(cache.get("k"), { data: 42 });
});

test("del removes an entry", () => {
  cache.clear();
  cache.set("todel", "value");
  cache.del("todel");
  assert.strictEqual(cache.get("todel"), null);
});

test("get returns null after TTL expires", async () => {
  cache.clear();
  cache.set("expiring", "value", 0);
  await new Promise((r) => setTimeout(r, 5));
  assert.strictEqual(cache.get("expiring"), null);
});

test("size() counts only live entries, not expired ones", async () => {
  cache.clear();
  cache.set("live", "value", 60);
  cache.set("dead", "value", 0);
  await new Promise((r) => setTimeout(r, 5));
  assert.strictEqual(cache.size(), 1);
});

test("clear() removes all entries", () => {
  cache.set("a", 1);
  cache.set("b", 2);
  cache.clear();
  assert.strictEqual(cache.size(), 0);
});
