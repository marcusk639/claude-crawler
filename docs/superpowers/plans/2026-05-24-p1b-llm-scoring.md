# P1b LLM-Powered Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace name-regex heuristics with LLM-powered README analysis that scores tools across 5 dimensions (documentation quality, installability, maintenance signals, security risk, Claude Code relevance). Falls back to existing heuristic scoring when `LLM_API_KEY` is not set.

**Architecture:** A new `src/scoring/llm-scorer.js` module handles all LLM calls. It uses a content-addressed in-memory cache (tool ID + README hash → score, 7-day TTL) to avoid re-scoring unchanged READMEs. The existing `src/scoring/index.js` calls `scoreWithLLM()` and merges the result into the final score. The `openai` npm package is used with an OpenAI-compatible base URL — works with OpenRouter, Ollama, or any provider. No breaking changes when `LLM_API_KEY` is absent.

**Tech Stack:** Node.js, `openai` npm package (new dep), `node:crypto` (built-in for hashing)

---

### Task 1: Install the openai package

**Files:**

- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install**

```bash
npm install openai
```

- [ ] **Step 2: Verify**

```bash
grep '"openai"' package.json
```

Expected: `"openai": "^4.x.x"` (or similar).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add openai package for LLM-compatible API calls"
```

---

### Task 2: Add LLM env vars to env.example

**Files:**

- Modify: `env.example`

- [ ] **Step 1: Read env.example first, then add the new block**

Open `env.example` and append:

```
# ── LLM scoring (optional) ───────────────────────────────────────────────────
# Enables intelligent README-based scoring. Without these, heuristic scoring
# is used (no breaking change).
#
# Free option: Hermes 3 405B on OpenRouter (no credit card required)
#   LLM_API_KEY=sk-or-...       # Get free key at openrouter.ai
#   LLM_BASE_URL=https://openrouter.ai/api/v1
#   LLM_MODEL=nousresearch/hermes-3-llama-3.1-405b-instruct:free
#
# Paid option (better quality): Hermes 4 70B at $0.13/M input tokens
#   LLM_MODEL=nousresearch/hermes-4-405b
#
# Local option (fully private, requires Ollama + ~25GB RAM):
#   LLM_BASE_URL=http://localhost:11434/v1
#   LLM_API_KEY=ollama
#   LLM_MODEL=hf.co/NousResearch/Hermes-4.3-36B-GGUF:Q4_K_M
#   (also set: OLLAMA_NUM_CTX=32768 — Ollama defaults to 4K which is too small)
#
# LLM_API_KEY=
# LLM_BASE_URL=https://openrouter.ai/api/v1
# LLM_MODEL=nousresearch/hermes-3-llama-3.1-405b-instruct:free
```

- [ ] **Step 2: Commit**

```bash
git add env.example
git commit -m "docs: add LLM scoring env var documentation to env.example"
```

---

### Task 3: Create the LLM scorer module

**Files:**

- Create: `src/scoring/llm-scorer.js`

- [ ] **Step 1: Write the failing test first**

Create `src/scoring/llm-scorer.test.js`:

```javascript
"use strict";

const { test, mock } = require("node:test");
const assert = require("node:assert/strict");

// scoreWithLLM returns null when LLM_API_KEY is not set
test("scoreWithLLM returns null when LLM_API_KEY is not set", async () => {
  delete process.env.LLM_API_KEY;
  // Re-require to get a fresh module without cached client
  // Use a unique cache-busting require path trick isn't possible in CommonJS without
  // resetting the module cache. Instead we test the exported behaviour directly.
  const { scoreWithLLM } = require("./llm-scorer");
  const result = await scoreWithLLM({
    id: "test:pkg",
    name: "test-pkg",
    description: "A test package",
    readme: "x".repeat(300), // long enough to pass length guard
    topics: [],
    stars: 0,
    weeklyDownloads: 0,
    updatedAt: new Date().toISOString(),
  });
  assert.strictEqual(result, null, "Should return null when no API key");
});

// scoreWithLLM returns null for tools with short/empty readmes
test("scoreWithLLM returns null for readme shorter than 200 chars", async () => {
  delete process.env.LLM_API_KEY;
  const { scoreWithLLM } = require("./llm-scorer");
  const result = await scoreWithLLM({
    id: "test:short",
    name: "short",
    description: "short",
    readme: "too short",
    topics: [],
    stars: 0,
    weeklyDownloads: 0,
    updatedAt: new Date().toISOString(),
  });
  assert.strictEqual(result, null);
});
```

- [ ] **Step 2: Run test — expect FAIL (module doesn't exist yet)**

```bash
node --test src/scoring/llm-scorer.test.js
```

Expected: Error — `Cannot find module './llm-scorer'`.

- [ ] **Step 3: Create the implementation**

Create `src/scoring/llm-scorer.js`:

```javascript
"use strict";

