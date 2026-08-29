/**
 * CoinMarketCap client (R38) — aggregator quote tier, API-key gated.
 *
 * Optional fallback: activates ONLY when COINMARKETCAP_API_KEY is set (free
 * tier, 10k credits/day; quotes/latest = 1 credit). When no key is present
 * every function fails fast, and the orchestrator simply skips this tier.
 *
 * Field map (quotes/latest → MarketOverview):
 *   price, percent_change_1h/24h, volume_24h, market_cap,
 *   fully_diluted_market_cap. CMC has no 6h window and no per-pool DEX stats
 *   (liquidity / buy-sell counts) — those stay null on this tier.
 */

import { coinmarketcapConfig } from '@/lib/config'
import type { MarketOverview } from '@/lib/market/geckoterminal'

/** True when the CMC tier is usable (key present). */
export function isCmcConfigured(): boolean {
  return coinmarketcapConfig.apiKey.length > 0
}

/* ------------------------------ token bucket ------------------------------- */

/** CMC free tier allows ~30 calls/min. Same shape as the other clients. */
const BUCKET_CAPACITY = 30
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
        if (!takeToken() && hit) {
          return { value: hit.value as T, stale: true, fetchedAt: hit.fetchedAt }
        }
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

/** Fetch the latest USD quote for the configured symbol. Throws when the
 * tier is not configured (no key) or the payload is unusable. */
export async function fetchCmcOverview(): Promise<MarketOverview> {
  if (!isCmcConfigured()) throw new Error('CoinMarketCap tier not configured (no API key)')
  const res = await fetch(
    `${coinmarketcapConfig.baseUrl}/v1/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(coinmarketcapConfig.symbol)}`,
    {
      headers: {
        Accept: 'application/json',
        'X-CMC_PRO_API_KEY': coinmarketcapConfig.apiKey,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    }
  )
  if (!res.ok) throw new Error(`CoinMarketCap quotes failed: ${res.status}`)
  const json: any = await res.json()
  if (json?.status?.error_code && Number(json.status.error_code) !== 0) {
    throw new Error(`CoinMarketCap error ${json.status.error_code}: ${json.status.error_message}`)
  }
  const entry = json?.data?.[coinmarketcapConfig.symbol]
  const usd = entry?.quote?.USD
  const priceUsd = Number(usd?.price)
  // Payload validation: same rule as every other tier — no positive price,
  // no snapshot.
  if (!(priceUsd > 0)) {
    throw new Error(`CoinMarketCap payload empty for ${coinmarketcapConfig.symbol}`)
  }
  const num = (v: unknown): number | null => {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return {
    priceUsd,
    priceChange24h: num(usd?.percent_change_24h),
    priceChange6h: null,
    priceChange1h: num(usd?.percent_change_1h),
    volume24hUsd: num(usd?.volume_24h),
    volume6hUsd: null,
    volume1hUsd: null,
    liquidityUsd: null,
    fdvUsd: num(usd?.fully_diluted_market_cap),
    marketCapUsd: num(usd?.market_cap),
    buys24h: null,
    sells24h: null,
    poolName: `${entry?.symbol ?? coinmarketcapConfig.symbol} / USD`,
    baseSymbol: entry?.symbol ?? coinmarketcapConfig.symbol,
    updatedAt: Date.now(),
    source: 'coinmarketcap',
  }
}

/** Cached quote for the overview fallback chain. */
export async function getCmcOverviewWithMeta(): Promise<
  MarketOverview & { stale: boolean; fetchedAt: number }
> {
  const { value, stale, fetchedAt } = await fetchCached<MarketOverview>(
    `cmc-overview:${coinmarketcapConfig.symbol}`,
    45_000,
    fetchCmcOverview
  )
  return { ...value, stale, fetchedAt }
}
