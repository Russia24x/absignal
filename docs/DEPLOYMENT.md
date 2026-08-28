# Deployment on Cloudflare (free tier, no credit card)

This app deploys cleanly to Cloudflare's **free Workers plan**. Two things need
attention on Cloudflare vs. local dev: the database (SQLite doesn't exist on
Workers) and build tooling. This guide covers both.

## Option A — Cloudflare Workers + OpenNext (recommended)

[OpenNext](https://opennext.js.org/cloudflare) adapts Next.js (App Router, Route
Handlers, SSR) to Cloudflare Workers with near-zero code changes.

### 1. Prerequisites

- A Cloudflare account (free — [dash.cloudflare.com](https://dash.cloudflare.com/sign-up), **no card required**)
- Node 20+ and the Wrangler CLI:

```bash
npm install -g wrangler
wrangler login
```

### 2. Database → Cloudflare D1 (or Turso)

Local dev uses SQLite via Prisma. On Workers, pick one:

**D1 (Cloudflare native, free tier: 5 GB)**

```bash
wrangler d1 create pengusignal
```

Then switch the Prisma datasource to the D1 driver adapter
(`@prisma/adapter-d1` + `prisma-client-js` preview `driverAdapters`):

```ts
// src/lib/db.ts (Cloudflare variant)
import { PrismaClient } from '@prisma/client'
import { PrismaD1 } from '@prisma/d1'

export const db = new PrismaClient({ adapter: new PrismaD1(env.DB) })
```

`wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "pengusignal"
database_id = "<from wrangler output>"
```

Schema push: `wrangler d1 migrations` (generate SQL with
`prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`).

**Turso (libSQL, generous free tier)** — same Prisma schema, `@prisma/adapter-libsql`,
keep SQLite semantics. Good if you want to stay closer to local dev.

> Note: the schema itself is portable — the models are plain SQLite-compatible
> tables with string wei amounts and JSON snapshots by design.

### 3. Install the adapter

```bash
npm i -D @opennextjs/cloudflare
npx opennextjs-cloudflare init
```

### 4. Environment variables

Set them for both build and runtime (`wrangler.toml` `[vars]` or the dashboard →
Workers → Settings → Variables):

```
NEXT_PUBLIC_APP_NETWORK=mainnet
NEXT_PUBLIC_RPC_MAINNET=https://api.mainnet.abs.xyz
NEXT_PUBLIC_PENGU_MAINNET=0x9ebe3a824ca958e4b3da772d2065518f009cba62
NEXT_PUBLIC_TREASURY_ADDRESS=0x60Df4E186364c3a49A550Aee29Da1d5fe3658818
SUBSCRIPTION_1D_PRICE_PENGU=10
SUBSCRIPTION_7D_PRICE_PENGU=5
SUBSCRIPTION_30D_PRICE_PENGU=30
SUBSCRIPTION_365D_PRICE_PENGU=100
SUBSCRIPTION_LIFETIME_PRICE_PENGU=1500
GECKOTERMINAL_NETWORK=abstract
GECKOTERMINAL_POOL=0xda7d037fda848177141e037f9d0c67cae7b53262
SESSION_SECRET=<openssl rand -hex 32>   # use `wrangler secret put SESSION_SECRET` instead
```

`SESSION_SECRET` must be a **Wrangler secret**, not a plain var:

```bash
wrangler secret put SESSION_SECRET
```

### 5. Build & deploy

```bash
npm run build:worker   # added by opennextjs-cloudflare init
wrangler deploy
```

Your app now runs on `*.workers.dev`. Attach a custom domain in the dashboard
(Workers → Triggers → Custom Domains) — free, with automatic TLS.

### 6. Free-tier notes & swap points

| Concern | Local dev | Cloudflare |
|---|---|---|
| Market-data cache | in-memory Map | Workers Cache API or KV (all fetches already flow through `src/lib/market/geckoterminal.ts` — swap `getCached`/`setCached`) |
| Rate limiting | in-memory sliding window | Workers Rate Limiting binding (`src/lib/rate-limit.ts` is a single module) |
| Sessions | SQLite table | same table on D1/Turso (no change) |
| RPC verification | outbound HTTPS — allowed on Workers | no change |
| Cron (optional) | — | add a Workers Cron to pre-compute the daily signal at 00:05 UTC |

Free plan limits (as of writing): 100k requests/day, 10ms CPU/request —
plenty for a signal product of this shape; the analysis engine is pure math
over ≤ 1000 candles and completes in ~2–5 ms.

## Option B — Cloudflare Pages (static + API as Workers)

If you prefer Pages for the frontend: the landing/terminal is highly interactive,
so static export loses SSR (and with it, cookie-based SSR of the right `dir`/`lang`).
Option A is recommended; use Pages only if you must, and accept a client-side
language flash for Persian users.

## Post-deploy checklist

1. `GET https://<your-domain>/api/config` → `configOk: true` and the right addresses.
2. `GET /api/signal/history` → rows appear (first call backfills from real candles).
3. Connect a wallet on the deployed site → signature prompt → session cookie set.
4. Create a plan intent (e.g. `day`) → send the plan price (10 PENGU by default)
   from a funded wallet → dialog reaches “verified” and the signal card renders
   the full signal.
5. Confirm the payment shows at `https://explorer.abs.xyz/address/<treasury>`.
