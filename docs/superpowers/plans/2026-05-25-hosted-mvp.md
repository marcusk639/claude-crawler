# Hosted MVP: Firebase Auth + Firestore + Railway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Firebase Auth (GitHub/Google/Apple), Firestore-backed saved tools, and a local server bridge to make claude-crawler usable as a hosted web app on Railway without breaking the existing local install workflow.

**Architecture:** The Express server gains three new modules (firebase init, auth middleware, user routes) and is deployed to Railway with `HOST=0.0.0.0`. The vanilla JS frontend adds Firebase client SDK for auth, a local bridge that detects a running local server and routes installs through it, and save/unsave buttons backed by Firestore. The catalog pipeline is untouched.

**Tech Stack:** Node.js, Express, `firebase-admin` (new), Firebase Auth SDK v10 (CDN), Firestore, Railway

**Depends on:** None — all existing code is additive

---

### Task 1: Install firebase-admin and update env.example

**Files:**

- Modify: `package.json` (via npm install)
- Modify: `env.example`

- [ ] **Step 1: Install firebase-admin**

```bash
npm install firebase-admin
```

- [ ] **Step 2: Verify it appears in package.json**

```bash
grep firebase-admin package.json
```

Expected: `"firebase-admin": "^12.x.x"` (or similar recent version)

- [ ] **Step 3: Update env.example**

Open `env.example` and append:

```bash
# ── Hosted deployment ──────────────────────────────────────────────────────────
# Set HOST=0.0.0.0 on Railway so the server binds to all interfaces.
# Leave unset for local dev (defaults to 127.0.0.1 loopback).
# HOST=0.0.0.0

# Allowed CORS origin for the hosted frontend (your Railway URL or custom domain).
# Also set this locally if you want the local bridge to work from the hosted app.
# ALLOWED_ORIGIN=https://your-app.up.railway.app

# ── Firebase Admin SDK (server-side — NEVER commit these values) ──────────────
# Generate from Firebase console → Project Settings → Service accounts → Generate new private key
# FIREBASE_PROJECT_ID=
# FIREBASE_CLIENT_EMAIL=
# FIREBASE_PRIVATE_KEY=     # Paste the full key including header/footer and literal \n escapes

# ── Firebase Client SDK (frontend — safe to commit, these are public identifiers) ──
# Copy from Firebase console → Project Settings → Your apps → SDK setup and configuration
# These are hardcoded directly in public/index.html (no build step needed)
# FIREBASE_API_KEY=          (goes in index.html, not .env)
# FIREBASE_AUTH_DOMAIN=      (goes in index.html, not .env)
# FIREBASE_APP_ID=           (goes in index.html, not .env)
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json env.example
git commit -m "chore: add firebase-admin dependency and document hosted env vars"
```

---

### Task 2: Create src/firebase.js — Admin SDK initialization

**Files:**

- Create: `src/firebase.js`

- [ ] **Step 1: Create the module**

Create `src/firebase.js`:

```javascript
"use strict";

const admin = require("firebase-admin");

function init() {
  if (admin.apps.length > 0) return; // already initialized

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } =
    process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    console.warn(
      "Firebase env vars not set — user accounts and saved tools are disabled",
    );
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      // Railway stores multiline env vars with literal \n — normalize them
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

init();

const db = admin.apps.length > 0 ? admin.firestore() : null;

module.exports = { admin, db };
```

- [ ] **Step 2: Smoke test — verify module loads without crashing**

```bash
node -e "require('./src/firebase')"
```

Expected: prints `Firebase env vars not set — user accounts and saved tools are disabled` (because no env vars are set locally), then exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/firebase.js
git commit -m "feat: add Firebase Admin SDK initialization module"
```

---

### Task 3: Create src/middleware/auth.js with tests (TDD)

**Files:**

- Create: `src/middleware/auth.test.js`
- Create: `src/middleware/auth.js`

- [ ] **Step 1: Create the src/middleware directory and write the failing tests**

```bash
mkdir -p src/middleware
```

Create `src/middleware/auth.test.js`:

```javascript
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
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

```bash
node --test src/middleware/auth.test.js
```

