# Deployment Guide — Cloudflare (free tier)

> **✅ Status: GO** (owner decision — Round 19, 2026-08-29).
> The Round-17 deployment hold is **lifted**. The audit pass
> (`docs/AUDIT.md`) is complete (2 medium findings fixed in-code), the
> Round-17 staircase tariff is validated, and the repo is production-clean
> (typecheck, lint, e2e 22/22 all green).
>
> This guide covers **three paths**, pick one:
>
> | Path | How | Best for |
> |---|---|---|
> | **A** | Manual deploy with the Wrangler CLI | full control, scripting |
> | **B** | `dash.cloudflare.com` + GitHub connection | auto-deploy on every push |
> | **C** | Self-hosted standalone build | your own VPS / any Node host |

---

## 0. Pre-deploy checklist (repo side — already done ✅)

| Gate | Status |
|---|---|
| `bun run typecheck` | 0 errors |
| `bun run lint` | clean |
| `bun scripts/e2e-auth.ts` | 22/22 pass (auth ladder, paywall, no-leak, exact wei amounts) |
| Secrets in git | none — `.env` untracked, `.env.example` carries placeholders only |
| `SESSION_SECRET` | generate a fresh one for production: `openssl rand -hex 32` |
| Treasury address | `0x60Df4E186364c3a49A550Aee29Da1d5fe3658818` — confirm you control it (see `docs/ABSTRACT_PORTAL.md`) before going live |

> ⚠️ **The one thing that must be set before first request:**
> `SESSION_SECRET`. Without it the API returns a config error instead of
> sessions. Set it as an **encrypted secret** (never a plaintext var).

---

## 1. One-time repo preparation (Cloudflare paths A & B)

The app runs on **Cloudflare Workers** via
[OpenNext Cloudflare](https://opennext.js.org/cloudflare) — the official
Next.js adapter. Run these steps **once**, locally, then commit the results:

### 1.1 Install the adapter

```bash
npm install -D @opennextjs/cloudflare
npx opennextjs-cloudflare init
```

`init` generates `wrangler.jsonc` (with the required `nodejs_compat`
compatibility flag) and adds `preview` / `deploy` scripts to
`package.json`. **Commit both changes** — the Workers Builds pipeline
(path B) relies on them being in the repo.

### 1.2 Create the production database (D1)

Local dev uses SQLite; Workers has no filesystem. Cloudflare **D1** is the
drop-in (free tier: 5 GB).

```bash
npx wrangler d1 create pengusignal
```

Copy the printed `database_id` into `wrangler.jsonc`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "pengusignal",
      "database_id": "<paste-here>"
    }
  ]
}
```

### 1.3 Switch Prisma to the D1 adapter

```bash
npm install @prisma/adapter-d1
```

`prisma/schema.prisma` — enable adapter + query-compiler mode (the Rust
engine binary cannot run on Workers):

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters", "queryCompiler"]
}
```

`src/lib/db.ts` — use the binding when present (keeps local SQLite dev
working unchanged):

```ts
import { PrismaClient } from '@prisma/client'
import { PrismaD1 } from '@prisma/adapter-d1'

export const db = new PrismaClient({
  // env.DB is injected by Workers; undefined in local dev
  ...(process.env.DB ? { adapter: new PrismaD1(process.env.DB as any) } : {}),
})
```

Regenerate the client and create the schema as SQL:

```bash
npx prisma generate
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma \
  --script --output migrations/0001_init.sql
```

Commit `migrations/0001_init.sql` and the schema change.

> Prefer staying closer to SQLite semantics? **Turso** (libSQL) works with
> `@prisma/adapter-libsql` and the same schema — swap the adapter in the
> snippet above.

---

## 2. PATH A — Manual deploy (Wrangler CLI)

### 2.1 Prerequisites

- A Cloudflare account (free — [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up), **no card required**)
- Node 20+ and Wrangler:

```bash
npm install -g wrangler
wrangler login        # opens the browser for OAuth
```

### 2.2 Push the schema to the remote D1

```bash
npx wrangler d1 migrations apply pengusignal --remote
```

### 2.3 Set the session secret

```bash
npx wrangler secret put SESSION_SECRET
# paste: <output of: openssl rand -hex 32>
```

### 2.4 Build & deploy

```bash
npm run deploy        # added by opennextjs-cloudflare init:
                      #   opennextjs-cloudflare build && wrangler deploy
```

