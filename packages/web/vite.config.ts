import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// In dev, the daemon runs on 127.0.0.1:7878 and we proxy data/WS routes to it.
// In production the daemon serves this build statically, so the proxy is dev-only.
const DAEMON = "http://127.0.0.1:7878";
const DAEMON_WS = "ws://127.0.0.1:7878";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Read shared types/helpers straight from source — no build step needed in dev.
      "@mission-control/shared": fileURLToPath(
        new URL("../shared/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    proxy: {
      "/events": DAEMON,
      "/api": DAEMON,
      "/v1": DAEMON,
      "/stream": { target: DAEMON_WS, ws: true },
      "/term": { target: DAEMON_WS, ws: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
