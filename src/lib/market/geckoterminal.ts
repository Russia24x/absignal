/**
 * GeckoTerminal market-data client (free tier, no API key).
 *
 * The free tier allows ~30 upstream requests/minute. Three layers keep us
 * safely under that budget while serving fresh-enough data:
 *
 *   1. TTL cache per resource (per-timeframe TTLs — intraday shorter, daily long)
 *   2. In-flight request coalescing (N concurrent clients → 1 upstream call)
 *   3. A global token bucket capping upstream calls per minute
 *
 * On upstream failure (429 / 5xx / network) the last good value is served
 * with `stale: true` instead of erroring — market data may lag, it never
 * disappears. Only the very first fetch (no cache at all) can hard-fail.
 *
 * R34 hardening for Cloudflare Workers egress IPs (shared, intermittently
 * soft-limited by GeckoTerminal):
 *   4. One short retry on 429/5xx — rides out transient rejections
 *   5. Payload validation — a 200 with an empty/degraded body (all-null
 *      attributes, no candles) is treated as a failure, so an empty payload
 *      can never poison the cache and be served as "$0.00".
 */

import { marketConfig } from '@/lib/config'
import { Prisma } from '@prisma/client'
import {
  fetchCexCandles,
  fetchCexOverview,
  cexPoolKey,
  cexPoolKeys,
  type CexVenue,
} from '@/lib/market/cex'
import { fetchCmcOverview } from '@/lib/market/coinmarketcap'
import { normalizeSeries } from '@/lib/market/series'

export interface Candle {
  time: number // unix seconds
  open: number
  high: number
  low: number
  close: number
  volume: number // USD
}

export interface MarketOverview {
  priceUsd: number
  priceChange24h: number | null
  priceChange6h: number | null
  priceChange1h: number | null
  volume24hUsd: number | null
  volume6hUsd: number | null
  volume1hUsd: number | null
  liquidityUsd: number | null
  fdvUsd: number | null
  marketCapUsd: number | null
  buys24h: number | null
  sells24h: number | null
  poolName: string | null
  baseSymbol: string | null
  updatedAt: number
  /** Which upstream served this snapshot (R35: dexscreener; R38: binance +
   * coinmarketcap tiers). Display-only meta; the signal engine never reads it. */
  source?: 'geckoterminal' | 'dexscreener' | CexVenue | 'coinmarketcap'
}

export type Timeframe = '15m' | '1h' | '4h' | '1d'

export interface FetchMeta {
  stale: boolean
  fetchedAt: number
}

/* ------------------------------ cache internals ----------------------------- */

interface CacheEntry {
  value: unknown
  fetchedAt: number
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<unknown>>()

/** Per-timeframe cache TTLs: intraday charts tolerate minutes of age. */
const TF_TTL_MS: Record<Timeframe, number> = {
  '15m': 120_000,
  '1h': 120_000,
  '4h': 180_000,
  '1d': 600_000,
}

/* ------------------------------ token bucket ------------------------------- */

/**
 * Global upstream budget: ~24 calls/min regenerates evenly, leaving headroom
 * below GeckoTerminal's ~30/min free limit even with several viewers.
 */
const BUCKET_CAPACITY = 24
const BUCKET_REFILL_PER_MS = BUCKET_CAPACITY / 60_000
let bucketTokens = BUCKET_CAPACITY
let bucketLastRefill = Date.now()

function takeToken(): boolean {
  const now = Date.now()
  bucketTokens = Math.min(BUCKET_CAPACITY, bucketTokens + (now - bucketLastRefill) * BUCKET_REFILL_PER_MS)
  bucketLastRefill = now
  if (bucketTokens >= 1) {
    bucketTokens -= 1
    return true
  }
  return false
}

/* ------------------------------ cached fetcher ------------------------------ */

function trimCache() {
  if (cache.size <= 128) return
  const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0]
  if (oldest) cache.delete(oldest[0])
}

