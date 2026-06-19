# Mission Control — Build Brief

**For: Claude Code. From: Kaan.**
**How to use this:** Save this file as `BRIEF.md` at the repo root and tell Claude Code to read it and build the project from zero. This brief is self-contained: it includes the known-good approaches for the parts that are easy to get wrong (hook ingest, the PTY terminal, the cross-platform port scanner, token auth), so build to them directly.

---

## 1. What you're building

A **local, single-machine command center** for a developer's own dev box. It runs on the machine, owns no cloud, and does three things plus one:

1. **Agents** — shows every Claude Code session running right now: which project, what it's doing this second, how many files it's edited, the commands it ran, what it finished.
2. **Servers** — every dev server listening on the machine, with framework detection and one-tap Open / Stop / Start / Restart.
3. **Terminal** — runs the real `claude` CLI inside a pseudo-terminal and streams it to the browser, so the user can drive Claude Code (every feature) from a phone.
4. **The leash (the actual point)** — when the user is away, the machine reaches *them*: a Telegram bot that notifies on finish / waiting / error, and lets them **approve or deny Claude Code's permission prompts with one tap**. This is the feature that makes the product worth existing. Build everything else in service of it.

### The thesis
Observing agents is a crowded, solved space. The wedge is **acting remotely** — turning "watch it work" into "supervise it from anywhere." Every design decision should be judged against: *does this help the user control their machine while away from the keyboard?*

### Scope
- **In:** single machine, single user, one access token. Local persistence. Telegram as the away-surface.
- **Out (do NOT build):** multi-tenant accounts, billing, a marketing site, fleet/multi-machine aggregation. Architect cleanly so a "fleet" layer *could* be added later, but don't build it now.

---

## 2. House rules (non-negotiable)

- **TypeScript, strict mode, everywhere.** Shared types between backend and frontend.
- **Real data only.** No mock/placeholder content in the UI. If there's no data, build a real empty state with a next action — never fake rows.
- **Never block or crash Claude Code.** Anything that runs as a hook must fail silently, time out fast, and exit 0. A broken Mission Control must never break the user's coding session.
- **Token on everything.** Every HTTP route, the event stream, and the terminal socket require the token. No exceptions.
- **Safe by default.** Bind `127.0.0.1` by default. Remote access is opt-in (`HOST=0.0.0.0`, behind Tailscale). A streamed shell is as powerful as physical access — treat it that way.
- **Mobile-first for the away surfaces.** The dashboard's remote views and all Telegram interactions must be fully usable on a phone. The desktop dashboard is the "sit down and work" surface; the phone is the "supervise from the bus" surface.
- **Quality floor:** responsive to mobile, visible keyboard focus, reduced-motion respected, no layout shift.

---

## 3. Architecture

One **backend daemon** owns every privileged operation. The frontend is a thin client.

### Backend daemon (the heart)
- **Stack:** Node + TypeScript, **Fastify** (HTTP) + **ws** (WebSocket), **@homebridge/node-pty-prebuilt-multiarch** (terminal — verified to ship working prebuilt binaries incl. Windows; fall back to `node-pty` only if it fails to load), **grammY** (Telegram), **better-sqlite3** (local persistence).
- **Responsibilities:**
  - Ingest Claude Code hook events at `POST /events` and derive live session state.
  - Scan listening ports + owning processes; control them.
  - Manage PTY terminal sessions and bridge them over WebSocket.
  - Run `git` against project folders for diffs / commit / revert.
  - Run the Telegram bot and the remote-approve flow.
  - Serve the built frontend.

### Frontend (thin client)
- **Stack:** Next.js (App Router) + TypeScript + Tailwind, **xterm.js** + fit addon for the terminal. (Vite + React is acceptable if simpler — the UI needs no SSR. Default to Next.js; the user is fluent in it.)
- In production the daemon serves the static frontend build. In dev, the frontend proxies API/WS to the daemon. The frontend holds no secrets beyond the token in the URL.

### Persistence
Local **SQLite** file under `~/.mission-control/`. Store: event history, session summaries, registered servers, the token, Telegram chat binding, approval-request log. (Use Supabase only if this is later turned into a cloud product — not now.)

### Data flow
```
Claude Code  ──hook──▶  POST /events  ──▶  EventHub (derive state)  ──▶  WS /stream  ──▶  Dashboard
                                                  └──▶ Telegram (notify / approve)
Dashboard  ──WS /term──▶  PTY (claude CLI)  ──▶  Dashboard
Dashboard  ──REST──▶  port scan / git / server control
```

---

## 4. How to observe Claude Code (verified specifics)

Claude Code emits lifecycle events through **hooks**. Wire a tiny Node script to each event; it reads the hook JSON from **stdin** and POSTs it to `http://127.0.0.1:PORT/events`. The script must fail silently, time out fast (~1.5s), and exit 0 so it never delays Claude Code. Ship a small generator that prints a paste-ready hooks block for `~/.claude/settings.json` with the script's absolute path already filled in.

