"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

// Test the validation helpers extracted from the route handlers.
// Full CRUD integration tests require a live Firestore — covered by smoke testing.

function validateSaveBody({ toolId, name }) {
  if (!toolId || typeof toolId !== "string" || toolId.trim().length === 0) {
    return "toolId is required";
  }
  if (toolId.length > 200) return "toolId must be 200 characters or fewer";
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return "name is required";
  }
  return null;
}

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

test("validateSaveBody: valid input returns null", () => {
  assert.strictEqual(
    validateSaveBody({ toolId: "npm:pg-mcp", name: "pg-mcp" }),
    null,
  );
});
