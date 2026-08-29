import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** TEMPORARY diagnostics (R34): reports what this Worker's outbound fetch
 * actually receives from upstream market-data APIs — status, key headers,
 * body snippet. Read-only, no secrets. Removed after diagnosis. */
export async function GET() {
  const probe = async (name: string, url: string) => {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
      })
      const text = await res.text()
      return {
        name,
        status: res.status,
        server: res.headers.get('server'),
        cfMitigated: res.headers.get('cf-mitigated'),
        contentType: res.headers.get('content-type'),
        bodyLength: text.length,
        bodySnippet: text.slice(0, 220),
      }
    } catch (err) {
      return { name, error: String(err).slice(0, 200) }
    }
  }

  const pool = '0xda7d037fda848177141e037f9d0c67cae7b53262'
  const results = await Promise.all([
    probe(
      'geckoterminal-pool',
      `https://api.geckoterminal.com/api/v2/networks/abstract/pools/${pool}`
    ),
    probe(
      'geckoterminal-ohlcv',
      `https://api.geckoterminal.com/api/v2/networks/abstract/pools/${pool}/ohlcv/day?aggregate=1&limit=30&currency=usd`
    ),
    probe(
      'dexscreener-token',
      'https://api.dexscreener.com/latest/dex/tokens/0x9ebe3a824ca958e4b3da772d2065518f009cba62'
    ),
    probe('cloudflare-trace', 'https://www.cloudflare.com/cdn-cgi/trace'),
  ])
  return NextResponse.json({ at: new Date().toISOString(), results })
}
