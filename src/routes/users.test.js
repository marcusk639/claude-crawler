"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

// Import the actual production helpers so tests exercise the live code path.
// The Router itself can't be unit-tested without a live Firestore; the helpers can.
const { validateSaveBody, validateToolIdParam } = require("./users");

// ── validateSaveBody ────────────────────────────────────────────────────────

test("validateSaveBody: missing toolId returns error", () => {
  assert.strictEqual(
    validateSaveBody({ name: "pg-mcp" }),
    "toolId is required",
  );
});

test("validateSaveBody: empty toolId returns error", () => {
  assert.strictEqual(
    validateSaveBody({ toolId: "  ", name: "pg-mcp" }),
    "toolId is required",
  );
});

test("validateSaveBody: toolId > 200 chars returns error", () => {
  assert.strictEqual(
    validateSaveBody({ toolId: "x".repeat(201), name: "pg-mcp" }),
    "toolId must be 200 characters or fewer",
  );
});

test("validateSaveBody: missing name returns error", () => {
  assert.strictEqual(
    validateSaveBody({ toolId: "npm:pg-mcp" }),
    "name is required",
  );
});

test("validateSaveBody: non-string name returns error", () => {
  assert.strictEqual(
    validateSaveBody({ toolId: "npm:pg-mcp", name: 42 }),
    "name is required",
  );
});

test("validateSaveBody: valid input returns null", () => {
  assert.strictEqual(
    validateSaveBody({ toolId: "npm:pg-mcp", name: "pg-mcp" }),
    null,
  );
});

// ── validateToolIdParam (used on DELETE path) ───────────────────────────────

test("validateToolIdParam: empty string returns error", () => {
  assert.strictEqual(validateToolIdParam(""), "toolId is required");
});

test("validateToolIdParam: whitespace-only returns error", () => {
  assert.strictEqual(validateToolIdParam("   "), "toolId is required");
});

test("validateToolIdParam: > 200 chars returns error", () => {
  assert.strictEqual(
    validateToolIdParam("x".repeat(201)),
    "toolId must be 200 characters or fewer",
  );
});

test("validateToolIdParam: non-string returns error", () => {
  assert.strictEqual(validateToolIdParam(42), "toolId is required");
  assert.strictEqual(validateToolIdParam(undefined), "toolId is required");
  assert.strictEqual(validateToolIdParam(null), "toolId is required");
});

test("validateToolIdParam: valid id returns null", () => {
  assert.strictEqual(validateToolIdParam("npm:pg-mcp"), null);
});
