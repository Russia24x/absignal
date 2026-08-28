import { NextResponse } from 'next/server'
import { getSentiment } from '@/lib/market/sentiment'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/** PENGU composite sentiment index (public, computed from real market data). */
export async function GET(req: Request) {
  const rl = rateLimit(`sentiment:${clientIp(req)}`, 30, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  try {
    const sentiment = await getSentiment()
    return NextResponse.json(sentiment)
  } catch {
    return NextResponse.json({ error: 'sentiment_unavailable' }, { status: 502 })
  }
}
