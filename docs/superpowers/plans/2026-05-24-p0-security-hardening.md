# P0 Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rate limiting to install endpoints and an optional auth token to the catalog refresh endpoint, preventing filesystem abuse and API quota exhaustion.

**Architecture:** Two independent middleware additions to `src/server.js`. Rate limiting uses `express-rate-limit` (a standard Express middleware). The refresh auth is a custom inline middleware that reads `REFRESH_SECRET` from env — if unset, it's a no-op (dev-friendly). Both changes are additive; no existing route logic changes.

**Tech Stack:** Node.js, Express, `express-rate-limit` (new dep)

---

### Task 1: Install express-rate-limit and verify the package installs cleanly

**Files:**

- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install the package**

```bash
npm install express-rate-limit
```

- [ ] **Step 2: Verify it appears in package.json**

```bash
grep express-rate-limit package.json
```

Expected output:

```
"express-rate-limit": "^7.x.x"
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add express-rate-limit dependency"
```

---

### Task 2: Add rate limiting to install endpoints

**Files:**

- Modify: `src/server.js`

- [ ] **Step 1: Add the rate limiter imports and definitions at the top of server.js, after the existing requires**

Open `src/server.js`. After the `const cache = require('./cache');` line, add:

```javascript
const rateLimit = require("express-rate-limit");

const installLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many install requests. Try again in a minute.",
  },
});

const previewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many preview requests. Try again in a minute.",
  },
});
```

- [ ] **Step 2: Apply the limiter to the execute route**

Find this line in `src/server.js`:

```javascript
app.post("/api/install/execute", async (req, res) => {
```

Change it to:

```javascript
app.post("/api/install/execute", installLimiter, async (req, res) => {
```

- [ ] **Step 3: Apply the limiter to the preview route**

Find this line in `src/server.js`:

```javascript
app.post("/api/install/preview", async (req, res) => {
```

Change it to:

```javascript
app.post("/api/install/preview", previewLimiter, async (req, res) => {
```

- [ ] **Step 4: Manual smoke test — verify the server still starts**

```bash
npm start
```

Expected: `Claude Crawler running at http://localhost:3737` — no errors.

Stop with Ctrl+C.

- [ ] **Step 5: Manual smoke test — verify rate limit fires**

```bash
npm start &
# Send 11 POST requests in rapid succession
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3737/api/install/execute \
    -H 'Content-Type: application/json' \
    -d '{"tool":{"name":"test","category":"agents","installConfig":{"type":"local"}}}'
done
```

Expected: First 10 lines print `400` (invalid tool, but passes rate limit), 11th prints `429`.

Stop the server: `kill %1`

- [ ] **Step 6: Commit**

```bash
git add src/server.js
git commit -m "feat(security): rate limit install endpoints (10/min execute, 30/min preview)"
```

---

### Task 3: Add optional auth token to /api/catalog/refresh

**Files:**

- Modify: `src/server.js`
- Modify: `env.example`

- [ ] **Step 1: Add the auth middleware function to server.js**

In `src/server.js`, after the `VALID_CATEGORIES` block and before the `validateTool` function, add:

```javascript
function requireRefreshSecret(req, res, next) {
  const secret = process.env.REFRESH_SECRET;
  if (!secret) return next(); // no secret configured — open in dev mode
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  next();
}
```

- [ ] **Step 2: Apply it to the refresh route**

Find this line in `src/server.js`:

```javascript
app.post("/api/catalog/refresh", async (req, res) => {
```

Change it to:

```javascript
app.post("/api/catalog/refresh", requireRefreshSecret, async (req, res) => {
```

- [ ] **Step 3: Update the startup log to show whether the endpoint is protected**

Find the startup log block in `src/server.js`:

```javascript
app.listen(PORT, "127.0.0.1", () => {
  console.log(`\nClaude Crawler running at http://localhost:${PORT}`);
  console.log(
    `GitHub API: ${process.env.GITHUB_TOKEN ? "authenticated (5000 req/hr)" : "unauthenticated (60 req/hr)"}`,
  );
  console.log(
    `Google Search: ${process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID ? "enabled" : "disabled"}\n`,
  );
});
```

Change it to:

```javascript
app.listen(PORT, "127.0.0.1", () => {
  console.log(`\nClaude Crawler running at http://localhost:${PORT}`);
  console.log(
    `GitHub API: ${process.env.GITHUB_TOKEN ? "authenticated (5000 req/hr)" : "unauthenticated (60 req/hr)"}`,
  );
  console.log(
    `Google Search: ${process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID ? "enabled" : "disabled"}`,
  );
  console.log(
    `Refresh endpoint: ${process.env.REFRESH_SECRET ? "protected (REFRESH_SECRET set)" : "open (set REFRESH_SECRET to protect)"}\n`,
  );
});
```

- [ ] **Step 4: Add REFRESH_SECRET to env.example**

Open `env.example` and add:

```
# Optional: protects POST /api/catalog/refresh from unauthenticated calls.
# Without this, the endpoint is open (fine for local-only use).
# REFRESH_SECRET=change-me
```

- [ ] **Step 5: Manual smoke test — verify unprotected mode still works**

```bash
npm start &
curl -s -X POST http://localhost:3737/api/catalog/refresh | head -c 100
```

Expected: `{"ok":true` or `{"ok":false,"error":"Refresh throttled` (if within 60s cooldown) — NOT a 401.

- [ ] **Step 6: Manual smoke test — verify protected mode rejects unauthenticated**

```bash
REFRESH_SECRET=mysecret npm start &
# Unauthenticated — should 401
curl -s -w "\n%{http_code}" -X POST http://localhost:3737/api/catalog/refresh
# Authenticated — should proceed
curl -s -w "\n%{http_code}" -X POST http://localhost:3737/api/catalog/refresh \
  -H "Authorization: Bearer mysecret"
```

Expected: First request returns `401`. Second returns `200` or `429`.

Kill server: `kill %1`

- [ ] **Step 7: Commit**

```bash
git add src/server.js env.example
git commit -m "feat(security): add optional REFRESH_SECRET auth to /api/catalog/refresh"
```