const crypto = require("node:crypto");

const TTL_7_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// In-memory content-addressed cache: key = "llm:{tool.id}:{readmeHash}"
// TTL 7 days — README content changes are rare.
const llmCache = new Map();

function makeCacheKey(tool) {
  const hash = crypto
    .createHash("sha256")
    .update(tool.readme || "")
    .digest("hex")
    .slice(0, 16);
  return `llm:${tool.id}:${hash}`;
}

function getCached(key) {
  const entry = llmCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    llmCache.delete(key);
    return null;
  }
  return entry.score;
}

function setCached(key, score) {
  llmCache.set(key, { score, expiresAt: Date.now() + TTL_7_DAYS_MS });
}

// Lazily initialized — only created when LLM_API_KEY is present.
let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.LLM_API_KEY) return null;
  const { OpenAI } = require("openai");
  _client = new OpenAI({
    baseURL: process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1",
    apiKey: process.env.LLM_API_KEY,
  });
  return _client;
}

const SYSTEM_PROMPT =
  "You are a security-focused technical reviewer evaluating Claude Code tools. " +
  "Respond ONLY with the requested JSON object. No prose, no markdown fences.";

async function scoreWithLLM(tool) {
  const client = getClient();
  if (!client) return null;
  if (!tool.readme || tool.readme.length < 200) return null;

  const key = makeCacheKey(tool);
  const cached = getCached(key);
  if (cached) return cached;

  const prompt = `Analyze this Claude Code tool and score it across 5 dimensions (0-20 each).

Tool name: ${tool.name}
Description: ${tool.description || "(none)"}
README (first 2000 chars): ${tool.readme.slice(0, 2000)}
Topics: ${(tool.topics || []).join(", ") || "(none)"}
Stars: ${tool.stars} | Weekly downloads: ${tool.weeklyDownloads} | Last updated: ${tool.updatedAt}

Return ONLY this JSON object (no other text):
{
  "documentationQuality": <integer 0-20, README completeness, examples, setup instructions>,
  "installabilityScore": <integer 0-20, clear install steps, working config examples>,
  "maintenanceSignals": <integer 0-20, recent commits, issues addressed, active development>,
  "securityRisk": <integer 0-20, 0=no risk, 20=high risk: suspicious patterns, excessive permissions>,
  "relevanceToClaudeCode": <integer 0-20, how useful is this specifically for Claude Code users>,
  "reasoning": "<1-2 sentence explanation of the scores>",
  "flags": ["<specific concern 1>", "<specific concern 2>"]
}`;

  try {
    const model =
      process.env.LLM_MODEL ||
      "nousresearch/hermes-3-llama-3.1-405b-instruct:free";
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const score = JSON.parse(raw);
    setCached(key, score);
    return score;
  } catch (err) {
    console.warn(`[llm-scorer] ${tool.name}: ${err.message}`);
    return null;
  }
}

module.exports = { scoreWithLLM };
```

- [ ] **Step 4: Run test — expect PASS**

```bash
node --test src/scoring/llm-scorer.test.js
```

Expected: 2 passing tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/scoring/llm-scorer.js src/scoring/llm-scorer.test.js
git commit -m "feat: add LLM scorer module with content-addressed 7-day cache"
```

---

### Task 4: Integrate LLM scoring into the scoring pipeline

**Files:**

- Modify: `src/scoring/index.js`

The LLM score is additive: each dimension (0–20) contributes a weighted bonus on top of the existing heuristic score. `securityRisk` works inversely (high = penalty). The LLM call runs per-tool during `scoreCatalog`. If the LLM call returns null (no key, short README, or error), the tool score is unchanged.

- [ ] **Step 1: Write a test for the integration**

Add to `src/scoring/index.test.js` (open the file and append before the last closing line):

```javascript
test("scoreCatalog adds llmScore field when scoreWithLLM returns data", async () => {
  // We can't easily mock the LLM in this integration test without LLM_API_KEY.
  // Instead, verify that when LLM_API_KEY is absent, llmScore is undefined
  // and the score field is still a number.
  delete process.env.LLM_API_KEY;
  const tools = [{ ...base, id: "no-llm" }];
  const [result] = scoreCatalog(tools);
  assert.ok(typeof result.score === "number");
  // llmScore will be undefined when no LLM key is set
  assert.strictEqual(result.llmScore, undefined);
});
```