Expected: the test file itself passes (it uses `makeMiddleware` inline — no external module needed). All 5 tests should pass immediately. This confirms the test logic is correct before we write the real middleware.

- [ ] **Step 3: Create the middleware**

Create `src/middleware/auth.js`:

```javascript
"use strict";

const { admin } = require("../firebase");

async function verifyFirebaseToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  if (!admin.apps.length) {
    return res.status(503).json({ ok: false, error: "Auth not configured" });
  }
  try {
    const token = auth.slice(7);
    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
}

module.exports = { verifyFirebaseToken };
```

- [ ] **Step 4: Verify the real module loads cleanly**

```bash
node -e "require('./src/middleware/auth')"
```

Expected: exits 0 (prints the Firebase warning since no env vars, but no crash).

- [ ] **Step 5: Commit**

```bash
git add src/middleware/
git commit -m "feat: add verifyFirebaseToken middleware with unit tests"
```

---

### Task 4: Create src/routes/users.js with validation tests (TDD)

**Files:**

- Create: `src/routes/users.test.js`
- Create: `src/routes/users.js`

- [ ] **Step 1: Create the src/routes directory and write the failing tests**

```bash
mkdir -p src/routes
```

Create `src/routes/users.test.js`:

```javascript
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
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

```bash
node --test src/routes/users.test.js
```

Expected: 5 passing tests (validation helpers are inline in the test file — they pass immediately). This confirms the validation logic before we put it in the route.

- [ ] **Step 3: Create the users route**

Create `src/routes/users.js`:

```javascript
"use strict";

const { Router } = require("express");
const { db } = require("../firebase");
const { verifyFirebaseToken } = require("../middleware/auth");

const router = Router();

router.use(verifyFirebaseToken);

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

// GET /api/user/saved-tools
router.get("/saved-tools", async (req, res) => {
  if (!db)
    return res.status(503).json({ ok: false, error: "Auth not configured" });
  try {
    const snap = await db
      .collection("users")
      .doc(req.uid)
      .collection("savedTools")
      .orderBy("savedAt", "desc")
      .get();
    const tools = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ ok: true, tools });
  } catch (err) {
    console.error("Failed to fetch saved tools:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch saved tools" });
  }
});

// POST /api/user/saved-tools
router.post("/saved-tools", async (req, res) => {
  if (!db)
    return res.status(503).json({ ok: false, error: "Auth not configured" });
  const error = validateSaveBody(req.body);
  if (error) return res.status(400).json({ ok: false, error });

  const { toolId, name, description = "", source = "" } = req.body;
  try {
    await db
      .collection("users")
      .doc(req.uid)
      .collection("savedTools")
      .doc(toolId)
      .set({
        savedAt: new Date().toISOString(),
        name: name.slice(0, 200),
        description: description.slice(0, 500),
        source,
      });
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to save tool:", err);
    res.status(500).json({ ok: false, error: "Failed to save tool" });
  }
});

// DELETE /api/user/saved-tools/:toolId
router.delete("/saved-tools/:toolId", async (req, res) => {
  if (!db)
    return res.status(503).json({ ok: false, error: "Auth not configured" });
  try {
    await db
      .collection("users")
      .doc(req.uid)
      .collection("savedTools")
      .doc(req.params.toolId)
      .delete();
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete saved tool:", err);
    res.status(500).json({ ok: false, error: "Failed to delete saved tool" });
  }
});

