# Architecture

PenguSignal is a single-page Next.js 16 application with an API-first backend.
This document explains the system end-to-end so future developers can extend it safely.

```
┌──────────────────────────────── Browser ────────────────────────────────┐
│  React 19 + Abstract Global Wallet (AGW) via @abstract-foundation/agw-react │
│  ├── Single page, 5 sections: hero (+mascot) · terminal ·                │
│  │   performance · pricing · FAQ                                          │
│  │     ├── Terminal: signal card + tabs (chart / alerts / risk calc)      │
│  │     └── Performance: tabs (track record / backtest)                    │
│  └── BuyPlanButton ladder → payment dialog (entitlement-gated)            │
└──────────────┬───────────────────────────────────────────┬──────────────┘
               │ fetch (same-origin, httpOnly cookie)      │ wallet tx (PENGU transfer)
               ▼                                           ▼
┌─────────────────────────────┐                ┌───────────────────────────┐
│  Next.js Route Handlers     │                │  Abstract chain (2741)    │
│  /api/auth/*    nonce/verify│                │  PENGU ERC-20 transfers   │
│  /api/market/*  cached data │──verify tx──▶  │  → treasury wallet        │
│  /api/signal/*  paywalled   │                └───────────────────────────┘
│  /api/backtest  replay      │
│  /api/payments/* intent     │
│  /api/user-profile portal   │
└──────┬──────────┬───────────┘
       ▼          ▼
┌────────────┐ ┌──────────────────────────┐
│ Prisma/DB  │ │ GeckoTerminal API (free) │
│ users,     │ │ PENGU/WETH pool: price,  │
│ sessions,  │ │ OHLCV candles (USD)      │
│ nonces,    │ └──────────────────────────┘
│ intents,   │
│ signals    │
│ (versioned)│
└────────────┘
```

## Module map

