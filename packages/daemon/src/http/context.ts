/**
 * Dependencies injected into the Fastify app and its routes.
 */
import type Database from "better-sqlite3";

import type { TunnelManager } from "../access/tunnel-manager.js";
import type { ApprovalStore } from "../approvals/store.js";
import type { Config } from "../config.js";
import type { CostStore } from "../cost/store.js";
import type { EventHub } from "../events/event-hub.js";
import type { PreviewProxyService } from "../preview/proxy-service.js";
import type { PtyManager } from "../pty/manager.js";
import type { ServerMonitor } from "../servers/monitor.js";
import type { TelegramService } from "../telegram/bot.js";
import type { StreamRegistry } from "../ws/registry.js";

export interface AppContext {
  readonly config: Config;
  readonly db: Database.Database;
  readonly eventHub: EventHub;
  readonly registry: StreamRegistry;
  readonly serverMonitor: ServerMonitor;
  /** 0.0.0.0 reverse proxies that expose localhost-only dev servers for preview. */
  readonly previewProxy: PreviewProxyService;
  readonly ptyManager: PtyManager;
  readonly costStore: CostStore;
  readonly approvalStore: ApprovalStore;
  readonly telegram: TelegramService;
  readonly tunnelManager: TunnelManager;
}
