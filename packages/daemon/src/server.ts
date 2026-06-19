/**
 * Compose and start the daemon: db → registry → event hub → http app.
 */
import type Database from "better-sqlite3";

import { TunnelManager } from "./access/tunnel-manager.js";
import { ApprovalStore } from "./approvals/store.js";
import { localDashboardUrl } from "./cli/dashboard-url.js";
import type { Config } from "./config.js";
import { CostStore } from "./cost/store.js";
import { openDb } from "./db/index.js";
import { EventHub } from "./events/event-hub.js";
import { buildApp } from "./http/app.js";
import { PreviewProxyService } from "./preview/proxy-service.js";
import { PtyManager } from "./pty/manager.js";
import { ServerMonitor } from "./servers/monitor.js";
import { TelegramService } from "./telegram/bot.js";
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

  // Reverse proxies that expose localhost-only dev servers on 0.0.0.0 for
  // remote preview. SECURITY: each exposed proxy port is unauthenticated raw
  // access to that dev server on the LAN (same exposure as the dev server
  // binding 0.0.0.0) — intentional for preview, torn down on shutdown below.
  const previewProxy = new PreviewProxyService();

  const ptyManager = new PtyManager();
  const costStore = new CostStore(registry);

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

  // The leash (M6/M7): Telegram service. Degrades to a no-op when no bot token
  // is configured, so the daemon runs fine without it.
  const telegram = new TelegramService({ db, approvalStore, ptyManager, config });
  telegram.start();

  // Notify on session edges (Stop → idle, Notification → waiting) via Telegram.
  // Wired here so the EventHub stays decoupled from the Telegram service.
  eventHub.setNotifier((text) => {
    void telegram.notify(text);
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
    tunnelManager,
  });

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