| Path | Responsibility |
|---|---|
| `src/lib/config.ts` | Single source of truth. Reads every env var, validates, exports typed config. **No other module reads `process.env` for app config.** |
| `src/lib/chains.ts` | Client-side viem chain definitions (Abstract 2741 / Testnet 11124). |
| `src/lib/market/geckoterminal.ts` | Market data client with in-memory TTL cache (respects the free tier's ~30 req/min). |
| `src/lib/analysis/indicators.ts` | Pure, deterministic indicator math (EMA, SMA, RSI-Wilder, MACD, Bollinger, Stochastic, ATR, ADX/DI, OBV slope, ROC, swing levels). |
| `src/lib/analysis/engine.ts` | **Engine v2 (regime-aware)**: ADX picks the per-timeframe weight table (trend / balanced / mean-revert), a chase dampener scales momentum votes when price is stretched from EMA20 (with a fresh-breakout exemption), verdict thresholds scale with ATR%. Produces verdict + confidence + ATR-based trade plan. `ENGINE_VERSION` is stamped on every lock. |
| `src/lib/signal/daily.ts` | The product logic: lock one verdict per UTC day (stamped with `engine` version), expose history, score outcomes against real next-day closes, backfill from historical candles (`backfilled: true` on reconstructed rows). |
| `src/lib/backtest/replay.ts` | Walk-forward replay over historical candles — the public Backtest tab and `/api/backtest`. |
| `src/lib/auth/session.ts` | Nonces (single-use, expiring, exact-message storage), sessions (random secret + HMAC cookie + SHA-256 at rest). |
| `src/lib/payments/onchain.ts` | On-chain payment verification via `eth_getTransactionReceipt` + ERC-20 Transfer log decoding. Amounts come from `subscriptionPackages` (`src/lib/config.ts`) resolved server-side from a `planId` — the client never names a price. |
| `src/lib/rate-limit.ts` | In-memory sliding-window limiter used by every public route. |
| `src/lib/abstract/` | Portal identity (`get-user-profile.ts` + tier colors), optimistic tx submission (`optimistic-tx.ts`), upvote voting contract (`voting-contract.ts`). |
| `src/hooks/use-app-data.ts` | All TanStack Query hooks + the wallet sign-in mutation. |
| `src/hooks/use-agw-login.ts` | The shared AGW login ladder (embedded-browser warning + dead-stack guard) behind the connect button and BuyPlanButton. |
| `src/components/payments/buy-plan-button.tsx` | Owns the whole purchase ladder: wallet-backend check → AGW login → SIWE sign-in → payment intent + dialog (remembered pending plan auto-opens). |
| `src/lib/i18n/` | `dict.ts` (fa/en), `context.tsx` (provider, cookie persistence, dir switching). |

## Security model (priority #1, #2 and #3)

1. **Never trust the client about money.** The frontend submits only `{ intentId, txHash }`.
   Amount, recipient, sender, token, chain and timing are re-derived from the blockchain.
2. **Entitlements live server-side.** `/api/signal/today` checks session → active
   subscription before serializing any signal content; the API answers with
   `auth_required` | `subscription_required` | `granted`. Registration is free, but
   the free tier receives only neutral metadata (`access` state + date) — never
   the verdict.
3. **No signal leaks.** The public track record masks any day whose outcome is still
   unknown (`LOCKED` rows) so today's paid verdict can't be inferred from history.
4. **Replay-proof auth.** Nonces are single-use, expire in 10 min, and the exact signed
   message is stored verbatim (zero reconstruction drift).
5. **Hardened sessions.** Cookie is httpOnly + sameSite=lax + secure(prod); value is
   `id.secret.hmac`; only `sha256(secret)` is stored; 7-day expiry with last-seen updates.
6. **Abuse resistance.** Per-IP/per-address sliding-window rate limits on every endpoint;
   payment intents expire in 30 minutes; `txHash` has a unique index (double-credit impossible).
7. **Input validation.** Zod-ready types + explicit regex checks on addresses,
   signatures and tx hashes; all Prisma queries are parameterized by construction.

## The daily signal lifecycle

```
00:00 UTC ─ first request of the day
            └─ engine v2 pulls fresh candles (15m/1h/4h/1d, only CLOSED candles)
            └─ regime-aware composite score → verdict → persisted to DailySignal
               (immutable for the day, stamped with engine: 'v2')
   …users with an active plan (day/week/month/year/lifetime) → /api/signal/today returns the locked row
next day  ─ history scorer compares verdict direction vs real next-day close → WIN/LOSS/NEUTRAL
```

Backfill: on the first-ever `/api/signal/history` call, the engine replays its scoring
over the last ~21 days of real daily candles, so the public track record is genuine
market data from day one. Reconstructed rows carry `backfilled: true` — the UI marks
them with a ◆ symbol and a bilingual disclosure footnote, so pre-launch
reconstruction is public, never hidden.

**Engine versioning (R26).** Every `DailySignal` row stores the engine generation
that produced it (`engine: 'v1' | 'v2' | …`). When the engine changes, the version
is bumped — existing rows are NEVER rewritten. The track record UI shows a `v2`
chip on v2 rows plus a permanent bilingual disclosure explaining why v1 failed
(48% lagging trend weight on a mean-reverting asset) and that failures are
published, not hidden. This turns engine upgrades into visible, auditable events.

## Payments & crediting (v2 tariff)

- **Free tier**: wallet registration + signature login cost nothing; signed-in users
  get market data, track record, backtest and risk calculator. Signals stay locked.
- **Plans** (`subscriptionPackages` in `config.ts`, env-tunable): the Round-17 staircase —
  day 10 / week 65 (7% off) / month 255 (15% off) / year 2750 (25% off) /
  lifetime 7650 PENGU (30% cap, 3-year linear base 10950). 1 day = 10 PENGU is the
  fixed baseline; `validateConfig()` enforces monotonic per-day rates + the 30% cap.
- `POST /api/payments/intent` takes only `{ planId }` — the server resolves the amount,
  treasury and chain, and stores a `PaymentIntent` (`type: 'SUBSCRIPTION'`, `days: null`
  for lifetime). Lifetime owners get `already_lifetime` — nothing left to buy.
- After on-chain verification, finite plans **stack**: credited days extend the current
  `User.subscriptionUntil` instead of replacing it. `lifetime` stores the 2099-12-31
  sentinel in `User.subscriptionUntil` and sets `User.subscriptionPlan = 'lifetime'`.
- **No Session Keys** (owner decision, Round 16): mainnet session keys require a
  security review + Session Key Policy Registry listing, so the only payment mechanism
  is a plain ERC-20 transfer verified against block data. The intent/verify API pair is
  the seam where a session-key flow could be introduced later.

## Adding a language

1. Copy the `en` object in `src/lib/i18n/dict.ts`, translate every value.
2. Add the code to `Lang` and to `dict`.
3. If the language is RTL, add its code to the `dir` derivation in `context.tsx`
   (and in `layout.tsx` for the SSR default).
4. Optionally add a font in `layout.tsx`.

## Adding an indicator

1. Implement it as a pure function in `indicators.ts` (candles in → value out).
2. In `engine.ts → analyzeTimeframe`, compute it, derive a vote
   (`bullish | bearish | neutral`) and a 0–1 strength, then `push(...)` with a weight.
3. Add the weight to **all three regime tables** (`WEIGHTS.trend`, `WEIGHTS.balanced`,
   `WEIGHTS.meanRevert` in `engine.ts`) — each must keep summing to 1. Decide whether
   the new voter belongs in `DAMPABLE` (momentum-chasing voters subject to the chase
   dampener).
4. **Bump `ENGINE_VERSION`** (e.g. `v2` → `v3`) — locked history stays stamped with
   the generation that produced it.
5. Validate the change with `bun run scripts/engine-v2-validation.ts` (walk-forward
   A/B on real candles: accuracy, paper equity, actionable days, plan replay in R).
   Document the reasoning in the PR/commit.

## Data flow guarantees

- All external market data flows through the caching client — direct GeckoTerminal
  calls from route handlers are forbidden (rate-limit safety).
- Every route handler is `force-dynamic` (no stale signal caching at the CDN layer,
  which matters once deployed to Cloudflare).
- The in-memory caches are per-process; on Cloudflare Workers, swap them for the
  Cache API or KV — see DEPLOYMENT.md.