async function fetchCached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<{ value: T; stale: boolean; fetchedAt: number }> {
  const hit = cache.get(key)
  const now = Date.now()
  if (hit && hit.expiresAt > now) {
    return { value: hit.value as T, stale: false, fetchedAt: hit.fetchedAt }
  }

  // Coalesce concurrent misses into a single upstream call.
  const existing = inflight.get(key)
  if (existing) {
    return existing as Promise<{ value: T; stale: boolean; fetchedAt: number }>
  }

  const task = (async () => {
    try {
      // Respect the global budget — unless we have nothing to serve at all.
      if (!takeToken() && hit) {
        return { value: hit.value as T, stale: true, fetchedAt: hit.fetchedAt }
      }
      try {
        const value = await fetcher()
        const fetchedAt = Date.now()
        cache.set(key, { value, fetchedAt, expiresAt: fetchedAt + ttlMs })
        trimCache()
        return { value, stale: false, fetchedAt }
      } catch (err) {
        // Upstream failed (likely rate limit) — degrade to stale data.
        if (hit) return { value: hit.value as T, stale: true, fetchedAt: hit.fetchedAt }
        throw err
      }
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, task)
  return task
}

async function gecko<T>(path: string): Promise<T> {
  const url = `${marketConfig.baseUrl}${path}`
  const doFetch = () =>
    fetch(url, {
      headers: { Accept: 'application/json' },
      // Next.js fetch cache disabled — we manage caching ourselves.
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
  let res = await doFetch()
  // GeckoTerminal intermittently rejects requests from datacenter egress IPs
  // (the Worker's shared IP is hot). One 400ms-backoff retry absorbs the
  // transient window without breaking the 15s abort budget (R34).
  if (res.status === 429 || res.status >= 500) {
    await new Promise((r) => setTimeout(r, 400))
    res = await doFetch()
  }
  if (!res.ok) {
    throw new Error(`GeckoTerminal ${path} failed: ${res.status}`)
  }
  return (await res.json()) as T
}

/* -------------------------------- overview -------------------------------- */

/**
 * Fetch the pool snapshot (price, volume, liquidity, tx counts).
 *
 * The pool may list PENGU as either the base or the quote side; we resolve
 * the PENGU-side USD price explicitly so the number is always PENGU/USD.
 */
async function fetchOverview(): Promise<MarketOverview> {
  const json = await gecko<any>(
    `/networks/${marketConfig.network}/pools/${marketConfig.pool}`
  )
  const a = json?.data?.attributes ?? {}
  const volume = a.volume_usd ?? {}
  const tx = a.transactions ?? {}
  const change = a.price_change_percentage ?? {}

  // Resolve which side of the pool is PENGU.
  const meta = json?.data?.relationships ?? {}
  const quoteId = String(meta.quote_token?.data?.id ?? '')
  const baseId = String(meta.base_token?.data?.id ?? '')
  const penguAddr = (
    marketConfig.network === 'abstract'
      ? process.env.NEXT_PUBLIC_PENGU_MAINNET
      : process.env.NEXT_PUBLIC_PENGU_TESTNET
  )?.toLowerCase()
  const penguIsBase = !!penguAddr && baseId.endsWith(penguAddr)
  const penguIsQuote = !!penguAddr && quoteId.endsWith(penguAddr)

  const penguPriceUsd = penguIsBase
    ? Number(a.base_token_price_usd ?? 0)
    : penguIsQuote
      ? Number(a.quote_token_price_usd ?? 0)
      : Number(a.quote_token_price_usd ?? a.base_token_price_usd ?? 0)

  // Payload validation (R34): GeckoTerminal sometimes answers 200 with an
  // empty/degraded body when soft-limiting datacenter IPs. A real pool always
  // has a positive price — anything else is a failure, so the stale-serving
  // layer keeps the last good snapshot instead of caching "$0.00".
  if (!(penguPriceUsd > 0)) {
    throw new Error(`GeckoTerminal overview payload empty for pool ${marketConfig.pool}`)
  }

  return {
    priceUsd: penguPriceUsd,
    priceChange24h: change.h24 != null ? Number(change.h24) : null,
    priceChange6h: change.h6 != null ? Number(change.h6) : null,
    priceChange1h: change.h1 != null ? Number(change.h1) : null,
    volume24hUsd: volume.h24 != null ? Number(volume.h24) : null,
    volume6hUsd: volume.h6 != null ? Number(volume.h6) : null,
    volume1hUsd: volume.h1 != null ? Number(volume.h1) : null,
    liquidityUsd: a.reserve_in_usd != null ? Number(a.reserve_in_usd) : null,
    fdvUsd: a.fdv_usd != null ? Number(a.fdv_usd) : null,
    marketCapUsd: a.market_cap_usd != null ? Number(a.market_cap_usd) : null,
    buys24h: tx.h24?.buys != null ? Number(tx.h24.buys) : null,
    sells24h: tx.h24?.sells != null ? Number(tx.h24.sells) : null,
    poolName: a.name ?? null,
    baseSymbol: 'PENGU',
    updatedAt: Date.now(),
    source: 'geckoterminal',
  }
}

/* ------------------------- dexscreener fallback (R35) ------------------------ */

/**
 * DexScreener fallback for the price-card snapshot (display-only).
 *
 * Ground truth from the deployed Worker (R34 diag): GeckoTerminal intermittently
 * hard-limits the shared Workers egress IP per endpoint — the OHLCV endpoint
 * returns 429 `gt-error-code-429` for long stretches while its pool endpoint
 * recovers — and it sometimes answers 200 with an empty body. DexScreener's
 * token endpoint answered 200 with full data from the same Worker at the same
 * moment. Same pool, same price, no key, no Cloudflare-internal throttling.
 *
 * Used ONLY for the overview: the signal engine, candles, and accuracy scoring
 * stay on GeckoTerminal exclusively so locked signals never change source.
 */
async function fetchOverviewViaDexScreener(): Promise<MarketOverview> {
  const pengu = (
    marketConfig.network === 'abstract'
      ? process.env.NEXT_PUBLIC_PENGU_MAINNET
      : process.env.NEXT_PUBLIC_PENGU_TESTNET
  )?.toLowerCase()
  if (!pengu) throw new Error('DexScreener fallback: PENGU address not configured')

  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${pengu}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) {
    throw new Error(`DexScreener tokens failed: ${res.status}`)
  }
  const json: any = await res.json()
  const pairs: any[] = Array.isArray(json?.pairs) ? json.pairs : []
  if (pairs.length === 0) {
    throw new Error('DexScreener returned no pairs')
  }

  // Prefer OUR pool (same address, same chain); else the deepest PENGU pair
  // on the chain — the price is arbed to equality across pools.
  const pair =
    pairs.find(
      (p) =>
        String(p?.pairAddress ?? '').toLowerCase() === marketConfig.pool &&
        p?.chainId === marketConfig.network
    ) ??
    pairs
      .filter((p) => p?.chainId === marketConfig.network)
      .sort((a, b) => (b?.liquidity?.usd ?? 0) - (a?.liquidity?.usd ?? 0))[0]
  if (!pair) throw new Error('DexScreener: no pair on the configured network')

  const priceUsd = Number(pair.priceUsd)
  if (!(priceUsd > 0)) {
    throw new Error('DexScreener payload has no positive price')
  }

  const num = (v: unknown): number | null => (v == null ? null : Number(v))
  return {
    priceUsd,
    priceChange24h: num(pair.priceChange?.m24),
    priceChange6h: num(pair.priceChange?.h6),
    priceChange1h: num(pair.priceChange?.h1),
    volume24hUsd: num(pair.volume?.h24),
    volume6hUsd: num(pair.volume?.h6),
    volume1hUsd: num(pair.volume?.h1),
    liquidityUsd: num(pair.liquidity?.usd),
    fdvUsd: num(pair.fdv),
    marketCapUsd: num(pair.marketCap),
    buys24h: num(pair.txns?.h24?.buys),
    sells24h: num(pair.txns?.h24?.sells),
    poolName:
      pair.baseToken?.symbol && pair.quoteToken?.symbol
        ? `${pair.baseToken.symbol} / ${pair.quoteToken.symbol}`
        : null,
    baseSymbol: 'PENGU',
    updatedAt: Date.now(),
    source: 'dexscreener',
  }
}

export interface OverviewWithMeta extends MarketOverview, FetchMeta {}

export async function getMarketOverviewWithMeta(): Promise<OverviewWithMeta> {
  const key = `overview:${marketConfig.pool}`
  const { value, stale, fetchedAt } = await fetchCached<MarketOverview>(
    key,
    marketConfig.priceTtlMs,
    async () => {
      // Multi-source fallback chain (R38 owner directive: CoinMarketCap +
      // Binance; R39: the CEX tier widened to the venues that actually answer
      // from the Workers egress). On-chain truth first, then keyless CEX,
      // then the key-gated aggregator. Every tier validates its own payload
      // (price > 0), so an empty body can never poison the cache. The chain
      // degrades gracefully: the landing-page price card only goes dark if
      // ALL sources fail.
      const sources: Array<() => Promise<MarketOverview>> = [
        fetchOverview,
        fetchOverviewViaDexScreener,
        fetchCexOverview, // bybit → okx → mexc → gate → binance (R39)
        fetchCmcOverview, // throws fast when no COINMARKETCAP_API_KEY is set
      ]
      let overview: MarketOverview | null = null
      let lastErr: unknown = null
      for (const src of sources) {
        try {
          overview = await src()
          break
        } catch (err) {
          lastErr = err
        }
      }
      if (!overview) throw lastErr instanceof Error ? lastErr : new Error('all market sources failed')
      // R37: record a live observation for the synthetic-candle builder
      // (works through outages via the DexScreener/CEX fallbacks).
      await persistTick(overview.priceUsd)
      return overview
    }
  )
  return { ...value, stale, fetchedAt }
}

export async function getMarketOverview(): Promise<MarketOverview> {
  // Extra meta fields are structurally harmless for value-only consumers.
  return getMarketOverviewWithMeta()
}

/* --------------------------------- candles --------------------------------- */

const TIMEFRAME_MAP: Record<Timeframe, { timeframe: string; aggregate: number }> = {
  '15m': { timeframe: 'minute', aggregate: 15 },
  '1h': { timeframe: 'hour', aggregate: 1 },
  '4h': { timeframe: 'hour', aggregate: 4 },
  '1d': { timeframe: 'day', aggregate: 1 },
}

async function fetchCandles(tf: Timeframe, limit: number): Promise<Candle[]> {
  const { timeframe, aggregate } = TIMEFRAME_MAP[tf]
  const json = await gecko<any>(
    `/networks/${marketConfig.network}/pools/${marketConfig.pool}/ohlcv/${timeframe}` +
      `?aggregate=${aggregate}&limit=${limit}&currency=usd`
  )
  const list: Array<Array<number>> = json?.data?.attributes?.ohlcv_list ?? []
  // Payload validation (R34): an empty candle list for a live pool means the
  // upstream soft-limited us — never cache or serve it as "no data".
  if (list.length === 0) {
    throw new Error(`GeckoTerminal ohlcv/${timeframe} returned no candles`)
  }
  return normalizeSeries(
    list
      .map((row) => ({
        time: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      }))
      .filter((c) => Number.isFinite(c.close) && c.close > 0)
  )
}

export interface CandlesWithMeta {
  candles: Candle[]
  stale: boolean
  fetchedAt: number
  /** R37: candles were synthesized from live price observations (ticks) —
   * display-only. The engine and backtests refuse synthetic candles. */
  synthetic?: boolean
  /** R38/R39: which venue served these candles — display/observability meta. */
  source?: 'geckoterminal' | CexVenue | 'cache' | 'synthetic'
}

/* --------------------- durable candle cache (R36) --------------------- */

/**
 * D1/SQLite-backed candle persistence.
 *
 * Ground truth (R34/R35 diag from the deployed Worker): GeckoTerminal's OHLCV
 * endpoint intermittently hard-limits (429) the shared Cloudflare Workers
 * egress IP for minutes at a time, while the same pool's data is fine from
 * other IPs. Historical candles are immutable, so persisting every successful
 * fetch makes one open window last forever: the chart, the track record's
 * outcome resolution (daily closes), and the backtest replay all survive
 * upstream outages instead of blanking out.
 *
 * Everything here is best-effort and fail-safe: a cache that cannot be
 * written or read must NEVER break the request path. The table is auto-created
 * on first use (CREATE TABLE IF NOT EXISTS) so production needs no manual
 * migration; dev/e2e SQLite gets it from `prisma db push`.
 */
const CANDLE_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS "CandleCache" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pool" TEXT NOT NULL,
  "tf" TEXT NOT NULL,
  "time" INTEGER NOT NULL,
  "open" REAL NOT NULL,
  "high" REAL NOT NULL,
  "low" REAL NOT NULL,
  "close" REAL NOT NULL,
  "volume" REAL NOT NULL,
  "updatedAt" INTEGER NOT NULL
)`

let candleTableReady = false

async function ensureCandleTable(): Promise<boolean> {
  if (candleTableReady) return true
  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()
    await db.$executeRawUnsafe(CANDLE_TABLE_DDL)
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "CandleCache_pool_tf_time_idx" ON "CandleCache" ("pool", "tf", "time")`
    )
    candleTableReady = true
    return true
  } catch {
    return false
  }
}

