# 🐧 PenguSignal

**Daily BUY / SELL signals for PENGU — built on the [Abstract](https://abs.xyz) blockchain.**

PenguSignal reads the real PENGU market every day (live DEX data on Abstract), runs a
multi-timeframe technical-analysis engine (RSI, MACD, EMA, Bollinger, Stochastic, ADX, OBV, ATR),
and locks a clear daily verdict — with entry zone, stop-loss and targets.

Access works entirely on-chain: connect an Abstract wallet, pay the one-time platform fee
(5 PENGU), then unlock each day's signal for 1 PENGU or subscribe. Payments are plain PENGU
transfers to a fixed treasury wallet, verified directly against Abstract block data.

- 🇮🇷 Persian (RTL) & English (LTR) UI — switch from the header
- 📊 Live terminal: price, volume, liquidity, candlestick chart (15m/1h/4h/1d)
- 🔒 Locked daily verdicts + a **public, honestly-scored track record**
- 🛡️ Security-first: signature login, single-use nonces, server-side entitlements, on-chain payment verification

> ⚠️ Educational technical analysis — not financial advice.

---

## Contents

- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Configuration](#configuration)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project structure](#project-structure)
- [Documentation](#documentation)

---

## Quick start

```bash
bun install          # install dependencies
bun run db:push      # create the SQLite database
bun run dev          # start on http://localhost:3000
```

Copy `.env.example` → `.env` and adjust (defaults are ready for Abstract mainnet).
Generate a strong session secret:

```bash
openssl rand -hex 32   # → SESSION_SECRET
```

Open `http://localhost:3000`, connect with the **Abstract Global Wallet (AGW)** —
the official Abstract smart-account wallet (email, social or external wallet
login; every method yields the same AGW account) — and walk the ladder:
connect → sign → pay access → unlock signal. Signature authentication supports
both EOAs and smart accounts (ERC-1271 / ERC-6492).

## How it works

### The analysis engine (`src/lib/analysis/`)

1. **Data** — OHLCV candles (USD-denominated) for the deepest PENGU pool on Abstract
   stream from the free [GeckoTerminal API](https://www.geckoterminal.com/dex-api) (no key
   needed). Prices, volume and liquidity come from the same source.
2. **Indicators** — 8 classic indicators vote on **4 timeframes** (15m, 1h, 4h, 1d)
   with transparent weights (`engine.ts`):
   EMA20/50 cross (0.18), MACD (0.16), EMA200 trend (0.14), RSI-14 (0.14),
   Bollinger %B (0.10), Stochastic (0.10), OBV slope (0.09), ROC (0.09).
3. **Composite** — timeframe scores are weighted (1d 0.40 / 4h 0.30 / 1h 0.20 / 15m 0.10)
   into a −100…+100 score → verdict: STRONG_SELL · SELL · HOLD · BUY · STRONG_BUY.
4. **Risk plan** — entry zone, stop-loss and 3 targets derive from the daily ATR
   (1.5×ATR risk, 1R/2R/3R targets).
5. **Lock & score** — the verdict is computed once per UTC day and stored immutably.
   Past days are later scored against the real next-day close — the public
   **track record** is therefore genuinely data-driven.

### Payments (`src/lib/payments/onchain.ts`)

The browser only submits a tx hash. The backend then verifies **on-chain via the Abstract
RPC**:

| Check | Guarantees |
|---|---|
| `eth_getTransactionReceipt` status = success | tx actually landed |
| `tx.to` = PENGU token contract | it is a token transfer |
| `tx.from` = session address | payer is the claimer |
| ERC-20 `Transfer(user → treasury)` log, value ≥ expected | right token, recipient, amount |
| block timestamp inside the intent window | no replay of old txs |
| unique `txHash` index | one tx can never credit twice |

### Auth (`src/lib/auth/session.ts`)

SIWE-style wallet login: server issues a **single-use nonce** → wallet signs a structured
message (`personal_sign`) → viem verifies the signature → httpOnly session cookie
(HMAC-protected, only a SHA-256 hash is stored server-side). Nonces expire in 10 minutes
and are consumed on use (replay-proof).

## Configuration

Everything is environment-driven — **nothing is hardcoded**. See `.env.example`:

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_APP_NETWORK` | `mainnet` | `mainnet` (2741) or `testnet` (11124) |
| `NEXT_PUBLIC_RPC_MAINNET` / `NEXT_PUBLIC_RPC_TESTNET` | official RPCs | Abstract RPC endpoints |
| `NEXT_PUBLIC_PENGU_MAINNET` | `0x9ebe…cba62` | PENGU ERC-20 on Abstract mainnet |
| `NEXT_PUBLIC_PENGU_TESTNET` | — | any test ERC-20 for testnet mode |
| `NEXT_PUBLIC_TREASURY_ADDRESS` | `0x60Df…8818` | where all PENGU payments land |
| `ACCESS_FEE_PENGU` | `5` | one-time platform access fee |
| `DAILY_SIGNAL_PRICE_PENGU` | `1` | per-day signal unlock |
| `SUBSCRIPTION_7D_PRICE_PENGU` / `SUBSCRIPTION_30D_PRICE_PENGU` | `7` / `30` | prepaid packages |
| `GECKOTERMINAL_NETWORK` / `GECKOTERMINAL_POOL` | `abstract` / PENGU-WETH pool | market data source |
| `SESSION_SECRET` | — | **required**, ≥ 32 chars (`openssl rand -hex 32`) |

> Wallet connection is exclusively the **Abstract Global Wallet (AGW)** via
> `@abstract-foundation/agw-react` — its built-in modal covers email, social
> and external wallets, so no extra WalletConnect project id is needed.

Switching to **testnet** is one variable (`NEXT_PUBLIC_APP_NETWORK=testnet`) plus a test
token address — see [docs/TESTNET.md](docs/TESTNET.md).

## Testing

```bash
bun scripts/e2e-auth.ts   # 18-check backend security suite (auth, paywall, payments)
bun run lint              # ESLint
bunx tsc --noEmit         # type check
```

The E2E suite generates a throwaway wallet and exercises the real flow end-to-end:
nonce issuance, signature verification, replay/forgery rejection, session lifecycle,
the paywall ladder, payment intents, and on-chain rejection of fake transactions.

## Deployment

Full guides live in [`docs/`](docs/):

- **[DEPLOYMENT.md](docs/DEPLOYMENT.md)** — Cloudflare free tier (Workers + D1/Turso),
  including domain setup and zero-cost scaling notes.
- **[ABSTRACT_PORTAL.md](docs/ABSTRACT_PORTAL.md)** — registering on portal.abs.xyz,
  creating your wallet, and funding the treasury.
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — modules, data flow, security model,
  and the i18n/adding-a-language recipe.

## Project structure

```
src/
├── app/
│   ├── page.tsx              # the single-page app (landing + terminal)
│   └── api/
│       ├── auth/             # nonce / verify / logout / me
│       ├── market/           # overview / candles (cached proxy)
│       ├── signal/           # today (paywalled) / history (public)
│       └── payments/         # intent / on-chain verify
├── components/
│   ├── landing/              # hero, features, pricing, FAQ, track record…
│   ├── market/               # overview cards, candlestick chart
│   ├── signal/               # the gated signal card
│   ├── payments/             # payment dialog flow
│   └── wallet/               # connect button + auto sign-in
├── hooks/                    # TanStack Query hooks (server state)
└── lib/
    ├── analysis/             # indicators + multi-TF engine
    ├── auth/                 # nonces, sessions
    ├── i18n/                 # fa/en dictionaries + context
    ├── market/               # GeckoTerminal client + cache
    ├── payments/             # on-chain verification
    └── signal/               # daily lock + track record + backfill
```

## Documentation

| Doc | What's inside |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | system design, security model, engine internals, how to extend |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Cloudflare free-tier deployment, envs, DB migration path |
| [docs/ABSTRACT_PORTAL.md](docs/ABSTRACT_PORTAL.md) | portal.abs.xyz registration & wallet setup walkthrough |
| [docs/TESTNET.md](docs/TESTNET.md) | running against Abstract Testnet |
| [docs/MAINTENANCE.md](docs/MAINTENANCE.md) | operations, monitoring, common tasks, troubleshooting |

---

Made with 💙 on Abstract · © PenguSignal
