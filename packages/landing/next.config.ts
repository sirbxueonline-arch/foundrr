import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Pin the workspace root to this package so Next does not infer the monorepo
// root (the repo has multiple lockfiles). This package deploys to Vercel
// standalone from packages/landing.
const here = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: here,
  },
};

export default nextConfig;
