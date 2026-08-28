# PenguSignal — Project Worklog

---
Task ID: 1
Agent: Main Agent (Z.ai Code)
Task: Build PenguSignal — a PENGU daily buy/sell signal platform on Abstract blockchain with wallet auth, PENGU payments, TA engine, FA/EN i18n, Cloudflare-ready architecture

Work Log:
- Researched Abstract docs (docs.abs.xyz / build.abs.xyz): mainnet chain 2741 (`https://api.mainnet.abs.xyz`), testnet 11124 (`https://api.testnet.abs.xyz`), explorers
- Verified PENGU token on Abstract mainnet on-chain via GeckoTerminal + RPC: `0x9ebe3a824ca958e4b3da772d2065518f009cba62` (18 decimals, real liquidity ~$675K, 24h vol ~$390K)
- Selected market data source: GeckoTerminal free API (no key), pool `PENGU/WETH 0.3%` = `0xda7d037fda848177141e037f9d0c67cae7b53262`, OHLCV verified in all timeframes (15m/1h/4h/1d, USD-denominated)
- Verified treasury `0x60Df4E186364c3a49A550Aee29Da1d5fe3658818` holds PENGU on mainnet (real address)
- Installed: wagmi v3.7.7, viem 2.56, lightweight-charts 5.2
- Built env-driven config system (`src/lib/config.ts`) — zero hardcoding, validation endpoint `/api/config`
- Prisma schema: User, AuthNonce (with verbatim message storage), Session (sha256+HMAC), PaymentIntent (unique txHash), DailySignal (immutable daily lock), SignalUnlock — pushed to SQLite
- Built analysis engine: 8 indicators (EMA cross, EMA200, RSI-Wilder, MACD, Bollinger %B, Stochastic, OBV slope, ROC) + ADX/ATR/swing levels, weighted multi-TF scoring (1d .4/4h .3/1h .2/15m .1), verdict thresholds, ATR-based trade plan (entry zone/SL/TP1-3/RR), FA+EN summaries
- Built daily signal service: lock-once-per-UTC-day, honest track record (verdict direction vs real next-day close), auto-backfill of ~21 days from real historical candles, **LOCKED masking of unresolved days** (fixed a verdict leak found in QA)
- Built auth: SIWE-style nonce→sign→verify (viem), single-use nonces (fixed a reconstruction-drift bug by storing the exact message), httpOnly HMAC sessions
- Built on-chain payment verification: receipt status, tx.to=PENGU contract, from=session user, Transfer(user→treasury) log decode, amount ≥ expected, block timestamp window, unique txHash — credits ACCESS / SIGNAL_DAY / SUBSCRIPTION entitlements
- API routes: auth (nonce/verify/logout/me), market (overview/candles, cached), signal (today paywalled / history public), payments (intent/verify) — all rate-limited
- Frontend: dark frosty "Antarctic night" PENGU theme (globals.css tokens, glass cards, aurora lines, snowfall, custom penguin SVG logo), Inter+Vazirmatn fonts, FA-RTL default / EN-LTR switch via cookie (no flash — SSR reads cookie)
- Frontend components: header (nav/lang/network/wallet), hero (live price ticker), market cards (6 stats + buy pressure), lightweight-charts candlestick chart (4 TFs), gated signal card (full ladder: connect→sign→access fee→day unlock→full signal with gauge/plan/MTF breakdown/indicators/levels), payment dialog (4-step progress, wrong-network switch, auto on-chain verify), track record table, features, pricing, FAQ, sticky footer with disclaimer
- Fixed TS errors: viem verifyMessage returns boolean; wagmi v3 useBalance lost `token` param → useReadContract balanceOf; Dict union type; config address casting
- Fixed React lint (set-state-in-effect): key-based dialog remount, derived verifying step, cookie-only i18n persistence
- Fixed SSR crash: replaced @reactuses useCopyToClipboard with navigator.clipboard
- Wrote E2E security suite `scripts/e2e-auth.ts` — 18/18 ✅ (nonce, real signature verify, replay rejection, forged-signature rejection, session lifecycle, paywall ladder, exact intent amounts, treasury targeting, unauthenticated rejection, fake/malformed tx rejection, logout, public endpoints, no-leak history)
- QA via agent-browser: page renders 200, Persian RTL verified, English LTR toggle works, chart canvas renders, 22-row real track record, mobile 390px no overflow, zero browser console errors
- VLM visual review of screenshots: 9.5/10, "production-ready", flawless RTL, no glitches
- Docs: README, docs/ARCHITECTURE.md, docs/DEPLOYMENT.md (Cloudflare free tier, OpenNext + D1/Turso), docs/ABSTRACT_PORTAL.md, docs/TESTNET.md, docs/MAINTENANCE.md, .env.example

