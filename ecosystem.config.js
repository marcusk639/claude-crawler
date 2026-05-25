/**
 * PM2 ecosystem configuration for claude-crawler.
 *
 * Why this exists: the MCP wrapper (~/dev/claude-crawler/mcp/server.js — roadmap
 * item M.4) calls localhost:3737, so the crawler must be up whenever Claude
 * sessions want catalog data. Run via:
 *
 *   pm2 start ecosystem.config.js
 *   pm2 save                       # persist process list across reboots
 *   pm2 startup                    # one-time: register PM2 with launchd
 *
 * Why fork mode (not cluster): src/server.js relies on `catalogInFlight`
 * single-flight dedup that's only correct within one process. Cluster mode
 * would spawn N workers, each with its own dedup state — defeating the
 * design and multiplying external-API calls.
 */
module.exports = {
  apps: [
    {
      name: "claude-crawler",
      script: "src/server.js",
      cwd: __dirname,

      // Single-instance fork mode (see header comment).
      instances: 1,
      exec_mode: "fork",

      // Restart policy:
      // - autorestart on unexpected crash
      // - require 10s uptime before counting as "stable" (catch crash-loops)
      // - cap restarts at 5; if it crashes 5 times in <60s, stop trying
      autorestart: true,
      min_uptime: "10s",
      max_restarts: 5,
      restart_delay: 2000,

      // Memory ceiling. Crawler holds an in-memory catalog cache; 200MB is
      // generous for the current crawler+npm+GitHub fetch surface. Adjust
      // upward if Google CSE pagination grows the cache.
      max_memory_restart: "200M",

      // Don't watch source files (production-style; use `npm run dev` for
      // hot-reload).
      watch: false,

      // Graceful shutdown — let in-flight crawls finish before SIGKILL.
      kill_timeout: 10000,

      // Logs: keep them inside the project so they're easy to grep.
      // Note: pm2-logrotate (`pm2 install pm2-logrotate`) is recommended
      // separately to cap log size.
      out_file: "./logs/out.log",
      error_file: "./logs/err.log",
      merge_logs: true,
      time: true,

      // Runtime env. Real secrets stay in .env (loaded by src/server.js via
      // dotenv) — do NOT put GITHUB_TOKEN / GOOGLE_API_KEY here, they'd
      // leak via `pm2 show`.
      env: {
        NODE_ENV: "production",
        PORT: 3737,
      },
    },
  ],
};
