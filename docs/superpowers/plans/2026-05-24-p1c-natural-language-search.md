# P1c Natural Language Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `POST /api/search/natural` endpoint and a search input in the dashboard that lets users describe what they need in plain English ("find me a tool for database migrations") and returns ranked results with per-result reasoning from an LLM.

**Architecture:** A new `src/search/llm-search.js` module takes a query string and a catalog array, sends compact tool summaries to the LLM, and returns an ordered array of matching tools with a `searchReasoning` field attached. The server endpoint validates input (query: 3–500 chars), hits the cache for the current catalog, and calls the search module. In the frontend, a debounced search input sits in the dashboard header; results render as the standard card grid with a reasoning excerpt below each card. Natural language search and sidebar filters are mutually exclusive — activating one clears the other.

**Tech Stack:** Node.js, `openai` package (already installed in P1b), vanilla JS + CSS for the frontend

**Depends on:** P1b must be complete (`openai` package installed, `LLM_API_KEY` env var documented)

---

### Task 1: Create the llm-search module with tests

**Files:**

- Create: `src/search/llm-search.js`
- Create: `src/search/llm-search.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/search/llm-search.test.js`:

```javascript
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { naturalLanguageSearch } = require("./llm-search");

const fakeCatalog = [
  {
    id: "npm:pg-mcp",
    name: "pg-mcp",
    description: "PostgreSQL MCP server for database queries",
    topics: ["postgres", "database", "mcp-server"],
    stars: 100,
    weeklyDownloads: 500,
    score: 70,
  },
  {
    id: "github:weather-agent",
    name: "weather-agent",
    description: "Fetches weather forecasts via Claude Code",
    topics: ["weather", "agent"],
    stars: 50,
    weeklyDownloads: 0,
    score: 40,
  },
];

test("naturalLanguageSearch throws when LLM_API_KEY is not set", async () => {
  delete process.env.LLM_API_KEY;
  await assert.rejects(
    () => naturalLanguageSearch("find me a database tool", fakeCatalog),
    { message: /LLM_API_KEY/ },
  );
});

test("naturalLanguageSearch rejects query shorter than 3 chars", async () => {
  process.env.LLM_API_KEY = "fake"; // set so we get past key check
  await assert.rejects(() => naturalLanguageSearch("db", fakeCatalog), {
    message: /3/,
  });
  delete process.env.LLM_API_KEY;
});

test("naturalLanguageSearch rejects query longer than 500 chars", async () => {
  process.env.LLM_API_KEY = "fake";
  await assert.rejects(
    () => naturalLanguageSearch("x".repeat(501), fakeCatalog),
    { message: /500/ },
  );
  delete process.env.LLM_API_KEY;
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

```bash
node --test src/search/llm-search.test.js
```

Expected: `Cannot find module './llm-search'`

- [ ] **Step 3: Create the module**

Create `src/search/llm-search.js`:

```javascript
"use strict";

const { OpenAI } = require("openai");

const SYSTEM_PROMPT =
  "You are a tool discovery assistant for Claude Code developers. " +
  "Given a developer's request and a list of available tools, identify the most relevant ones. " +
  "Respond ONLY with the requested JSON object. No prose, no markdown fences.";

function getClient() {
  if (!process.env.LLM_API_KEY) {
    throw new Error("LLM_API_KEY is not set — LLM features are disabled");
  }
  return new OpenAI({
    baseURL: process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1",
    apiKey: process.env.LLM_API_KEY,
  });
}

function buildSummaries(catalog) {
  // Compact one-line summary per tool — keeps prompt size small
  return catalog
    .slice(0, 100)
    .map(
      (t) =>
        `ID:${t.id} | ${t.name} | ${(t.description || "").slice(0, 100)} | topics:${(t.topics || []).slice(0, 5).join(",")}`,
    )
    .join("\n");
}

async function naturalLanguageSearch(query, catalog) {
  if (typeof query !== "string" || query.trim().length < 3) {
    throw new Error("Query must be at least 3 characters");
  }
  if (query.length > 500) {
    throw new Error("Query must be 500 characters or fewer");
  }

  const client = getClient(); // throws if no API key

  const summaries = buildSummaries(catalog);

  const prompt = `A developer is looking for Claude Code tools. Their request:
"${query}"

Available tools (one per line, format: ID | name | description | topics):
${summaries}

Return ONLY this JSON object:
{
  "results": [
    {"id": "<tool ID from list above>", "reasoning": "<1 sentence why this matches>"},
    ...
  ]
}

Rules:
- Include only genuinely relevant tools (max 10)
- Use the exact ID strings from the list
- Return {"results": []} if nothing matches
- Do not invent IDs not in the list`;

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
    temperature: 0.2,
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) return [];

  const parsed = JSON.parse(raw);
  const matches = Array.isArray(parsed.results) ? parsed.results : [];

  // Build lookup for O(1) joins
  const catalogById = Object.fromEntries(catalog.map((t) => [t.id, t]));

  return matches
    .filter((m) => m.id && catalogById[m.id]) // discard any hallucinated IDs
    .map((m) => ({ ...catalogById[m.id], searchReasoning: m.reasoning || "" }));
}

