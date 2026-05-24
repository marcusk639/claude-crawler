"use strict";

const { crawlGitHub } = require("./github");
const { crawlNpm } = require("./npm");
const { crawlAnthropicOrg } = require("./anthropic");
const { crawlEcc } = require("./ecc");
const { crawlWeb } = require("./web");
const { detectInstalled } = require("../installer/detect");

async function crawlAll() {
  const results = await Promise.allSettled([
    crawlGitHub(),
    crawlNpm(),
    crawlAnthropicOrg(),
    crawlEcc(),
    crawlWeb(),
  ]);

  const tools = [];
  const sourceNames = ["GitHub", "npm", "Anthropic org", "ECC", "Web"];

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      tools.push(...result.value);
    } else {
      console.warn(
        `[crawler] ${sourceNames[i]} failed: ${result.reason?.message}`,
      );
    }
  });

  const deduped = deduplicateById(tools);
  const withInstallStatus = await detectInstalled(deduped);
  return withInstallStatus;
}

function deduplicateById(tools) {
  const seen = new Map();
  for (const tool of tools) {
    const existing = seen.get(tool.id);
    if (!existing) {
      seen.set(tool.id, { ...tool });
    } else if (tool.stars > (existing.stars || 0)) {
      // Keep the higher-star version but carry forward any community signals from the other
      seen.set(tool.id, {
        ...tool,
        communityMentions:
          (existing.communityMentions || 0) + (tool.communityMentions || 0),
        communityScore: Math.max(
          existing.communityScore || 0,
          tool.communityScore || 0,
        ),
        communityContext: [
          ...(existing.communityContext || []),
          ...(tool.communityContext || []),
        ],
      });
    } else {
      // Existing wins on stars — merge incoming community signals immutably
      seen.set(tool.id, {
        ...existing,
        communityMentions:
          (existing.communityMentions || 0) + (tool.communityMentions || 0),
        communityScore: Math.max(
          existing.communityScore || 0,
          tool.communityScore || 0,
        ),
        communityContext: [
          ...(existing.communityContext || []),
          ...(tool.communityContext || []),
        ],
      });
    }
  }
  return [...seen.values()];
}

module.exports = { crawlAll };
