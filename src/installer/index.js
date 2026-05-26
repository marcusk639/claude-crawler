"use strict";

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const axios = require("axios");
const { scanContent } = require("../scoring/scanner");

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const GH_API = "https://api.github.com";

// Files that must never be overwritten regardless of install category.
// Overwriting these would give an attacker control over Claude Code's core config.
const PROTECTED_FILENAMES = new Set([
  "settings.json",
  "settings.local.json",
  ".mcp.json",
  "CLAUDE.md",
  "claude.md",
]);

const MAX_FILE_BYTES = 512 * 1024; // 512 KB — reasonable cap for agent/skill files
const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(process.env.GITHUB_TOKEN && {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  }),
};

// Allowlist of hosts we will fetch file content from. Protects against SSRF
// if a GitHub API response (or future crawler) ever produces a non-GitHub URL —
// e.g. a redirect to cloud metadata endpoints (169.254.169.254) on a hosted deployment.
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
]);

function isAllowedDownloadUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_DOWNLOAD_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

// Returns a preview of what would happen — no filesystem changes
async function getInstallPreview(tool) {
  const config = tool.installConfig || {};

  switch (config.type) {
    case "npm-package":
      return previewNpm(tool);
    case "github-file":
    case "github-dir":
    case "github-repo":
    case "mcp-server":
      return previewGithub(tool);
    case "local":
      return {
        type: "local",
        message: "Already installed locally — no action needed.",
        files: [],
      };
    default:
      return {
        type: "unknown",
        message: "No install method available for this tool.",
        files: [],
      };
  }
}

function previewNpm(tool) {
  const pkg = tool.installConfig.npmPackage;
  return {
    type: "npm",
    command: `npm install -g ${pkg}`,
    message: `Installs ${pkg} globally via npm. No files will be written to ~/.claude.`,
    files: [],
    warnings: tool.contentWarnings || [],
  };
}

async function previewGithub(tool) {
  const config = tool.installConfig;
  const [owner, repo] = (config.repoFullName || "").split("/");
  if (!owner || !repo)
    return {
      type: "error",
      message: "Cannot determine repo from tool config.",
      files: [],
    };

  const files = await fetchRepoFileList(owner, repo, tool.category);
  const destDir = resolveDestDir(tool);

  const resolvedDestDir = path.resolve(destDir);
  const fileChanges = files.flatMap((f) => {
    const dest = path.resolve(destDir, f.name);
    // Block path traversal — dest must stay within destDir
    if (!dest.startsWith(resolvedDestDir + path.sep)) {
      throw new Error(`Path traversal blocked: ${f.name}`);
    }
    // Exclude protected system files from preview — executeInstall also enforces this,
    // but surfacing it here keeps the preview accurate and avoids a misleading "will create" entry.
    if (PROTECTED_FILENAMES.has(path.basename(dest))) {
      return [];
    }
    const exists = fs.pathExistsSync(dest);
    return [
      {
        src: f.downloadUrl,
        dest,
        exists,
        action: exists ? "overwrite" : "create",
        size: f.size,
      },
    ];
  });

  return {
    type: "github",
    repoUrl: tool.url,
    destDir,
    files: fileChanges,
    warnings: tool.contentWarnings || [],
    message: buildPreviewMessage(fileChanges, destDir),
  };
}

async function fetchRepoFileList(owner, repo, category) {
  // Probe common paths where the relevant content lives
  const probePaths = getContentPaths(category);

  for (const probePath of probePaths) {
    try {
      const url = probePath
        ? `${GH_API}/repos/${owner}/${repo}/contents/${probePath}`
        : `${GH_API}/repos/${owner}/${repo}/contents`;

      const { data } = await axios.get(url, {
        headers: GH_HEADERS,
        timeout: 8000,
      });
      const items = Array.isArray(data) ? data : [data];
      const mdFiles = items.filter(
        (f) =>
          f.type === "file" &&
          (f.name.endsWith(".md") || f.name.endsWith(".json")),
      );

      if (mdFiles.length > 0) {
        return mdFiles.map((f) => ({
          name: f.name,
          downloadUrl: f.download_url,
          size: f.size,
        }));
      }
    } catch {
      /* path doesn't exist in this repo — try next */
    }
  }

  return [];
}