module.exports = { naturalLanguageSearch };
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
node --test src/search/llm-search.test.js
```

Expected: 3 passing tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/search/
git commit -m "feat: add naturalLanguageSearch module with input validation"
```

---

### Task 2: Add the /api/search/natural endpoint to the server

**Files:**

- Modify: `src/server.js`

- [ ] **Step 1: Add the require at the top of server.js**

In `src/server.js`, after the other `require` statements, add:

```javascript
const { naturalLanguageSearch } = require("./search/llm-search");
```

- [ ] **Step 2: Add the endpoint**

In `src/server.js`, after the `GET /api/health` route and before `GET /api/status`, add:

```javascript
// POST /api/search/natural — LLM-powered semantic search over the catalog
app.post("/api/search/natural", async (req, res) => {
  try {
    const { query } = req.body;
    if (typeof query !== "string") {
      return res
        .status(400)
        .json({ ok: false, error: "query must be a string" });
    }
    const catalog = cache.get("catalog");
    if (!catalog) {
      return res.status(503).json({
        ok: false,
        error: "Catalog not loaded yet. Visit /api/catalog first.",
      });
    }
    const results = await naturalLanguageSearch(query, catalog);
    res.json({ ok: true, results, query });
  } catch (err) {
    const isInputError = err.message.includes("characters");
    const status = isInputError ? 400 : 500;
    const message = isInputError
      ? err.message
      : "Search failed. Check server logs.";
    if (!isInputError) console.error("Search error:", err);
    res.status(status).json({ ok: false, error: message });
  }
});
```

- [ ] **Step 3: Smoke test — start the server and call the endpoint**

```bash
npm start &
sleep 2
# Load the catalog first
curl -s http://localhost:3737/api/catalog > /dev/null
# Test input validation (no LLM key needed for this check)
curl -s -X POST http://localhost:3737/api/search/natural \
  -H 'Content-Type: application/json' \
  -d '{"query":"x"}' | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d)"
kill %1
```

Expected without LLM key: `{ ok: false, error: 'Search failed. Check server logs.' }` or validation error — either is correct behavior showing the endpoint exists and runs.

- [ ] **Step 4: Commit**

```bash
git add src/server.js
git commit -m "feat: add POST /api/search/natural endpoint for LLM-powered search"
```

---

### Task 3: Add search input to the dashboard HTML

**Files:**

- Modify: `public/index.html`

- [ ] **Step 1: Read public/index.html to find the header section**

Open `public/index.html` and locate the `<header>` element. It contains the title and the Refresh Catalog button.

- [ ] **Step 2: Add the search input inside the header**

Inside the `<header>`, after the refresh button, add:

```html
<div class="search-bar">
  <input
    type="search"
    id="nlSearchInput"
    placeholder="Describe what you need… (e.g. database migration tool)"
    autocomplete="off"
  />
  <button id="nlSearchClear" class="btn-ghost" hidden>Clear</button>
  <span id="nlSearchSpinner" class="spinner" hidden></span>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(ui): add natural language search input to dashboard header"
```

---

### Task 4: Wire up the search logic in app.js

**Files:**

- Modify: `public/app.js`

- [ ] **Step 1: Read public/app.js and locate the state object and render function**

The state object tracks `catalog`, `filters`, and similar. The render function reads state to produce the card grid.

- [ ] **Step 2: Add search state fields and the search handler**

In `public/app.js`, add to the `state` object:

```javascript
nlQuery: "",       // active natural language query string
nlResults: null,   // null = not searching; array = search results
nlLoading: false,
```

Add the search handler function (place near other event handlers):

