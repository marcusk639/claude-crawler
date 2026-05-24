# Hermes AI — Strategic Integration Guide for Claude Crawler

_Research date: 2026-05-24 | Confidence: High (multi-source verified)_

---

## Executive Summary

Hermes AI from Nous Research is two distinct but complementary things: an **open-weight LLM model family** (Hermes 3/4) and an **open-source autonomous agent runtime** (Hermes Agent). Both are directly applicable to claude-crawler, and together they could power the product's most differentiating capabilities — intelligent scoring, AI-assisted discovery, and fully local inference — at a fraction of the cost of Claude or GPT.

The core proposition: Hermes 4 70B delivers Claude-Sonnet-class function calling at **$0.13/M input tokens vs. $3/M for Claude Sonnet** (23x cheaper). The Hermes Agent system, with its persistent memory, self-improving skill library, and OpenAI-compatible API, could replace hand-coded crawl orchestration with an agent that gets smarter over time.

---

## What Hermes Is (And Is Not)

### Layer 1: The Hermes LLM Models

Open-weight language models fine-tuned from Llama 3.1, Qwen3, and ByteDance Seed bases. Released under the Llama 3 community license (permissive commercial use). Available free on HuggingFace; hosted inference via OpenRouter, Nous Portal, and a dozen other providers.

| Model          | Parameters | Context | Input $/1M | Output $/1M | Notes                                  |
| -------------- | ---------- | ------- | ---------- | ----------- | -------------------------------------- |
| Hermes 3 8B    | 8B         | 128K    | ~$0.05     | ~$0.10      | Local-friendly (8–16GB VRAM)           |
| Hermes 4 70B   | 70B        | 131K    | $0.13      | $0.40       | Best cost/quality for this use case    |
| Hermes 4 405B  | 405B       | 131K    | $1.00      | $3.00       | Near-frontier, overkill for most tasks |
| Hermes 4.3 36B | 36B        | 512K    | ~$0.20     | ~$0.60      | 70B-equivalent quality; 512K context   |

**What makes Hermes models different from Claude/GPT:**

- Open weights — download and run locally with no outbound API calls
- Hybrid reasoning mode — toggleable `<think>…</think>` traces (similar to Claude extended thinking)
- Low refusal rate — does not refuse to analyze potentially sensitive tool content
- Strong structured JSON output — a specific training objective, not an afterthought
- XML-tagged function calling — explicit, parser-friendly `<tool_call>` / `<tool_response>` format

### Layer 2: Hermes Agent (the Runtime)

A self-hosted autonomous agent framework — not a model, not a managed service. MIT-licensed Python application you run on a server, VPS, or locally.

Key properties:

- **Model-agnostic**: Defaults to Hermes LLMs but works with Claude, GPT, Gemini, or any Ollama model
- **OpenAI-compatible REST API**: Exposes `POST /v1/chat/completions` at `localhost:8642` — your existing Node.js axios/fetch code works unchanged
- **Persistent memory**: Cross-session FTS search + LLM summarization; accumulates knowledge across runs
- **Self-improving skills**: After complex tasks (5+ tool calls), the agent writes a skill document capturing the approach. Future similar tasks load the skill instead of re-reasoning from scratch
- **MCP-native**: Speaks the Model Context Protocol natively — can consume discovered MCP servers directly
- **157k GitHub stars**, MIT license, 1,300+ contributors

Install: `curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash`

---

## Where Hermes Fits in Claude Crawler

### Current Architecture Gaps

Claude-crawler currently has hand-coded, static logic for:

1. Scoring tools (keyword regex on name/description)
2. Security scanning (pattern matching on README text)
3. Category detection (name-based heuristics)

These are brittle. A package named `nexus-mcp-adapter` will fail all name-based heuristics even if it's the best MCP server available. The right solution is reading and understanding the actual README and source code — which requires language model inference.

### Integration Map

