/**
 * Backtest Sandbox — deterministic replay of the 1D analysis engine over
 * real historical daily candles.
 *
 * Model (conservative & honest):
 * - For each signal day D the engine sees ONLY candles closed before D
 *   (identical to how live daily signals are computed — same code path:
 *   analyzeTimeframe on the daily series with the last candle dropped).
 * - Actionable verdicts (BUY/STRONG_BUY → long, SELL/STRONG_SELL → short)
 *   open a paper trade at the close of D-1 using the same ATR-based plan
 *   math as the live trade plan (entry = close − 0.1·ATR, SL = entry ∓ 1.5·ATR,
 *   TPs = 1R/2R/3R).
 * - One position at a time (non-overlapping); max hold 7 days.
 * - Take-profit ladder 50/30/20 at TP1/TP2/TP3; after TP1 the stop moves to
 *   entry (breakeven), after TP2 to TP1.
 * - Same-day ambiguity resolved pessimistically: the stop is checked first.
 * - Results are in R-multiples (profit / initial risk), so they are
 *   position-size independent.
 *
 * The 1D timeframe is a data-driven limitation: intraday history (15m/1h/4h)
 * is not available far enough back, so the replay uses the same daily
 * timeframe component the live engine weights at 0.4. This is labelled
 * honestly in the UI ("1D engine replay").
 */

import { analyzeTimeframe, verdictFromScore, type Verdict } from '@/lib/analysis/engine'
import { atr } from '@/lib/analysis/indicators'
import type { Candle } from '@/lib/market/geckoterminal'

export interface BacktestTrade {
  /** Signal day (yyyy-mm-dd, UTC). */
  date: string
  /** Exit day (yyyy-mm-dd, UTC). */
  exitDate: string
  side: 'long' | 'short'
  verdict: Verdict
  entry: number
  stopLoss: number
  takeProfits: number[]
  /** Realized R-multiple (profit ÷ initial risk). */
  r: number
  holdDays: number
  outcome: 'TP3' | 'TP2' | 'TP1' | 'BE' | 'SL' | 'TIMEOUT'
}

export interface BacktestStats {
  trades: number
  wins: number
  losses: number
  breakeven: number
  winRate: number // %
  totalR: number
  avgR: number
  bestR: number
  worstR: number
  /** Gross win ÷ |gross loss| (null when no losses). */
  profitFactor: number | null
  /** Max peak-to-valley drawdown of the cumulative R curve. */
  maxDrawdownR: number
  avgHoldDays: number
  /** Actionable signals skipped because a position was already open. */
  skippedSignals: number
  holdDays: number
}

export interface BacktestResult {
  from: string
  to: string
  tradingDays: number
  stats: BacktestStats
  trades: BacktestTrade[]
  /** Cumulative R after each closed trade. */
  equity: Array<{ date: string; r: number }>
}

const WARMUP = 60
const MAX_HOLD_DAYS = 7

function dayOf(c: Candle): string {
  return new Date(c.time * 1000).toISOString().slice(0, 10)
}

function actionable(verdict: Verdict): 'long' | 'short' | null {
  if (verdict === 'BUY' || verdict === 'STRONG_BUY') return 'long'
  if (verdict === 'SELL' || verdict === 'STRONG_SELL') return 'short'
  return null
}

/**
 * Simulate one trade day-by-day with the TP ladder + trailing stops.
 * Returns realized R and the outcome label.
 */
function simulate(
  side: 'long' | 'short',
  entry: number,
  stop: number,
  tps: [number, number, number],
  sim: Candle[],
): { r: number; outcome: BacktestTrade['outcome']; holdDays: number; exitDate: string } {
  const risk = Math.abs(entry - stop)
  if (risk <= 0) return { r: 0, outcome: 'BE', holdDays: 0, exitDate: dayOf(sim[0]) }

  const bookedR: number[] = []
  let curStop = stop
  let tpIdx = 0
  let lastDate = dayOf(sim[0])

  for (let d = 0; d < sim.length && d < MAX_HOLD_DAYS; d++) {
    const c = sim[d]
    lastDate = dayOf(c)
    const low = c.low
    const high = c.high

    // Pessimistic intraday assumption: stop first.
    const stopHit = side === 'long' ? low <= curStop : high >= curStop
    if (stopHit) {
      const exitR = side === 'long' ? (curStop - entry) / risk : (entry - curStop) / risk
      bookedR.push(exitR)
      const r = bookedR.reduce((a, b) => a + b, 0)
      // Outcome label: which stage the trade reached when stopped.
      let outcome: BacktestTrade['outcome'] = 'SL'
      if (tpIdx === 1) outcome = bookedR.length === 2 && r <= 0.55 && r >= -0.05 ? 'BE' : 'TP1'
      else if (tpIdx === 2) outcome = 'TP2'
      else if (tpIdx === 3) outcome = 'TP3'
      return { r, outcome, holdDays: d + 1, exitDate: lastDate }
    }

    // Take profits (ladder order).
    while (tpIdx < 3) {
      const tp = tps[tpIdx]
      const hit = side === 'long' ? high >= tp : low <= tp
      if (!hit) break
      const mult = tpIdx + 1
      const fraction = [0.5, 0.3, 0.2][tpIdx]
      bookedR.push(mult * fraction)
      curStop = tpIdx === 0 ? entry : tps[tpIdx - 1]
      tpIdx++
    }
    if (tpIdx === 3) {
      const r = bookedR.reduce((a, b) => a + b, 0)
      return { r, outcome: 'TP3', holdDays: d + 1, exitDate: lastDate }
    }
  }

  // Timeout: exit the remainder at the last close.
  const lastClose = sim[Math.min(sim.length, MAX_HOLD_DAYS) - 1]?.close ?? entry
  const exitR = side === 'long' ? (lastClose - entry) / risk : (entry - lastClose) / risk
  bookedR.push(exitR)
  const r = bookedR.reduce((a, b) => a + b, 0)
  return { r, outcome: 'TIMEOUT', holdDays: Math.min(sim.length, MAX_HOLD_DAYS), exitDate: lastDate }
}

