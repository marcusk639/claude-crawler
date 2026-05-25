"use strict";

const crypto = require("node:crypto");

const TTL_7_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_README_CHARS = 200;
const MAX_README_CHARS = 2000;

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
  if (!tool.readme || tool.readme.length < MIN_README_CHARS) return null;

  const key = makeCacheKey(tool);
  const cached = getCached(key);
  if (cached) return cached;

  const prompt = `Analyze this Claude Code tool and score it across 5 dimensions (0-20 each).

Tool name: ${tool.name}
Description: ${tool.description || "(none)"}
README (first ${MAX_README_CHARS} chars): ${tool.readme.slice(0, MAX_README_CHARS)}
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