**Events to hook:** `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `SubagentStop`, `Stop`, `Notification` (and `SessionEnd` / `PreCompact` if useful).

**Deriving state per session** (keyed by `session_id`):
- `project` = basename of `cwd`.
- `filesEdited` = count of distinct `file_path` from `PostToolUse` where tool ∈ {Edit, Write, MultiEdit, NotebookEdit}.
- `bash` = count of `PostToolUse` Bash; capture the command as an "achievement."
- `current` activity = derived from the latest `PreToolUse` (tool + target) / `UserPromptSubmit` (prompt) / `Stop` (idle).
- `status` = active → idle after ~90s of silence; idle on `Stop`.
- Keep a ring buffer of recent events and a short "achievements" list (edited X, ran Y, subagent done).

> ⚠️ **Verify the current hook payload schema and event list against the live docs** before relying on field names: `https://code.claude.com/docs/en/hooks`. Treat the docs as the source of truth.

**Cost/token telemetry (milestone, optional):** Claude Code supports OpenTelemetry via `CLAUDE_CODE_ENABLE_TELEMETRY=1`, emitting metrics (token usage, cost, session counts, lines of code). The daemon can run a tiny OTLP receiver and surface a live "$ today / $ this session" meter. Confirm exporter config and metric names at `https://code.claude.com/docs/en/monitoring-usage`. This is the fiddliest feature — schedule it late.

---

## 5. Dev-server scanning (verified)

Detect listening TCP ports and their owning process, dedupe by port, guess the framework from the process command line, expose a local URL.

