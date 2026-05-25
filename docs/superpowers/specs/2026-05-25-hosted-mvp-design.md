# Hosted MVP Design

**Date:** 2026-05-25
**Status:** Approved

---

## Goal

Ship a hosted version of claude-crawler that any Claude Code developer can use without local setup. Users get always-fresh catalog access, NL search, and LLM scoring from a URL. One-click install remains available to users who also run the local server. User accounts (GitHub, Google, Apple via Firebase Auth) enable saved tool lists.

Monetization is deferred. Everything is free at launch.

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│             User's Browser                  │
│                                             │
│  Hosted Frontend (served from Express)      │
│  ├── Firebase Auth SDK (GitHub/Google/Apple)│
│  ├── Catalog UI (existing app.js)           │
│  └── Local Bridge: tries localhost:3737     │
└──────────┬──────────────┬───────────────────┘
           │              │ (if local server running)
           │ API calls    ▼
           │         localhost:3737
           │         (existing local server)
           │         writes to ~/.claude/
           ▼
┌─────────────────────────────┐    ┌──────────────────────────┐
│  Express Server             │    │  Firebase                │
│  Railway / Fly.io           │◄───│                          │
│                             │    │  Auth (GitHub/Google/    │
│  ├── Crawlers               │    │        Apple OAuth)      │
│  ├── LLM scoring            │    │  Firestore (user state)  │
│  ├── NL search              │    │                          │
│  ├── Catalog cache          │    └──────────────────────────┘
│  └── User routes            │
│      (verify Firebase token)│
└─────────────────────────────┘
```

**Key principle:** The catalog never touches Firebase. Crawlers, scoring, and LLM features stay on the Express server exactly as they are today. Firebase owns identity and user state only.

---

## Components

### Express Server (Railway)

The existing Node.js server deployed as a persistent process on Railway (free tier). No architectural changes to the catalog pipeline — crawlers, scoring engine, LLM scorer, NL search, and in-memory cache are unchanged.

**New additions:**

- Firebase Admin SDK initialization (`src/firebase.js`)
- Token verification middleware (`src/middleware/auth.js`)
- User routes (`src/routes/users.js`): saved tools CRUD
- CORS relaxed to allow the hosted frontend origin in addition to localhost

### Firebase Auth

Three providers enabled in the Firebase console:

| Provider | Setup effort                                                        | Notes                                                                                                     |
| -------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| GitHub   | Low — create OAuth app in GitHub settings                           | Natural for developers                                                                                    |
| Google   | Minimal — toggle in Firebase console                                | Fastest sign-in (one tap)                                                                                 |
| Apple    | Medium — requires Apple Developer account ($99/yr), key file upload | Required if going mobile later; ship with GitHub + Google first if Apple Developer account not yet active |

The backend never handles OAuth directly. It only receives and verifies the Firebase ID token that the client SDK produces.

### Firestore (User State Only)

```
users/{uid}
  email: string
  displayName: string
  createdAt: timestamp

users/{uid}/savedTools/{toolId}
  savedAt: timestamp
  name: string          // denormalized snapshot
  description: string
  source: string        // "github" | "npm" | "ecc" | etc.
```

User filter preferences are stored in `localStorage` client-side — not Firestore. Firestore writes happen only on explicit user actions (save/unsave a tool).

### Local Server Bridge

On page load, the hosted frontend attempts:

```javascript
fetch("http://localhost:3737/api/health", {
  signal: AbortSignal.timeout(1000),
});
```

- **If successful:** install buttons POST to `http://localhost:3737/api/install/execute` directly from the client. A "Local installer active ✓" indicator appears in the header.
- **If not running:** install buttons show the install command in a copy-paste modal. A "Get one-click installs" prompt links to setup instructions.

The local server's CORS config must be updated to allow the hosted frontend origin (in addition to the existing localhost-only restriction).

---

## Auth Flow

```
1. User clicks "Sign in with GitHub / Google / Apple"
   → Firebase Auth SDK handles OAuth entirely (no backend involved)

2. Frontend receives idToken from Firebase
   → stored in memory, auto-refreshed by Firebase SDK every hour

3. Authenticated API calls include:
   Authorization: Bearer {idToken}

4. Express middleware (verifyFirebaseToken):
   → admin.auth().verifyIdToken(token)
   → attaches req.uid to request context
   → returns 401 if token missing, expired, or invalid

5. User routes use req.uid to read/write Firestore
```

---

## Route Protection