- [ ] **Step 2: Run — expect PASS (llmScore is undefined, score is a number)**

```bash
node --test src/scoring/index.test.js
```

Expected: all existing tests + new test pass.

- [ ] **Step 3: Update src/scoring/index.js to call scoreWithLLM**

Open `src/scoring/index.js`. Replace the entire file content with:

```javascript
"use strict";

const { scanContent } = require("./scanner");
const { scoreWithLLM } = require("./llm-scorer");

async function scoreCatalog(tools) {
  const scored = await Promise.all(
    tools.map(async (tool) => {
      const contentWarnings = scanContent(tool);
      const llmScore = await scoreWithLLM(tool);
      const score = computeScore({ ...tool, contentWarnings, llmScore });
      return { ...tool, contentWarnings, llmScore, score };
    }),
  );
  return scored.sort((a, b) => b.score - a.score);
}

function computeScore(tool) {
  let score = 0;

  // Stars: log10 scale, max 35 pts (reaches ~35 at 10k stars)
  if (tool.stars > 0) {
    score += Math.min(35, Math.log10(tool.stars + 1) * 10);
  }

  // npm weekly downloads: log10 scale, max 20 pts
  if (tool.weeklyDownloads > 0) {
    score += Math.min(20, Math.log10(tool.weeklyDownloads + 1) * 5.5);
  }

  // Recency: linear decay over 365 days, max 20 pts
  const ageMs = Date.now() - new Date(tool.updatedAt).getTime();
  const ageDays = ageMs / 86_400_000;
  if (ageDays < 365) {
    score += 20 * (1 - ageDays / 365);
  }

  // Has README / description: 8 pts
  if (tool.hasReadme || tool.readme?.length > 100) score += 5;
  if (tool.description?.length > 20) score += 3;

  // Official org (Anthropic / modelcontextprotocol): 10 pts
  if (tool.isOfficial) score += 10;

  // Community Reddit mentions: up to 7 pts
  if (tool.communityMentions > 0) {
    score += Math.min(7, tool.communityMentions * 2);
  }

  // Community Reddit upvote score: up to 5 pts
  if (tool.communityScore > 0) {
    score += Math.min(5, Math.log10(tool.communityScore + 1) * 2);
  }

  // LLM score bonus (when available): up to +15 pts
  // documentationQuality + installabilityScore + maintenanceSignals averaged → 0-5 pts each
  // relevanceToClaudeCode → 0-5 pts
  // securityRisk is inverted: 0=safe (bonus), 20=risky (penalty)
  if (tool.llmScore) {
    const {
      documentationQuality,
      installabilityScore,
      maintenanceSignals,
      securityRisk,
      relevanceToClaudeCode,
    } = tool.llmScore;
    const qualityAvg =
      (documentationQuality + installabilityScore + maintenanceSignals) / 3;
    score += Math.min(10, (qualityAvg / 20) * 10); // 0–10 pts for quality
    score += Math.min(5, (relevanceToClaudeCode / 20) * 5); // 0–5 pts for relevance
    score -= Math.min(20, (securityRisk / 20) * 20); // 0–20 pt penalty for risk
  }

  // Penalties
  score -= (tool.contentWarnings || []).length * 20;
  if (!tool.description) score -= 5;
  if (!tool.license && tool.source !== "ecc") score -= 2;

  return Math.round(Math.max(0, Math.min(100, score)));
}

module.exports = { scoreCatalog, computeScore };
```

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: all tests pass. Note: `scoreCatalog` is now async — verify existing tests still pass (the test file calls it synchronously; the async version needs await).

> **If tests fail because scoreCatalog is now async:** Update `src/scoring/index.test.js` — change the `scoreCatalog` test to use `async` and `await`:
>
> ```javascript
> test("scoreCatalog returns tools sorted by score descending", async () => {
>   // ... same body, but add await:
>   const scored = await scoreCatalog(tools);
>   // ...
> });
> ```

- [ ] **Step 5: Commit**

```bash
git add src/scoring/index.js src/scoring/index.test.js
git commit -m "feat: integrate LLM scoring into scoring pipeline with weighted bonus/penalty"
```

---

### Task 5: Update the catalog endpoint to handle async scoreCatalog

**Files:**

- Modify: `src/server.js`

`scoreCatalog` is now async. The catalog endpoint must `await` it.

- [ ] **Step 1: Find and update all calls to scoreCatalog in src/server.js**

There are two: in `GET /api/catalog` and `POST /api/catalog/refresh`. Both currently call `scoreCatalog(raw)` synchronously.

In `src/server.js`, change both occurrences of:

```javascript
const scored = scoreCatalog(raw);
```