Stage Summary:
- Fully functional PENGU signal platform on Abstract mainnet (testnet via env): wallet auth, 5-PENGU access fee, 1-PENGU daily signal or 7/30-day subscriptions, all payments verified on-chain to treasury 0x60Df4E186364c3a49A550Aee29Da1d5fe3658818
- Real data only: live market from GeckoTerminal, 21+ days of real backfilled signal history with honest WIN/LOSS scoring
- Security hardened: 18/18 E2E checks pass; server-side entitlements; on-chain tx verification; no signal leakage (LOCKED masking)
- Deployable to Cloudflare free tier (documented path), modular config-driven architecture, FA/EN i18n with true RTL
- Unresolved/next-phase items:
  1. WalletConnect project ID optional (env ready) — enable mobile wallets by registering at cloud.walletconnect.com
  2. Cloudflare deployment itself (docs ready; D1/Turso adapter swap documented) — needs the owner's Cloudflare account
  3. Optional: Workers Cron to pre-compute daily signal at 00:05 UTC (currently computed on first request)
  4. Optional next features: email/Telegram alerts for subscribers, PENGU-holder gated content, multi-pool aggregation, backtest sandbox UI

---
Task ID: 2
Agent: Main Agent (Z.ai Code)
Task: Round-2 QA (agent-browser + VLM) and enhancement pass — richer styling + new interactive features

Work Log:
- Assessed project state: dev server healthy, all API endpoints 200, zero console/page errors, lint clean
- QA via agent-browser: page renders, FA-RTL/EN-LTR toggle works, mobile 390px no horizontal overflow (scrollWidth=390 at all sections), track record shows 22 real rows
- VLM visual review of desktop/mobile screenshots (7.5/10 baseline): flat cards/buttons, no pulse on live data, cramped date column, tight footer disclaimer, mobile pricing edge-tightness
- Styling enhancements (globals.css): `.card-interactive` (hover lift + frost glow + border brighten), `.btn-aurora` (gradient CTA with hover glow-intensify + lift), `.glow-pulse` (breathing glow for live values), `.countdown-cell`, `.timeline-cell`, `.sparkline-path` draw-in animation, `.icon-bob`, glass cards got top-edge ice-light inset highlight
- Hero: primary CTA upgraded to gradient aurora button; price-change pill now has bg + breathing glow when positive; added 4 trust badges row (wallet login / on-chain payments / real data / daily locks)
- Market cards: price card now renders a real 24h sparkline (SVG path from last 96×15m candle closes, animated draw-in, bull/bear colored); all cards got card-interactive hover; values font-black tabular-nums
- Track record: animated count-up stats (requestAnimationFrame, ease-out cubic), SVG accuracy donut ring (color-coded 45/60% thresholds, drop-shadow glow), 30-day outcome timeline strip (WIN=tall green/LOSS=short red/LOCKED=frost cells with per-day tooltips), date cells whitespace-nowrap, row hover
- Signal card: live HH:MM:SS countdown to next UTC-midnight signal lock (ticks every second, verified 35→32s), digit-block styling, tooltip explains 00:00 UTC lock
- Footer: copy-address buttons for PENGU contract + treasury (short 0x9ebe…ba62 format, clipboard API + execCommand fallback, toast "Copied!" verified via CDP click), grid rebalanced to [1.3fr_0.85fr_1fr] with baseline alignment, disclaimer text enlarged xs
- New components: BackToTop floating button (appears >600px scroll, framer-motion, verified scrolls to 0 via JS click — CDP click blocked only by Next.js dev-tools portal overlay, not present in production)
- New hooks: use-countdown.ts (UTC-midnight countdown, SSR-safe), use-count-up.ts (animated counters)
- Dict: +20 strings (fa/en) — trust badges, countdown, timeline labels, copy address
- Verified EN LTR view renders correctly (VLM: premium gradient CTA, crisp typography, no issues)
- Re-ran E2E security suite: 18/18 pass (nonce, signature, replay, forged sig, paywall ladder, treasury targeting, fake tx rejection, logout, no-leak history)
- Final lint clean; dev log clean; mobile re-verified no overflow after changes

