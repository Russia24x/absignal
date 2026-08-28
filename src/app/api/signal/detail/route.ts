import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSignalHistory } from '@/lib/signal/daily'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Full engine output for a PAST, RESOLVED day (public).
 *
 * Security: reuses getSignalHistory's masking to decide whether a day is
 * resolved. Any day whose outcome is still PENDING (today, or awaiting the
 * next close) is refused — the verdict is paid content and must never leak.
 */
export async function GET(req: Request) {
  const rl = rateLimit(`signal-detail:${clientIp(req)}`, 30, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const date = new URL(req.url).searchParams.get('date') ?? ''
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: 'invalid_date' }, { status: 400 })
  }

  try {
    // Authoritative resolution check: the same history pipeline that masks
    // the public track record decides if this date is safe to expose.
    const history = await getSignalHistory(60)
    const entry = history.entries.find((e) => e.date === date)
    if (!entry || entry.verdict === 'LOCKED' || entry.outcome === 'PENDING') {
      return NextResponse.json({ error: 'not_resolved' }, { status: 403 })
    }

    const row = await db.dailySignal.findUnique({ where: { date } })
    if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    return NextResponse.json({
      date: row.date,
      signal: JSON.parse(row.dataJson),
      outcome: entry.outcome,
      changePercent: entry.changePercent,
    })
  } catch {
    return NextResponse.json({ error: 'detail_unavailable' }, { status: 502 })
  }
}