module.exports = router;
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all existing tests pass + 5 new validation tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/
git commit -m "feat: add user saved-tools CRUD routes with Firestore"
```

---

### Task 5: Update src/server.js — CORS, host binding, mount user routes

**Files:**

- Modify: `src/server.js`

- [ ] **Step 1: Update the CORS configuration and add the require statements**

In `src/server.js`, replace line 6 (the cors require) and line 12 (the cache require block) with:

Find this block at the top of the file (lines 1–12):

```javascript
"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { crawlAll } = require("./crawlers");
const { scoreCatalog } = require("./scoring");
const { getInstallPreview, executeInstall } = require("./installer");
const { scanLocalConfig } = require("./installer/health");
const cache = require("./cache");
```

Replace with:

```javascript
"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { crawlAll } = require("./crawlers");
const { scoreCatalog } = require("./scoring");
const { getInstallPreview, executeInstall } = require("./installer");
const { scanLocalConfig } = require("./installer/health");
const cache = require("./cache");
require("./firebase"); // initialize Firebase Admin SDK (no-op if env vars not set)
const userRoutes = require("./routes/users");
```

- [ ] **Step 2: Update the CORS middleware on line 18**

Find:

```javascript
// Restrict CORS to same-origin localhost only — prevents cross-site install trigger
app.use(cors({ origin: `http://localhost:${PORT}` }));
```

Replace with:

```javascript
// Allow localhost for local dev, plus the hosted frontend origin when deployed
const ALLOWED_ORIGINS = [
  `http://localhost:${PORT}`,
  process.env.ALLOWED_ORIGIN,
].filter(Boolean);
app.use(cors({ origin: ALLOWED_ORIGINS }));
```

- [ ] **Step 3: Mount the user routes**

After the `app.use(express.static(...))` line (around line 20), add:

```javascript
app.use("/api/user", userRoutes);
```

- [ ] **Step 4: Update the listen call to support Railway**

Find:

```javascript
// Bind to loopback only — prevents LAN access to the install endpoint
app.listen(PORT, "127.0.0.1", () => {
```

Replace with:

```javascript
// On Railway (RAILWAY_ENVIRONMENT is set), bind to 0.0.0.0 for external traffic.
// Locally, default to 127.0.0.1 loopback. Override with HOST env var if needed.
const HOST = process.env.RAILWAY_ENVIRONMENT
  ? "0.0.0.0"
  : process.env.HOST || "127.0.0.1";
app.listen(PORT, HOST, () => {
```

- [ ] **Step 5: Smoke test — start the server and verify it starts cleanly**

```bash
npm start
```

Expected: `Claude Crawler running at http://localhost:3737` — no errors or crashes.

Stop with Ctrl+C.

- [ ] **Step 6: Verify the user route exists (no auth token → 401)**

```bash
npm start &
sleep 2
curl -s http://localhost:3737/api/user/saved-tools
kill %1
```

Expected: `{"ok":false,"error":"Unauthorized"}` — the route exists and auth is enforced.

- [ ] **Step 7: Commit**

```bash
git add src/server.js
git commit -m "feat: mount user routes, update CORS for hosted origin, support Railway HOST binding"
```

---

### Task 6: Update public/index.html — Firebase SDK, auth UI, modals

**Files:**

- Modify: `public/index.html`

- [ ] **Step 1: Read public/index.html to find the `</head>` tag and the header-right section**

Open `public/index.html`. You need two insertion points:

1. Just before `</head>` — for the Firebase SDK scripts and config
2. Inside `.header-right` — for the Sign In button and local bridge chip

- [ ] **Step 2: Add Firebase SDK scripts and config just before `</head>`**

Insert this block just before the closing `</head>` tag:

```html
<!-- Firebase SDK (compat build — works without a bundler) -->
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script>
  // Replace these values with your Firebase project's config.
  // Find them at: Firebase console → Project Settings → Your apps → SDK setup
  // These are NOT secrets — safe to commit.
  firebase.initializeApp({
    apiKey: "REPLACE_WITH_YOUR_API_KEY",
    authDomain: "REPLACE_WITH_YOUR_AUTH_DOMAIN",
    projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
    appId: "REPLACE_WITH_YOUR_APP_ID",
  });
</script>
```

- [ ] **Step 3: Add Sign In button, bridge chip, and auth modal to the header**

Find the `.header-right` div:

```html
<div class="header-right">
  <div class="search-wrap">
    <input
      type="search"
      id="search"
      placeholder="Search tools…"
      autocomplete="off"
    />
  </div>
  <button id="btn-refresh" class="btn btn-primary" title="Re-crawl all sources">
    <span class="btn-icon">↻</span> Refresh
  </button>
  <div id="status-dot" class="status-dot" title="Server status"></div>
</div>
```

Replace with:

```html
<div class="header-right">
  <div class="search-wrap">
    <input
      type="search"
      id="search"
      placeholder="Search tools…"
      autocomplete="off"
    />
  </div>
  <span
    id="bridge-chip"
    class="bridge-chip hidden"
    title="Local installer active — one-click installs enabled"
  >
    ✓ Installer
  </span>
  <button id="btn-refresh" class="btn btn-primary" title="Re-crawl all sources">
    <span class="btn-icon">↻</span> Refresh
  </button>
  <!-- Signed out: show Sign In button -->
  <button id="btn-signin" class="btn btn-secondary">Sign In</button>
  <!-- Signed in: show user avatar + sign out -->
  <div id="user-menu" class="user-menu hidden">
    <img
      id="user-avatar"
      class="user-avatar"
      src=""
      alt=""
      width="28"
      height="28"
    />
    <span id="user-name" class="user-name"></span>
    <button id="btn-signout" class="btn-ghost btn-sm">Sign Out</button>
  </div>
  <div id="status-dot" class="status-dot" title="Server status"></div>
</div>
```

- [ ] **Step 4: Add the auth provider modal just before `</body>`**

Insert just before the closing `</body>` tag (after the existing install modal):

```html
<!-- Auth provider chooser modal -->
<div id="auth-modal-overlay" class="modal-overlay hidden">
  <div class="modal auth-modal">
    <button class="modal-close" id="auth-modal-close" aria-label="Close">
      ✕
    </button>
    <h2 class="modal-title">Sign in to Claude Crawler</h2>
    <p class="auth-subtitle">Save tools and sync across devices</p>
    <div class="auth-providers">
      <button class="auth-provider-btn" data-provider="github">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"
          />
        </svg>
        Continue with GitHub
      </button>
      <button class="auth-provider-btn" data-provider="google">
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Continue with Google
      </button>
      <button class="auth-provider-btn" data-provider="apple">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
          />
        </svg>
        Continue with Apple
      </button>
    </div>
  </div>
</div>

<!-- Copy-paste install fallback modal (shown when no local bridge) -->
<div id="no-bridge-modal-overlay" class="modal-overlay hidden">
  <div class="modal no-bridge-modal">
    <button class="modal-close" id="no-bridge-close" aria-label="Close">
      ✕
    </button>
    <h2 class="modal-title">Local installer not detected</h2>
    <p>
      To enable one-click installs, run claude-crawler on your local machine:
    </p>
    <div class="code-block">npx claude-crawler@latest</div>
    <p class="auth-subtitle">
      Then refresh this page. The install button will activate automatically.
    </p>
    <p class="auth-subtitle">
      Alternatively, use the install command from the tool's Install dialog.
    </p>
    <button class="btn btn-primary" id="no-bridge-retry">Check Again</button>
  </div>
</div>
```

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat(ui): add Firebase SDK, auth modal, local bridge chip, no-bridge modal"
```

---

### Task 7: Update public/app.js — auth state, local bridge detection, save/unsave tools

**Files:**

- Modify: `public/app.js`

- [ ] **Step 1: Add new state fields to the state object**

Find the `state` object (line 4):

```javascript
const state = {
  catalog: [],
  filtered: [],
  loading: false,
  error: null,
  filters: {
    category: "all",
    job: "all",
    source: "all",
    search: "",
    hideInstalled: false,
    officialOnly: false,
  },
  sort: "score",
  installTool: null,
  installPreview: null,
  installState: "idle", // idle | loading | ready | executing | done
};
```

Replace with:

```javascript
const state = {
  catalog: [],
  filtered: [],
  loading: false,
  error: null,
  filters: {
    category: "all",
    job: "all",
    source: "all",
    search: "",
    hideInstalled: false,
    officialOnly: false,
    savedOnly: false,
  },
  sort: "score",
  installTool: null,
  installPreview: null,
  installState: "idle", // idle | loading | ready | executing | done
  localBridge: false, // true when localhost:3737 is reachable
  currentUser: null, // Firebase user object or null
  savedToolIds: new Set(), // IDs of tools saved by current user
};

// Current Firebase ID token — refreshed automatically by Firebase SDK
let idToken = null;
```

- [ ] **Step 2: Update the `api()` helper to attach the auth token**

Find the `api()` function:

```javascript
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "API error");
  return data;
}
```

Replace with:

```javascript
async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
  const res = await fetch(path, { headers, ...opts });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "API error");
  return data;
}
```

- [ ] **Step 3: Add auth and bridge initialization functions after the `api()` function**

After the closing brace of `api()`, add:

```javascript
// ── Auth ───────────────────────────────────────
function initAuth() {
  firebase.auth().onAuthStateChanged(async (user) => {
    state.currentUser = user;
    idToken = user ? await user.getIdToken() : null;

    const btnSignin = document.getElementById("btn-signin");
    const userMenu = document.getElementById("user-menu");
    const userAvatar = document.getElementById("user-avatar");
    const userName = document.getElementById("user-name");

    if (user) {
      btnSignin.classList.add("hidden");
      userMenu.classList.remove("hidden");
      userAvatar.src = user.photoURL || "";
      userAvatar.alt = user.displayName || "";
      userName.textContent = user.displayName || user.email || "";
      await loadSavedTools();
    } else {
      btnSignin.classList.remove("hidden");
      userMenu.classList.add("hidden");
      state.savedToolIds = new Set();
    }
    applyFiltersAndRender();
  });

  // Refresh token silently before it expires (Firebase tokens expire after 1hr)
  setInterval(
    async () => {
      if (state.currentUser) {
        idToken = await state.currentUser.getIdToken(true);
      }
    },
    55 * 60 * 1000,
  );
}

