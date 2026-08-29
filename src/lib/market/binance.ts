/**
 * Binance market-data client (R38) — keyless fallback tier with REAL OHLCV.
 *
 * Why Binance: PENGU/USDT is a top-liquidity Binance spot pair, the public
 * market-data API is generously rate-limited (klines weight 2 of 6000/min),
 * and — unlike GeckoTerminal — it does not soft-limit datacenter egress IPs.
 * Daily klines go back 600+ candles (GT has ~182), which also deepens the
 * backtest and track-record windows.
 *
 * Host policy: `data-api.binance.vision` first — Binance's official public
 * market-data host WITHOUT geo-restrictions (api.binance.com answers 451 from
 * restricted jurisdictions, which some Workers colos are) — then api.binance.com
 * as the secondary host. BINANCE_BASE_URL pins a single host when set (this is
 * also the outage-simulation hook used in tests).
 *
 * Same hardening rules as the GeckoTerminal client: short retry on 429/5xx,
 * payload validation (a 200 with an unusable body is a failure), in-flight
 * coalescing, TTL memory cache and a dedicated token bucket.
 */

import { binanceConfig } from '@/lib/config'
import { normalizeSeries } from '@/lib/market/series'
import type { Candle, MarketOverview, Timeframe } from '@/lib/market/geckoterminal'

/** Hosts tried in order (unless pinned via BINANCE_BASE_URL). */
const DEFAULT_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com']

function hosts(): string[] {
  return binanceConfig.baseUrl ? [binanceConfig.baseUrl] : DEFAULT_HOSTS
}

/* ------------------------------ token bucket ------------------------------- */

/** Binance's budget is far larger than GT's; 60/min is polite and ample. */
const BUCKET_CAPACITY = 60
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

/* ------------------------------ cache internals ----------------------------- */

interface CacheEntry {
  value: unknown
  fetchedAt: number
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<unknown>>()

/** Which host served the last successful request (sticky — avoids re-probing
 * a dead host on every call; re-probed when it fails again). */
let preferredHost: string | null = null

async function binance<T>(path: string): Promise<T> {
  const ordered = preferredHost
    ? [preferredHost, ...hosts().filter((h) => h !== preferredHost)]
    : hosts()
  let lastErr: unknown = null
  for (const host of ordered) {
    // Respect our outbound budget — but always allow the attempt when we are
    // the LAST fallback tier (nothing else to serve).
    if (!takeToken() && host !== ordered[0]) continue
    const url = `${host}${path}`
    const doFetch = () =>
      fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      })
    try {
      let res = await doFetch()
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 400))
        res = await doFetch()
      }
      if (!res.ok) throw new Error(`Binance ${path} failed: ${res.status}`)
      const json = (await res.json()) as T
      preferredHost = host
      return json
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Binance request failed')
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
  const existing = inflight.get(key)
  if (existing) {
    return existing as Promise<{ value: T; stale: boolean; fetchedAt: number }>
  }
  const task = (async () => {
    try {
      try {
        const value = await fetcher()
        const fetchedAt = Date.now()
        cache.set(key, { value, fetchedAt, expiresAt: fetchedAt + ttlMs })
        return { value, stale: false, fetchedAt }
      } catch (err) {
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

/* --------------------------------- overview --------------------------------- */

/**
 * 24h ticker snapshot for the configured spot pair.
 * Field map: quoteVolume (index: `quoteVolume`) is the USD volume; a ticker
 * for a USDT pair is USD-denominated for our purposes (USDT≈USD).
 */
export async function fetchBinanceOverview(): Promise<MarketOverview> {
  const t: any = await binance<any>(`/api/v3/ticker/24hr?symbol=${binanceConfig.symbol}`)
  const priceUsd = Number(t?.lastPrice)
  // Payload validation: a tradable pair always has a positive last price.
  if (!(priceUsd > 0)) {
    throw new Error(`Binance ticker payload empty for ${binanceConfig.symbol}`)
  }
  const num = (v: unknown): number | null => {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const [base, quote] = binanceConfig.symbol.replace(/(USDT|FDUSD|USDC)$/, ' $1').split(' ')
  return {
    priceUsd,
    priceChange24h: num(t?.priceChangePercent),
    priceChange6h: null, // Binance 24hr ticker has no 6h window
    priceChange1h: null,
    volume24hUsd: num(t?.quoteVolume),
    volume6hUsd: null,
    volume1hUsd: null,
    liquidityUsd: null, // CEX concept does not exist
    fdvUsd: null,
    marketCapUsd: null,
    buys24h: null,
    sells24h: null,
    poolName: `${base ?? 'PENGU'} / ${quote ?? 'USDT'}`,
    baseSymbol: base ?? 'PENGU',
    updatedAt: Date.now(),
    source: 'binance',
  }
}

/** Cached ticker for the overview fallback chain. */
export async function getBinanceOverviewWithMeta(): Promise<
  MarketOverview & { stale: boolean; fetchedAt: number }
> {
  const { value, stale, fetchedAt } = await fetchCached<MarketOverview>(
    `binance-overview:${binanceConfig.symbol}`,
    45_000,
    fetchBinanceOverview
  )
  return { ...value, stale, fetchedAt }
}

/* ---------------------------------- klines ---------------------------------- */

const KLINE_INTERVAL: Record<Timeframe, string> = {
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
}

/**
 * Real OHLCV candles for a timeframe.
 *
 * Kline row: [openTime(ms), open, high, low, close, baseVolume, closeTime,
 * quoteVolume(USD), trades, …]. We take quoteVolume as the USD volume to match
 * the Candle contract (GT candles are USD-denominated too). Buckets open at
 * :00-aligned UTC boundaries — identical bucket keys to GT, so the durable
 * candle cache can hold both sources side by side.
 */
export async function fetchBinanceCandles(tf: Timeframe, limit: number): Promise<Candle[]> {
  const interval = KLINE_INTERVAL[tf]
  const rows: Array<Array<unknown>> = await binance<any>(
    `/api/v3/klines?symbol=${binanceConfig.symbol}&interval=${interval}&limit=${Math.min(limit, 1000)}`
  )
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Binance klines ${interval} returned no candles`)
  }
  return normalizeSeries(
    rows
      .map((r) => ({
        time: Math.floor(Number(r[0]) / 1000),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        // Quote (USD) volume; fall back to base×close when absent.
        volume: Number(r[7]) > 0 ? Number(r[7]) : Number(r[5]) * Number(r[4]),
      }))
      .filter((c) => Number.isFinite(c.close) && c.close > 0)
  )
}

/** Durable-cache pool key for Binance-sourced candles (kept distinct from the
 * GT pool key so the two series never overwrite each other). */
export function binancePoolKey(): string {
  return `binance:${binanceConfig.symbol}`
}