- **Windows:** `netstat -ano -p tcp` → parse `LISTENING` rows for addr/port/pid; resolve command via PowerShell `Get-CimInstance Win32_Process -Filter "ProcessId=PID"` (do **not** rely on `wmic`, it's being removed).
- **macOS/Linux:** prefer `ss -ltnp`, fall back to `lsof -nP -iTCP -sTCP:LISTEN`, and finally a **dependency-free `/proc/net/tcp` + `/proc/net/tcp6` parser** (state `0A` = LISTEN) with an inode→pid map built from `/proc/*/fd`. Implement all three tiers so it works on a lean Linux box with neither `ss` nor `lsof` installed, as well as on a normal macOS/Linux machine.
- **Framework guess** from the command: Next.js, Vite, webpack, CRA, Nuxt, Astro, Remix, Angular, Vue CLI, Gatsby, Parcel, Storybook, FastAPI/Uvicorn, Flask, Django, Rails, PHP, python http.server, nodemon → else Node/Python.
- **Control:** Stop = `taskkill /PID x /T /F` (Win) or SIGTERM→SIGKILL (Unix). Start/Restart only works for **registered** servers (name + cwd + command persisted to SQLite), since you can't restart a process whose launch command you never knew. Expose both: stop any detected process; start/restart registered ones.

---

## 6. Terminal (verified)

- Spawn `claude` (or a shell) via node-pty in the user's chosen `cwd`. Multiplex over `WS /term?id=…&token=…`.
- Keep a per-terminal scrollback buffer (~200k chars) and **replay it on connect** so a phone reconnecting mid-task resumes where it left off.
- Handle resize: client sends a control frame (prefix a byte, e.g. `\x00` + JSON `{t:"resize",cols,rows}`); everything else is raw keystrokes.
- Frontend: xterm.js + fit addon, multi-tab (each tab = one PTY), telemetry-console theme (see §8). Must work with a mobile on-screen keyboard.
- If node-pty fails to load on the user's machine, the dashboard must still run and the terminal panel must show the exact load error — degrade gracefully.

---

## 7. The crown jewel — remote approve (build this carefully)

**Goal:** when Claude Code asks permission for a risky action and the user is away, their phone buzzes with the command and **Approve / Deny** buttons; the tap decides whether Claude Code proceeds.

**Mechanism:** a **`PreToolUse` hook** that, for flagged tools/commands (configurable: e.g. Bash matching destructive patterns, or all Bash, user's choice), calls the daemon. The daemon:
1. Pushes a Telegram message with the tool + input and inline **Approve / Deny** buttons (grammY).
2. The hook **polls the daemon** for a decision (short interval) up to ~**50s** (stay under Claude Code's hook timeout).
3. On Approve → hook returns "allow." On Deny → "deny" with a reason. **On timeout → fall back to the normal local permission prompt** (never hang the session, never silently allow).

> ⚠️ The exact way a `PreToolUse` hook returns an allow/deny decision (JSON on stdout with a permission decision object vs. exit codes) has changed across versions. **Confirm the current decision schema at `https://code.claude.com/docs/en/hooks`** and implement to that. Get this contract right before building the UI around it.

**Also via Telegram:** notify on `Stop` (finished / now idle-waiting), on `Notification` (needs attention), and on detected errors. Allow a quick reply that's piped into the active session as a prompt. Bind one Telegram chat to the daemon via a one-time `/link <token>` command; store the chat id in SQLite.

---

## 8. Design direction

**Concept: a telemetry console / instrument panel** — not the default hacker-green terminal, not a generic SaaS dashboard. It should read like mission telemetry: precise, dark, alive. Spend boldness in **one** place (the live "pulse" of active agents) and keep everything else quiet and disciplined.

**Palette (dark, "refined modern"):**
```
--void   #0d1014   base
--panel  #151b23   raised surface
--line   #232c37   hairlines
--text   #e6eaf0   primary text
--muted  #8a95a3   secondary
--faint  #5b6573   tertiary / labels
--signal #f2a23c   active / running (the one accent that gets glow)
--cool   #56b6c2   links / interactive
--ok     #74c69d   success
--alert  #e5645a   stop / error
```
**Type:** data and code in **JetBrains Mono**; labels/UI in **Space Grotesk** (or Inter). Mono carries the telemetry feel — use it for ports, counts, session ids, activity lines.

**Signature element:** every *live* entity (agent or server) carries a breathing amber pulse; the header has a faint sweeping activity line. When nothing is active the page goes calm and cool — the amber only appears when the machine is actually working. The aesthetic *encodes state*.

**Layout:** desktop = two columns (Agents + Servers left, Terminal right, full height). Mobile = a segmented switch between Agents / Servers / Terminal. Agent cards: project (mono, prominent), status pill, current-activity line, a stat row (files / tools / cmds / subagents / prompts / uptime), recent achievements. Server rows: port (prominent), framework, command (truncated), pid, controls.

**Remote-link gotcha:** build dev-server "Open" links from `window.location.hostname` (NOT the literal string `localhost`), so over Tailscale they point at the dev machine, not the phone.

**Reference:** use the **Mobbin MCP** for real dashboard/terminal/monitoring UI patterns before designing. Don't ship the first generic layout that compiles.

---

## 9. Environment

- Target user is on **Windows** (`C:\Users\Kaan`), also wants it to work on macOS/Linux. Test the Windows paths (backslashes, `taskkill`, PowerShell command lookup).
- `claude` must be on PATH for the terminal's **+ Claude** action. Node ≥ 18.
- First run generates a token to `~/.mission-control/token` and prints the dashboard URL with `?token=…`. Honor `PORT`, `HOST`, `MC_TOKEN` env overrides.
- Provide a Tailscale quickstart in the README (install both ends → `HOST=0.0.0.0` → open `http://<machine-name>:PORT/?token=…`).

---

## 10. Build order (ship in milestones — stop after each for review)

1. **M1 — Spine.** Daemon skeleton, token auth, SQLite, `POST /events` ingest + state derivation, `WS /stream`, minimal dashboard rendering live agents. *Done when:* a real Claude Code session lights up the Agents panel live.
2. **M2 — Servers.** Cross-platform scan + framework detection + Stop + register/Start/Restart. *Done when:* running dev servers appear and can be stopped/restarted from the UI.
3. **M3 — Terminal.** PTY bridge, xterm multi-tab, scrollback replay, resize. *Done when:* the user can run the real `claude` CLI from the browser, including on mobile.
4. **M4 — Diff & git.** Show each agent project's `git status` + diff; Commit / Revert from the UI. *Done when:* the user can review and commit an agent's changes from their phone.
5. **M5 — Cost meter.** OTel ingest → live token/cost readout. *Done when:* per-session and daily cost show real numbers.
6. **M6 — Telegram notify.** Bot + `/link`, notifications on finished / waiting / error, quick-reply into a session. *Done when:* the phone buzzes when an agent finishes or stalls.
7. **M7 — Remote approve (crown jewel).** PreToolUse blocking hook ↔ daemon ↔ Telegram inline Approve/Deny, with timeout fallback. *Done when:* a flagged command can be approved from the phone and Claude Code proceeds.
8. **M8 — Polish.** Empty states, a11y, reduced motion, Tailscale docs, PWA + web-push as an alternative to Telegram, README.

Build M1→M3 to a runnable tool first; that alone is useful. M4–M7 are where it becomes *the* tool. Don't gold-plate early milestones before the leash exists.

---

## 11. Verify against live docs (don't trust memory)

Before implementing, confirm current specifics — these change between Claude Code versions:
- Hook event list + payload schema + the PreToolUse allow/deny decision contract → `https://code.claude.com/docs/en/hooks`
- OpenTelemetry metric names + exporter setup → `https://code.claude.com/docs/en/monitoring-usage`
- grammY current API for inline keyboards + callback queries → grammY docs

Implement to what the docs say today, not to what this brief assumes.