The app is now live on `https://<name>.<account>.workers.dev`.

### 2.5 Add the remaining variables

```bash
npx wrangler secret put NEXT_PUBLIC_RPC_MAINNET          # https://api.mainnet.abs.xyz
npx wrangler secret put NEXT_PUBLIC_PENGU_MAINNET        # 0x9ebe...cba62
npx wrangler secret put NEXT_PUBLIC_TREASURY_ADDRESS     # treasury address
npx wrangler secret put GECKOTERMINAL_NETWORK            # abstract
npx wrangler secret put GECKOTERMINAL_POOL               # 0xda7d...3262
```

…or manage them visually in the dashboard (see §4). `wrangler deploy`
after any variable change.

### 2.6 Redeploys & rollbacks

```bash
npm run deploy                                    # new version
npx wrangler deployments list                     # history
npx wrangler rollback                             # back to previous version
```

---

## 3. PATH B — Deploy from `dash.cloudflare.com` + GitHub

This wires the GitHub repo to Cloudflare **Workers Builds**: every push to
`main` builds and deploys automatically. No CI config file needed —
Cloudflare runs the build in its own runners.

### 3.1 Prerequisites

- The repo pushed to GitHub: `https://github.com/Russia24x/absignal`
- §1 (one-time repo prep) **committed and pushed** — the pipeline needs
  `wrangler.jsonc` + the D1 binding in the repo.

### 3.2 Connect GitHub

