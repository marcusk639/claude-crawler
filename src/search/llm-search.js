"use strict";

const SYSTEM_PROMPT =
  "You are a tool discovery assistant for Claude Code developers. " +
  "Given a developer's request and a list of available tools, identify the most relevant ones. " +
  "Respond ONLY with the requested JSON object. No prose, no markdown fences.";

const MAX_CATALOG_FOR_PROMPT = 100;
const MIN_QUERY_CHARS = 3;
const MAX_QUERY_CHARS = 500;

function getClient() {
  if (!process.env.LLM_API_KEY) {
    throw new Error("LLM_API_KEY is not set — LLM features are disabled");
  }
  const { OpenAI } = require("openai");
  return new OpenAI({
    baseURL: process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1",
    apiKey: process.env.LLM_API_KEY,
  });
}

function buildSummaries(catalog) {
  return catalog
    .slice(0, MAX_CATALOG_FOR_PROMPT)
    .map(
      (t) =>
        `ID:${t.id} | ${t.name} | ${(t.description || "").slice(0, 100)} | topics:${(t.topics || []).slice(0, 5).join(",")}`,
    )
    .join("\n");
}

async function naturalLanguageSearch(query, catalog) {
  if (typeof query !== "string" || query.trim().length < MIN_QUERY_CHARS) {
    throw new Error(`Query must be at least ${MIN_QUERY_CHARS} characters`);
  }
  if (query.length > MAX_QUERY_CHARS) {
    throw new Error(`Query must be ${MAX_QUERY_CHARS} characters or fewer`);
  }

  const client = getClient();

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

  // Defense against hallucinated IDs — strict join against actual catalog
  const catalogById = Object.fromEntries(catalog.map((t) => [t.id, t]));

  return matches
    .filter((m) => m.id && catalogById[m.id])
    .map((m) => ({ ...catalogById[m.id], searchReasoning: m.reasoning || "" }));
}

module.exports = { naturalLanguageSearch };