```
claude-crawler
├── src/crawlers/          → Hermes Agent orchestration (optional, Phase 3)
├── src/scoring/index.js   → Hermes 4 70B LLM scoring (Phase 1 priority)
├── src/scoring/scanner.js → Hermes 4 70B content analysis (Phase 1 priority)
├── src/crawlers/web.js    → Hermes Agent web search tools (Phase 2)
└── public/app.js          → AI-powered search (Phase 2)
```

---

## Phase 1: LLM-Powered Scoring (Highest ROI, Lowest Complexity)

### The Problem with Current Scoring

`src/scoring/index.js` uses `log10(stars+1)` and keyword regex. This produces identical scores for:

- A 50-star MCP server with comprehensive docs, tests, and active maintenance
- A 50-star repo that's someone's weekend experiment with a broken README

### Hermes 4 for Intelligent Scoring

Add a `scoreWithLLM(tool)` function that calls Hermes 4 70B with a structured schema:

```javascript
// src/scoring/llm-scorer.js
const OpenAI = require("openai");

const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1",
  apiKey: process.env.LLM_API_KEY,
});

const SCORING_SCHEMA = {
  type: "object",
  properties: {
    documentationQuality: { type: "integer", minimum: 0, maximum: 20 },
    installabilityScore: { type: "integer", minimum: 0, maximum: 20 },
    maintenanceSignals: { type: "integer", minimum: 0, maximum: 20 },
    securityRisk: { type: "integer", minimum: 0, maximum: 20 },
    relevanceToClaudeCode: { type: "integer", minimum: 0, maximum: 20 },
    reasoning: { type: "string" },
    flags: { type: "array", items: { type: "string" } },
  },
  required: [
    "documentationQuality",
    "installabilityScore",
    "maintenanceSignals",
    "securityRisk",
    "relevanceToClaudeCode",
    "reasoning",
    "flags",
  ],
};

async function scoreWithLLM(tool) {
  const prompt = `Analyze this Claude Code tool and score it across 5 dimensions (0-20 each).
  
Tool: ${tool.name}
Description: ${tool.description}
README excerpt: ${(tool.readme || "").slice(0, 2000)}
Topics: ${(tool.topics || []).join(", ")}
Stars: ${tool.stars} | Downloads: ${tool.weeklyDownloads} | Updated: ${tool.updatedAt}

Respond ONLY with valid JSON matching this schema:
${JSON.stringify(SCORING_SCHEMA, null, 2)}`;

  const response = await client.chat.completions.create({
    model: process.env.LLM_MODEL || "nousresearch/hermes-4-405b",
    messages: [
      {
        role: "system",
        content:
          "You are a security-focused technical reviewer. Respond only with the requested JSON schema.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  return JSON.parse(response.choices[0].message.content);
}

module.exports = { scoreWithLLM };
```

**Why Hermes for this:** JSON schema adherence is a specific Hermes training objective. The model is less likely than Llama base models to hallucinate outside the schema. And at $0.13/M input tokens, scoring 500 tools with 2K-token READMEs costs roughly **$0.13 total per full catalog refresh** — effectively free.

### LLM Score Cache Strategy

LLM scoring should be cached aggressively. Tool READMEs don't change daily:

```javascript
// Cache LLM scores by tool ID + readme hash (content-addressed)
// TTL: 7 days (vs. 1 hour for the main catalog cache)
const llmScoreKey = `llm-score:${tool.id}:${hash(tool.readme)}`;
```

---

## Phase 2: AI-Powered Search and Recommendations

### Natural Language Discovery

The biggest UX gap in every competitor is that you must know what to search for. Claude-crawler could expose:

```
GET /api/search?q=I+need+something+to+help+me+with+database+migrations
```

This routes to Hermes 4 70B with the catalog as context, returning ranked results with explanations. This is the feature that Glama, PulseMCP, and Claude Marketplaces all lack.

### Implementation Pattern

```javascript
// POST /api/search/natural
app.post("/api/search/natural", async (req, res) => {
  const { query } = req.body;
  const catalog = cache.get("catalog") || [];

  // Send top-100 tool summaries + user query to Hermes
  // Get back: ranked IDs + reasoning per result
  const results = await naturalLanguageSearch(query, catalog.slice(0, 100));
  res.json({ ok: true, results });
});
```