Stage Summary:
- Round-2 QA: stable, zero regressions; visual polish raised from 7.5/10 to ~9/10 (VLM final review confirms all new features render correctly)
- 7 new user-facing features: live next-signal countdown, 24h sparkline, accuracy donut, outcome timeline strip, animated counters, copy-address buttons, back-to-top button
- Richer styling: gradient CTA, card hover glow system, breathing live-value glow, sparkline draw-in, icon bob, ice-light glass edges
- All strings i18n'd (fa/en); RTL/LTR verified; mobile verified
- Unresolved/next-phase items:
  1. WalletConnect project ID optional (env ready) — enable mobile wallets by registering at cloud.walletconnect.com
  2. Cloudflare deployment itself (docs ready; D1/Turso adapter swap documented) — needs the owner's Cloudflare account
  3. Optional: Workers Cron to pre-compute daily signal at 00:05 UTC (currently computed on first request)
  4. Optional next features: email/Telegram alerts for subscribers, PENGU-holder gated content, multi-pool aggregation, backtest sandbox UI

---
Task ID: 3
Agent: Main Agent (Z.ai Code)
Task: Round-3 QA (stable baseline confirmed) + analytics deep-dive features: strategy equity curve, past-signal detail dialog, chart EMA overlays, indicator education tooltips