/** Persist a successful fetch. Insert-only for old buckets (immutable),
 * plus an update for the newest (still-forming) bucket. Chunked to stay
 * under SQLite's bound-variable limit. Each source persists under its own
 * pool key (GT pool address / "binance:SYMBOL") so the two series stay
 * independent — one source's outage never overwrites the other's history. */
async function persistCandles(tf: Timeframe, candles: Candle[], poolKey: string): Promise<void> {
  if (candles.length === 0) return
  if (!(await ensureCandleTable())) return
  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()
    const pool = poolKey
    // Seconds — Prisma's Int is 32-bit; epoch ms overflows it.
    const updatedAt = Math.floor(Date.now() / 1000)
    const rows = candles.map((c) => ({
      id: `${pool}:${tf}:${c.time}`,
      pool,
      tf,
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      updatedAt,
    }))
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50)
      await db.$executeRaw`
        INSERT OR IGNORE INTO "CandleCache"
          ("id", "pool", "tf", "time", "open", "high", "low", "close", "volume", "updatedAt")
        VALUES ${Prisma.join(
          chunk.map(
            (r) => Prisma.sql`(${r.id}, ${r.pool}, ${r.tf}, ${r.time}, ${r.open}, ${r.high}, ${r.low}, ${r.close}, ${r.volume}, ${r.updatedAt})`
          )
        )}`
    }
    // The newest bucket is still forming — refresh it (INSERT OR IGNORE
    // skipped it if it already existed).
    const tail = rows[rows.length - 1]
    await db.candleCache
      .update({
        where: { id: tail.id },
        data: {
          open: tail.open,
          high: tail.high,
          low: tail.low,
          close: tail.close,
          volume: tail.volume,
          updatedAt,
        },
      })
      .catch(() => {})
  } catch {
    // Best-effort durability — never break the request path.
  }
}

