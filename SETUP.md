# claude-crawler — New Machine Setup

Claude Code agent catalog crawler + scoring API. Node.js/Express, deployed on Railway.

## Prerequisites

| Tool    | Version | Install             |
| ------- | ------- | ------------------- |
| Node.js | ≥18     | `brew install node` |
| npm     | bundled | —                   |

## Clone & Install

```bash
git clone https://github.com/marcusk639/claude-crawler.git
cd claude-crawler
npm install
```

## Environment

```bash
cp env.example .env
# Fill in values
```

Key env vars (retrieve from 1Password "claude-crawler"):

| Variable                | Required    | Source                                                                                          |
| ----------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`          | Recommended | GitHub → Settings → Developer tokens (no scopes needed for public repos). Without it: 60 req/hr |
| `GOOGLE_API_KEY`        | Optional    | Google Cloud Console → Custom Search API                                                        |
| `GOOGLE_CSE_ID`         | Optional    | programmablesearchengine.google.com → New engine                                                |
| `LLM_API_KEY`           | Optional    | openrouter.ai (enables intelligent README scoring)                                              |
| `FIREBASE_PROJECT_ID`   | Optional    | Firebase Console → Project settings → Service accounts                                          |
| `FIREBASE_CLIENT_EMAIL` | Optional    | Same — Generate new private key                                                                 |
| `FIREBASE_PRIVATE_KEY`  | Optional    | Same                                                                                            |

Without Firebase: runs fine as a standalone API with local file cache.

## Start

```bash
npm start        # production
npm run dev      # development (nodemon)
# Listens on PORT (default 3737)
```

## Verify

```bash
curl http://localhost:3737/health
```

## Deployment

Hosted on Railway. Check the Railway dashboard for the live URL and env vars.

```bash
# Railway deployment is git-push triggered on main branch
git push  # triggers auto-deploy
```

## Notes

- Firebase credentials are optional — enables persistent catalog storage
- LLM scoring is optional — falls back to heuristic scoring without it
- `REFRESH_SECRET` protects `POST /api/catalog/refresh` in production
