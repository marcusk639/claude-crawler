"use strict";

const CATEGORY_DISPLAY = {
  "mcp-servers": "MCP Servers",
  agents: "Agents",
  skills: "Skills",
  templates: "Templates",
  hooks: "Hooks",
  tools: "Tools",
  plugins: "Plugins",
};

const JOB_DISPLAY = {
  "automate-workflow": "Automate Workflow",
  "code-quality": "Code Quality",
  "language-support": "Language Support",
  "external-services": "External Services",
  "ai-enhancement": "AI Enhancement",
  "project-management": "Project Management",
};

// One paragraph of static intro copy per category landing page.
// Hand-written so each page has unique, indexable prose (not a templated stub).
const CATEGORY_INTRO = {
  "mcp-servers":
    "Model Context Protocol servers extend Claude Code with new tool surfaces — databases, APIs, browsers, file systems. Each one runs as a local process Claude talks to over stdio, giving sessions structured access to systems beyond the working directory.",
  agents:
    "Subagents are specialized Claude personas Claude Code can dispatch in parallel — code reviewers, planners, debuggers, security auditors. Each agent has its own tool allowlist and system prompt, letting you parallelize complex work without polluting your main session's context.",
  skills:
    "Skills are slash-invokable workflows that bundle instructions, tool permissions, and progressive-disclosure references. A well-written skill turns a recurring task — writing tests, reviewing PRs, debugging a class of bug — into one consistent command.",
  templates:
    "CLAUDE.md templates give Claude Code session-level instructions: architecture, conventions, invariants, who to ask. A good template means new contributors and new sessions both onboard in the first message instead of the tenth.",
  hooks:
    "Hooks are shell commands the harness runs on tool events — PreToolUse to block dangerous writes, PostToolUse to auto-format, Stop to verify before exiting. They turn Claude Code from a chat tool into a guarded production-grade harness.",
  tools:
    "Standalone CLI tools and utilities that complement Claude Code workflows — installers, validators, log analyzers, deployment helpers. Not technically Claude Code extensions, but the daily tools developers reach for alongside.",
  plugins:
    "Bundles of skills, agents, and MCP servers distributed as a single installable unit. Plugins are how you share a complete workflow — domain knowledge plus tools plus discipline — with the rest of your team.",
};

const JOB_INTRO = {
  "automate-workflow":
    "Tools that take repetitive Claude Code workflows — running tests, formatting, reviewing, committing — and turn them into one-command pipelines.",
  "code-quality":
    "Reviewers, linters, type-checkers, and refactoring assistants that catch issues before they ship.",
  "language-support":
    "Skills, agents, and MCP servers that give Claude Code idiomatic mastery of a specific language or framework.",
  "external-services":
    "MCP servers and integrations that connect Claude Code to APIs, databases, cloud platforms, and SaaS tools.",
  "ai-enhancement":
    "Tools that improve how Claude itself plans, reasons, retrieves context, and self-corrects across long sessions.",
  "project-management":
    "Skills and agents for planning, status tracking, decomposition, and team coordination from inside Claude Code.",
};

const TOP_N_CATEGORY = 20;
const TOP_N_JOB = 20;
const TOP_N_RELATED = 6;
const TOP_N_HOMEPAGE_SEED = 50;
const WRITE_BATCH_SIZE = 50;

module.exports = {
  CATEGORY_DISPLAY,
  JOB_DISPLAY,
  CATEGORY_INTRO,
  JOB_INTRO,
  TOP_N_CATEGORY,
  TOP_N_JOB,
  TOP_N_RELATED,
  TOP_N_HOMEPAGE_SEED,
  WRITE_BATCH_SIZE,
};
