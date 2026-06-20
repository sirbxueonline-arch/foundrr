# Founder

Founder is a local, single-machine command center for supervising AI coding agents
(Claude Code) from anywhere, paired with a global anonymous usage leaderboard. A
Node/TypeScript daemon runs on your dev box and serves a dashboard (Agents, Servers,
a real `claude` terminal); a zero-dependency hook bridge observes Claude Code and
feeds it events; and the crown jewel is the leash — when you're away, your machine
reaches you over the shared Telegram bot **@foundrremotebot** so you can approve or
deny Claude Code's permission prompts with one tap. Single user, one access token,
local SQLite, binds `127.0.0.1` by default.

## Setup (run these)

Run in the repo root, in order:

```bash
npm install        # install workspace deps
npm run build      # compile every package (shared, hook, web, daemon)
npm link           # put `mc` on your PATH (global command)
mc setup           # installs hooks, writes the access token, ENABLES token
                   #   recording in ~/.claude/settings.json, prints the dashboard URL
mc start           # start the daemon; then open the printed http://...?token=... URL
```

**Restart Claude Code after `mc setup`** so the telemetry env it writes into
`~/.claude/settings.json` takes effect (that's what powers the live cost/token meter).

`mc setup` is idempotent and safe to re-run — every step backs up
`~/.claude/settings.json` first and merges without clobbering.

> Not linking `mc` globally? Every command also works as
> `node packages/daemon/dist/cli/index.js <command>`.

## Notes

- **Pick your agent/model:** `mc config model <key>` (see keys with
  `mc config model show`). This is the bucket reported to the global leaderboard.
- **Link the leash:** `mc telegram link` prints a one-time code; message
  **@foundrremotebot** with `/link <CODE>` to approve/deny from your phone. One
  shared bot serves every install — no BotFather, no token.
- **Telemetry is anonymous and on by default** (install id + model + token/cost
  deltas; never code, paths, or prompts). Opt out with `mc telemetry share off`.
  `mc telemetry enable --write` re-applies the OTel env if you ever need it.
- **Binds `127.0.0.1` by default** (local only). For LAN / Tailscale access, start
  with `HOST=0.0.0.0 mc start`. `PORT` defaults to `7878`.
- **Check the install** any time with `mc doctor` (Node, `claude` on PATH, token,
  hooks, telemetry env, web build).
- **Revoke a leaked URL** with `mc rotate-token`.

## For the agent

If the user asks to set up or run Founder, execute the **Setup (run these)** steps
above in order. After `mc setup`, remind them to restart Claude Code so telemetry
applies, then run `mc start` and open the printed `?token=` URL.
