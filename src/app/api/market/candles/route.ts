import { NextResponse } from 'next/server'
import { getCandlesWithMeta, type Timeframe } from '@/lib/market/geckoterminal'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const VALID_TF: Timeframe[] = ['15m', '1h', '4h', '1d']

/** OHLCV candles for the chart (public market data). Serves stale data
 *  (flagged) when the upstream is rate-limited instead of failing. */
export async function GET(req: Request) {
  const rl = rateLimit(`candles:${clientIp(req)}`, 60, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const url = new URL(req.url)
  const tf = (url.searchParams.get('tf') ?? '1h') as Timeframe
  if (!VALID_TF.includes(tf)) {
    return NextResponse.json({ error: 'invalid_timeframe' }, { status: 400 })
  }
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 200), 30), 500)

  try {
    const { candles, stale, fetchedAt } = await getCandlesWithMeta(tf, limit)
    return NextResponse.json({ timeframe: tf, candles, stale, fetchedAt })
  } catch {
    return NextResponse.json({ error: 'market_data_unavailable' }, { status: 502 })
  }
}
