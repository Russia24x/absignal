/**
 * Multi-venue CEX market-data tier (R39) — the fallback that actually works
 * from the Cloudflare Workers egress.
 *
 * Ground truth (R39 diag, run from the deployed Worker itself, HKG egress):
 * Binance's WAF answers 403 Forbidden to the shared Workers egress IPs on
 * EVERY host (data-api.binance.vision, api.binance.com, api1–api4, fapi),
 * independent of User-Agent — so the R38 Binance tier could never work in
 * production, no matter the host failover. From the SAME egress at the same
 * moment: Bybit 200 (127ms), OKX 200 (205ms), MEXC 200 (361ms), Gate.io 200
 * (836ms) — all serving real klines for PENGU. (KuCoin and Coinbase 429'd on
 * shared-IP contention; CoinGecko shares GeckoTerminal's rate budget.)
 *
 * Venue order = measured reliability from the Workers egress:
 *   bybit → okx → mexc → gate → binance
 * Binance stays LAST in the chain: it 403s from Workers but works from other
 * egresses (local dev, self-hosted proxies) and may unblock someday. Sticky
 * preferred venue avoids re-probing dead venues on every call; a shared
 * politeness bucket caps the tier's outbound volume; every payload is
 * validated before it is accepted (a 200 with an unusable body is a failure).
 *
 * All venues serve REAL OHLCV — the engine, track record and backtest accept
 * them exactly like GeckoTerminal candles (R38 precedent). Buckets open at
 * UTC-aligned boundaries on every venue, so the durable candle cache holds
 * all series side by side (see readPersistedCandles' N-source merge).
 */

import { cexConfig, binanceConfig } from '@/lib/config'
import {
  fetchBinanceCandles,
  fetchBinanceOverview,
  binancePoolKey,
} from '@/lib/market/binance'
import type { Candle, MarketOverview, Timeframe } from '@/lib/market/geckoterminal'

export type CexVenue = 'bybit' | 'okx' | 'mexc' | 'gate' | 'binance'

/* ------------------------------ token bucket ------------------------------- */

/** Shared politeness budget for the whole tier (all venues combined). */
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

/* ------------------------------- fetch core -------------------------------- */

async function cexFetchJson(url: string, venue: CexVenue): Promise<unknown> {
  const doFetch = () =>
    fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
  let res = await doFetch()
  // One short retry on transient rejections — venue failover is the real
  // retry strategy; this only rides out single-request blips.
  if (res.status === 429 || res.status >= 500) {
    await new Promise((r) => setTimeout(r, 400))
    res = await doFetch()
  }
  if (!res.ok) throw new Error(`${venue} request failed: ${res.status}`)
  return res.json()
}

/** Normalize + validate a mapped candle list (positive prices, finite values). */
function toCandles(rows: Candle[]): Candle[] {
  return rows
    .filter(
      (c) =>
        Number.isFinite(c.time) &&
        c.time > 0 &&
        Number.isFinite(c.close) &&
        c.close > 0 &&
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.volume)
    )
    .sort((a, b) => a.time - b.time)
}

/* ------------------------------- Bybit (v5) -------------------------------- */

const BYBIT_INTERVAL: Record<Timeframe, string> = {
  '15m': '15',
  '1h': '60',
  '4h': '240',
  '1d': 'D',
}

async function bybitCandles(tf: Timeframe, limit: number): Promise<Candle[]> {
  const json: any = await cexFetchJson(
    `https://api.bybit.com/v5/market/kline?category=spot&symbol=${cexConfig.bybitSymbol}&interval=${BYBIT_INTERVAL[tf]}&limit=${Math.min(limit, 1000)}`,
    'bybit'
  )
  const list: Array<Array<unknown>> = json?.result?.list ?? []
  if (json?.retCode !== 0 || list.length === 0) {
    throw new Error(`bybit klines ${tf} returned no candles`)
  }
  // Row: [startMs, open, high, low, close, baseVol, turnover(quote USD)] — newest first.
  return toCandles(
    list.map((r) => ({
      time: Math.floor(Number(r[0]) / 1000),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[6]) > 0 ? Number(r[6]) : Number(r[5]),
    }))
  )
}