/** Read the durable cache for a timeframe (newest `limit` buckets).
 *
 * R39 N-source merge: the GT pool series AND every CEX venue series are
 * persisted under their own pool keys; bucket keys are identical across
 * venues (UTC-aligned boundaries) while prices are arbitraged to equality.
 * Policy: the series with the NEWEST bucket owns the tail and its values
 * (indicators weight recent data most, and a single-source tail keeps
 * volume-based reads like OBV coherent); buckets the primary is missing
 * (older history, holes) are filled from any other series that has them. */
async function readPersistedCandles(tf: Timeframe, limit: number): Promise<Candle[]> {
  if (!(await ensureCandleTable())) return []
  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()
    const pools = [marketConfig.pool, ...cexPoolKeys()]
    const seriesList = (
      await Promise.all(
        pools.map((pool) =>
          db.candleCache
            .findMany({ where: { pool, tf }, orderBy: { time: 'desc' }, take: limit })
            .then((rows) =>
              rows.map((r) => ({
                time: r.time, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
              }))
            )
            .catch(() => [] as Candle[])
        )
      )
    )
      .map((s) => [...s].sort((a, b) => a.time - b.time))
      .filter((s) => s.length > 0)
    if (seriesList.length === 0) return []
    // Primary = series with the newest bucket (owns the tail AND its values).
    let primary = seriesList[0]
    for (const s of seriesList) {
      if (s[s.length - 1].time > primary[primary.length - 1].time) primary = s
    }
    // Union: primary values win; other series contribute only missing buckets
    // (extends history backward, fills holes).
    const union = new Map(primary.map((c) => [c.time, c]))
    for (const s of seriesList) {
      if (s === primary) continue
      for (const c of s) if (!union.has(c.time)) union.set(c.time, c)
    }
    return [...union.values()].sort((a, b) => a.time - b.time).slice(-limit)
  } catch {
    return []
  }
}