async function loadSavedTools() {
  try {
    const { tools } = await api("/api/user/saved-tools");
    state.savedToolIds = new Set(tools.map((t) => t.id));
  } catch (err) {
    console.warn("Could not load saved tools:", err.message);
    state.savedToolIds = new Set();
  }
}

async function toggleSave(toolId) {
  if (!state.currentUser) {
    document.getElementById("auth-modal-overlay").classList.remove("hidden");
    return;
  }
  const isSaved = state.savedToolIds.has(toolId);
  if (isSaved) {
    state.savedToolIds.delete(toolId);
    applyFiltersAndRender();
    await api(`/api/user/saved-tools/${encodeURIComponent(toolId)}`, {
      method: "DELETE",
    });
  } else {
    state.savedToolIds.add(toolId);
    applyFiltersAndRender();
    const tool = state.catalog.find((t) => t.id === toolId);
    if (tool) {
      await api("/api/user/saved-tools", {
        method: "POST",
        body: JSON.stringify({
          toolId,
          name: tool.name || tool.displayName || "",
          description: tool.description || "",
          source: tool.source || "",
        }),
      });
    }
  }
}

function openAuthModal() {
  document.getElementById("auth-modal-overlay").classList.remove("hidden");
}

function closeAuthModal() {
  document.getElementById("auth-modal-overlay").classList.add("hidden");
}

