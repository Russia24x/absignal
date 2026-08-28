# Deployment Guide — Cloudflare (free tier)

> **✅ Status: GO** (owner decision — Round 19, 2026-08-29; current as of R27).
> The Round-17 deployment hold is **lifted**. The audit pass
> (`docs/AUDIT.md`) is complete (2 medium findings fixed in-code), the
> Round-17 staircase tariff is validated, and the repo is production-clean
> (typecheck, lint, e2e 34/34 all green; engine v2 walk-forward-validated
> in R26; full minimal UI redesign in R24).
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
| `bun scripts/e2e-auth.ts` | 34/34 pass (auth ladder, paywall, no-leak, exact wei amounts, subscription lifecycle, anti-tampering) |
| Secrets in git | none — `.env` untracked, `.env.example` carries placeholders only |
| `SESSION_SECRET` | generate a fresh one for production: `openssl rand -hex 32` |
| Treasury address | `0x60Df4E186364c3a49A550Aee29Da1d5fe3658818` — confirm you control it (see `docs/ABSTRACT_PORTAL.md`) before going live |

> ⚠️ **The one thing that must be set before first request:**
> `SESSION_SECRET`. Without it the API returns a config error instead of
> sessions. Set it as an **encrypted secret** (never a plaintext var).

---

## 0.5 Gas: how payments stay cheap / free (Abstract official features)

The app already implements two official Abstract standards — no extra infra
required for them to work:

1. **Optimistic transactions** — subscription payments are submitted through
   Abstract's `unstable_sendRawTransactionWithDetailedOutput` RPC endpoint
   (the official AGW reusable: `build.abs.xyz/docs/experimental/use-optimistic-write-contract`,
   adapted in `src/hooks/use-optimistic-write-contract.ts` +
   `src/lib/abstract/optimistic-tx.ts`). The wallet UI receives the
   transaction hash *instantly* (pre-confirmation) while the receipt is
   polled and server-verified as before. If the endpoint is ever
   unavailable, the flow automatically falls back to the standard wagmi
   submission — identical security, only without instant feedback.
2. **AGW deployment sponsorship** — Abstract's default paymaster already
   sponsors the user's AGW smart-account deployment (official FAQ:
   `docs.abs.xyz/abstract-global-wallet/frequently-asked-questions`), so
   brand-new wallets can transact with zero ETH setup.

### Optional: sponsor your users' payment gas (0-fee payments)

To make the payment transaction itself **completely free for users** (you
pay the gas — fractions of a cent per tx on Abstract):

1. Deploy a **General paymaster** on Abstract mainnet — start from the
   official example repo (`docs.abs.xyz/how-abstract-works/native-account-abstraction/paymasters`
   → "Paymasters Example Repo"), and make `validateAndPayForPaymasterTransaction`
   return `PAYMASTER_VALIDATION_SUCCESS_MAGIC` only for transactions you
   want to sponsor (e.g. restrict `to` == PENGU token, or require a
   signature from your backend).
2. Fund the paymaster contract with ETH for gas (keep a low balance +
   an alert — a compromised paymaster only risks its own balance).
3. Set the variable (plaintext is fine — the address is public):
   `NEXT_PUBLIC_SPONSOR_PAYMASTER_ADDRESS=0xYourPaymaster…`
4. Redeploy. The sponsorship is applied at the **provider level** — the
   official `customPaymasterHandler` on `AbstractWalletProvider`
   (see `src/components/wallet/agw-gate.tsx`), the same mechanism as the
   official `useWriteContractSponsored` hook
   (`docs.abs.xyz/abstract-global-wallet/agw-react/hooks/useWriteContractSponsored`)
   — so EVERY wallet transaction (payment, vote, future writes) carries
   the paymaster automatically, and the payment dialog shows "Network fee:
   sponsored — you pay 0 gas".

Without a paymaster configured, users simply pay normal (very low)
Abstract gas from their wallet ETH, and the AGW deployment fee is already
sponsored by Abstract.

### Optional: Abstract Portal app voting

