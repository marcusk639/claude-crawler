"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

// We test the middleware logic in isolation by constructing it with a mock admin.
// This avoids needing real Firebase credentials in CI.
function makeMiddleware(mockAdmin) {
  return async function verifyFirebaseToken(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    if (!mockAdmin.apps.length) {
      return res.status(503).json({ ok: false, error: "Auth not configured" });
    }
    try {
      const token = auth.slice(7);
      const decoded = await mockAdmin.auth().verifyIdToken(token);
      req.uid = decoded.uid;
      next();
    } catch {
      return res.status(401).json({ ok: false, error: "Invalid token" });
    }
  };
}

function mockRes() {
  const r = { _code: 200, _body: null };
  r.status = (code) => {
    r._code = code;
    return r;
  };
  r.json = (body) => {
    r._body = body;
  };
  return r;
}

const uninitAdmin = { apps: [] };
const initAdmin = {
  apps: [true],
  auth: () => ({
    verifyIdToken: async (token) => {
      if (token === "valid-token") return { uid: "user-abc" };
      throw new Error("Token invalid or expired");
    },
  }),
};

test("returns 401 when Authorization header is missing", async () => {
  const middleware = makeMiddleware(initAdmin);
  const req = { headers: {} };
  const res = mockRes();
  await middleware(req, res, () => {});
  assert.strictEqual(res._code, 401);
  assert.strictEqual(res._body.ok, false);
});

test("returns 401 when Authorization header does not start with Bearer", async () => {
  const middleware = makeMiddleware(initAdmin);
  const req = { headers: { authorization: "Basic abc123" } };
  const res = mockRes();
  await middleware(req, res, () => {});
  assert.strictEqual(res._code, 401);
});

test("returns 503 when Firebase is not configured", async () => {
  const middleware = makeMiddleware(uninitAdmin);
  const req = { headers: { authorization: "Bearer some-token" } };
  const res = mockRes();
  await middleware(req, res, () => {});
  assert.strictEqual(res._code, 503);
  assert.match(res._body.error, /not configured/);
});

test("returns 401 when token is invalid", async () => {
  const middleware = makeMiddleware(initAdmin);
  const req = { headers: { authorization: "Bearer bad-token" } };
  const res = mockRes();
  await middleware(req, res, () => {});
  assert.strictEqual(res._code, 401);
  assert.strictEqual(res._body.error, "Invalid token");
});

test("calls next() and sets req.uid on valid token", async () => {
  const middleware = makeMiddleware(initAdmin);
  const req = { headers: { authorization: "Bearer valid-token" } };
  const res = mockRes();
  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });
  assert.ok(nextCalled, "next() should have been called");
  assert.strictEqual(req.uid, "user-abc");
});