| Route                              | Auth required              | Reason                                                  |
| ---------------------------------- | -------------------------- | ------------------------------------------------------- |
| `GET /api/catalog`                 | No                         | Catalog is public                                       |
| `GET /api/status`                  | No                         | Health check                                            |
| `POST /api/search/natural`         | No                         | NL search is public                                     |
| `POST /api/install/preview`        | No                         | Preview is read-only                                    |
| `POST /api/install/execute`        | No                         | Local bridge only; local server has its own protections |
| `POST /api/catalog/refresh`        | No (REFRESH_SECRET if set) | Existing behavior unchanged                             |
| `GET /api/user/saved-tools`        | Yes                        | User-specific data                                      |
| `POST /api/user/saved-tools`       | Yes                        | User-specific data                                      |
| `DELETE /api/user/saved-tools/:id` | Yes                        | User-specific data                                      |

---

## Files Changed

### New files

| File                     | Purpose                                                                       |
| ------------------------ | ----------------------------------------------------------------------------- |
| `src/firebase.js`        | Firebase Admin SDK initialization; reads env vars; exports `admin` and `db`   |
| `src/middleware/auth.js` | `verifyFirebaseToken(req, res, next)` — verifies ID token, attaches `req.uid` |
| `src/routes/users.js`    | Saved tools CRUD: GET, POST, DELETE                                           |

### Modified files

| File                | Change                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/server.js`     | Relax CORS to allow `ALLOWED_ORIGIN` env var; mount `/api/user` routes; import firebase init                                                 |
| `public/index.html` | Add Firebase SDK scripts (Auth + Firestore); add login/logout button; add local bridge status indicator                                      |
| `public/app.js`     | Auth state listener; attach idToken to API calls; save/unsave button on tool cards; local bridge detection on init; saved tools filter state |
| `public/style.css`  | Login button; user avatar; save button on cards; local bridge status chip; auth modal                                                        |
| `env.example`       | Add Firebase Admin env vars and `ALLOWED_ORIGIN`                                                                                             |

---

## Environment Variables (additions)

```bash
# Firebase Admin SDK (server-side)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=        # paste the full private key including \n escapes

# Hosting
ALLOWED_ORIGIN=https://your-app.up.railway.app   # or custom domain

# Firebase client config — NOT secrets, safe to commit
# Hardcoded directly in public/index.html (no build step needed)
# Copy from Firebase console → Project Settings → Your apps → SDK setup
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_APP_ID=
```

Note: Firebase client config values are public identifiers, not secrets — safe to commit or embed directly in `public/index.html`. Firebase security rules and the Admin SDK private key are what protect your data. Never commit the Admin SDK private key.

---

## UI Changes

**Header additions:**

- Sign In button (right side) → opens provider chooser modal (GitHub / Google / Apple)
- When signed in: user avatar + display name + Sign Out
- Local bridge status chip: "Local installer active ✓" or subtle "no local server" state

**Tool cards:**

- Bookmark icon (top-right corner of card)
- Filled when tool is in saved list; outline when not
- Requires auth — clicking when signed out prompts sign-in

**Saved tools filter:**

- New filter option in sidebar: "Saved" — filters catalog to user's saved tools only
- Only visible when signed in

---

## Deployment

**Railway setup:**

1. Connect GitHub repo to Railway
2. Railway auto-detects Node.js, runs `npm start`
3. Set all environment variables in Railway dashboard
4. Railway provides a public URL (`*.up.railway.app`) — use as `ALLOWED_ORIGIN`

**Firebase setup:**

1. Create Firebase project
2. Enable Authentication → add GitHub, Google, (Apple) providers
3. Enable Firestore → start in production mode
4. Add Firestore security rules (see below)
5. Generate Admin SDK service account key

**Firestore security rules:**

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

---

## What This Is Not

- No catalog stored in Firestore — catalog stays in memory on the server
- No server-side rendering — frontend remains vanilla JS
- No payment or feature gating — everything free at launch
- No mobile app — web only for MVP
- No Firebase Hosting — frontend served from Express for MVP simplicity (can migrate to Firebase Hosting later)
- No Cloud Functions — crawlers run as a persistent process on Railway, not serverless

---

## Success Criteria

- [ ] User can visit the hosted URL and browse the catalog without any local setup
- [ ] User can sign in with GitHub, Google, or Apple
- [ ] Signed-in user can save tools; saved list persists across sessions and devices
- [ ] User running the local server sees "Local installer active ✓" and can one-click install
- [ ] User without local server sees install commands in a copy-paste modal
- [ ] Signing out clears saved state from UI (Firestore data persists for next login)
- [ ] Anonymous users get full catalog + NL search access