Once the app is listed on the [Abstract Portal](https://abs.xyz/portal),
set `NEXT_PUBLIC_ABSTRACT_APP_ID=<numeric id from the portal URL>` and an
official "Upvote on Abstract" banner appears in the footer (on-chain vote
via the canonical voting contract `0x3b50de27506f0a8c1f4122a1e6f470009a76ce2a`,
one vote per epoch per wallet — official AGW Reusables pattern). This is
free growth: portal ranking drives discovery.

---

## 1. One-time repo preparation (Cloudflare paths A & B)

> ✅ **Status (R28): DONE and committed.** The repo already contains every
> file below — `wrangler.jsonc` (worker `pengusignal`, D1 binding to the real
> database `aa91256d-98f1-4d81-b294-2a34b0c4ebb3` created by the owner),
> `open-next.config.ts`, `public/_headers`, `cloudflare-env.d.ts`, the D1
> adapter wiring, and `migrations/0001_init.sql`. This section documents
> HOW they were produced — for reference, rebuilds, or a fresh environment.

The app runs on **Cloudflare Workers** via
[OpenNext Cloudflare](https://opennext.js.org/cloudflare) — the official
Next.js adapter. Run these steps **once**, locally, then commit the results:

### 1.1 Install the adapter

```bash
npm install -D @opennextjs/cloudflare wrangler
npx opennextjs-cloudflare init
```

`init` generates `wrangler.jsonc` (with the required `nodejs_compat`
compatibility flag) and adds `preview` / `deploy` scripts to `package.json`.
**Commit both changes** — the Workers Builds pipeline (path B) relies on
them being in the repo.

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

⚠️ **Corrected (R28).** An earlier draft of this section suggested reading the
D1 binding from `process.env.DB` — that **does not work** with OpenNext
Cloudflare. The binding is only reachable via `getCloudflareContext()`, and
the whole switch has four moving parts (all now in the repo):

**(a) Matching package versions.** The adapter must match `@prisma/client`'s
major version — the Prisma 6 client needs the 6.x adapter:

```bash
npm install @prisma/adapter-d1@^6.19.3   # NOT v7 — that targets Prisma 7
```

**(b) Schema flags** (`prisma/schema.prisma`) — adapter + query-compiler mode
(the Rust engine binary cannot run on Workers). Do NOT set an `output`
directory: OpenNext patches the default-generated client at build time.

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters", "queryCompiler"]
}
```

**(c) `src/lib/db.ts` — per-request `getDb()`, not a module-level client.**
Both the Workers D1 path and the SQLite fallback (local dev, e2e scripts,
self-hosted) live behind one function. SYNC `getCloudflareContext()` is
deliberate — see the file's docblock for the full rationale:

```ts
import { PrismaClient } from '@prisma/client'
import { PrismaD1 } from '@prisma/adapter-d1'

export async function getDb(): Promise<PrismaClient> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const { env } = getCloudflareContext()   // sync — only resolves inside the deployed worker
    if (env?.DB) return new PrismaClient({ adapter: new PrismaD1(env.DB) })
  } catch { /* not on Workers */ }
  // …SQLite fallback via DATABASE_URL (unchanged local dev)
}
```

Every consumer (`session.ts`, `daily.ts`, 4 API routes, `scripts/e2e-auth.ts`)
calls `const db = await getDb()` at the top of its function.

**(d) `next.config.ts` — keep Prisma external** (official OpenNext recipe,
[opennext.js.org/cloudflare/howtos/db](https://opennext.js.org/cloudflare/howtos/db)).
Without this, Next bundles `@prisma/client` with NODE conditions (the
Rust-engine client) and the worker dies with
*"Prisma Client could not locate the Query Engine"*:

```ts
const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
}
```

Then regenerate the client, the binding types, and the initial migration
(all committed — re-run only when the schema changes):

```bash
npx prisma generate
bun run cf-typegen        # wrangler types --include-runtime=false …
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma \
  --script --output migrations/0001_init.sql
```

> **`--include-runtime=false` matters:** with runtime types included, the
> generated file redefines the global `Response` (15k lines), which changes
> `Response.json()` to `unknown` project-wide and breaks ~50 call sites.

> Prefer staying closer to SQLite semantics? **Turso** (libSQL) works with
> `@prisma/adapter-libsql` and the same schema — swap the adapter in
> `getDb()`.

### 1.4 Test the Workers/D1 path locally (before deploying)

`bun run dev` deliberately stays on SQLite (see `src/lib/db.ts`). To exercise
the REAL worker + D1 stack locally:

```bash
cp .dev.vars.example .dev.vars    # then paste your real SESSION_SECRET
npx wrangler d1 migrations apply pengusignal --local   # schema into local D1
bun run preview                   # builds the worker, serves it on http://localhost:8787
```

Verify: `/api/config` → `configOk: true`, `/api/signal/history` → backfills
~21 days into local D1 (every row stamped with the current engine version),
`/api/signal/today` → `auth_required` (paywall intact). This exact flow was
used to validate the stack end-to-end before the first deploy.

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
| Variable | `NEXT_PUBLIC_SPONSOR_PAYMASTER_ADDRESS` | *(optional — see §0.5; empty = users pay own gas)* |
| Variable | `NEXT_PUBLIC_ABSTRACT_APP_ID` | *(optional — portal listing id; enables the Upvote banner)* |
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
   candles; each row carries its engine version — `v1` for the pre-launch
   reconstruction window, `v2` from the first live lock after the upgrade).
3. `GET /api/market/overview` → live PENGU price (~$0.009 range).
4. Open the site in a browser: Persian RTL renders by default, language
   toggle flips to English, all 5 sections render (hero, terminal,
   performance, pricing, FAQ), zero console errors.
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
| "Prisma Client could not locate the Query Engine" (on the worker) | `serverExternalPackages` missing `"@prisma/client", ".prisma/client"` in `next.config.ts`, or adapter major ≠ client major (needs 6.x with `@prisma/client@6`) → fix and rebuild |
| ~50 `TS18046: … is of type 'unknown'` errors after regenerating types | `cloudflare-env.d.ts` was regenerated WITH runtime types → run `bun run cf-typegen` (which passes `--include-runtime=false`) |
| `bun run lint` dies with `JavaScript heap out of memory` | eslint is parsing build output → `.open-next/**`/`.wrangler/**` must stay in the ignores list of `eslint.config.mjs` |
| Empty signal history (on the deployed worker) | D1 migration not applied remotely → `npx wrangler d1 migrations apply pengusignal --remote` |
| Market data 502s | GeckoTerminal throttling — transient, self-heals via cache; see §7 swap points |
| Wallet connect blocked | `NEXT_PUBLIC_APP_NETWORK`/RPC vars missing at **build** time (public vars are inlined) → set vars → rebuild |

---

*Deployment target reference: Cloudflare Workers + OpenNext (`@opennextjs/cloudflare`), D1 database (`pengusignal`, id `aa91256d-98f1-4d81-b294-2a34b0c4ebb3`), free plan. Tested shapes: Next.js 16 App Router, Prisma 6 + `@prisma/adapter-d1` 6.x (WASM engine via workerd conditions), wagmi/AGW client-side. The full Workers stack — build, D1 queries, backfill, auth paywall — was validated locally with `bun run preview` (R28).*
