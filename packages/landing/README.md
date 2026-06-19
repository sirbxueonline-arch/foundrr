# Mission Control — Landing

Standalone Next.js (App Router) marketing/stats page for Mission Control.
Deploys to Vercel **independently** of the daemon/dashboard workspace — it does
not import `@mission-control/shared` and is excluded from the npm workspaces in
the repo root.

## Stack

- Next.js 16 (App Router, Turbopack) + React 19
- TypeScript strict
- Tailwind v4 (`@tailwindcss/postcss`)
- Fonts: JetBrains Mono (data) + Space Grotesk (display) via `next/font`

## Data

Live aggregates are read from Supabase REST. The publishable (anon) key is
public by design and grants read-only access to the two aggregate views:

- `GET /rest/v1/global_totals?select=*`
- `GET /rest/v1/model_leaderboard?select=*`

Fetched on the server with `revalidate: 30`, then polled client-side every 15s
so counters feel live. All values default to the public literals in
`lib/supabase.ts` / `lib/config.ts`, so the page renders even with no env set.

## Develop

```bash
npm install --no-workspaces
npm run dev      # http://localhost:3000
npm run build    # production build (what Vercel runs)
npm start        # serve the production build
```

## Deploy to Vercel

Set the project **Root Directory** to `packages/landing`. `vercel.json` pins
the framework, build command, and `npm install --no-workspaces` so the standalone
lockfile is used.

### Environment variables (all optional — sane public defaults baked in)

| Variable | Default |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://hmnviltczxxxpzunpnlb.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_…` (publishable, public) |
| `NEXT_PUBLIC_GITHUB_URL` | `https://github.com/kaanguluzada/mission-control` |