```javascript
let nlDebounceTimer = null;

function onNlSearch(query) {
  clearTimeout(nlDebounceTimer);
  const trimmed = query.trim();

  if (!trimmed) {
    state.nlQuery = "";
    state.nlResults = null;
    document.getElementById("nlSearchClear").hidden = true;
    render();
    return;
  }

  if (trimmed.length < 3) return; // wait for more input

  nlDebounceTimer = setTimeout(async () => {
    state.nlQuery = trimmed;
    state.nlLoading = true;
    document.getElementById("nlSearchSpinner").hidden = false;
    document.getElementById("nlSearchClear").hidden = false;
    render();

    try {
      const res = await fetch("/api/search/natural", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await res.json();
      state.nlResults = res.ok ? data.results : null;
      if (!res.ok) console.warn("Search error:", data.error);
    } catch (err) {
      state.nlResults = null;
      console.warn("Search failed:", err);
    } finally {
      state.nlLoading = false;
      document.getElementById("nlSearchSpinner").hidden = true;
      render();
    }
  }, 400);
}

function clearNlSearch() {
  document.getElementById("nlSearchInput").value = "";
  state.nlQuery = "";
  state.nlResults = null;
  document.getElementById("nlSearchClear").hidden = true;
  render();
}
```

- [ ] **Step 3: Attach event listeners (in the DOMContentLoaded or init block)**

In the initialization block where other event listeners are attached, add:

```javascript
document.getElementById("nlSearchInput").addEventListener("input", (e) => {
  onNlSearch(e.target.value);
});

document
  .getElementById("nlSearchClear")
  .addEventListener("click", clearNlSearch);
```

- [ ] **Step 4: Update the render function to use nlResults when active**

In the render function, where the displayed tool list is determined (currently from `state.catalog` filtered by `state.filters`), add a branch at the top:

```javascript
// Natural language search results take priority over filter state
const displayTools =
  state.nlResults !== null
    ? state.nlResults
    : applyFilters(state.catalog, state.filters);
```

Replace all uses of the previous `filteredTools` or `displayTools` variable with this new `displayTools`.

- [ ] **Step 5: Show reasoning excerpt below each card when in search mode**

In the card rendering function, add a reasoning line that only shows when `tool.searchReasoning` is present:

```javascript
const reasoningHtml = tool.searchReasoning
  ? `<p class="search-reasoning">${escHtml(tool.searchReasoning)}</p>`
  : "";
```

Insert `${reasoningHtml}` into the card template after the description.

- [ ] **Step 6: Commit**

```bash
git add public/app.js
git commit -m "feat(ui): wire up natural language search with debounce and result rendering"
```

---

### Task 5: Add CSS for search input and reasoning excerpt

**Files:**

- Modify: `public/style.css`

- [ ] **Step 1: Append search styles**

Open `public/style.css` and append:

```css
.search-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  max-width: 520px;
}

.search-bar input[type="search"] {
  flex: 1;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.45rem 0.75rem;
  color: var(--text);
  font-size: 0.875rem;
  outline: none;
}

.search-bar input[type="search"]:focus {
  border-color: var(--accent);
}

.search-bar input[type="search"]::placeholder {
  color: var(--text-muted);
}

.btn-ghost {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  padding: 0.4rem 0.6rem;
  cursor: pointer;
  font-size: 0.8rem;
}

.btn-ghost:hover {
  color: var(--text);
  border-color: var(--text-muted);
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.search-reasoning {
  font-size: 0.78rem;
  color: var(--accent);
  font-style: italic;
  margin: 0.25rem 0 0;
  line-height: 1.4;
}
```

- [ ] **Step 2: Verify the UI**

```bash
npm start
```

Open `http://localhost:3737`. The search bar should appear in the header. Typing in it shows a spinner after 400ms (if LLM key is configured and catalog is loaded). Without an LLM key, typing will show no results but won't crash.

- [ ] **Step 3: Full end-to-end test (requires LLM_API_KEY)**

```bash
# Set up a free OpenRouter key first, then:
LLM_API_KEY=sk-or-... LLM_BASE_URL=https://openrouter.ai/api/v1 \
  LLM_MODEL=nousresearch/hermes-3-llama-3.1-405b-instruct:free npm start
```

1. Open `http://localhost:3737`
2. Click "Refresh Catalog" and wait for it to load
3. Type "database migration" in the search bar
4. Verify: results appear with reasoning excerpts, results are more relevant than alphabetical browse would give
5. Click "Clear" — verify returns to filtered browse mode

- [ ] **Step 4: Commit**

```bash
git add public/style.css
git commit -m "feat(ui): add search bar and reasoning excerpt styles"
```

---

### Task 6: Run full test suite

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: all tests pass including the new `llm-search.test.js` tests.

- [ ] **Step 2: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "feat: natural language search complete (backend + frontend)"
```