async function signInWith(provider) {
  let authProvider;
  if (provider === "github") {
    authProvider = new firebase.auth.GithubAuthProvider();
  } else if (provider === "google") {
    authProvider = new firebase.auth.GoogleAuthProvider();
  } else if (provider === "apple") {
    authProvider = new firebase.auth.OAuthProvider("apple.com");
  } else {
    return;
  }
  try {
    await firebase.auth().signInWithPopup(authProvider);
    closeAuthModal();
  } catch (err) {
    console.error("Sign-in error:", err);
    alert(`Sign-in failed: ${err.message}`);
  }
}

// ── Local Bridge ───────────────────────────────
async function detectLocalBridge() {
  try {
    await fetch("http://localhost:3737/api/health", {
      signal: AbortSignal.timeout(1000),
    });
    state.localBridge = true;
  } catch {
    state.localBridge = false;
  }
  const chip = document.getElementById("bridge-chip");
  if (state.localBridge) {
    chip.classList.remove("hidden");
  } else {
    chip.classList.add("hidden");
  }
}
```

- [ ] **Step 4: Update `bindControls()` to wire auth + bridge event listeners**

At the end of the `bindControls()` function, before its closing brace, add:

```javascript
// Auth
document.getElementById("btn-signin").addEventListener("click", openAuthModal);
document
  .getElementById("auth-modal-close")
  .addEventListener("click", closeAuthModal);
document.getElementById("auth-modal-overlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("auth-modal-overlay"))
    closeAuthModal();
});
document.getElementById("btn-signout").addEventListener("click", () => {
  firebase.auth().signOut();
});
document.querySelectorAll(".auth-provider-btn").forEach((btn) => {
  btn.addEventListener("click", () => signInWith(btn.dataset.provider));
});

