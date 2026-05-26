"use strict";

const MAX_SLUG_LEN = 60;
const VALID_CATEGORIES = new Set([
  "agents",
  "skills",
  "templates",
  "hooks",
  "mcp-servers",
  "tools",
  "plugins",
]);

function slugify(name) {
  if (typeof name !== "string") return "";
  const stripped = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return stripped.slice(0, MAX_SLUG_LEN);
}

function toolUrl(tool) {
  const category = VALID_CATEGORIES.has(tool && tool.category)
    ? tool.category
    : "tools";
  return `/tools/${category}/${slugify(tool && tool.name)}`;
}

function categoryUrl(category) {
  return `/categories/${category}`;
}

function jobUrl(job) {
  return `/jobs/${job}`;
}

module.exports = { slugify, toolUrl, categoryUrl, jobUrl, MAX_SLUG_LEN };
