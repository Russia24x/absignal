# PenguSignal — Full Code Audit (Round 17, 2026-08-28)

> Scope: every file under `src/`, `prisma/`, `scripts/`, plus runtime behavior
> of the running dev server. Triggered by the owner: full audit of
> architecture, core, security, execution — **deployment halted** during and
> after the audit until explicitly lifted.
>
> ⛔ UPDATE (R23): the automated 15-minute review cycle was later
> **permanently removed by owner directive** — no scheduled development
> review runs anymore.
>
> ✅ UPDATE (R27, current): this audit's conclusions still hold. Changes
> since R17, all gated green at each round: **R22** removed fake sections
> (HolderPerks, Snowfall) and wired direct purchase from pricing cards;
> **R23** extended the e2e suite 22 → 34 checks (subscription lifecycle +
> anti-tampering) — all pass; **R24** flattened the UI to a minimal
> 5-section single page (−2,798 lines, no functional loss); **R25** made the
> track record provably transparent (`backfilled` flag + ◆ disclosure);
> **R26** shipped engine v2 (regime-aware weights, chase dampener,
> volatility-scaled verdicts) validated walk-forward, with a versioned track
> record. Current gates: `tsc` 0 errors · lint clean · e2e 34/34 · browser
> QA (EN/FA/RTL/mobile) console-error-free.

**Verdict: PASS with 2 security fixes applied during the audit (A-1, A-2)
and 1 correctness guard added (A-4). No blocking findings remain.**

---

## 1. Architecture Audit

**Approach.** Reviewed module layering, dependency direction, configuration
strategy, i18n, and the client/server split.

| Area | Finding | Status |
|---|---|---|
| Layering | Clean 4-layer split: `app/api/*` (transport) → `lib/*` (domain: auth, payments, signal, market, analysis, backtest) → `prisma` (persistence) → `components/*` (presentation). No domain logic in route handlers beyond orchestration; no DB imports from components. | ✅ |
| Config strategy | Single source of truth `src/lib/config.ts`; zero hardcoded network params; `/api/config` surfaces misconfiguration early (`configOk`). Round 17 adds **tariff sanity validation** (monotonic per-day rates + 30% cap) — env typos now fail loudly. | ✅ |
| Client/server trust boundary | The client never names a price — intents carry only `{ planId }`; the server resolves amounts, treasury, chain. Wallet address comes from the verified session, never from the request body. | ✅ |
| API surface | 14 route handlers, **all rate-limited** (verified by grep sweep), all `force-dynamic`, all returning typed JSON errors. | ✅ |
| i18n | `dict.ts` en/fa kept symmetric (checked this round: +12 keys per language for the staircase UI). RTL/LTR via cookie + `dir` attribute, SSR-consistent. | ✅ |
| Provider stack | AGW (`@abstract-foundation/agw-react`) wraps wagmi + QueryClient; query defaults tuned for the rate-limited upstream (`refetchOnWindowFocus:false`, retry:1). | ✅ |
| Future-proofing (Session Keys) | The intent/verify API pair is the documented seam for a future Session-Keys payment path; nothing else assumes one-shot transfers. | ✅ |

**Architecture debt (non-blocking):** market-data module caches live in
process memory — lost on hot reload/restart (caused transient 502s during this
audit while the upstream was throttled). Acceptable for the sandbox; on
Cloudflare, KV/DO caching is already the documented path.

## 2. Core Audit (engine & data)

| Area | Finding | Status |
|---|---|---|
| Analysis engine | 8 indicators + ADX/ATR/swing levels, weighted multi-TF scoring (1d .4 / 4h .3 / 1h .2 / 15m .1), verdict thresholds, ATR-based trade plan. Deterministic, no randomness. | ✅ |
| Daily signal lock | One signal per UTC day, lock-on-write (`DailySignal` unique by date). Unresolved days are **LOCKED-masked** in every read path — history, detail dialog, equity curve. Verified again this round by e2e ("history masks unresolved verdicts"). | ✅ |
| Honest track record | Verdicts are scored against the real next-day close; no retroactive edits (rows are immutable once resolved). | ✅ |
| Market data layer | GeckoTerminal with per-TF TTL cache, in-flight coalescing, global token bucket (24/min), stale-on-error. Behavior verified under real throttling during this audit (transient 502s only when cache cold + bucket empty; recovers automatically). | ✅ |
| Payment crediting | Finite plans stack on `max(currentUntil, now)` — no lost days; lifetime sentinel (2099-12-31) always wins; `already_lifetime` blocks repurchase. | ✅ |
| Money math | **Finding A-1 (fixed):** `penguToWei` used `units * 10**18` — overflows `Number.MAX_SAFE_INTEGER`; the 7650-PENGU lifetime intent came out as `7649.999999999999475712` PENGU. Rewritten as exact BigInt fixed-point conversion (`toFixed(6)` string split). All 5 plans now produce exact wei. | 🔧 fixed |
| Config guard | **Finding A-4 (added):** `validateConfig()` now enforces the Round-17 balance rule — per-day rate monotonicity and the 30% discount cap — at boot and on every `/api/config` poll. | ✅ added |

## 3. Security Audit

**Method.** Line review of the auth, session, payment-intent, payment-verify
and signal-gate paths + the automated E2E suite
(`scripts/e2e-auth.ts`, 22 checks) executed live: **22/22 pass** after fixes.

