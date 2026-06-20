# Mission Control

A **local, single-machine command center** for supervising Claude Code from
anywhere. It runs on your dev box, owns no cloud, and lets you watch your
agents, control dev servers, and drive a real `claude` terminal — from your
desk or your phone.

The point isn't observation (that's a crowded space). The point is **the
leash**: when you're away, the machine reaches *you* over Telegram and lets you
**approve or deny Claude Code's permission prompts with one tap**. Everything
else exists in service of that.

Single user. One access token. Local SQLite. Binds `127.0.0.1` by default.

---

## Architecture

One Node/TypeScript **Fastify daemon** owns every privileged operation and also
serves the built dashboard. A **zero-dependency hook bridge** wired into Claude
Code's hooks feeds it events.

- **Daemon** — HTTP + WebSocket + PTY (terminal) + SQLite (persistence) +
  grammY (Telegram) + an OTLP receiver (cost/token metrics). Serves the
  Vite/React dashboard from `packages/web/dist`.
- **Hook bridge** — a tiny script that reads each hook's JSON from stdin and
  POSTs it to the daemon. It fails silently, times out fast, and exits 0, so a
  broken Mission Control never breaks your coding session.

**Data flow:**

```
Claude Code ──hook──▶ POST /events ──▶ EventHub ──▶ WS /stream ──▶ Dashboard
                                          └──▶ Telegram (notify)

PreToolUse hook ──▶ /approvals ──▶ Telegram Approve/Deny ──▶ hook proceeds/defers

Dashboard ──WS /term──▶ PTY (claude CLI) ──▶ Dashboard
Dashboard ──REST──▶ port scan / git / server control
```

---

## Requirements

- **Node ≥ 20**
- **`claude` on your PATH** — needed for the Terminal's **+ Claude** action.
- **Windows arm64 caveat:** the pinned `node-pty` build ships no prebuilt binary
  for Windows arm64. On that platform you'll need VS Build Tools to compile it,
  or run an x64 Node. The rest of the dashboard runs fine regardless — the
  Terminal panel **degrades gracefully** and shows the node-pty load error
  instead of crashing.

---

## Quick start

```bash
npm install && npm run build   # install deps + compile every package
npm link                       # put `mc` on your PATH (global)
mc setup                       # guided first-run: token + hooks + URL + next steps
mc start                       # start the daemon; open the printed URL
```

That's it. **`mc setup` replaces the old manual multi-step dance** — it creates
your home dir + access token, installs the Claude Code hooks, **auto-enables
token recording by writing the `OTEL_*` env block into `~/.claude/settings.json`**
(backing the file up first), prints the dashboard URL with `?token=…`, and lists
the optional follow-ups. It's **idempotent**, so re-running it is safe and just
reprints the current state. Restart Claude Code after `mc setup` so the telemetry
env applies.

> **Using Claude Code on this repo?** A root [`CLAUDE.md`](./CLAUDE.md) is
> auto-read as project instructions — it has the full clone-to-running setup, so
> you can just ask Claude to "set up Founder."

`mc setup` finishes by pointing you at the two extras most people want:

- **The shared leash** — link the Founder Telegram bot **@foundrremotebot** with
  `mc telegram link`. One bot serves every install: no BotFather, no token. You
  get a single-use code to message the bot, and then you can approve/deny Claude
  Code's permission prompts from your phone.
- **The model picker** — `mc config model <key>` records which agent/model you
  run, which feeds the global leaderboard (`mc config model show` lists the
  valid keys).

> Not linking `mc` globally? Every command also works as
> `node packages/daemon/dist/cli/index.js <command>` (e.g.
> `node packages/daemon/dist/cli/index.js setup`).

Prefer to paste the hooks block yourself instead of letting `mc setup` install
it? `mc hooks print` emits a paste-ready JSON block for
`~/.claude/settings.json`. Run `mc doctor` any time for a green/red preflight
checklist.

### Environment overrides

| Var                  | Default               | Purpose                                          |
| -------------------- | --------------------- | ------------------------------------------------ |
| `PORT`               | `7878`                | HTTP port                                        |
| `HOST`               | `127.0.0.1`           | Bind host (`0.0.0.0` for remote — see Tailscale) |
| `MC_TOKEN`           | generated             | Override the access token                        |
| `MC_HOME`            | `~/.mission-control`  | Home dir (db, token)                             |
| `TELEGRAM_BOT_TOKEN` | (stored in db)        | Bot token; overrides the stored one              |

