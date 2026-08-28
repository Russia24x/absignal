import { NextResponse } from 'next/server'
import { getSignalHistory, backfillHistory } from '@/lib/signal/daily'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Public track record: every locked daily signal with its real outcome.
 * First call also backfills from historical candles so the record is
 * genuine market data, never fabricated.
 */
export async function GET(req: Request) {
  const rl = rateLimit(`history:${clientIp(req)}`, 30, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  try {
    await backfillHistory()
    const history = await getSignalHistory(30)
    return NextResponse.json(history)
  } catch {
    return NextResponse.json({ error: 'history_unavailable' }, { status: 502 })
  }
}