/* -------------------- live price ticks (R37) -------------------- */

/**
 * Live price observations. Every FRESH overview fetch (primary or the
 * DexScreener fallback) records one tick — the DexScreener path works from
 * the Workers egress even while GeckoTerminal is blocked, so ticks keep
 * flowing through outages. Ticks synthesize display-only candles when real
 * OHLCV is unavailable: the chart fills from "now" forward while the durable
 * candle cache waits for an upstream window.
 */
const TICK_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS "PriceTick" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "ts" INTEGER NOT NULL,
  "priceUsd" REAL NOT NULL
)`

let tickTableReady = false

async function ensureTickTable(): Promise<boolean> {
  if (tickTableReady) return true
  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()
    await db.$executeRawUnsafe(TICK_TABLE_DDL)
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PriceTick_ts_idx" ON "PriceTick" ("ts")`)
    tickTableReady = true
    return true
  } catch {
    return false
  }
}

/** Record one live observation. Fire-and-forget semantics: any failure is
 * silently dropped — ticks are a progressive enhancement, never a dependency. */
async function persistTick(priceUsd: number): Promise<void> {
  if (!(priceUsd > 0)) return
  if (!(await ensureTickTable())) return
  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()
    await db.$executeRaw`INSERT INTO "PriceTick" ("ts", "priceUsd") VALUES (${Math.floor(Date.now() / 1000)}, ${priceUsd})`
    // Opportunistic prune: keep ~7 days of ticks.
    if (Math.random() < 0.1) {
      await db
        .$executeRawUnsafe(`DELETE FROM "PriceTick" WHERE "ts" < ${Math.floor(Date.now() / 1000) - 7 * 86400}`)
        .catch(() => {})
    }
  } catch {
    // best-effort
  }
}