function getContentPaths(category) {
  switch (category) {
    case "agents":
      return [".claude/agents", "agents", ""];
    case "skills":
      return [".claude/skills", "skills", ""];
    case "templates":
      return ["", ".claude"];
    default:
      return [""];
  }
}

function resolveDestDir(tool) {
  const category = tool.category;
  const name = tool.name.toLowerCase().replace(/[^a-z0-9-_]/g, "-");

  switch (category) {
    case "agents":
      return path.join(CLAUDE_DIR, "agents");
    case "skills":
      return path.join(CLAUDE_DIR, "skills", name);
    case "templates":
      return CLAUDE_DIR;
    case "hooks":
      return path.join(CLAUDE_DIR, "hooks");
    default:
      return path.join(CLAUDE_DIR, "tools", name);
  }
}

function buildPreviewMessage(fileChanges, destDir) {
  const creates = fileChanges.filter((f) => f.action === "create").length;
  const overwrites = fileChanges.filter((f) => f.action === "overwrite").length;
  const parts = [];
  if (creates) parts.push(`create ${creates} file${creates !== 1 ? "s" : ""}`);
  if (overwrites)
    parts.push(
      `overwrite ${overwrites} existing file${overwrites !== 1 ? "s" : ""}`,
    );
  return `Will ${parts.join(" and ")} in ${destDir.replace(os.homedir(), "~")}`;
}

// Performs the actual install — only call after user confirms preview
async function executeInstall(tool) {
  const config = tool.installConfig || {};

  if (config.type === "npm-package") {
    return {
      success: true,
      type: "npm",
      command: config.npmInstallCmd,
      message: "Run the command above in your terminal to install.",
    };
  }

  const preview = await previewGithub(tool);
  if (preview.type === "error" || preview.files.length === 0) {
    return {
      success: false,
      message:
        preview.message || "No installable files found in this repository.",
    };
  }

  const destDir = resolveDestDir(tool);
  await fs.ensureDir(destDir);

  const installed = [];
  const errors = [];

  for (const file of preview.files) {
    try {
      if (file.size > MAX_FILE_BYTES) {
        errors.push({
          file: file.dest,
          error: `File too large (${file.size} bytes, max ${MAX_FILE_BYTES})`,
        });
        continue;
      }

      // SSRF guard: only fetch from known GitHub raw-content hosts
      if (!isAllowedDownloadUrl(file.src)) {
        errors.push({
          file: file.dest,
          error: `Blocked unsafe download URL (must be raw.githubusercontent.com or objects.githubusercontent.com)`,
        });
        continue;
      }

      const { data: content } = await axios.get(file.src, {
        responseType: "text",
        timeout: 10000,
        maxContentLength: MAX_FILE_BYTES,
        maxBodyLength: MAX_FILE_BYTES,
        // Disable redirects entirely — an HTTP 302 from a compromised endpoint
        // could redirect to an internal address, bypassing the host allowlist
        maxRedirects: 0,
      });

      // Block writes to core Claude Code config files regardless of category
      if (PROTECTED_FILENAMES.has(path.basename(file.dest))) {
        errors.push({
          file: file.dest,
          error: `Refusing to overwrite protected system file: ${path.basename(file.dest)}`,
        });
        continue;
      }

      // Scan actual downloaded content before writing — catches injections missed by readme scan
      const warnings = scanContent({
        ...tool,
        readme: content,
        description: "",
      });
      const criticals = warnings.filter((w) => w.severity === "critical");
      if (criticals.length > 0) {
        errors.push({
          file: file.dest,
          error: `Blocked by security scan: ${criticals.map((w) => w.label).join(", ")}`,
        });
        continue;
      }

      // Backup existing file before overwriting
      if (file.exists) {
        await fs.copy(file.dest, `${file.dest}.bak`, { overwrite: true });
      }

      await fs.outputFile(file.dest, content, "utf8");
      installed.push(file.dest.replace(os.homedir(), "~"));
    } catch (err) {
      errors.push({ file: file.dest, error: err.message });
    }
  }

  return {
    success: errors.length === 0,
    installed,
    errors,
    message:
      errors.length === 0
        ? `Installed ${installed.length} file(s) successfully.`
        : `Installed ${installed.length} file(s) with ${errors.length} error(s).`,
  };
}

module.exports = { getInstallPreview, executeInstall };