async function bybitOverview(): Promise<MarketOverview> {
  const json: any = await cexFetchJson(
    `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${cexConfig.bybitSymbol}`,
    'bybit'
  )
  const t = json?.result?.list?.[0]
  const priceUsd = Number(t?.lastPrice)
  if (json?.retCode !== 0 || !(priceUsd > 0)) {
    throw new Error(`bybit ticker payload empty for ${cexConfig.bybitSymbol}`)
  }
  const pct = Number(t?.price24hPcnt) * 100 // fraction → percent
  return {
    priceUsd,
    priceChange24h: Number.isFinite(pct) ? pct : null,
    priceChange6h: null,
    priceChange1h: null,
    volume24hUsd: Number(t?.turnover24h) > 0 ? Number(t?.turnover24h) : null,
    volume6hUsd: null,
    volume1hUsd: null,
    liquidityUsd: null,
    fdvUsd: null,
    marketCapUsd: null,
    buys24h: null,
    sells24h: null,
    poolName: `${cexConfig.bybitSymbol.replace(/USDT$/, '')} / USDT`,
    baseSymbol: cexConfig.bybitSymbol.replace(/USDT$/, ''),
    updatedAt: Date.now(),
    source: 'bybit',
  }
}

/* --------------------------------- OKX (v5) -------------------------------- */

const OKX_BAR: Record<Timeframe, string> = {
  '15m': '15m',
  '1h': '1H',
  '4h': '4H',
  '1d': '1D',
}

async function okxCandles(tf: Timeframe, limit: number): Promise<Candle[]> {
  // /market/candles serves the most recent 300 candles per bar — plenty for
  // the chart (GT gives ~182); deeper history comes from the durable cache.
  const json: any = await cexFetchJson(
    `https://www.okx.com/api/v5/market/candles?instId=${cexConfig.okxSymbol}&bar=${OKX_BAR[tf]}&limit=${Math.min(limit, 300)}`,
    'okx'
  )
  const data: Array<Array<unknown>> = json?.data ?? []
  if (json?.code !== '0' || data.length === 0) {
    throw new Error(`okx candles ${tf} returned no data`)
  }
  // Row: [tsMs, open, high, low, close, vol(base), volCcy(quote), volCcyQuote, confirm] — newest first.
  return toCandles(
    data.map((r) => ({
      time: Math.floor(Number(r[0]) / 1000),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[7]) > 0 ? Number(r[7]) : Number(r[6]),
    }))
  )
}

async function okxOverview(): Promise<MarketOverview> {
  const json: any = await cexFetchJson(
    `https://www.okx.com/api/v5/market/ticker?instId=${cexConfig.okxSymbol}`,
    'okx'
  )
  const t = json?.data?.[0]
  const priceUsd = Number(t?.last)
  if (json?.code !== '0' || !(priceUsd > 0)) {
    throw new Error(`okx ticker payload empty for ${cexConfig.okxSymbol}`)
  }
  const open24h = Number(t?.open24h)
  const pct = open24h > 0 ? ((priceUsd - open24h) / open24h) * 100 : NaN
  return {
    priceUsd,
    priceChange24h: Number.isFinite(pct) ? pct : null,
    priceChange6h: null,
    priceChange1h: null,
    volume24hUsd: Number(t?.volCcy24h) > 0 ? Number(t?.volCcy24h) : null,
    volume6hUsd: null,
    volume1hUsd: null,
    liquidityUsd: null,
    fdvUsd: null,
    marketCapUsd: null,
    buys24h: null,
    sells24h: null,
    poolName: cexConfig.okxSymbol.replace('-', ' / '),
    baseSymbol: cexConfig.okxSymbol.split('-')[0],
    updatedAt: Date.now(),
    source: 'okx',
  }
}

/* --------------------------------- MEXC (v3) ------------------------------- */

const MEXC_INTERVAL: Record<Timeframe, string> = {
  '15m': '15m',
  '1h': '60m', // MEXC uses 60m, not 1h
  '4h': '4h',
  '1d': '1d',
}

async function mexcCandles(tf: Timeframe, limit: number): Promise<Candle[]> {
  const json: any = await cexFetchJson(
    `https://api.mexc.com/api/v3/klines?symbol=${cexConfig.mexcSymbol}&interval=${MEXC_INTERVAL[tf]}&limit=${Math.min(limit, 1000)}`,
    'mexc'
  )
  if (!Array.isArray(json) || json.length === 0) {
    throw new Error(`mexc klines ${tf} returned no candles`)
  }
  // Binance-compatible row: [openMs, open, high, low, close, baseVol, closeMs, quoteVol] — oldest first.
  return toCandles(
    json.map((r: Array<unknown>) => ({
      time: Math.floor(Number(r[0]) / 1000),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[7]) > 0 ? Number(r[7]) : Number(r[5]) * Number(r[4]),
    }))
  )
}