**Cost estimate:** 100 tool summaries at ~100 tokens each = 10K input tokens per search. At $0.13/M tokens = **$0.0013 per search query**. Negligible.

### "Similar Tools" Recommendations

On the tool detail view, embed a call to Hermes to find semantically similar tools — not just same-category, but same-problem tools:

```javascript
async function findSimilarTools(targetTool, catalog) {
  // Give Hermes the target tool description + catalog summaries
  // Ask it to return 5 similar tools with similarity reasoning
}
```

---

## Phase 3: Hermes Agent for Crawl Orchestration (Advanced)

### Current Limitation

`src/crawlers/index.js` runs 5 fixed crawlers in parallel and stops. It cannot:

- Discover new data sources on its own
- Adapt query terms based on what's trending
- Follow citation trails (e.g., if a Reddit post mentions an unknown tool, chase it)
- Learn which queries consistently produce high-quality results

### Hermes Agent as Crawl Coordinator

With Hermes Agent running locally, you expose claude-crawler's crawl functions as tools and let the agent decide the crawl strategy:

```javascript
// Tools exposed to Hermes Agent
const CRAWL_TOOLS = [
  { name: 'search_github', description: 'Search GitHub repos by topic or keyword', ... },
  { name: 'search_npm',    description: 'Search npm registry by keyword', ... },
  { name: 'fetch_readme',  description: 'Fetch README for a specific repo', ... },
  { name: 'score_tool',    description: 'Score a tool using quality heuristics', ... },
  { name: 'save_tool',     description: 'Save a tool to the catalog', ... },
];
```

The agent's persistent memory means it remembers: "searches for `keywords:mcp-server` consistently return higher-quality results than `topic:mcp`." It writes this as a skill and applies it on the next crawl — without code changes.

**Why this matters for the product:** This is the "self-improving catalog" moat. Competitors have static crawlers. Claude-crawler gets smarter every week.

### Hermes Agent API Integration (Node.js)

```javascript
// src/agent/hermes-client.js
const OpenAI = require("openai");

// Works whether you're running Hermes Agent locally or calling OpenRouter directly
const hermes = new OpenAI({
  baseURL: process.env.HERMES_AGENT_URL || "http://localhost:8642/v1",
  apiKey: process.env.HERMES_AGENT_KEY || "local",
});

async function runAgenticCrawl(objective) {
  // Uses Hermes Agent's Runs API for async long-running crawl jobs
  const run = await hermes.post("/v1/runs", {
    messages: [{ role: "user", content: objective }],
    tools: CRAWL_TOOLS,
  });

  // Stream progress via SSE
  return run.id;
}
```

---

## Phase 4: Local-Only Inference for Privacy

### The Privacy Angle (Competitive Differentiator)

Claude-crawler reads `~/.claude/` config files — potentially including API keys, secrets, and personal project context. Sending this data to a cloud LLM is a legitimate concern for enterprise users.

With Hermes models running locally via Ollama:

- Zero data leaves the machine
- No API costs
- No rate limits
- Works offline

```bash
# Setup local Hermes inference
ollama pull hf.co/NousResearch/Hermes-4.3-36B-GGUF:Q4_K_M
```

Then in `.env`:

```
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=hf.co/NousResearch/Hermes-4.3-36B-GGUF:Q4_K_M
```

No code changes required — the same OpenAI-compatible client hits the local Ollama endpoint instead.

**Hardware requirement for Hermes 4.3 36B at Q4_K_M:** ~25GB RAM. This fits a Mac Studio M2 Ultra (192GB) or a machine with 32GB+ RAM.

---

## Cost Comparison: Hermes vs. Alternatives

For a typical claude-crawler workload (500 tools scored on catalog refresh):

