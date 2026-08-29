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
}

const PROBES: Probe[] = [
  { name: 'cf-trace', url: 'https://www.cloudflare.com/cdn-cgi/trace' },
  {
    name: 'gt-pool',
    url: `https://api.geckoterminal.com/api/v2/networks/abstract/pools/${POOL}`,
  },
  {
    name: 'gt-ohlcv-1d',
    url: `https://api.geckoterminal.com/api/v2/networks/abstract/pools/${POOL}/ohlcv/day?aggregate=1&limit=2&currency=usd`,
  },
  {
    name: 'dexscreener',
    url: `https://api.dexscreener.com/latest/dex/tokens/${PENGU}`,
  },
  {
    name: 'binance-vision-klines',
    url: 'https://data-api.binance.vision/api/v3/klines?symbol=PENGUUSDT&interval=1d&limit=2',
  },
  {
    name: 'binance-vision-ticker',
    url: 'https://data-api.binance.vision/api/v3/ticker/24hr?symbol=PENGUUSDT',
  },
  {
    name: 'binance-com-klines',
    url: 'https://api.binance.com/api/v3/klines?symbol=PENGUUSDT&interval=1d&limit=2',
  },
  {
    name: 'binance-api1-klines',
    url: 'https://api1.binance.com/api/v3/klines?symbol=PENGUUSDT&interval=1d&limit=2',
  },
  {
    name: 'binance-api2-klines',
    url: 'https://api2.binance.com/api/v3/klines?symbol=PENGUUSDT&interval=1d&limit=2',
  },
  {
    name: 'binance-api3-klines',
    url: 'https://api3.binance.com/api/v3/klines?symbol=PENGUUSDT&interval=1d&limit=2',
  },
  {
    name: 'binance-api4-klines',
    url: 'https://api4.binance.com/api/v3/klines?symbol=PENGUUSDT&interval=1d&limit=2',
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
      headers: { Accept: 'application/json' },
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