const BUCKET_SECONDS: Record<Timeframe, number> = {
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
}

/** Build display-only candles from accumulated live ticks. Requires at least
 * two observations in different buckets for the requested timeframe. */
async function buildSyntheticCandles(tf: Timeframe, limit: number): Promise<Candle[]> {
  if (!(await ensureTickTable())) return []
  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()
    const bucketSec = BUCKET_SECONDS[tf]
    const lookbackSec = Math.min(limit * bucketSec + bucketSec, 7 * 86400)
    const since = Math.floor(Date.now() / 1000) - lookbackSec
    const ticks = await db.priceTick.findMany({
      where: { ts: { gte: since } },
      orderBy: { ts: 'asc' },
      take: 20000,
    })
    if (ticks.length < 2) return []
    const buckets = new Map<number, Candle>()
    for (const t of ticks) {
      if (!(t.priceUsd > 0)) continue
      const bucket = Math.floor(t.ts / bucketSec) * bucketSec
      const b = buckets.get(bucket)
      if (!b) {
        buckets.set(bucket, {
          time: bucket,
          open: t.priceUsd,
          high: t.priceUsd,
          low: t.priceUsd,
          close: t.priceUsd,
          volume: 0,
        })
      } else {
        b.high = Math.max(b.high, t.priceUsd)
        b.low = Math.min(b.low, t.priceUsd)
        b.close = t.priceUsd
      }
    }
    const candles = [...buckets.values()].sort((a, b) => a.time - b.time)
    if (candles.length < 2) return []
    return candles.slice(-limit)
  } catch {
    return []
  }
}