| Option                        | Per Refresh | Per Month (4 refreshes/day) | Notes                 |
| ----------------------------- | ----------- | --------------------------- | --------------------- |
| Hermes 4 70B (OpenRouter)     | ~$0.15      | ~$18                        | Best value            |
| Hermes 4 405B (OpenRouter)    | ~$1.20      | ~$144                       | Near-frontier quality |
| Claude Sonnet 4.6             | ~$3.50      | ~$420                       | Current default       |
| GPT-4o                        | ~$5.50      | ~$660                       | Most expensive        |
| Hermes 4.3 36B (local Ollama) | $0.00       | $0.00                       | Requires hardware     |

**Recommendation:** Default to Hermes 4 70B via OpenRouter. Expose `LLM_MODEL` as an env var so users can override with local Ollama or a more powerful model for their use case.

---

## Implementation Roadmap

### Sprint 1 (1–2 days): LLM-Powered Scoring

1. Add `openai` npm package: `npm install openai`
2. Create `src/scoring/llm-scorer.js` with the schema above
3. Add `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` to `env.example`
4. Modify `src/scoring/index.js` to call `scoreWithLLM()` for tools with a README
5. Add 7-day LLM score cache with content-addressed keys
6. Add `llmScore` field to the normalized tool shape
7. Surface `llmScore` breakdown in the tool modal on the dashboard

### Sprint 2 (2–3 days): Natural Language Search

1. Create `POST /api/search/natural` endpoint in `src/server.js`
2. Create `src/search/llm-search.js` using Hermes structured output
3. Add search input to the dashboard header
4. Wire up results with reasoning excerpts shown per result

### Sprint 3 (3–5 days): Hermes Agent Crawl Orchestration

1. Install Hermes Agent locally
2. Define `CRAWL_TOOLS` schema from existing crawler functions
3. Create `src/agent/hermes-client.js`
4. Add `POST /api/agent/crawl` endpoint with SSE streaming
5. Add agent crawl status panel to the dashboard

---

## Risks and Mitigations

| Risk                                                      | Likelihood | Mitigation                                                                                         |
| --------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| Hermes quality below Claude for complex security analysis | Medium     | Use 405B for security scanner; 70B for general scoring                                             |
| OpenRouter rate limits during catalog refresh             | Low        | Batch requests; add retry with exponential backoff                                                 |
| Hermes Agent requires persistent Python process           | Medium     | Run as a sidecar only when LLM features are enabled; fall back to direct OpenRouter if not running |
| Local Ollama context window limited to 4K by default      | High       | Document the `OLLAMA_NUM_CTX=32768` env var in setup guide                                         |
| Nous Portal pricing opaque                                | Medium     | Default to OpenRouter which has published pricing; Portal is optional                              |

---

## Quick Start: Enable LLM Scoring Today

```bash
# 1. Install the OpenAI-compatible client
npm install openai

# 2. Get a free API key at openrouter.ai (no credit card for free tier models)
# Hermes 3 405B Instruct is free; Hermes 4 requires credits

# 3. Add to .env
echo "LLM_API_KEY=sk-or-..." >> .env
echo "LLM_BASE_URL=https://openrouter.ai/api/v1" >> .env
echo "LLM_MODEL=nousresearch/hermes-4-405b" >> .env

# 4. Restart
npm start
```

The scoring module will detect `LLM_API_KEY` and enrich scores automatically. Without the key, it falls back to the existing heuristic scoring — no breaking change.

---

## Sources

- [Hermes Agent Official Docs](https://hermes-agent.nousresearch.com/docs/)
- [Hermes Agent GitHub (MIT)](https://github.com/NousResearch/hermes-agent)
- [Hermes Agent API Server Docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)
- [Hermes 4 Model Card (HuggingFace)](https://huggingface.co/NousResearch/Hermes-4-70B)
- [Hermes 4 Technical Report (arXiv:2508.18255)](https://arxiv.org/pdf/2508.18255)
- [Hermes Function Calling Reference (GitHub, MIT)](https://github.com/NousResearch/Hermes-Function-Calling)
- [OpenRouter: Nous Research Models + Pricing](https://openrouter.ai/nousresearch)
- [Nous Portal](https://portal.nousresearch.com/info)
