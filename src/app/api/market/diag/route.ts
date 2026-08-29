import { NextResponse } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * TEMPORARY diagnostic (R39) — same pattern as the R35 diag, now token-gated.
 * Answers 404 for every request without the exact token so it cannot be used
 * as an outbound-fetch amplification vector. REMOVED after the round.
 *
 * Purpose: ground truth on what the deployed Worker's OWN egress receives
 * from every market-data host in the R38 fallback chain (the sandbox egress
 * is NOT the Workers egress — Binance was only ever verified from here).
 */

const TOKEN = 'd3b02db3929a551f6aab6b6e079596c3'

const POOL = '0xda7d037fda848177141e037f9d0c67cae7b53262'
const PENGU = '0x9ebe3a824ca958e4b3da772d2065518f009cba62'

interface Probe {
  name: string
  url: string
  headers?: Record<string, string>
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

const PROBES: Probe[] = [
  { name: 'cf-trace', url: 'https://www.cloudflare.com/cdn-cgi/trace' },
  { name: 'gt-pool', url: `https://api.geckoterminal.com/api/v2/networks/abstract/pools/${POOL}` },
  {
    name: 'gt-ohlcv-1d',
    url: `https://api.geckoterminal.com/api/v2/networks/abstract/pools/${POOL}/ohlcv/day?aggregate=1&limit=2&currency=usd`,
  },
  {
    name: 'dexscreener',
    url: `https://api.dexscreener.com/latest/dex/tokens/${PENGU}`,
  },
  // ── Binance family: plain vs browser-UA vs futures host ──
  {
    name: 'binance-vision-klines',
    url: 'https://data-api.binance.vision/api/v3/klines?symbol=PENGUUSDT&interval=1d&limit=2',
  },
  {
    name: 'binance-vision-klines-UA',
    url: 'https://data-api.binance.vision/api/v3/klines?symbol=PENGUUSDT&interval=1d&limit=2',
    headers: { 'User-Agent': BROWSER_UA },
  },
  {
    name: 'binance-com-klines-UA',
    url: 'https://api.binance.com/api/v3/klines?symbol=PENGUUSDT&interval=1d&limit=2',
    headers: { 'User-Agent': BROWSER_UA },
  },
  {
    name: 'binance-fapi-klines',
    url: 'https://fapi.binance.com/fapi/v1/klines?symbol=PENGUUSDT&interval=1d&limit=2',
  },
  // ── Alternative CEXes with PENGU listings, public klines ──
  {
    name: 'bybit-klines',
    url: 'https://api.bybit.com/v5/market/kline?category=spot&symbol=PENGUUSDT&interval=D&limit=2',
  },
  {
    name: 'okx-candles',
    url: 'https://www.okx.com/api/v5/market/candles?instId=PENGU-USDT&bar=1D&limit=2',
  },
  {
    name: 'kucoin-candles',
    url: 'https://api.kucoin.com/api/v1/market/candles?symbol=PENGU-USDT&type=1day',
  },
  {
    name: 'gate-candles',
    url: 'https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=PENGU_USDT&interval=1d&limit=2',
  },
  {
    name: 'mexc-klines',
    url: 'https://api.mexc.com/api/v3/klines?symbol=PENGUUSDT&interval=1d&limit=2',
  },
  {
    name: 'coinbase-candles',
    url: 'https://api.exchange.coinbase.com/products/PENGU-USD/candles?granularity=86400',
    headers: { 'User-Agent': BROWSER_UA },
  },
  {
    name: 'kraken-ohlc',
    url: 'https://api.kraken.com/0/public/OHLC?pair=PENGUUSD',
  },
  {
    name: 'coingecko-ping',
    url: 'https://api.coingecko.com/api/v3/ping',
  },
  {
    name: 'cmc-quotes-nokey',
    url: 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=PENGU',
  },
]

async function runProbe(p: Probe) {
  const started = Date.now()
  try {
    const res = await fetch(p.url, {
      headers: { Accept: 'application/json', ...(p.headers ?? {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    const text = (await res.text()).slice(0, 220)
    return {
      name: p.name,
      status: res.status,
      ok: res.ok,
      ms: Date.now() - started,
      snippet: text,
    }
  } catch (err) {
    return {
      name: p.name,
      status: null,
      ok: false,
      ms: Date.now() - started,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    }
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  if (url.searchParams.get('token') !== TOKEN) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  const rl = rateLimit(`diag:${clientIp(req)}`, 10, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const results = await Promise.all(PROBES.map(runProbe))
  return NextResponse.json({ at: new Date().toISOString(), results })
}