The access token persists at `~/.mission-control/token` (mode `0600`). First
run generates one if `MC_TOKEN` isn't set.

---

## The four surfaces

- **Agents** — every Claude Code session running right now: project, current
  activity, files edited, commands run, recent achievements. Live entities
  carry a breathing amber pulse.
- **Servers** — every dev server listening on the machine, with framework
  detection and **Open / Stop / Start / Restart**. Stop works on any detected
  process; Start/Restart work on **registered** servers (name + cwd + command
  persisted to SQLite).
- **Terminal** — a real `claude` CLI in a PTY, streamed to the browser.
  Multi-tab, mobile-keyboard friendly, with scrollback replay on reconnect so a
  phone resuming mid-task picks up where it left off.
- **The leash** — Telegram remote-approve (below).

**Layout:** desktop = two columns (Agents + Servers left, Terminal right).
Mobile = a segmented Agents / Servers / Terminal switch.

---

## Telegram remote-approve (the crown jewel)

The fastest path is the **shared Founder bot** — one cloud bot serves every
install, so there's no BotFather and no token to manage:

```bash
mc telegram link   # prints a single-use code; message @foundrremotebot with it
mc start
```

`mc telegram link` gives you a code; open Telegram, message **@foundrremotebot**,
and send `/link <CODE>`. (`mc setup` points you here too.)

Prefer your **own** bot? Use "own" mode with a BotFather token instead:

```bash
mc telegram mode own
mc telegram setup <botToken>   # token from @BotFather
mc start
```

Then, from your phone, message your own bot:

```
/link <ACCESS_TOKEN>
```

The access token is the one in the dashboard URL after `?token=`, or in
`~/.mission-control/token`. After linking (either bot):

- Gated tool calls **buzz your phone** with **Approve / Deny** buttons. The
  default policy gates **every Bash command** and **every file-write tool**
  (Write / Edit / MultiEdit / NotebookEdit). Reads (Read, Grep, Glob, WebFetch,
  …) are **never** gated — prompting on reads is pure noise.
- A tap decides whether Claude Code proceeds.
- **On timeout (~50s)** the hook falls back to the normal local permission
  prompt. It **never hangs** and **never silently allows**.
- You can also approve from the dashboard's approval banner.

Check status anytime with `mc telegram status` (shows whether a bot token is
stored and whether a chat is linked).

---

## Cost meter

`mc setup` already enables this for you (it writes the `OTEL_*` env block into
`~/.claude/settings.json`). To wire it up by hand later:

```bash
mc telemetry enable           # PRINTS the OTEL_* env block (does not edit anything)
mc telemetry enable --write   # ALSO writes it into ~/.claude/settings.json (backed up)
```

Plain `mc telemetry enable` only prints — add the block to
`~/.claude/settings.json` under an `"env"` block, or export it in your shell
profile. `--write` does that merge for you (idempotent + backed up). Restart
Claude Code so the env applies. Once Claude Code is emitting metrics, the
dashboard shows live **$ today / $ session** within ~10s of activity.

---

## Security

- Binds **`127.0.0.1` by default** — local only.
- **Token on every data route**, the WebSocket stream, and the hook ingest.
- A streamed shell is as powerful as physical access — treat it that way.
- Remote access is **opt-in**. For from-anywhere access, prefer **Tailscale**
  (private, no public URL). A **public** Cloudflare tunnel (`mc tunnel`) is
  available but exposes a token-gated shell to the internet — see below.
- **The token rides in the dashboard URL** (`?token=…`). Over HTTPS it is
  encrypted in transit, and the SPA strips it from the address bar after load —
  but it can still leak via browser history, a `Referer` header, or a
  screenshot. If a URL may have leaked, run **`mc rotate-token`** to revoke it.

---

## Access from anywhere

You want the dashboard from your phone on cellular or a different network — not
just localhost or the same LAN. Two paths, in order of preference:

### Option A — Tailscale (recommended)

**Private, encrypted, works over cellular, no public URL.** Tailscale is a
WireGuard overlay, **not** a LAN-only tool: once both devices are on the same
tailnet, your phone reaches the dev box from **anywhere** (cellular included) as
if they were on the same network — with **nothing exposed to the public
internet**.