To:

```javascript
const scored = await scoreCatalog(raw);
```

- [ ] **Step 2: Smoke test — start the server and hit the catalog endpoint**

```bash
npm start &
sleep 2
curl -s http://localhost:3737/api/catalog | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('ok:', d.ok, 'count:', d.data?.length)"
kill %1
```

Expected: `ok: true count: <number>` with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server.js
git commit -m "fix: await async scoreCatalog in catalog and refresh endpoints"
```

---

### Task 6: Surface llmScore in the tool modal (dashboard)

**Files:**

- Modify: `public/app.js`

When a tool has a non-null `llmScore`, the install modal should show an expandable "AI Analysis" section with the 5 dimension scores and reasoning.

- [ ] **Step 1: Find the modal rendering function in public/app.js**

Search for the function that renders the install modal — it will contain the tool name, description, and install preview. The function is likely named `renderInstallModal` or `openInstallModal`.

- [ ] **Step 2: Add the LLM score panel to the modal HTML**

In the modal render function, after the tool description block, add:

```javascript
// After the existing description HTML, add:
const llmPanel = tool.llmScore
  ? `
  <details class="llm-score-panel">
    <summary>AI Analysis <span class="llm-badge">Hermes</span></summary>
    <div class="llm-dims">
      <div class="llm-dim">
        <span>Documentation</span>
        <span class="llm-bar" style="--pct:${tool.llmScore.documentationQuality * 5}%"></span>
        <span>${tool.llmScore.documentationQuality}/20</span>
      </div>
      <div class="llm-dim">
        <span>Installability</span>
        <span class="llm-bar" style="--pct:${tool.llmScore.installabilityScore * 5}%"></span>
        <span>${tool.llmScore.installabilityScore}/20</span>
      </div>
      <div class="llm-dim">
        <span>Maintenance</span>
        <span class="llm-bar" style="--pct:${tool.llmScore.maintenanceSignals * 5}%"></span>
        <span>${tool.llmScore.maintenanceSignals}/20</span>
      </div>
      <div class="llm-dim">
        <span>Security Risk</span>
        <span class="llm-bar risk" style="--pct:${tool.llmScore.securityRisk * 5}%"></span>
        <span>${tool.llmScore.securityRisk}/20</span>
      </div>
      <div class="llm-dim">
        <span>Claude Relevance</span>
        <span class="llm-bar" style="--pct:${tool.llmScore.relevanceToClaudeCode * 5}%"></span>
        <span>${tool.llmScore.relevanceToClaudeCode}/20</span>
      </div>
    </div>
    ${tool.llmScore.reasoning ? `<p class="llm-reasoning">${escHtml(tool.llmScore.reasoning)}</p>` : ""}
    ${tool.llmScore.flags?.length ? `<ul class="llm-flags">${tool.llmScore.flags.map((f) => `<li>${escHtml(f)}</li>`).join("")}</ul>` : ""}
  </details>`
  : "";
```

Insert `${llmPanel}` into the modal HTML string at the appropriate location.

- [ ] **Step 3: Add CSS for the LLM panel to public/style.css**

Open `public/style.css` and append:

```css
.llm-score-panel {
  margin-top: 1rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
}
.llm-score-panel summary {
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--text-muted);
  list-style: none;
}
.llm-badge {
  font-size: 0.7rem;
  background: #7c3aed22;
  color: #a78bfa;
  border-radius: 4px;
  padding: 1px 5px;
  margin-left: 6px;
}
.llm-dims {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.75rem;
}
.llm-dim {
  display: grid;
  grid-template-columns: 140px 1fr 40px;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}
.llm-bar {
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  position: relative;
}
.llm-bar::after {
  content: "";
  position: absolute;
  inset: 0;
  width: var(--pct, 0%);
  background: var(--accent);
  border-radius: 3px;
}
.llm-bar.risk::after {
  background: #f59e0b;
}
.llm-reasoning {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 0.5rem;
  font-style: italic;
}
.llm-flags {
  font-size: 0.78rem;
  color: #fca5a5;
  margin: 0.4rem 0 0 1rem;
  padding: 0;
}
```

- [ ] **Step 4: Verify the UI**

```bash
npm start
```

Open `http://localhost:3737` in a browser. Without `LLM_API_KEY`, tools will have no AI Analysis section — this is correct. With `LLM_API_KEY` set, after a catalog refresh, tools with READMEs > 200 chars should show the expandable panel.

- [ ] **Step 5: Commit**

```bash
git add public/app.js public/style.css
git commit -m "feat: show LLM score breakdown panel in tool install modal"
```
