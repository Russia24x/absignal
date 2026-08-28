import { NextResponse } from 'next/server'
import { runBacktest, type BacktestResult } from '@/lib/backtest/replay'
import { getCandles } from '@/lib/market/geckoterminal'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Backtest Sandbox (public): deterministic 1D-engine replay over the real
 * daily candle history. Result is computed from cached market data and
 * memoized for 1 hour (deterministic output + slow-moving daily data →
 * zero upstream cost for repeat visitors).
 */

let memo: { at: number; result: BacktestResult | null } | null = null
const MEMO_TTL_MS = 60 * 60 * 1000

export async function GET(req: Request) {
  const rl = rateLimit(`backtest:${clientIp(req)}`, 30, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  if (memo && Date.now() - memo.at < MEMO_TTL_MS) {
    return NextResponse.json(
      { ...memo.result, cached: true },
      { headers: { 'cache-control': 'public, s-maxage=600' } },
    )
  }

  try {
    const candles = await getCandles('1d', 300)
    const result = runBacktest(candles)
    if (!result) {
      return NextResponse.json({ error: 'insufficient_history' }, { status: 503 })
    }
    memo = { at: Date.now(), result }
    return NextResponse.json({ ...result, cached: false })
  } catch {
    return NextResponse.json({ error: 'backtest_unavailable' }, { status: 502 })
  }
}