/** While serving the D1 fallback, retry the live upstream at most this often. */
const D1_FALLBACK_TTL_MS = 30_000

/** Fetch OHLCV candles (USD-denominated) for a timeframe, with cache meta.
 *
 * R39 multi-source chain (owner directive: CoinMarketCap + Binance fallbacks;
 * R39: widened to the venues that actually answer from the Workers egress):
 *
 *   1. GeckoTerminal OHLCV — the on-chain pool, the signal source of record.
 *      Persisted under the GT pool key.
 *   2. Multi-venue CEX klines (bybit → okx → mexc → gate → binance) — REAL
 *      OHLCV, keyless, all with deep PENGU/USDT history. Each venue persists
 *      under its own pool key ("binance:SYMBOL" keeps the R38 shape,
 *      "cex:VENUE:SYMBOL" for the rest). Real candles ⇒ the engine, the
 *      track-record close series, and the backtest all keep working through
 *      GT outages (synthetic refusal in getCandles is untouched — CEX klines
 *      are real market data).
 *   3. D1 durable cache — N-source merged series (see readPersistedCandles),
 *      stale-flagged with a short memory TTL so the live sources are retried.
 *   4. Tick-synthetic candles — display-only, refused by the engine.
 *
 * This is a dedicated orchestrator (not fetchCached) because the fallback
 * tiers must be marked `stale: true` and cached with a shorter TTL. */

/** Cached candle payloads carry their venue alongside the series, so cache
 * hits keep the chart's source badge stable instead of flickering off.
 * R39: also carries the synthetic flag — a stale-served cached synthetic
 * series must stay honestly flagged (the flag was previously lost on the
 * token-bucket stale path). */
interface CachedCandleSeries {
  candles: Candle[]
  source: NonNullable<CandlesWithMeta['source']>
  synthetic?: boolean
}

