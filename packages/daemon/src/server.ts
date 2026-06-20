/**
 * Compose and start the daemon: db → registry → event hub → http app.
 */
import type Database from "better-sqlite3";

import { TunnelManager } from "./access/tunnel-manager.js";
import { SharedApprovalPoller } from "./approvals/shared-poller.js";
import { ApprovalStore } from "./approvals/store.js";
import { localDashboardUrl } from "./cli/dashboard-url.js";
import type { Config } from "./config.js";
import { CostStore } from "./cost/store.js";
import { openDb } from "./db/index.js";
import { getSettings } from "./db/settings-repo.js";
import { EventHub } from "./events/event-hub.js";
import { buildApp } from "./http/app.js";
import { PreviewProxyService } from "./preview/proxy-service.js";
import { wirePreviewUpgrades } from "./preview/upgrade.js";
import { PtyManager } from "./pty/manager.js";
import { ServerMonitor } from "./servers/monitor.js";
import { TelegramService } from "./telegram/bot.js";
import { SharedBot } from "./telegram/shared-bot.js";
import { resolveInstallId } from "./telemetry/install-id.js";
import { TelemetryReporter } from "./telemetry/reporter.js";
import { StreamRegistry } from "./ws/registry.js";

export interface RunningDaemon {
  /** The dashboard URL, including the ?token= query. */
  readonly url: string;
  /** Gracefully stop the sweeper, close the HTTP server, and close the db. */
  close(): Promise<void>;
}

function dashboardUrl(config: Config): string {
  return localDashboardUrl(config.host, config.port, config.token);
}

/** Start the daemon and return its URL + a close handle. */
export async function startDaemon(config: Config): Promise<RunningDaemon> {
  const db: Database.Database = openDb(config.dbPath);
  const registry = new StreamRegistry();
  const eventHub = new EventHub(db, registry);
  eventHub.start();

  const serverMonitor = new ServerMonitor(db, registry);
  serverMonitor.start();

  // Path-mounted reverse proxies that expose localhost-only dev servers under
  // `/__preview/:port/…` on THIS daemon's port for remote preview. SECURITY: the
  // proxy entry points sit behind the same dashboard token gate (see
  // http/routes/servers.ts + preview/upgrade.ts), so the preview is not an open
  // relay. Every proxy is torn down on shutdown below.
  const previewProxy = new PreviewProxyService();

  const ptyManager = new PtyManager();
  const costStore = new CostStore(registry, db);

  // Anonymous global usage sharing (P4). On by default, single-flag opt-out via
  // `mc telemetry share off`. Reads the cost store's lifetime totals, diffs them
  // against a persisted watermark, and POSTs only the delta. Swallows all
  // errors — telemetry must never affect the daemon.
  const telemetryReporter = new TelemetryReporter(costStore, db, config);
  telemetryReporter.start();

  // Managed public tunnel for the "Access from anywhere" panel. Off until the
  // dashboard starts it; torn down on close() so it never outlives the daemon.
  const tunnelManager = new TunnelManager();

  // Remote approve (M7): the store owns the approval lifecycle + TTL sweeper.
  const approvalStore = new ApprovalStore(registry, db);
  approvalStore.start();

  // The leash (M6/M7): LOCAL grammY Telegram service ("own" mode). Degrades to
  // a no-op when no bot token is configured, so the daemon runs fine without it.
  const telegram = new TelegramService({ db, approvalStore, ptyManager, config });
  telegram.start();

  // The Founder shared cloud bot (P7, "shared" mode — the default). One bot,
  // many installs; the anonymous install id is this install's identity. All
  // calls swallow errors so a relay failure never affects the daemon.
  const sharedBot = new SharedBot(resolveInstallId(config.home));
  // Bridges shared-bot decisions back into the LOCAL approval store so the hook
  // (which polls the local id) and the dashboard both resolve.
  const sharedApprovalPoller = new SharedApprovalPoller(sharedBot, approvalStore);

  // Notify on session edges (Stop → idle, Notification → waiting). Route through
  // the shared cloud bot in "shared" mode, the local bot in "own" mode, nothing
  // in "off" mode. Wired here so the EventHub stays decoupled. The mode is read
  // per-notification so a `mc telegram mode` change takes effect without a restart.
  eventHub.setNotifier((text) => {
    let mode: "shared" | "own" | "off" = "shared";
    try {
      mode = getSettings(db).telegramMode;
    } catch {
      mode = "shared";
    }
    if (mode === "shared") {
      void sharedBot.notify(text);
    } else if (mode === "own") {
      void telegram.notify(text);
    }
  });

  const app = await buildApp({
    config,
    db,
    eventHub,
    registry,
    serverMonitor,
    previewProxy,
    ptyManager,
    costStore,
    approvalStore,
    telegram,
    sharedBot,
    sharedApprovalPoller,
    tunnelManager,
  });

  // Route preview WebSocket upgrades (Vite HMR, etc.) through the SAME daemon
  // server under /__preview/:port/*, leaving the dashboard's own WS (/stream,
  // /term) untouched. Must run after buildApp so @fastify/websocket's upgrade
  // listener is already attached and we can delegate non-preview upgrades to it.
  wirePreviewUpgrades(app.server, previewProxy, config);

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    eventHub.stop();
    serverMonitor.stop();
    previewProxy.stopAll();
    ptyManager.killAll();
    costStore.stop();
    telemetryReporter.stop();
    approvalStore.stop();
    sharedApprovalPoller.stopAll();
    void telegram.stop();
    tunnelManager.stop();
    db.close();
    throw err;
  }

  const url = dashboardUrl(config);

  const close = async (): Promise<void> => {
    eventHub.stop();
    serverMonitor.stop();
    // Tear down preview proxies so an exposed dev server never outlives the daemon.
    previewProxy.stopAll();
    ptyManager.killAll();
    costStore.stop();
    telemetryReporter.stop();
    approvalStore.stop();
    // Stop any in-flight shared-approval pollers before tearing down the bot.
    sharedApprovalPoller.stopAll();
    await telegram.stop();
    // Tear down any managed public tunnel so it never outlives the daemon.
    tunnelManager.stop();
    try {
      await app.close();
    } finally {
      db.close();
    }
  };

  return { url, close };
}
