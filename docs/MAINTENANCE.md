# Maintenance & operations guide

Everything an operator needs to run, monitor, and extend PenguSignal.

## Daily operation

- **Nothing is manual.** The daily signal locks automatically on the first
  request after 00:00 UTC; market data refreshes on demand with server-side
  caching; expired nonces/intents are inert rows that can be pruned (below).
- **Watch the treasury**: https://explorer.abs.xyz/address/0x60Df4E186364c3a49A550Aee29Da1d5fe3658818
- **Health endpoints**:
  - `GET /api` → `{ status: "ok" }` (liveness)
  - `GET /api/config` → `configOk: true` + any misconfiguration messages
  - `GET /api/market/overview` → upstream market data healthy

## Common tasks

### Re-check / re-run the security suite

```bash
bun scripts/e2e-auth.ts
```

Run after any change to auth, payments, or the signal paywall. It must show 34 ✅
(34 checks: auth ladder, paywall, no-leak, exact wei amounts, subscription
lifecycle incl. expiry/renewal stacking, and anti-tampering).

### Prune stale rows (optional, safe anytime)

```sql
DELETE FROM AuthNonce      WHERE expiresAt < datetime('now', '-1 day');
DELETE FROM PaymentIntent  WHERE status = 'PENDING' AND expiresAt < datetime('now', '-1 day');
DELETE FROM Session        WHERE expiresAt  < datetime('now', '-1 day');
```

### Change pricing

Only env vars — `SUBSCRIPTION_1D_PRICE_PENGU`, `SUBSCRIPTION_7D_PRICE_PENGU`,
`SUBSCRIPTION_30D_PRICE_PENGU`, `SUBSCRIPTION_365D_PRICE_PENGU`,
`SUBSCRIPTION_LIFETIME_PRICE_PENGU`. The UI reads them from `/api/config`;
restart after changing. A price change only affects **new** intents — already
credited subscriptions keep their remaining days, and lifetime holders keep
lifetime.

The Round-17 balance rule is enforced by `validateConfig()`: per-day rates must
be non-increasing as plan duration grows (day 10 → week 65 → month 255 →
year 2750 → lifetime 7650 PENGU) and no plan may exceed its linear base or the
30% discount cap. A typo that breaks the ladder shows up as `configOk:false`
on `/api/config` — check it after any price change.

### Rotate the treasury

1. Set `NEXT_PUBLIC_TREASURY_ADDRESS` to the new address. Restart.
2. Ongoing intents (≤ 30 min old) against the old address can be settled
   manually: users send to the new one and create a fresh intent.

### Tune the engine (v2 — regime-aware)

All knobs live at the top of `src/lib/analysis/engine.ts`:

| Constant | What it controls |
|---|---|
| `WEIGHTS.trend` / `.balanced` / `.meanRevert` | Per-regime indicator weights (each table must sum to 1) — ADX ≥ 25 → trend, < 20 → mean-revert |
| `TIMEFRAME_WEIGHTS` | 1d 0.40 / 4h 0.30 / 1h 0.20 / 15m 0.10 composite |
| `VERDICT_THRESHOLDS` | Base BUY/SELL/STRONG thresholds (±15/±40), scaled by volatility |
| `DAMPABLE` | Which voters count as momentum-chasing (subject to the chase dampener) |
| `dampParams` (in `analyzeTimeframe`) | Chase-dampener reach per regime (trend 2.5 ATR/floor 0.5 · balanced 2.0/0.35 · chop 1.5/0.25) |
| `volatilityScale()` | ATR% multiplier on verdict thresholds (×0.8–1.6, baseline ATR% ≈ 4) |

**The discipline (non-negotiable):**

1. The engine is deterministic — the same candles always produce the same output.
2. **Bump `ENGINE_VERSION`** (e.g. `v2` → `v3`) with any scoring change. Locked
   `DailySignal` rows keep their original version — the public track record is
   versioned and history is never rewritten.
3. Validate before shipping: `bun run scripts/engine-v2-validation.ts` — a
   walk-forward A/B over ~119 days of real candles (accuracy, paper equity,
   actionable days, plan replay in R). Ship only if the new version is not
   worse on the plan-replay metric (what subscribers actually trade).
4. v1's lesson is documented in the UI itself: fixed trend-heavy weights on a
   mean-reverting asset sold bottoms and bought tops (28.6% accuracy over the
   21-day pre-launch window). Read `scripts/engine-v2-validation.ts`'s header
   before touching weights.

### Inspect today's locked signal (admin)

```bash
sqlite3 db/custom.db "SELECT date, verdict, score, confidence, engine, backfilled FROM DailySignal ORDER BY date DESC LIMIT 5;"
```

## Monitoring suggestions (when deployed)

- **Cloudflare**: Workers analytics (requests, errors, CPU) are free.
- **Uptime**: point a free monitor at `GET /api/config` and
  `GET /api/market/overview`.
- **Alerts**: if `market_data_unavailable` (502) appears repeatedly, the
  GeckoTerminal upstream is down or rate-limiting — increase cache TTLs in
  `src/lib/config.ts` (`marketConfig.*TtlMs`).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/api/config` shows `configOk: false` | missing/invalid env vars | read `configErrors[]`, fix `.env`, restart |
| “PENGU token address is not configured” in testnet mode | `NEXT_PUBLIC_PENGU_TESTNET` empty | set it to your test ERC-20 |
| Signature login loops | server restarted between nonce & verify (nonce lost) | normal, retry; on Cloudflare use D1/Turso so sessions survive |
| Payment stuck on “verifying” | tx not yet mined / wrong chain | wait a block (~2 s on Abstract); dialog auto-verifies when the receipt lands |
| “transaction sender does not match your wallet” | user paid from a different wallet than the session | pay from the connected wallet |
| Market cards show “—” | upstream outage | check `GET /api/market/overview` from the server; TTLs will re-warm on recovery |
| Chart empty for a timeframe | pool has fewer candles than requested | wait — GeckoTerminal indexes new pools progressively |
| A brand-new DB column (e.g. after adding a field to the schema + `db:push`) comes back `null`/missing from the API | the running dev server holds a stale Prisma client in memory | restart the dev server (`bun run dev`) — bitten twice in R25/R26 |
| Track record shows an old engine version on recent days | expected — rows are stamped at lock time and never rewritten | nothing to fix; new locks pick up the current `ENGINE_VERSION` automatically |

## Release checklist

1. `bun run typecheck` → clean
2. `bun run lint` → clean
3. `bun scripts/e2e-auth.ts` → 34 ✅
4. Engine changed? → `ENGINE_VERSION` bumped + `bun run scripts/engine-v2-validation.ts` not worse than previous
5. Manual browser pass: connect → sign → buy a plan → signal renders → language toggle → mobile width
6. `GET /api/config` on the deployed host → `configOk: true`
7. Deploy via [docs/DEPLOYMENT.md](DEPLOYMENT.md) (manual Wrangler or Workers Builds — both covered) and run its §6 post-deploy verification