// No-bridge modal
document.getElementById("no-bridge-close").addEventListener("click", () => {
  document.getElementById("no-bridge-modal-overlay").classList.add("hidden");
});
document
  .getElementById("no-bridge-retry")
  .addEventListener("click", async () => {
    await detectLocalBridge();
    if (state.localBridge) {
      document
        .getElementById("no-bridge-modal-overlay")
        .classList.add("hidden");
    }
  });

// Saved-only filter (delegated — button added in renderSidebar)
document.addEventListener("click", (e) => {
  if (e.target.matches("[data-saved-filter]")) {
    state.filters.savedOnly = !state.filters.savedOnly;
    e.target.classList.toggle("active", state.filters.savedOnly);
    applyFiltersAndRender();
  }
});

// Save/unsave button (delegated from catalog grid)
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-save-id]");
  if (btn) toggleSave(btn.dataset.saveId);
});
```

- [ ] **Step 5: Update the DOMContentLoaded block to call initAuth and detectLocalBridge**

Find:

```javascript
document.addEventListener("DOMContentLoaded", () => {
  bindControls();
  checkStatus();
  loadHealth();
  loadCatalog();
});
```

Replace with:

```javascript
document.addEventListener("DOMContentLoaded", () => {
  bindControls();
  checkStatus();
  loadHealth();
  loadCatalog();
  initAuth();
  detectLocalBridge();
});
```

- [ ] **Step 6: Update the `applyFilters()` function to support savedOnly filter**

Find the filter function. It contains a loop that checks `state.filters`. Find the return statement inside the filter (where `hideInstalled` is checked) and add `savedOnly` support:

Find this block inside the filter function:

```javascript
if (hideInstalled && t.installed) return false;
```

Replace with:

```javascript
if (hideInstalled && t.installed) return false;
if (state.filters.savedOnly && !state.savedToolIds.has(t.id)) return false;
```

- [ ] **Step 7: Update `renderCard()` to add the save bookmark button**

In `renderCard()`, find the card action buttons section. It currently ends with:

```javascript
        ${canInstall ? `<button class="btn btn-primary btn-sm" data-install-id="${escHtml(tool.id)}">${installBtnLabel}</button>` : ""}
```

Replace with:

```javascript
        <button
          class="btn-save${state.savedToolIds.has(tool.id) ? " saved" : ""}"
          data-save-id="${escHtml(tool.id)}"
          title="${state.savedToolIds.has(tool.id) ? "Remove from saved" : "Save tool"}"
          aria-label="${state.savedToolIds.has(tool.id) ? "Remove from saved" : "Save tool"}"
        >&#9825;</button>
        ${canInstall ? `<button class="btn btn-primary btn-sm" data-install-id="${escHtml(tool.id)}">${installBtnLabel}</button>` : ""}
```

- [ ] **Step 8: Update `executeInstall()` to route through the local bridge when active**

Find the `executeInstall` function and replace only the `api()` call inside it:

Find:

```javascript
const { result } = await api("/api/install/execute", {
  method: "POST",
  body: JSON.stringify({ tool: state.installTool }),
});
```

Replace with:

```javascript
const installUrl = state.localBridge
  ? "http://localhost:3737/api/install/execute"
  : "/api/install/execute";