async function mexcOverview(): Promise<MarketOverview> {
  const json: any = await cexFetchJson(
    `https://api.mexc.com/api/v3/ticker/24hr?symbol=${cexConfig.mexcSymbol}`,
    'mexc'
  )
  const priceUsd = Number(json?.lastPrice)
  if (!(priceUsd > 0)) {
    throw new Error(`mexc ticker payload empty for ${cexConfig.mexcSymbol}`)
  }
  const pct = Number(json?.priceChangePercent)
  return {
    priceUsd,
    priceChange24h: Number.isFinite(pct) ? pct : null,
    priceChange6h: null,
    priceChange1h: null,
    volume24hUsd: Number(json?.quoteVolume) > 0 ? Number(json?.quoteVolume) : null,
    volume6hUsd: null,
    volume1hUsd: null,
    liquidityUsd: null,
    fdvUsd: null,
    marketCapUsd: null,
    buys24h: null,
    sells24h: null,
    poolName: `${cexConfig.mexcSymbol.replace(/USDT$/, '')} / USDT`,
    baseSymbol: cexConfig.mexcSymbol.replace(/USDT$/, ''),
    updatedAt: Date.now(),
    source: 'mexc',
  }
}

/* ------------------------------ Gate.io (v4) ------------------------------- */

async function gateCandles(tf: Timeframe, limit: number): Promise<Candle[]> {
  const json: any = await cexFetchJson(
    `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${cexConfig.gateSymbol}&interval=${tf}&limit=${Math.min(limit, 1000)}`,
    'gate'
  )
  if (!Array.isArray(json) || json.length === 0) {
    throw new Error(`gate candlesticks ${tf} returned no candles`)
  }
  // Row: [tsSec, quoteVol(USD), close, high, low, open, baseVol, closed?] — newest first.
  return toCandles(
    json.map((r: Array<unknown>) => ({
      time: Number(r[0]),
      open: Number(r[5]),
      high: Number(r[3]),
      low: Number(r[4]),
      close: Number(r[2]),
      volume: Number(r[1]),
    }))
  )
}

async function gateOverview(): Promise<MarketOverview> {
  const json: any = await cexFetchJson(
    `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${cexConfig.gateSymbol}`,
    'gate'
  )
  const t = Array.isArray(json) ? json[0] : null
  const priceUsd = Number(t?.last)
  if (!(priceUsd > 0)) {
    throw new Error(`gate ticker payload empty for ${cexConfig.gateSymbol}`)
  }
  const pct = Number(t?.change_percentage) // already in percent
  const [base, quote] = cexConfig.gateSymbol.split('_')
  return {
    priceUsd,
    priceChange24h: Number.isFinite(pct) ? pct : null,
    priceChange6h: null,
    priceChange1h: null,
    volume24hUsd:
      Number(t?.quote_volume) > 0
        ? Number(t?.quote_volume)
        : Number(t?.volume) > 0
          ? Number(t?.volume)
          : null,
    volume6hUsd: null,
    volume1hUsd: null,
    liquidityUsd: null,
    fdvUsd: null,
    marketCapUsd: null,
    buys24h: null,
    sells24h: null,
    poolName: `${base ?? 'PENGU'} / ${quote ?? 'USDT'}`,
    baseSymbol: base ?? 'PENGU',
    updatedAt: Date.now(),
    source: 'gate',
  }
}

/* ------------------------------- venue registry ---------------------------- */

interface VenueAdapter {
  id: CexVenue
  symbol: string
  fetchCandles: (tf: Timeframe, limit: number) => Promise<Candle[]>
  fetchOverview: () => Promise<MarketOverview>
}

/** Durable-cache pool key for a venue's series (kept distinct per venue so
 * the series never overwrite each other; "binance" keeps the R38 key shape
 * so existing D1 rows stay readable). */