1. Install Tailscale on the dev box **and** your phone (same tailnet).
2. Run the daemon with `HOST=0.0.0.0` (so it accepts the tailnet interface):
   ```bash
   HOST=0.0.0.0 mc start
   ```
3. From the phone — on Wi-Fi **or** cellular — open
   `http://<machine-name>:<PORT>/?token=…` (the machine name is its Tailscale
   name; the token is in the `mc start` banner or `~/.mission-control/token`).

The dashboard builds dev-server "Open" links from the page hostname (not the
literal `localhost`), so over Tailscale they resolve to the dev box, not the
phone.

> **Tailscale Funnel** can additionally publish a service to the *public*
> internet (`tailscale funnel <port>`). That is a public exposure with the same
> caveats as `mc tunnel` below — only use it deliberately.

### Option B — Cloudflare Tunnel (`mc tunnel`) — public HTTPS URL

```bash
mc start        # one shell; keep the default HOST=127.0.0.1 — the tunnel reaches it locally
mc tunnel       # another shell; prints a stark warning, asks to confirm, then a public URL
```

`mc tunnel` shells out to [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/do-more-with-tunnels/trycloudflare/)
and runs a **quick tunnel** (`cloudflared tunnel --url http://127.0.0.1:<port>`),
which assigns an ephemeral `https://<random>.trycloudflare.com` URL — **no
Cloudflare account required**. It prints the full dashboard URL with `?token=`
appended (HTTPS, so the token is encrypted in transit), and keeps running until
**Ctrl+C**, which tears the tunnel down.

> **⚠️ This exposes a shell to the internet.** The dashboard streams a real
> terminal. Anyone with the URL **and** the token can run arbitrary commands on
> your machine — it is as powerful as physical access. Treat the tunnel as
> **temporary**: open it only when needed, tear it down when done, and run
> **`mc rotate-token`** afterward if the URL might have leaked.

- `mc tunnel --yes` skips the interactive confirmation (for scripts).
- No `cloudflared` on PATH? `mc tunnel` prints install instructions
  (`brew install cloudflared` on macOS) and exits — it never fails loudly.
- The daemon stays bound to `127.0.0.1` (the default); the tunnel reaches it
  over loopback. You do **not** need `HOST=0.0.0.0` for a local tunnel.

### Revoking access

```bash
mc rotate-token   # new token, prints the new URL; the old token is dead
```

Run this whenever a URL containing `?token=` may have been exposed (a public
tunnel, shared link, screenshot, or browser history). Restart `mc start` to pick
up the new token, reopen the dashboard with the printed URL, and re-link
Telegram with `/link <NEW_TOKEN>` if you use the leash.

---

## Troubleshooting

- **`mc doctor`** — runs a preflight checklist (Node version, `claude` on PATH,
  home dir + token, port, hooks installed, telemetry env, node-pty loadable, web
  build present).
- **Terminal panel shows a load error** — node-pty couldn't load on this
  platform (see the Windows arm64 caveat above). The rest of the dashboard still
  works.
- **Blank dashboard** — check the token in the URL. Without a valid `?token=…`
  you get a 401 prompt page, not the app.

---

## Commands

| Command                    | What it does                                                    |
| -------------------------- | --------------------------------------------------------------- |
| `mc setup`                 | Guided first-run: token + hooks + URL + next steps (idempotent) |
| `mc start`                 | Start the daemon and print the dashboard URL                    |
| `mc hooks print`           | Print a paste-ready hooks block for `~/.claude/settings.json`   |
| `mc hooks install`         | Install the hooks into `~/.claude/settings.json` (with backup)  |
| `mc doctor`                | Run an environment preflight checklist                          |
| `mc telemetry enable [--write]` | Print the `OTEL_*` env block (`--write` also adds it to `~/.claude/settings.json`) |
| `mc telegram setup <t>`    | Store a Telegram bot token (the leash)                          |
| `mc telegram status`       | Show whether a bot token is stored and a chat is linked         |
| `mc tunnel [--yes]`        | Expose the dashboard at a public Cloudflare HTTPS URL (see warning) |
| `mc rotate-token`          | Regenerate the access token (revokes the old one) + print the URL  |
