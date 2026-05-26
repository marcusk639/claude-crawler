# Hosted MVP — Manual Setup Checklist

**Status:** Code is ready. This document walks through the manual steps required to bring the hosted MVP online: creating the Firebase project, wiring OAuth providers, generating credentials, and deploying to Railway.

**Estimated time:** 45–60 minutes (most of it is OAuth provider configuration in third-party dashboards).

---

## Part 1 — Firebase project setup (≈15 min)

### Step 1: Create the Firebase project

1. Go to https://console.firebase.google.com
2. Click **Add project** → name it `claude-crawler` (or anything you like)
3. Disable Google Analytics (not needed for MVP — skip the linking step)
4. Click **Create project** → wait for it to provision → **Continue**

### Step 2: Enable Authentication providers

In the Firebase console, click **Build → Authentication → Get started**.

In the **Sign-in method** tab, enable each provider:

#### GitHub

1. Click **GitHub** → toggle **Enable** → keep the dialog open
2. In a new tab, go to https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**
3. Fill in:
   - **Application name:** `Claude Crawler`
   - **Homepage URL:** `https://claude-crawler.web.app` (placeholder for now — you'll update later if needed)
   - **Authorization callback URL:** Copy this from the Firebase dialog (looks like `https://YOUR-PROJECT.firebaseapp.com/__/auth/handler`)
4. Click **Register application**
5. Copy the **Client ID** → paste into the Firebase GitHub dialog
6. Click **Generate a new client secret** → copy → paste into Firebase
7. Back in Firebase: **Save**

#### Google

1. Click **Google** → toggle **Enable**
2. Pick a project support email (your email)
3. **Save** — no extra config needed

#### Apple (OPTIONAL — skip if you don't have an Apple Developer account)

- Requires Apple Developer Program membership ($99/yr)
- You'll need: a Service ID, a Sign in with Apple key (.p8 file), and the team/key IDs
- Skip for MVP — GitHub + Google is enough to launch

### Step 3: Enable Firestore

1. Click **Build → Firestore Database → Create database**
2. Choose **Start in production mode** (we'll add our rules in the next step)
3. Pick a region: `us-central1` is a safe default (or pick one closer to your users)
4. Click **Enable**

### Step 4: Set Firestore security rules

Once the database is created, click the **Rules** tab and replace the default rules with:

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

### Step 5: Generate Admin SDK service account key

1. Click the gear icon (top-left) → **Project settings** → **Service accounts** tab
2. Click **Generate new private key** → **Generate key**
3. A JSON file downloads. **Save it securely — never commit this file.**

Open the JSON. You'll need these three values for Railway:

| JSON field     | Railway env var                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `project_id`   | `FIREBASE_PROJECT_ID`                                                                                                                 |
| `client_email` | `FIREBASE_CLIENT_EMAIL`                                                                                                               |
| `private_key`  | `FIREBASE_PRIVATE_KEY` (paste the entire multiline string, including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----\n`) |

### Step 6: Get the client SDK config

1. Gear icon → **Project settings** → **General** tab → scroll to **Your apps**
2. Click **Add app** → Web (`</>`) icon → name it `claude-crawler-web` → **Register app**
3. Copy the `firebaseConfig` values shown. You need: `apiKey`, `authDomain`, `projectId`, `appId`
4. Open `public/index.html` in your editor
5. Find the `firebase.initializeApp({...})` call near the top and replace each `REPLACE_WITH_YOUR_*` placeholder with the real value

These are **public identifiers, not secrets** — safe to commit.

6. Commit the change:
   ```bash
   git add public/index.html
   git commit -m "feat: set Firebase client config for hosted deployment"
   ```

---

## Part 2 — Railway deployment (≈20 min)

### Step 7: Create the Railway project

1. Go to https://railway.app → **Sign in with GitHub**
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `claude-crawler` repository
4. Railway auto-detects Node.js and runs `npm start`

### Step 8: Set environment variables

In the Railway project dashboard → **Variables** tab, add the following:

```
# Firebase Admin SDK (from Step 5)
FIREBASE_PROJECT_ID=<from your service account JSON>
FIREBASE_CLIENT_EMAIL=<from your service account JSON>
FIREBASE_PRIVATE_KEY=<paste the FULL private_key string including BEGIN/END lines>

# Set later — leave blank for now
ALLOWED_ORIGIN=

# Existing API keys (if you use them locally, copy them over)
GITHUB_TOKEN=<your GitHub PAT for higher rate limits>
GOOGLE_API_KEY=<your Google Custom Search API key>
GOOGLE_CSE_ID=<your Custom Search Engine ID>
LLM_API_KEY=<your OpenRouter key>
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=nousresearch/hermes-3-llama-3.1-405b-instruct:free

# Optional: protect /api/catalog/refresh
REFRESH_SECRET=<a long random string>
```

**Important note on `FIREBASE_PRIVATE_KEY`:** Railway preserves the multi-line string correctly when you paste it. The server code normalizes literal `\n` escape sequences just in case (`replace(/\\n/g, "\n")`).

### Step 9: Deploy and get the Railway URL

1. Railway auto-deploys on push. You can also click **Deploy** manually.
2. Once the build succeeds, go to **Settings → Networking → Generate Domain**
3. Copy the assigned domain (e.g., `claude-crawler-production-XXXX.up.railway.app`)
4. Go back to **Variables** and set:
   ```
   ALLOWED_ORIGIN=https://claude-crawler-production-XXXX.up.railway.app
   ```
5. Railway redeploys automatically when env vars change.

### Step 10: Authorize the Railway domain in Firebase

OAuth providers will reject sign-ins from unrecognized origins until you authorize them.

1. Firebase console → **Authentication → Settings** tab → **Authorized domains**
2. Click **Add domain** → enter your Railway domain (without `https://`)
3. Repeat for your GitHub OAuth App: go to https://github.com/settings/developers → your `Claude Crawler` app → **Authorization callback URL** — verify it points to your `firebaseapp.com/__/auth/handler` URL (this stays the same; Firebase handles the redirect)

---

## Part 3 — Smoke test (≈5 min)

### Step 11: Open the hosted app and verify each flow

Open `https://YOUR-RAILWAY-URL.up.railway.app` in your browser.

Check each:

- [ ] **Catalog loads** without any local setup — wait for the tools grid to populate
- [ ] **Refresh** button works — crawls run and the catalog updates
- [ ] **Sign In** opens the provider modal → click **Continue with GitHub** → auth succeeds → user avatar appears top-right
- [ ] **Bookmark** a tool — the heart icon turns filled (accent color)
- [ ] **Sign out** → the bookmark icon resets; sign back in → the saved tool persists
- [ ] **On a machine with claude-crawler running locally:** the `✓ Installer` chip should appear; clicking **Install** on a GitHub-type tool triggers the local install flow
- [ ] **On a machine without local server:** the Install button shows **"No local installer"** with a setup link to the no-bridge modal
- [ ] **No console errors** in the browser DevTools

If any step fails, check:

- Railway logs (Railway dashboard → **Deployments** → click latest → view logs)
- Browser DevTools console for client-side errors
- Firebase console → **Authentication → Users** to confirm sign-ins are arriving
- Firebase console → **Firestore Database** to confirm saved-tools writes are appearing

---

## Troubleshooting

| Symptom                                                         | Likely cause                                      | Fix                                                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **"Auth not configured"** when calling `/api/user/*`            | `FIREBASE_*` env vars missing on Railway          | Re-check Step 8; redeploy after setting                                                                               |
| **Sign-in popup closes immediately with an error**              | OAuth callback URL mismatch                       | Re-check GitHub OAuth App callback URL; should be `https://YOUR-PROJECT.firebaseapp.com/__/auth/handler`              |
| **CORS error in browser console**                               | `ALLOWED_ORIGIN` not set or doesn't match the URL | Re-check Step 9; must include the `https://` prefix                                                                   |
| **Server crashes on startup with `FIREBASE_PRIVATE_KEY` error** | Multi-line key got mangled                        | In Railway, edit the var and re-paste; or use the JSON's `private_key` field exactly as-is including all `\n` escapes |
| **`/api/catalog` returns empty**                                | Crawlers haven't run yet                          | Click **Refresh** button in the UI, or POST to `/api/catalog/refresh`                                                 |

---

## What you'll have after this

A public URL anyone can use to:

- Browse the Claude Code tool catalog (LLM-scored, security-scanned)
- Search via natural language ("find me a database migration tool")
- Sign in with GitHub/Google and save tools across sessions
- One-click install (if they also run `npx claude-crawler@latest` locally) OR get clear instructions for setting up the local installer

This is the launchable MVP. Monetization, ratings, plugin support, and other ROADMAP items come after this is in users' hands.