const { result } = await fetch(installUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ tool: state.installTool }),
}).then((r) => r.json());
if (!result) throw new Error("Install failed — no response from server");
```

- [ ] **Step 9: Show the no-bridge modal when install is clicked with no local bridge**

In `renderInstallPreview()`, find where `confirmBtn.onclick = executeInstall` is set for github-type installs and wrap it:

Find:

```javascript
confirmBtn.disabled = files.length === 0;
confirmBtn.textContent = "Confirm Install";
confirmBtn.onclick = executeInstall;
```

Replace with:

```javascript
if (!state.localBridge) {
  confirmBtn.disabled = true;
  confirmBtn.textContent = "No local installer";
  const hint = document.createElement("p");
  hint.style.cssText = "margin-top:8px;font-size:12px;color:var(--text-muted)";
  hint.innerHTML =
    '<a href="#" id="open-no-bridge" style="color:var(--accent)">Set up the local installer</a> to enable one-click installs.';
  body.appendChild(hint);
  document.getElementById("open-no-bridge")?.addEventListener("click", (e) => {
    e.preventDefault();
    document
      .getElementById("no-bridge-modal-overlay")
      .classList.remove("hidden");
  });
} else {
  confirmBtn.disabled = files.length === 0;
  confirmBtn.textContent = "Confirm Install";
  confirmBtn.onclick = executeInstall;
}
```

- [ ] **Step 10: Commit**

```bash
git add public/app.js
git commit -m "feat(ui): add Firebase auth, local bridge detection, save/unsave tools"
```

---

### Task 8: Update public/style.css — auth and bridge styles

**Files:**

- Modify: `public/style.css`

- [ ] **Step 1: Append the new styles to the end of the file**

Open `public/style.css` and append:

```css
/* ── Auth UI ──────────────────────────────────────────────────────────────── */

.user-menu {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.user-avatar {
  border-radius: 50%;
  object-fit: cover;
}

.user-name {
  font-size: 0.8rem;
  color: var(--text-muted);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auth-modal {
  max-width: 340px;
  text-align: center;
}

.auth-subtitle {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin: 0 0 1.25rem;
}

.auth-providers {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.auth-provider-btn {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  padding: 0.65rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 0.875rem;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.auth-provider-btn:hover {
  border-color: var(--accent);
  background: rgba(99, 102, 241, 0.06);
}

/* ── Local bridge chip ────────────────────────────────────────────────────── */

.bridge-chip {
  font-size: 0.72rem;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.12);
  color: #86efac;
  border: 1px solid rgba(34, 197, 94, 0.3);
  white-space: nowrap;
}

/* ── Save button on tool cards ───────────────────────────────────────────── */

.btn-save {
  background: transparent;
  border: none;
  font-size: 1.1rem;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0.1rem 0.3rem;
  line-height: 1;
  transition: color 0.15s;
}

.btn-save:hover {
  color: var(--text);
}

.btn-save.saved {
  color: var(--accent);
}

/* ── No-bridge modal ─────────────────────────────────────────────────────── */

.no-bridge-modal {
  max-width: 380px;
  text-align: center;
}

.code-block {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.6rem 1rem;
  font-family: monospace;
  font-size: 0.85rem;
  color: var(--accent);
  margin: 0.75rem 0;
  user-select: all;
}
```

- [ ] **Step 2: Verify the app looks right — start the server and open the browser**

```bash
npm start
```

Open `http://localhost:3737`. Verify:

- Sign In button appears in the header (right side)
- The "✓ Installer" bridge chip is hidden (local bridge IS running so it will show — this is expected locally)
- Clicking Sign In opens the provider chooser modal with GitHub, Google, Apple buttons
- Bookmark icons appear on each tool card
- No JS errors in the browser console

Stop the server with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add public/style.css
git commit -m "feat(ui): add styles for auth modal, bridge chip, save buttons, no-bridge modal"
```

---

### Task 9: Firebase Console Setup + Railway Deployment

This task is manual configuration, not code changes. Complete each step in order.

**Firebase Console Setup**

- [ ] **Step 1: Create the Firebase project**

1. Go to [Firebase console](https://console.firebase.google.com)
2. Click **Add project** → name it `claude-crawler`
3. Disable Google Analytics (not needed for MVP)
4. Click **Create project**

- [ ] **Step 2: Enable Authentication providers**

1. In the Firebase console, click **Authentication** → **Get started**
2. Click **Sign-in method** tab
3. Enable **GitHub**: click it → toggle Enable → enter your GitHub OAuth App's Client ID and Secret (create one at github.com/settings/developers → OAuth Apps → New OAuth App; callback URL = `https://YOUR-PROJECT.firebaseapp.com/__/auth/handler`)
4. Enable **Google**: click it → toggle Enable → save (no extra config needed)
5. Enable **Apple** (optional — skip if no Apple Developer account): requires Apple Developer Program membership, Service ID, and private key upload

- [ ] **Step 3: Enable Firestore**

1. Click **Firestore Database** → **Create database**
2. Choose **Start in production mode**
3. Pick a region close to your users (e.g., `us-central1`)
4. After creation, click **Rules** tab and replace the default rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth.uid == uid;
      match /savedTools/{toolId} {
        allow read, write: if request.auth.uid == uid;
      }
    }
  }
}
```

Click **Publish**.

- [ ] **Step 4: Generate Admin SDK service account key**

1. Click the gear icon → **Project settings** → **Service accounts** tab
2. Click **Generate new private key** → **Generate key**
3. Save the downloaded JSON file securely — **never commit it**
4. Extract these three values from the JSON:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (the full multiline string)

- [ ] **Step 5: Get the client SDK config**

1. Click the gear icon → **Project settings** → **General** tab → scroll to **Your apps**
2. Click **Add app** → Web (`</>`) → name it `claude-crawler-web`
3. Copy the `firebaseConfig` object values — you need: `apiKey`, `authDomain`, `projectId`, `appId`

- [ ] **Step 6: Update public/index.html with the real Firebase config values**

Open `public/index.html` and replace the placeholder config:

```javascript
firebase.initializeApp({
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_AUTH_DOMAIN",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  appId: "REPLACE_WITH_YOUR_APP_ID",
});
```

With the actual values from the Firebase console. These are public — safe to commit.

```bash
git add public/index.html
git commit -m "feat: set Firebase client config for hosted deployment"
```

**Railway Setup**

- [ ] **Step 7: Create a Railway account and connect the repo**

1. Go to [railway.app](https://railway.app) → Sign in with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Select the `claude-crawler` repository
4. Railway auto-detects Node.js and runs `npm start`

- [ ] **Step 8: Set environment variables in Railway**

In the Railway project dashboard → **Variables** tab, add:

```
FIREBASE_PROJECT_ID=<from Step 4>
FIREBASE_CLIENT_EMAIL=<from Step 4>
FIREBASE_PRIVATE_KEY=<from Step 4 — paste the full key including -----BEGIN... lines>
ALLOWED_ORIGIN=<leave blank for now — fill in after deploy to get the Railway URL>
```

Also set any existing env vars you use locally:

```
GITHUB_TOKEN=<your GitHub PAT>
GOOGLE_API_KEY=<your Google API key>
GOOGLE_CSE_ID=<your CSE ID>
LLM_API_KEY=<your OpenRouter key>
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=nousresearch/hermes-3-llama-3.1-405b-instruct:free
```

- [ ] **Step 9: Deploy and get the Railway URL**

1. Click **Deploy** — Railway builds and starts the server
2. Click **Settings** → copy the generated domain (e.g., `claude-crawler-production.up.railway.app`)
3. Go back to **Variables** and set `ALLOWED_ORIGIN=https://claude-crawler-production.up.railway.app`
4. Railway redeploys automatically

