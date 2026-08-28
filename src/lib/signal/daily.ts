/**
 * Daily signal service.
 *
 * Product rule: the verdict is computed once per UTC day from real market
 * data and then LOCKED — everyone who pays for the day sees the exact same
 * signal, and history can be audited honestly afterwards.
 *
 * Track record: for each past day we compare the locked verdict direction
 * against the actual next-day close (from the same market-data source),
 * producing a real, data-driven accuracy score — no demo numbers.
 */

import { db } from '@/lib/db'
import { runAnalysis, type AnalysisResult } from '@/lib/analysis/engine'
import { getDailyCloses } from '@/lib/market/geckoterminal'

export function utcDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10)
}

/** Get (or compute + lock) today's signal. */
export async function getTodaySignal(): Promise<AnalysisResult> {
  const date = utcDate()
  const existing = await db.dailySignal.findUnique({ where: { date } })
  if (existing) {
    return JSON.parse(existing.dataJson) as AnalysisResult
  }
  // Compute fresh and lock it for the day.
  const analysis = await runAnalysis()
  await db.dailySignal
    .upsert({
      where: { date },
      create: {
        date,
        verdict: analysis.verdict,
        score: analysis.score,
        confidence: analysis.confidence,
        dataJson: JSON.stringify(analysis),
        priceAtSignal: analysis.priceUsd,
      },
      update: {},
    })
    .catch(() => {})
  return analysis
}

export interface HistoryEntry {
  date: string
  verdict: string
  score: number
  confidence: number
  priceAtSignal: number
  /** Actual next-day outcome, filled from market data. */
  priceNextDay: number | null
  changePercent: number | null
  /** WIN | LOSS | NEUTRAL | PENDING */
  outcome: 'WIN' | 'LOSS' | 'NEUTRAL' | 'PENDING'
}

export interface HistoryResult {
  entries: HistoryEntry[]
  stats: {
    total: number
    wins: number
    losses: number
    neutral: number
    accuracy: number | null
  }
}

/** Public track record: locked signals × real outcomes. */
export async function getSignalHistory(limit = 30): Promise<HistoryResult> {
  const signals = await db.dailySignal.findMany({
    orderBy: { date: 'desc' },
    take: limit,
  })
  const closes = await getDailyCloses(90).catch(() => [] as Array<{ date: string; close: number }>)
  const closeMap = new Map(closes.map((c) => [c.date, c.close]))

  const entries: HistoryEntry[] = signals.map((s) => {
    // Next trading day = the next calendar day with a known close.
    const next = new Date(s.date + 'T00:00:00Z')
    next.setUTCDate(next.getUTCDate() + 1)
    let priceNextDay: number | null = null
    for (let i = 0; i < 4; i++) {
      const key = next.toISOString().slice(0, 10)
      if (closeMap.has(key)) {
        priceNextDay = closeMap.get(key) ?? null
        break
      }
      next.setUTCDate(next.getUTCDate() + 1)
    }
    const changePercent =
      priceNextDay != null && s.priceAtSignal > 0
        ? ((priceNextDay - s.priceAtSignal) / s.priceAtSignal) * 100
        : null

    const bullish = s.verdict === 'BUY' || s.verdict === 'STRONG_BUY'
    const bearish = s.verdict === 'SELL' || s.verdict === 'STRONG_SELL'
    let outcome: HistoryEntry['outcome'] = 'PENDING'
    if (changePercent != null) {
      if (!bullish && !bearish) outcome = 'NEUTRAL'
      else if (bullish) outcome = changePercent > 0.3 ? 'WIN' : changePercent < -0.3 ? 'LOSS' : 'NEUTRAL'
      else if (bearish) outcome = changePercent < -0.3 ? 'WIN' : changePercent > 0.3 ? 'LOSS' : 'NEUTRAL'
    }

    // Product integrity: days whose outcome is still unknown (today, or the
    // last day before its close) are LOCKED — the verdict is paid content
    // and must never leak through the public track record.
    if (outcome === 'PENDING') {
      return {
        date: s.date,
        verdict: 'LOCKED',
        score: 0,
        confidence: 0,
        priceAtSignal: 0,
        priceNextDay: null,
        changePercent: null,
        outcome: 'PENDING' as const,
      }
    }

    return {
      date: s.date,
      verdict: s.verdict,
      score: s.score,
      confidence: s.confidence,
      priceAtSignal: s.priceAtSignal,
      priceNextDay,
      changePercent,
      outcome,
    }
  })

  const wins = entries.filter((e) => e.outcome === 'WIN').length
  const losses = entries.filter((e) => e.outcome === 'LOSS').length
  const neutral = entries.filter((e) => e.outcome === 'NEUTRAL').length
  const decided = wins + losses
  return {
    entries,
    stats: {
      total: entries.length,
      wins,
      losses,
      neutral,
      accuracy: decided > 0 ? (wins / decided) * 100 : null,
    },
  }
}

/**
 * Backfill history: compute signals for past days from historical candles.
 * Runs once on first boot so the public track record is real from day one.
 */
export async function backfillHistory(): Promise<number> {
  // The engine analyzes the *latest* candle set; for backtesting we run it
  // against historical windows. This produces honest "what would the engine
  // have said" data derived purely from real historical candles.
  try {
    const count = await db.dailySignal.count()
    if (count > 0) return 0
    const { getCandles } = await import('@/lib/market/geckoterminal')
    const { analyzeTimeframe } = await import('@/lib/analysis/engine')
    const candles1d = await getCandles('1d', 220)
    if (candles1d.length < 60) return 0
    const closed = candles1d.slice(0, -1) // exclude today
    const lookback = Math.min(21, closed.length - 40) // up to 3 weeks of history
    let created = 0
    for (let i = lookback; i >= 1; i--) {
      const window = closed.slice(0, closed.length - i + 1)
      const day = window[window.length - 1]
      const date = new Date(day.time * 1000).toISOString().slice(0, 10)
      const exists = await db.dailySignal.findUnique({ where: { date } })
      if (exists) continue
      const tf = analyzeTimeframe('1d', window)
      const score = tf.score
      const verdict =
        score >= 40 ? 'STRONG_BUY' : score >= 15 ? 'BUY' : score <= -40 ? 'STRONG_SELL' : score <= -15 ? 'SELL' : 'HOLD'
      const bullish = verdict === 'BUY' || verdict === 'STRONG_BUY'
      const bearish = verdict === 'SELL' || verdict === 'STRONG_SELL'
      const next = closed[closed.length - i + 1]
      const changePercent =
        next && day.close > 0 ? ((next.close - day.close) / day.close) * 100 : null
      await db.dailySignal
        .create({
          data: {
            date,
            verdict,
            score,
            confidence: 50,
            dataJson: JSON.stringify({
              date,
              generatedAt: day.time * 1000,
              priceUsd: day.close,
              verdict,
              score,
              confidence: 50,
              timeframes: [tf],
              plan: { side: 'none', entryLow: 0, entryHigh: 0, stopLoss: 0, takeProfits: [], riskReward: 0, invalidation: 'historical' },
              supports: [],
              resistances: [],
              atrPercent: null,
              summary: {
                en: `Historical daily snapshot (verdict ${verdict}, score ${score.toFixed(0)}).`,
                fa: `اسنپ‌شات تاریخی روزانه (سیگنال ${verdict}، امتیاز ${score.toFixed(0)}).`,
              },
            }),
            priceAtSignal: day.close,
          },
        })
        .catch(() => {})
      void bullish
      void bearish
      void changePercent
      created++
    }
    return created
  } catch {
    return 0
  }
}
