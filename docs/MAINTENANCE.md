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

Run after any change to auth, payments, or the signal paywall. It must show 22 ✅.

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

### Tune the engine

All weights are at the top of `src/lib/analysis/engine.ts`
(`INDICATOR_WEIGHTS`, `TIMEFRAME_WEIGHTS`, `VERDICT_THRESHOLDS`).
The engine is deterministic — the same candles always produce the same output,
so changes are auditable against history by re-running the backfill on a dev DB.

### Inspect today's locked signal (admin)

```bash
sqlite3 db/custom.db "SELECT date, verdict, score, confidence FROM DailySignal ORDER BY date DESC LIMIT 5;"
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

## Release checklist

1. `bunx tsc --noEmit` → clean
2. `bun run lint` → clean
3. `bun scripts/e2e-auth.ts` → 22 ✅
4. Manual browser pass: connect → sign → buy a plan → signal renders → language toggle → mobile width
5. `GET /api/config` on the deployed host → `configOk: true`