export function cexPoolKey(venue: CexVenue): string {
  switch (venue) {
    case 'binance':
      return binancePoolKey()
    case 'bybit':
      return `cex:bybit:${cexConfig.bybitSymbol}`
    case 'okx':
      return `cex:okx:${cexConfig.okxSymbol}`
    case 'mexc':
      return `cex:mexc:${cexConfig.mexcSymbol}`
    case 'gate':
      return `cex:gate:${cexConfig.gateSymbol}`
  }
}

/** All CEX pool keys in venue order (for the durable-cache N-source merge). */
export function cexPoolKeys(): string[] {
  return orderedVenues().map((v) => cexPoolKey(v.id))
}

function venueAdapters(): VenueAdapter[] {
  return [
    { id: 'bybit', symbol: cexConfig.bybitSymbol, fetchCandles: bybitCandles, fetchOverview: bybitOverview },
    { id: 'okx', symbol: cexConfig.okxSymbol, fetchCandles: okxCandles, fetchOverview: okxOverview },
    { id: 'mexc', symbol: cexConfig.mexcSymbol, fetchCandles: mexcCandles, fetchOverview: mexcOverview },
    { id: 'gate', symbol: cexConfig.gateSymbol, fetchCandles: gateCandles, fetchOverview: gateOverview },
    {
      // R38 adapter — 403s from the Workers egress but stays in the chain for
      // other egresses (local dev, proxies) and future unblocks.
      id: 'binance',
      symbol: binanceConfig.symbol,
      fetchCandles: fetchBinanceCandles,
      fetchOverview: fetchBinanceOverview,
    },
  ]
}

/** Configured venues in precedence order (CEX_VENUES overrides; empty disables
 * the whole tier — the outage-simulation hook for tests). */
function orderedVenues(): VenueAdapter[] {
  const all = venueAdapters()
  if (cexConfig.venues.length === 0) return []
  const byId = new Map(all.map((v) => [v.id, v]))
  const ordered: VenueAdapter[] = []
  for (const id of cexConfig.venues) {
    const v = byId.get(id as CexVenue)
    if (v && v.symbol) ordered.push(v)
  }
  return ordered
}

/* --------------------------------- public API ------------------------------ */

/**
 * Which venue served the last successful request (sticky — avoids re-probing
 * dead venues on every call; re-probed when it fails again).
 */
let preferredVenue: CexVenue | null = null

/** Real OHLCV candles from the first healthy CEX venue (see venue order above).
 * Returns the winning venue so the caller can persist under its pool key and
 * badge it honestly. */
export async function fetchCexCandles(
  tf: Timeframe,
  limit: number
): Promise<{ candles: Candle[]; venue: CexVenue }> {
  const venues = orderedVenues()
  if (venues.length === 0) throw new Error('CEX tier disabled (CEX_VENUES empty)')
  // Sticky ordering: preferred venue first, remaining venues in precedence order.
  const ordered = preferredVenue
    ? [preferredVenue, ...venues.map((v) => v.id).filter((id) => id !== preferredVenue)]
    : venues.map((v) => v.id)
  const byId = new Map(venues.map((v) => [v.id, v]))
  let lastErr: unknown = null
  for (const id of ordered) {
    const venue = byId.get(id)
    if (!venue) continue
    // Respect the tier's outbound budget — but always allow the first attempt
    // (when we are the last real-OHLCV tier, a skipped venue means a dead chart).
    if (id !== ordered[0] && !takeToken()) continue
    try {
      const candles = await venue.fetchCandles(tf, limit)
      preferredVenue = id
      return { candles, venue: id }
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('all CEX venues failed')
}

/** 24h ticker snapshot from the first healthy CEX venue (price-card fallback
 * tier between DexScreener and CoinMarketCap). */
export async function fetchCexOverview(): Promise<MarketOverview> {
  const venues = orderedVenues()
  if (venues.length === 0) throw new Error('CEX tier disabled (CEX_VENUES empty)')
  const ordered = preferredVenue
    ? [preferredVenue, ...venues.map((v) => v.id).filter((id) => id !== preferredVenue)]
    : venues.map((v) => v.id)
  const byId = new Map(venues.map((v) => [v.id, v]))
  let lastErr: unknown = null
  for (const id of ordered) {
    const venue = byId.get(id)
    if (!venue) continue
    if (id !== ordered[0] && !takeToken()) continue
    try {
      const overview = await venue.fetchOverview()
      preferredVenue = id
      return overview
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('all CEX venues failed')
}