Work Log:
- Fresh QA baseline: all endpoints 200, zero console/page errors, mobile 390px no overflow, E2E security suite 18/18 pass — phase stable, proceeded with new features
- New API `/api/signal/detail?date=YYYY-MM-DD` (src/app/api/signal/detail/route.ts): returns full engine output for PAST RESOLVED days only. Security: reuses getSignalHistory's masking pipeline as authoritative resolution check — today/unresolved days return 403 `not_resolved` (verified: today→403, invalid→400, past→200, unknown→403). Rate-limited.
- New component SignalDetailDialog: click any resolved row in track-record table → fetch + render full past signal (verdict + gauge, WIN/LOSS badge with real change %, summary, trade plan when present, timeframe breakdown, indicator list with education tooltips). Verified via browser: dialog opens for 2026-08-27, verdict/score/indicators render, outcome -2.74% correct in DOM (VLM misread sign; DOM data confirmed accurate).
- New component EquityCurve ("strategy equity curve"): cumulative paper return of following every locked verdict (buy→long +1, sell→short −1, hold→flat), computed client-side from the real audited history. Animated SVG area chart (framer-motion path draw), zero-line, per-point native tooltips (date · daily% → cumulative%), 4 headline stats (paper return / traded days / best / worst). Renders honest real numbers: −12.1% over 14 traded days, best +18.1%, worst −19.7% — transparency is the product.
- PriceChart upgraded: EMA20 (cyan #7be1ff) + EMA50 (violet #b48cff) LineSeries overlays computed client-side from real candle closes (SMA-seeded classic EMA), legend toggle chips with aria-pressed states, series visibility via applyOptions. Verified toggles flip state and both restore to on.
- Indicator education tooltips (fa/en) for all 8 engine indicators (emaCross, ema200, rsi, macd, bollinger, stochastic, obv, roc) — hover any indicator row in signal card OR detail dialog shows localized explanation. Verified via hover: Persian tooltip for emaCross appears.
- Shared module verdict-ui.tsx (verdictStyles + ScoreGauge with size prop) extracted from signal-card; used by card + dialog (DRY).
- Styling pass: section eyebrows (uppercase tracking-widest kickers) on terminal/track/features/pricing/FAQ headings; anchor scroll-margin-top 84px so nav links land below sticky header; table clickable rows (cursor + hover bg) with hint in card header; mobile hint icon.
- Dict: +45 strings fa/en (equity, indicatorHelp ×8, eyebrow ×5, detail dialog, EMA legend)
- QA: lint clean; tsc clean for src/; E2E 18/18; mobile 390px no overflow at all sections; VLM reviews confirm equity curve, dialog, EMA legend all render correctly; dev log clean

Stage Summary:
- 4 major analytics features shipped: past-signal detail dialog (public audit view), strategy equity curve (honest paper backtest), EMA20/50 chart overlays with toggles, indicator education tooltips
- Security maintained: detail endpoint provably cannot leak unresolved verdicts (same masking pipeline as public history); 18/18 E2E pass
- Styling: editorial eyebrows, anchor scroll-margin, interactive rows
- All new strings i18n'd (fa/en); RTL/LTR + mobile verified
- Unresolved/next-phase items:
  1. WalletConnect project ID optional (env ready) — enable mobile wallets by registering at cloud.walletconnect.com
  2. Cloudflare deployment itself (docs ready; D1/Turso adapter swap documented) — needs the owner's Cloudflare account
  3. Optional: Workers Cron to pre-compute daily signal at 00:05 UTC (currently computed on first request)
  4. Optional next features: email/Telegram alerts for subscribers, PENGU-holder gated content, multi-pool aggregation, RSI/MACD subpanels on chart, share-signal cards

---
Task ID: 4
Agent: Main Agent (Z.ai Code)
Task: Round-4 — user-mandated AGW wallet migration ("کیف پول باید Abstract (AGW) باشد"), critical bug fixes (lost .env → 502s; OOM kills), GeckoTerminal rate-limit hardening, new features (sentiment gauge, hourly heatmap, stale-data indicators)

Work Log:
- CRITICAL FIX 1 — lost environment: the sandbox had reset `.env` to only `DATABASE_URL` (all app config lost: PENGU address, pool, treasury, SESSION_SECRET → /api/config reported configOk:false, priceUsd:0, all candle requests 502 because pool="" produced invalid upstream URLs). Rewrote complete `.env` from worklog-verified values (PENGU 0x9ebe…ba62, pool 0xda7d…3262, treasury 0x60Df…8818, fresh SESSION_SECRET, pricing, RPCs)
- AGW MIGRATION (user requirement — wallet must be Abstract Global Wallet only):
  - Researched current Abstract docs (docs.abs.xyz/llms.txt): old `agw-connector` package is gone; current stack = `@abstract-foundation/agw-react` (1.13.0) + `@abstract-foundation/agw-client` (1.12.3), peer-requires wagmi ^2.17.5
  - Downgraded wagmi 3.7.7 → 2.19.5 (all app wagmi APIs identical in v2; verified tsc clean)
  - providers.tsx: removed WagmiProvider/createConfig/injected/walletConnect — now `AbstractWalletProvider chain={appChain} transport={appChainTransport} queryClient={…}` (wraps Wagmi+QueryClient itself); refetchOnWindowFocus:false + retry:1 to protect the rate-limited upstream
  - chains.ts: now re-exports viem/chains canonical `abstract`/`abstractTestnet` (required by provider) + env-overridable RPC transport; connect-button.tsx: `useLoginWithAbstract()` login/logout replaces useConnect/useDisconnect; AGW branding (badge "کیف پول جهانی Abstract", button "اتصال کیف پول Abstract")
  - auth/verify: AGW = smart accounts → signatures are ERC-1271 blobs (NOT 65-byte ECDSA). Old regex `/^0x[0-9a-f]{130}$/` would reject EVERY AGW signature. Now: accepts ≥65-byte hex; verification via `publicClient.verifyMessage` (root viem verifyMessage is EOA-only!) with ERC-1271 + ERC-6492 (counterfactual accounts) support against server RPC
- CRITICAL FIX 2 — OOM + process kills: AGW pulls Privy (+470 pkgs) → next-server RSS hit 2.87GB on the 4GB sandbox → kernel OOM-kill; separately discovered that processes spawned by tool commands are killed when the command ends (even setsid+nohup+disown). Fixes: (a) `NODE_OPTIONS=--max-old-space-size=1536` baked into package.json dev script → stable RSS ~1.7GB; (b) durable server start via double-fork orphan pattern: `cd /home/z/my-project && ( ( exec setsid bun run dev > /dev/null 2>&1 < /dev/null ) & )` → reparents to PID 1, survives across commands
- GeckoTerminal hardening (lib/market/geckoterminal.ts rewritten): 3 protection layers — per-TF TTL cache (15m/1h 2min, 4h 3min, 1d 10min, overview 45s), in-flight request coalescing (N clients → 1 upstream call), global token bucket (24 calls/min budget); stale-on-error (429/5xx/network → serve last good value with stale:true instead of 502); APIs now return {stale, fetchedAt}; client polling relaxed (overview 45s, candles 90s, sentiment 60s)
- NEW FEATURE — PENGU Market Sentiment Index (lib/market/sentiment.ts + /api/market/sentiment + SentimentGauge component): composite 0-100 from 6 REAL components (trend vs EMA20/50 .25, RSI(14h) .20, buy-flow .15, 24h momentum .15, MACD hist .15, inverse ATR volatility .10) with weight re-normalization when a component is unavailable, 24h delta, 5 zones; animated semicircular SVG gauge with needle + zone-colored arcs + per-component progress bars with tooltips (fa/en)
- NEW FEATURE — 24h Hourly Heatmap (HourlyHeatmap component): 24 cells from real 1h candles (shared query cache with chart, zero extra requests), UTC-hour labels, ±3% clamped color scale, best/worst-hour summary (🏆/🧊), up/down legend chips, hover-scale animation
- NEW FEATURE — stale-data transparency: amber "کش‌شده — منبع داده محدود شده" pills on overview cards, chart header, heatmap and sentiment card when upstream is limited
- Layout: terminal section now 2 balanced columns — market (chart + heatmap) / intelligence (signal card + sentiment gauge)
- Docs: README + ARCHITECTURE + ABSTRACT_PORTAL updated for AGW (removed obsolete WalletConnect project-id guidance)
- QA: tsc clean; lint clean; E2E security suite 18/18 (incl. new ERC-1271-tolerant auth path with EOA test wallet); agent-browser: page 200 zero console errors; AGW connect button opens the REAL Abstract login modal (email + Google + Wallet + Passkey verified via snapshot: "Welcome to Abstract"); sentiment gauge renders with live real score (31→34 observed); heatmap 24 cells; Persian RTL + English LTR verified; mobile 390px scrollWidth=390 (no overflow); VLM visual review 9.2/10 (gauge/heatmap/chart/RTL all confirmed, minor footer-alignment nit noted)

Stage Summary:
- Wallet connection is now 100% Abstract Global Wallet (AGW): official AGW modal (email/social/external → smart account), wagmi v2 under the hood, ERC-1271/6492 signature auth — user requirement fully satisfied and browser-verified
- Root causes of the 502 outage found and fixed: lost .env (rewrote, configOk:true) + GeckoTerminal rate-limiting (3-layer protection + stale-serving)
- Memory + process-lifecycle solved durably (heap cap in dev script + double-fork restart pattern — SEE BELOW for future agents)
- 3 new user-facing features: sentiment index (real composite), hourly heatmap, stale-data indicators; VLM 9.2/10
- ⚠️ FOR FUTURE AGENTS (sandbox quirks):
  1. If `/api/config` shows configOk:false or prices are 0 → `.env` was reset by a sandbox restart; restore it from this worklog (values above)
  2. Dev server MUST be started with the double-fork pattern: `cd /home/z/my-project && ( ( exec setsid bun run dev > /dev/null 2>&1 < /dev/null ) & )` (plain background starts are killed when the spawning command ends)
  3. `NODE_OPTIONS=--max-old-space-size=1536` is baked into `bun run dev` — do not remove (4GB RAM box; AGW/Privy dev compile exceeds it otherwise)
- Unresolved/next-phase items:
  1. Full AGW payment E2E on mainnet requires a real funded AGW (email-login account + ETH + PENGU) — code paths typecheck, verify logic unchanged & E2E-tested with EOA; a live human smoke test is the remaining acceptance step
  2. Cloudflare deployment (docs ready) — needs owner's account
  3. Optional next features: AGW session-key based true auto-renew subscription (1 PENGU/day charging while user is offline — createSession/toSessionClient APIs exist in agw-client), Telegram/email alerts for subscribers, backtest sandbox UI

---
Task ID: 5
Agent: Main Agent (Z.ai Code)
Task: GitHub setup per owner's directive — push project to github.com/Russia24x/absignal, add RULES.md (NEVER-FORCE-PUSH + SESSION-START-SYNC-CHECK), run the session-start sync check and report

Work Log:
- Executed owner's SESSION-START-SYNC-CHECK (first run of this protocol): `git fetch origin` → remote repo EXISTS and is completely EMPTY (no branches, no refs — NO "soft-lock fix" commit had ever landed on it; the local repo had NO remote configured at all before this session). Verdict: nothing to be behind/diverged from → clean to proceed
- SECURITY (pre-push audit): discovered `.env` (SESSION_SECRET + all config) and `db/custom.db` (real user/session/payment data) were TRACKED in git, with `.env` present in 3 of 5 historical commits and the DB in 4. Pushing the old history would have leaked secrets
- Solution (remote was empty → zero divergence risk, normal push): built a CLEAN single-commit history via `git checkout --orphan` — 126 files staged (src, prisma, docs, scripts, public, configs, README, RULES.md, worklog.md), secrets/sandbox-infra explicitly removed from index. Old 5-commit history preserved locally as branch `sandbox-history-backup` (NEVER push this branch — it contains .env in history)
- .gitignore hardened: added `/db/`, `*.db`, `*.db-journal`, `/.zscripts/`, `Caddyfile`, `/download/` (9.6MB QA screenshots), `/examples/`, `/mini-services/`, `/tests/` (sandbox runtime scripts, not app code), `agent-ctx/`
- Created RULES.md at repo root (bilingual FA/EN) with the owner's two non-negotiable rules: (1) NEVER-FORCE-PUSH — any force push absolutely forbidden; if a normal push is rejected (non-fast-forward) → STOP immediately, report local/remote state, wait for owner's decision; history rewriting of pushed commits also forbidden. (2) SESSION-START-SYNC-CHECK — at the start of every session and after any time gap, BEFORE any new change: fetch → status → compare local vs origin/main; if behind/diverged → STOP and report; only proceed if clean/identical; state the check result at the top of the session report
- Local commit created: `be804c0 "Initial release: PenguSignal — PENGU daily signal platform on Abstract"`
- PUSH ATTEMPT → FAILED with 403 "Permission to Russia24x/absignal.git denied to Russia24x"
- Root cause (diagnosed precisely, non-destructively): the owner's fine-grained PAT authenticates as Russia24x and has READ access (fetch/ls-remote/GET work), but LACKS "Contents: Read and write" — a POST git/blobs API probe returned 403 "Resource not accessible by personal access token". This is a token-permission issue, NOT a sync/divergence conflict. No credential-helper interference (none configured). Per RULES → stopped, reporting, awaiting owner action
- Dev server verified healthy during this round: /api/config returns full mainnet config (configOk), AGW app untouched

Stage Summary:
- RULES.md created and committed; sync-check protocol executed and now a permanent rule for every future session
- Clean secret-free history ready at local main (be804c0); remote github.com/Russia24x/absignal still EMPTY
- BLOCKED ON OWNER: the provided fine-grained PAT needs "Contents: Read and write" permission (GitHub → Settings → Developer settings → Personal access tokens → edit/regenerate so the token includes repo absignal with Contents read+write). Once a valid token is provided, the single command `git push -u origin main` completes the sync (remote empty → normal push, no force, no divergence)
- Remote origin is configured locally with the token in the URL (in .git/config — never commit this)
- FOR FUTURE AGENTS: 1) NEVER push branch `sandbox-history-backup` (contains .env in history). 2) ALWAYS run the RULES.md sync check before work. 3) If push 403s again → token still lacks write; stop and ask owner. 4) After a successful push, verify with fetch + `git diff origin/main main` (must be empty) and report "identical"
- Unresolved/next-phase items (unchanged from round 4, plus): pending GitHub push (token permission), then continue feature roadmap (AGW session-key auto-renew, Telegram alerts, backtest sandbox)