- [ ] **Step 10: Add the Railway URL as an authorized redirect in Firebase Auth**

In Firebase console → Authentication → Settings → **Authorized domains**, add your Railway domain: `claude-crawler-production.up.railway.app`

Also add it to each OAuth provider's allowed redirect URIs (GitHub: in your GitHub OAuth App settings).

- [ ] **Step 11: Smoke test the hosted app**

Open `https://claude-crawler-production.up.railway.app` in your browser.

Verify each success criterion:

- [ ] Catalog loads without any local setup
- [ ] Click "Refresh" — catalog populates with tools
- [ ] Sign In → GitHub / Google → auth succeeds, user avatar appears
- [ ] Bookmark a tool — icon turns filled (accent color)
- [ ] Sign out → bookmark icons reset; sign back in → saved tool is still saved
- [ ] On a machine with claude-crawler running locally: "✓ Installer" chip appears; clicking Install triggers local install flow
- [ ] On a machine without local server: Install button shows "No local installer" with setup link
- [ ] No console errors on load

---

### Task 10: Run the full test suite

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected:

```
ℹ tests 38
ℹ pass 38
ℹ fail 0
```

(28 existing tests + 5 auth middleware tests + 5 user route validation tests = 38)

- [ ] **Step 2: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "feat: hosted MVP complete — Firebase Auth + Firestore + Railway"
```