/** Run the 1D engine replay over closed daily candles. */
export function runBacktest(allCandles: Candle[]): BacktestResult | null {
  // Drop the in-progress candle exactly like the live engine.
  const closed = allCandles.slice(0, -1)
  if (closed.length < WARMUP + 10) return null

  const trades: BacktestTrade[] = []
  let skipped = 0
  let busyUntil = -1

  for (let i = WARMUP; i < closed.length; i++) {
    if (i <= busyUntil) continue
    // Only signal days whose full simulation window (max hold) exists in
    // history count — trades that would still be open at the data edge are
    // excluded entirely (honest: no half-simulated outcomes).
    if (i + MAX_HOLD_DAYS > closed.length) break

    // The engine sees candles 0..i-1 (slice includes day i; analyzeTimeframe
    // drops the last one — same as live where today's candle is dropped).
    const visible = closed.slice(0, i + 1)
    const tf = analyzeTimeframe('1d', visible)
    const verdict = verdictFromScore(tf.score)
    const side = actionable(verdict)
    if (!side) continue

    // Plan math mirrors buildPlan() with price = close of D-1.
    const ref = closed[i - 1].close
    const atrValue = atr(closed.slice(0, i), 14) ?? ref * 0.04
    const entry = ref - 0.1 * atrValue
    const risk = 1.5 * atrValue
    const stop = side === 'long' ? entry - risk : entry + risk
    const dir = side === 'long' ? 1 : -1
    const tps: [number, number, number] = [
      entry + dir * risk,
      entry + dir * 2 * risk,
      entry + dir * 3 * risk,
    ]

    const sim = closed.slice(i, i + MAX_HOLD_DAYS)

    const res = simulate(side, entry, stop, tps, sim)
    trades.push({
      date: dayOf(closed[i]),
      exitDate: res.exitDate,
      side,
      verdict,
      entry,
      stopLoss: stop,
      takeProfits: tps,
      r: Math.round(res.r * 100) / 100,
      holdDays: res.holdDays,
      outcome: res.outcome,
    })
    const holdEnd = i + res.holdDays - 1
    for (let j = i + 1; j <= holdEnd && j < closed.length; j++) {
      const t2 = analyzeTimeframe('1d', closed.slice(0, j + 1))
      if (actionable(verdictFromScore(t2.score))) skipped++
    }
    busyUntil = holdEnd
  }

  // Aggregate stats.
  const rs = trades.map((t) => t.r)
  const wins = rs.filter((r) => r > 0.05)
  const losses = rs.filter((r) => r < -0.05)
  const grossWin = wins.reduce((a, b) => a + b, 0)
  const grossLoss = losses.reduce((a, b) => a + b, 0)
  const totalR = rs.reduce((a, b) => a + b, 0)

  let cum = 0
  let peak = 0
  let maxDD = 0
  const equity: Array<{ date: string; r: number }> = []
  for (const t of trades) {
    cum += t.r
    peak = Math.max(peak, cum)
    maxDD = Math.max(maxDD, peak - cum)
    equity.push({ date: t.exitDate, r: Math.round(cum * 100) / 100 })
  }

  const stats: BacktestStats = {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: trades.length - wins.length - losses.length,
    winRate: trades.length ? Math.round((wins.length / trades.length) * 100) : 0,
    totalR: Math.round(totalR * 100) / 100,
    avgR: trades.length ? Math.round((totalR / trades.length) * 100) / 100 : 0,
    bestR: rs.length ? Math.max(...rs) : 0,
    worstR: rs.length ? Math.min(...rs) : 0,
    profitFactor: grossLoss < 0 ? Math.round((grossWin / Math.abs(grossLoss)) * 100) / 100 : null,
    maxDrawdownR: Math.round(maxDD * 100) / 100,
    avgHoldDays: trades.length
      ? Math.round((trades.reduce((a, t) => a + t.holdDays, 0) / trades.length) * 10) / 10
      : 0,
    skippedSignals: skipped,
    holdDays: MAX_HOLD_DAYS,
  }

  return {
    from: dayOf(closed[WARMUP]),
    to: dayOf(closed[closed.length - 1]),
    tradingDays: closed.length - WARMUP,
    stats,
    trades: trades.slice().reverse(), // newest first
    equity,
  }
}