export async function getCandlesWithMeta(tf: Timeframe, limit = 200): Promise<CandlesWithMeta> {
  const key = `candles:${tf}:${limit}`
  const hit = cache.get(key)
  const now = Date.now()
  if (hit && hit.expiresAt > now) {
    const v = hit.value as CachedCandleSeries
    return { candles: v.candles, stale: false, fetchedAt: hit.fetchedAt, source: v.source, synthetic: v.synthetic }
  }

  const existing = inflight.get(key)
  if (existing) return existing as Promise<CandlesWithMeta>

  const task = (async (): Promise<CandlesWithMeta> => {
    try {
      // Respect the global upstream budget — unless we have nothing to serve.
      if (!takeToken() && hit) {
        const v = hit.value as CachedCandleSeries
        return { candles: v.candles, stale: true, fetchedAt: hit.fetchedAt, source: v.source, synthetic: v.synthetic }
      }
      let firstErr: unknown = null
      // Tier 1: GeckoTerminal (on-chain pool — source of record).
      try {
        const candles = await fetchCandles(tf, limit)
        const fetchedAt = Date.now()
        cache.set(key, { value: { candles, source: 'geckoterminal' }, fetchedAt, expiresAt: fetchedAt + TF_TTL_MS[tf] })
        trimCache()
        await persistCandles(tf, candles, marketConfig.pool)
        return { candles, stale: false, fetchedAt, source: 'geckoterminal' }
      } catch (err) {
        firstErr = err
      }
      // Tier 2 (R38/R39): multi-venue CEX klines — real OHLCV, keyless. Venue
      // order measured from the Workers egress: bybit → okx → mexc → gate →
      // binance (Binance 403s the shared Workers IPs on every host, but stays
      // in the chain for other egresses). Signals, stats, and backtests stay
      // alive through GT outages because this tier is real market data.
      try {
        const { candles, venue } = await fetchCexCandles(tf, limit)
        const fetchedAt = Date.now()
        cache.set(key, { value: { candles, source: venue }, fetchedAt, expiresAt: fetchedAt + TF_TTL_MS[tf] })
        trimCache()
        await persistCandles(tf, candles, cexPoolKey(venue))
        return { candles, stale: false, fetchedAt, source: venue }
      } catch {
        // fall through to the durable tiers
      }
      if (hit) {
        const v = hit.value as CachedCandleSeries
        return { candles: v.candles, stale: true, fetchedAt: hit.fetchedAt, source: v.source, synthetic: v.synthetic }
      }
      // Tier 3: durable merged cache (R36 + R38/R39 multi-source). Upstreams are
      // failing AND the memory cache is cold — serve what past successful
      // fetches persisted, honestly flagged stale, with a short TTL so the
      // upstreams are retried promptly once the outage windows pass.
      const persisted = await readPersistedCandles(tf, limit)
      if (persisted.length > 0) {
        const fetchedAt = Date.now()
        cache.set(key, { value: { candles: persisted, source: 'cache' }, fetchedAt, expiresAt: fetchedAt + D1_FALLBACK_TTL_MS })
        trimCache()
        return { candles: persisted, stale: true, fetchedAt, source: 'cache' }
      }
      // Tier 4 (R37): synthesize display-only candles from live price ticks
      // (DexScreener/CEX-backed — keep flowing through outages). The
      // chart gets SOMETHING real instead of an empty canvas; the engine
      // refuses synthetic candles (see getCandles).
      const synthetic = await buildSyntheticCandles(tf, limit)
      if (synthetic.length > 0) {
        const fetchedAt = Date.now()
        cache.set(key, { value: { candles: synthetic, source: 'synthetic', synthetic: true }, fetchedAt, expiresAt: fetchedAt + D1_FALLBACK_TTL_MS })
        trimCache()
        return { candles: synthetic, stale: true, synthetic: true, fetchedAt, source: 'synthetic' }
      }
      throw firstErr instanceof Error ? firstErr : new Error('all candle sources failed')
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, task)
  return task
}

/** Value-only variant for the analysis engine / signal service.
 * REFUSES synthetic (tick-built) candles — signals and backtests must only
 * ever be computed from real OHLCV (signal-source integrity, R37). CEX
 * klines ARE real OHLCV from deep PENGU venues (R38/R39), so the engine
 * accepts them exactly like GT candles. */
export async function getCandles(tf: Timeframe, limit = 200): Promise<Candle[]> {
  const { candles, synthetic } = await getCandlesWithMeta(tf, limit)
  if (synthetic) {
    throw new Error(`synthetic candles are display-only (tf=${tf})`)
  }
  return candles
}

/** Fetch recent daily closes — used to score historical signal accuracy.
 * Throws when no real close series is available; the caller (getSignalHistory)
 * catches and reconstructs from the rows themselves (R37 row-chaining). */
export async function getDailyCloses(days: number): Promise<Array<{ date: string; close: number }>> {
  const key = `dailycloses:${days}`
  const { value } = await fetchCached<Array<{ date: string; close: number }>>(
    key,
    marketConfig.historyTtlMs,
    async () => {
      const candles = await getCandles('1d', Math.max(days + 5, 30))
      return candles.slice(-days).map((c) => ({
        date: new Date(c.time * 1000).toISOString().slice(0, 10),
        close: c.close,
      }))
    }
  )
  return value
}
