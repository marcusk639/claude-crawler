"use strict";

const { scanContent } = require("./scanner");

function scoreCatalog(tools) {
  return tools
    .map((tool) => {
      const contentWarnings = scanContent(tool);
      const score = computeScore({ ...tool, contentWarnings });
      return { ...tool, contentWarnings, score };
    })
    .sort((a, b) => b.score - a.score);
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

  // Penalties
  score -= tool.contentWarnings.length * 20;
  if (!tool.description) score -= 5;
  if (!tool.license && tool.source !== "ecc") score -= 2;

  return Math.round(Math.max(0, Math.min(100, score)));
}

module.exports = { scoreCatalog, computeScore };