1. Sign in to [dash.cloudflare.com](https://dash.cloudflare.com).
2. Left sidebar → **Workers & Pages** → **Create** → **Workers** tab →
   **Connect to Git** (a.k.a. *Import a repository*).
3. **Install the "Cloudflare Workers" GitHub App** on your GitHub account:
   - *Only select repositories* → `Russia24x/absignal` → **Install & Authorize**.
4. Back in Cloudflare, select the `absignal` repository → **Begin setup**.

### 3.3 Configure the build

| Setting | Value |
|---|---|
| Project name | `pengusignal` (becomes `pengusignal.<account>.workers.dev`) |
| Production branch | `main` |
| Build command | `npx opennextjs-cloudflare build` |
| Deploy command | `npx wrangler deploy` (default) |
| Root directory | `/` |

### 3.4 Add variables & secrets (before first build)

In the same setup screen → **Variables and Secrets**:

| Type | Name | Value |
|---|---|---|
| Secret (encrypt) | `SESSION_SECRET` | `openssl rand -hex 32` output |
| Variable | `NEXT_PUBLIC_APP_NETWORK` | `mainnet` |
| Variable | `NEXT_PUBLIC_RPC_MAINNET` | `https://api.mainnet.abs.xyz` |
| Variable | `NEXT_PUBLIC_PENGU_MAINNET` | `0x9ebe3a824ca958e4b3da772d2065518f009cba62` |
| Variable | `NEXT_PUBLIC_TREASURY_ADDRESS` | `0x60Df4E186364c3a49A550Aee29Da1d5fe3658818` |
| Variable | `GECKOTERMINAL_NETWORK` | `abstract` |
| Variable | `GECKOTERMINAL_POOL` | `0xda7d037fda848177141e037f9d0c67cae7b53262` |
| Variable | `SUBSCRIPTION_1D_PRICE_PENGU` | `10` |
| Variable | `SUBSCRIPTION_7D_PRICE_PENGU` | `65` |
| Variable | `SUBSCRIPTION_30D_PRICE_PENGU` | `255` |
| Variable | `SUBSCRIPTION_365D_PRICE_PENGU` | `2750` |
| Variable | `SUBSCRIPTION_LIFETIME_PRICE_PENGU` | `7650` |

> The five pricing vars have safe defaults baked into `src/lib/config.ts`
> — set them only to override. The build fails fast with a config error if
> the staircase balance rule is ever violated (monotonic per-day rates,
> 30% cap).

Click **Save and Deploy** — first build runs (~2–4 min).

### 3.5 Apply the D1 migration (one command, once)

Workers Builds deploys code but does **not** touch the database. Run §2.2
once from any machine with Wrangler logged in:

```bash
npx wrangler d1 migrations apply pengusignal --remote
```

### 3.6 Day-2 operations (all in the dashboard)

- **Auto-deploy**: every push to `main` → new production deployment.
- **Preview deployments**: pull-request branches get isolated
  `<hash>.pengusignal.<account>.workers.dev` URLs (enable in
  *Settings → Builds → Branches*).
- **Rollback**: *Deployments* tab → pick a green deployment → **Rollback**.
- **Secrets**: *Settings → Variables and Secrets* → edit → **Save and deploy**
  applies on the next build.
- **Logs**: *Logs → Real-time / Past logs* — request-level, no extra setup.

### 3.7 Disconnecting GitHub (if ever needed)

GitHub → *Settings → Applications → Installed GitHub Apps → Cloudflare
Workers → Configure* → remove the repository. Existing deployments keep
serving until deleted.

---

## 4. Custom domain (optional, free)

1. Dashboard → your Worker → **Settings → Domains & Routes** → **Add** →
   **Custom domain**.
2. Enter e.g. `pengusignal.xyz` — the zone must be on your Cloudflare
   account (domains bought elsewhere: add the zone first, Cloudflare
   walks you through the nameserver switch).
3. TLS certificate is issued automatically within minutes.

---

## 5. PATH C — Self-hosted standalone (any Node host)

The repo already builds a self-contained server (`output: "standalone"` in
`next.config.ts`):

```bash
npm run build    # next build + copies static/ and public/ into .next/standalone
npm run start    # NODE_ENV=production node .next/standalone/server.js
```

SQLite needs no setup — set `DATABASE_URL` to a **persistent** path (not
`/tmp`). Reverse-proxy port 3000 behind nginx/Caddy for TLS. Everything
else (env vars, verification checklist §6) is identical.

---

## 6. Post-deploy verification checklist

Run these **against the live URL** before announcing anything:

1. `GET https://<domain>/api/config` → `"configOk": true`, correct
   treasury + PENGU addresses, the 5 plan prices.
2. `GET /api/signal/history` → rows appear (first call backfills from real
   candles).
3. `GET /api/market/overview` → live PENGU price (~$0.009 range).
4. Open the site in a browser: Persian RTL renders by default, language
   toggle flips to English, all 12 sections render, zero console errors.
5. Connect a wallet → signature prompt → session cookie set
   (`/api/auth/me` returns your address).
6. Create a plan intent (e.g. `day`) → send 10 PENGU from a funded wallet →
   dialog reaches "verified" → the signal card renders the full signal.
7. Confirm the payment at
   `https://explorer.abs.xyz/address/0x60Df4E186364c3a49A550Aee29Da1d5fe3658818`.
8. Mobile: 390 px viewport → no horizontal scroll, single-column pricing.

---

## 7. Free-tier limits & production swap points

| Concern | Local dev | Cloudflare Workers (free) | Notes |
|---|---|---|---|
| Requests | — | 100 k/day | plenty at this product shape |
| CPU | — | 10 ms/request | engine is pure math over ≤ 1000 candles (~2–5 ms) |
| Market-data cache | in-memory Map | in-memory per-isolate | all fetches flow through `src/lib/market/geckoterminal.ts` → swap `getCached`/`setCached` to Workers KV or Cache API if throttle 502s appear |
| Rate limiting | in-memory sliding window | per-isolate | `src/lib/rate-limit.ts` is a single module → swap to the Workers Rate Limiting binding if abuse appears |
| Sessions | SQLite table | same table on D1 | no code change |
| RPC verification | outbound HTTPS | allowed on Workers | no change |
| Daily signal lock | computed on first request | same | optional: add a Workers Cron at 00:05 UTC to pre-warm |

---

## 8. Troubleshooting

| Symptom | Cause → fix |
|---|---|
| `config error` from every API route | `SESSION_SECRET` missing → set as encrypted secret, redeploy |
| Build fails on Workers Builds | §1 changes not committed/pushed (missing `wrangler.jsonc`) |
| `P2010 / adapter` Prisma errors | `prisma generate` not run with `driverAdapters` + `queryCompiler`, or D1 binding name ≠ `DB` |
| Empty signal history | D1 migration not applied → §2.2 / §3.5 |
| Market data 502s | GeckoTerminal throttling — transient, self-heals via cache; see §7 swap points |
| Wallet connect blocked | `NEXT_PUBLIC_APP_NETWORK`/RPC vars missing at **build** time (public vars are inlined) → set vars → rebuild |

---

*Deployment target reference: Cloudflare Workers + OpenNext (`@opennextjs/cloudflare`), D1 database, free plan. Tested shapes: Next.js 16 App Router, Prisma 6, wagmi/AGW client-side.*