| Control | Finding | Status |
|---|---|---|
| Auth (SIWE-style) | Single-use nonce bound to address, verbatim message storage (zero reconstruction drift), ERC-1271/ERC-6492 verification for AGW smart accounts. Replay + forged-signature rejection verified live. | ✅ |
| Sessions | 32-byte random secret, only SHA-256 hash stored; cookie `<id>.<secret>.<hmac>` is tamper-evident (constant-time compare); httpOnly + sameSite=lax + secure in production; 7-day TTL with server-side expiry enforcement. | ✅ |
| Paywall ladder | `auth_required → subscription_required → granted`, server-enforced; `signal` payload is absent (not hidden) without an active subscription. E2e-verified. | ✅ |
| Payment verification | 6 independent on-chain checks (receipt status, tx.to = PENGU contract, tx.from = session user, Transfer(user→treasury) log decode with correct topic + emitting contract, amount ≥ expected, block timestamp window). Client supplies only a tx hash. | ✅ |
| Replay / double-spend | txHash unique index across intents; same-tx-different-intent rejected. | ✅ |
| **Concurrency** | **Finding A-2 (fixed):** the verify route had a check-then-act window — two concurrent verifies of the same intent could both pass `status === 'PENDING'` and double-credit stacked days. Now the intent is **atomically claimed** (`updateMany` on `txHash: null → txHash` with re-claim allowed for crash-retry) before verification; the loser gets 409, a failed verification releases the claim. | 🔧 fixed |
| Rate limiting | All 14 routes; per-user on money paths (`intent` 12/min, `verify` 30/min), per-IP on public reads. | ✅ |
| Secrets | `SESSION_SECRET` ≥32 chars enforced; `.env` untracked in git (verified); `.env.example` carries a placeholder only. No secrets in source (grep sweep clean). | ✅ |
| Price integrity | **Finding A-3 (mitigated by A-1 + A-4):** with the old float math, an env price above ~10,000 PENGU would drift further from the intended amount. Exact conversion + boot-time validation close this class. | ✅ |
| Input validation | Plan ids whitelisted; tx hashes regex-validated; addresses checksummed/lowercased consistently; body parsing guarded. | ✅ |

**Residual risks (accepted):** server trusts the configured RPC endpoint
(`RPC_URL_MAINNET`) for payment truth — an operator-level concern, not
exploitable by app users. Treasury key custody is entirely off-app (owner
wallet). AGW `loadProviderDetails` sandbox fetch failure is environmental and
gracefully degraded.

## 4. Execution Audit (runtime)

| Check | Result |
|---|---|
| Dev server health (`GET /` 200, API 200s, no compile errors) | ✅ |
| E2E security suite live run | ✅ 22/22 (after A-1/A-2 fixes; flaky upstream-availability check hardened with exponential backoff — security ≠ availability) |
| `bun run lint` | ✅ clean |
| `tsc --noEmit` (src/ + scripts/) | ✅ 0 errors |
| `/api/config` tariff validation | ✅ `configOk:true`, ladder 10/65/255/2750/7650, discounts 0/7/15/25/30% |
| Browser QA (agent-browser, EN + FA + mobile 390px) | ✅ see Round 17 worklog — pricing section renders badges, strikethroughs, staircase visual; zero console errors |
| OOM posture | `NODE_OPTIONS=--max-old-space-size=1536` in dev script; RSS stable | ✅ |
| Server persistence | Double-fork orphan start pattern; survives tool-command teardown | ✅ |

## 5. Deployment Audit — hold **LIFTED** (Round 19)

- **Round-17 state:** intentionally stopped (owner decision). Verified at the
  time: no CI/CD pipelines (`.github/workflows` absent), no deploy configs,
  no deploy scripts — nothing could deploy automatically.
- **Round 19:** owner lifted the hold; deployment preparation is the active
  phase. `docs/DEPLOYMENT.md` now carries the full go-live runbook
  (manual Wrangler deploy + `dash.cloudflare.com` GitHub-connected
  auto-deploy + self-hosted standalone path).
- Still true: no CI/CD pipeline exists in-repo (deliberate — Cloudflare
  Workers Builds is the intended pipeline, configured in the dashboard,
  not in the repo).

## Findings Register

| ID | Severity | Area | Finding | Resolution |
|---|---|---|---|---|
| A-1 | Medium | Core/money | Float precision loss in `penguToWei` (7650 → 7649.999…75712 PENGU in wei) | Fixed — exact BigInt fixed-point conversion; e2e asserts exact amounts |
| A-2 | Medium | Security | Concurrent verify could double-credit one intent (check-then-act race) | Fixed — atomic txHash claim + release-on-fail + 409 for race loser |
| A-3 | Low | Security | Same float class could drift for large env-tuned prices | Closed by A-1 + A-4 |
| A-4 | Guard | Core/config | No validation of tariff balance | Added — `validateConfig()` enforces monotonic per-day rates + 30% cap |
| A-5 | Info | Ops | In-memory market cache lost on restart; upstream throttle → transient 502 | Accepted (sandbox); KV/DO documented for production |
| A-6 | Info | Testing | E2E "candles public" conflated availability with security | Hardened — exponential backoff, judges only 401/403 as failure |

*Audit performed by the main agent (Z.ai Code), Round 17. ⛔ The automated
15-minute review cycles were later permanently removed by owner directive
(R18, reaffirmed R23); no scheduled dev-review job exists or may be created.*
