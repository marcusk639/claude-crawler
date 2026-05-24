"use strict";

// Patterns that flag genuinely suspicious content in Claude config files.
// Conservative — minimize false positives on normal code/docs.

// INJECTION_PATTERNS are critical: writing a file with these to ~/.claude/ is blocked outright.
const INJECTION_PATTERNS = [
  {
    re: /ignore\s+(all\s+)?(previous|prior)\s+(instructions?|rules?|prompts?)/i,
    label: 'Prompt injection: "ignore previous instructions"',
  },
  {
    re: /disregard\s+(your\s+)?(system\s+prompt|instructions)/i,
    label: "Prompt injection: disregard system prompt",
  },
  {
    re: /you\s+are\s+now\s+(a\s+)?(different|new|another)\s+(AI|assistant|model)/i,
    label: "Prompt injection: persona override",
  },
  {
    re: /act\s+as\s+(a\s+)?(different|new|another|evil|unrestricted)\s+(AI|assistant|model)/i,
    label: "Prompt injection: act-as persona override",
  },
  {
    re: /pretend\s+(you\s+are|to\s+be)\s+(a\s+)?(different|new|another|evil|unrestricted)/i,
    label: "Prompt injection: pretend persona override",
  },
  {
    re: /\bDAN\b.{0,30}(mode|prompt|jailbreak)/i,
    label: "Prompt injection: DAN pattern",
  },
  {
    re: /forget\s+(everything|all)\s+(you\s+)?(know|were\s+told)/i,
    label: "Prompt injection: memory wipe instruction",
  },
  {
    re: /override\s+(your\s+)?(current\s+)?(instructions?|rules?|system\s+prompt)/i,
    label: "Prompt injection: override instructions",
  },
  {
    re: /###\s*(INSTRUCTIONS?|SYSTEM|OVERRIDE|PROMPT)\s*###/i,
    label: "Prompt injection: markdown instruction block",
  },
  {
    re: /<\|system\|>|<\|assistant\|>|<\|user\|>/i,
    label: "Prompt injection: model-specific control tokens",
  },
  {
    re: /roleplay\s+as\s+(an?\s+)?(evil|unrestricted|jailbroken|uncensored)/i,
    label: "Prompt injection: roleplay jailbreak",
  },
  {
    re: /your\s+true\s+self\s+(has|have|knows?)\s+no\s+(limits?|restrictions?)/i,
    label: "Prompt injection: true-self jailbreak",
  },
];

const EXFILTRATION_PATTERNS = [
  {
    re: /curl\s+.{0,80}(\.env|id_rsa|credentials|\.aws|\.ssh)/i,
    label: "Possible credential exfiltration via curl",
  },
  {
    re: /curl\s+https?:\/\/[^\s]+\s+-d\s+@/i,
    label: "curl file upload to remote server",
  },
  {
    re: /\bcat\s+~?\/?\.?(env|ssh|aws)\b/i,
    label: "Reading sensitive credential files",
  },
  {
    re: /nc\s+\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i,
    label: "Netcat to IP address",
  },
  {
    re: /\/dev\/tcp\//i,
    label: "Bash TCP reverse shell via /dev/tcp",
  },
  {
    re: /env\s*\|\s*(curl|wget|nc)\b/i,
    label: "Piping env vars to network tool",
  },
  {
    re: /settings\.json\s*\|\s*(curl|wget)/i,
    label: "Exfiltrating settings.json",
  },
  {
    re: /wget\s+.*--post-data/i,
    label: "wget credential post to remote server",
  },
  {
    re: /process\.env\b.{0,100}(fetch|XMLHttpRequest|require\s*\(\s*['"]https)/i,
    label: "JavaScript process.env exfiltration",
  },
];

const OBFUSCATION_PATTERNS = [
  {
    re: /eval\s*\(\s*(Buffer|atob|fromBase64)/i,
    label: "Eval of base64/encoded content",
  },
  { re: /exec\s*\(\s*atob\s*\(/i, label: "Exec of base64-decoded content" },
  {
    re: /[A-Za-z0-9+/]{200,}={0,2}/,
    label: "Suspicious long base64-like string",
  },
];

const HOOK_PATTERNS = [
  {
    re: /rm\s+-rf\s+~?\/(\.claude|\.config|Documents|Desktop)/i,
    label: "Destructive rm -rf targeting home dirs",
  },
  { re: /git\s+push\s+.*--force/i, label: "Force push in hook" },
  { re: /chmod\s+777/i, label: "Overly permissive chmod 777" },
];

function scanContent(tool) {
  const warnings = [];
  const textToScan = buildScanTarget(tool);
  if (!textToScan) return warnings;

  // Only scan CLAUDE.md templates and hooks with full injection checks
  const isHighRisk = ["templates", "hooks"].includes(tool.category);

  // Injection patterns are critical — a file containing these in ~/.claude is a direct attack vector
  for (const { re, label } of INJECTION_PATTERNS) {
    if (re.test(textToScan)) warnings.push({ severity: "critical", label });
  }

  for (const { re, label } of EXFILTRATION_PATTERNS) {
    if (re.test(textToScan)) warnings.push({ severity: "critical", label });
  }

  for (const { re, label } of OBFUSCATION_PATTERNS) {
    if (re.test(textToScan)) warnings.push({ severity: "high", label });
  }

  if (isHighRisk || tool.source === "ecc") {
    for (const { re, label } of HOOK_PATTERNS) {
      if (re.test(textToScan)) warnings.push({ severity: "medium", label });
    }
  }

  return warnings;
}

function buildScanTarget(tool) {
  // No length cap — a padded payload placed after 8000 chars would bypass all checks.
  // Callers should enforce a max download size before calling scanContent.
  return [tool.readme || "", tool.description || ""].join("\n");
}

module.exports = { scanContent };
