import { NextResponse } from 'next/server'
import { getMarketOverviewWithMeta } from '@/lib/market/geckoterminal'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/** Live PENGU market snapshot (public). Serves stale data (flagged) when the
 *  upstream is rate-limited instead of failing. */
export async function GET(req: Request) {
  const rl = rateLimit(`market:${clientIp(req)}`, 60, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  try {
    const overview = await getMarketOverviewWithMeta()
    return NextResponse.json(overview)
  } catch {
    return NextResponse.json({ error: 'market_data_unavailable' }, { status: 502 })
  }
}
