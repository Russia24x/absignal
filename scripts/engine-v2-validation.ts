/**
 * Engine v2 validation — walk-forward comparison on REAL historical candles.
 *
 * Purpose (engineering sanity check, not marketing): v1's lag failure was
 * diagnosed from the locked track record (sold bottoms / bought tops on a
 * mean-reverting asset). This script re-runs BOTH engines over the same
 * historical daily candles with strict no-look-ahead and compares:
 *   - directional accuracy (WIN/LOSS with the same ±0.3% band as the
 *     public track record)
 *   - paper equity (Σ verdict-direction × next-day change)
 *   - actionable-day count (v2 should skip low-conviction chop days)
 *
 * v1 is cloned inline (its exact production weights/thresholds) so the
 * comparison is apples-to-apples regardless of the current engine code.
 *
 * Run: bun run scripts/engine-v2-validation.ts
 */

import { analyzeTimeframe, verdictFromScore, volatilityScale, type Verdict } from '../src/lib/analysis/engine'
import { atr, rsi, ema, macd, bollinger, stochastic, obvSlope, roc, sma, adx } from '../src/lib/analysis/indicators'
import { getCandles, type Candle } from '../src/lib/market/geckoterminal'

type Vote = 'bullish' | 'bearish' | 'neutral'

const V1_W = { emaCross: 0.18, ema200: 0.14, rsi: 0.14, macd: 0.16, bollinger: 0.1, stochastic: 0.1, obv: 0.09, roc: 0.09 }

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

/** v1 clone: exact production scoring of the pre-upgrade engine (1D series). */
function v1Score(allCandles: Candle[]): number {
  const candles = allCandles.slice(0, -1)
  const closes = candles.map((c) => c.close)
  const price = closes[closes.length - 1] ?? 0
  const parts: Array<{ vote: Vote; contribution: number }> = []
  const push = (vote: Vote, weight: number, strength: number) => {
    parts.push({ vote, contribution: vote === 'bullish' ? weight * strength : vote === 'bearish' ? -weight * strength : 0 })
  }

  const ema20 = ema(closes, 20)
  const ema50 = ema(closes, 50)
  if (ema20 != null && ema50 != null && ema50 !== 0) {
    const dist = ((ema20 - ema50) / ema50) * 100
    push(dist > 0.05 ? 'bullish' : dist < -0.05 ? 'bearish' : 'neutral', V1_W.emaCross, clamp(Math.abs(dist) / 2, 0.25, 1))
  }
  const ema200 = ema(closes, 200) ?? sma(closes, Math.min(closes.length, 100))
  if (ema200 != null && ema200 !== 0 && price > 0) {
    const dist = ((price - ema200) / ema200) * 100
    push(dist > 0.1 ? 'bullish' : dist < -0.1 ? 'bearish' : 'neutral', V1_W.ema200, clamp(Math.abs(dist) / 5, 0.25, 1))
  }
  const r = rsi(closes, 14)
  if (r != null) {
    let vote: Vote = 'neutral'; let s = 0.3
    if (r >= 70) { vote = 'bearish'; s = clamp((r - 70) / 15, 0.4, 1) }
    else if (r <= 30) { vote = 'bullish'; s = clamp((30 - r) / 15, 0.4, 1) }
    else if (r > 55) { vote = 'bullish'; s = clamp((r - 55) / 15, 0.2, 0.7) }
    else if (r < 45) { vote = 'bearish'; s = clamp((45 - r) / 15, 0.2, 0.7) }
    push(vote, V1_W.rsi, s)
  }
  const m = macd(closes)
  if (m) {
    const norm = closes[closes.length - 1] !== 0 ? (m.histogram / closes[closes.length - 1]) * 1000 : 0
    push(m.histogram > 0 ? 'bullish' : m.histogram < 0 ? 'bearish' : 'neutral', V1_W.macd, clamp(Math.abs(norm) / 1.5, 0.25, 1))
  }
  const bb = bollinger(closes, 20, 2)
  if (bb) {
    const pb = bb.percentB
    let vote: Vote = 'neutral'; let s = 0.3
    if (pb > 1) { vote = 'bearish'; s = 0.8 }
    else if (pb < 0) { vote = 'bullish'; s = 0.8 }
    else if (pb > 0.6) { vote = 'bullish'; s = clamp((pb - 0.6) / 0.4, 0.2, 0.8) }
    else if (pb < 0.4) { vote = 'bearish'; s = clamp((0.4 - pb) / 0.4, 0.2, 0.8) }
    push(vote, V1_W.bollinger, s)
  }
  const st = stochastic(candles)
  if (st) {
    let vote: Vote = 'neutral'; let s = 0.3
    if (st.k >= 80) { vote = 'bearish'; s = clamp((st.k - 80) / 15, 0.4, 1) }
    else if (st.k <= 20) { vote = 'bullish'; s = clamp((20 - st.k) / 15, 0.4, 1) }
    else if (st.k > st.d && st.k > 50) { vote = 'bullish'; s = 0.4 }
    else if (st.k < st.d && st.k < 50) { vote = 'bearish'; s = 0.4 }
    push(vote, V1_W.stochastic, s)
  }
  const obv = obvSlope(candles, 20)
  if (obv != null) {
    push(obv > 0.02 ? 'bullish' : obv < -0.02 ? 'bearish' : 'neutral', V1_W.obv, clamp(Math.abs(obv) / 0.6, 0.25, 1))
  }
  const rc = roc(closes, 10)
  if (rc != null) {
    push(rc > 0.1 ? 'bullish' : rc < -0.1 ? 'bearish' : 'neutral', V1_W.roc, clamp(Math.abs(rc) / 4, 0.25, 1))
  }
  return clamp(parts.reduce((a, p) => a + p.contribution, 0) * 100, -100, 100)
}

function v1Verdict(score: number): Verdict {
  if (score >= 40) return 'STRONG_BUY'
  if (score >= 15) return 'BUY'
  if (score <= -40) return 'STRONG_SELL'
  if (score <= -15) return 'SELL'
  return 'HOLD'
}

interface Tally {
  label: string
  wins: number
  losses: number
  neutral: number
  equity: number
  peak: number
  maxDD: number
  actionable: number
  days: number
  worstDay: number
  bestDay: number
}

function tally(label: string): Tally {
  return { label, wins: 0, losses: 0, neutral: 0, equity: 0, peak: 0, maxDD: 0, actionable: 0, days: 0, worstDay: 0, bestDay: 0 }
}

function score(t: Tally, verdict: Verdict, chg: number) {
  t.days++
  const bull = verdict === 'BUY' || verdict === 'STRONG_BUY'
  const bear = verdict === 'SELL' || verdict === 'STRONG_SELL'
  if (!bull && !bear) { t.neutral++; return }
  t.actionable++
  const daily = (bull ? 1 : -1) * chg
  t.equity += daily
  t.peak = Math.max(t.peak, t.equity)
  t.maxDD = Math.min(t.maxDD, t.equity - t.peak)
  t.bestDay = Math.max(t.bestDay, daily)
  t.worstDay = Math.min(t.worstDay, daily)
  if (bull) { if (chg > 0.3) t.wins++; else if (chg < -0.3) t.losses++; else t.neutral++ }
  else { if (chg < -0.3) t.wins++; else if (chg > 0.3) t.losses++; else t.neutral++ }
}

function report(t: Tally) {
  const decided = t.wins + t.losses
  const acc = decided > 0 ? ((t.wins / decided) * 100).toFixed(1) : '—'
  console.log(
    `${t.label.padEnd(10)} days:${String(t.days).padStart(4)}  actionable:${String(t.actionable).padStart(4)}  ` +
    `W/L/N: ${t.wins}/${t.losses}/${t.neutral}  acc:${acc}%  ` +
    `equity:${(t.equity >= 0 ? '+' : '') + t.equity.toFixed(1)}%  maxDD:${t.maxDD.toFixed(1)}%  ` +
    `best:${t.bestDay >= 0 ? '+' : ''}${t.bestDay.toFixed(1)}% worst:${t.worstDay.toFixed(1)}%`
  )
}

/* ------------------- plan-based replay (product reality) ------------------- */

const MAX_HOLD = 7

interface PlanTally {
  label: string
  trades: number
  wins: number
  losses: number
  totalR: number
  maxDDR: number
  skipped: number
}

function planTally(label: string): PlanTally {
  return { label, trades: 0, wins: 0, losses: 0, totalR: 0, maxDDR: 0, skipped: 0 }
}

/** Same trade simulation as the product backtest: SL 1.5 ATR, TP ladder 1R/2R/3R (50/30/20), stop-to-entry after TP1, pessimistic same-day stop-first, max hold 7d. */
function simulatePlan(side: 'long' | 'short', entry: number, stop: number, tps: [number, number, number], sim: Candle[]): number {
  const risk = Math.abs(entry - stop)
  if (risk <= 0) return 0
  const booked: number[] = []
  let curStop = stop
  let tpIdx = 0
  for (let d = 0; d < sim.length && d < MAX_HOLD; d++) {
    const c = sim[d]
    const stopHit = side === 'long' ? c.low <= curStop : c.high >= curStop
    if (stopHit) {
      booked.push(side === 'long' ? (curStop - entry) / risk : (entry - curStop) / risk)
      return booked.reduce((a, b) => a + b, 0)
    }
    while (tpIdx < 3) {
      const tp = tps[tpIdx]
      const hit = side === 'long' ? c.high >= tp : c.low <= tp
      if (!hit) break
      booked.push((tpIdx + 1) * [0.5, 0.3, 0.2][tpIdx])
      curStop = tpIdx === 0 ? entry : tps[tpIdx - 1]
      tpIdx++
    }
    if (tpIdx === 3) return booked.reduce((a, b) => a + b, 0)
  }
  const lastClose = sim[Math.min(sim.length, MAX_HOLD) - 1]?.close ?? entry
  booked.push(side === 'long' ? (lastClose - entry) / risk : (entry - lastClose) / risk)
  return booked.reduce((a, b) => a + b, 0)
}

function runPlanReplay(label: string, verdictAt: (i: number, visible: Candle[]) => Verdict, closed: Candle[], t: PlanTally) {
  let busyUntil = -1
  let cum = 0
  let peak = 0
  for (let i = 60; i < closed.length; i++) {
    if (i <= busyUntil) { t.skipped++; continue }
    if (i + MAX_HOLD > closed.length) break
    const visible = closed.slice(0, i + 1)
    const verdict = verdictAt(i, visible)
    const side = verdict === 'BUY' || verdict === 'STRONG_BUY' ? 'long' : verdict === 'SELL' || verdict === 'STRONG_SELL' ? 'short' : null
    if (!side) continue
    const ref = closed[i - 1].close
    const atrVal = atr(closed.slice(0, i), 14) ?? ref * 0.04
    const entry = ref - 0.1 * atrVal
    const risk = 1.5 * atrVal
    const stop = side === 'long' ? entry - risk : entry + risk
    const dir = side === 'long' ? 1 : -1
    const tps: [number, number, number] = [entry + dir * risk, entry + dir * 2 * risk, entry + dir * 3 * risk]
    const r = simulatePlan(side, entry, stop, tps, closed.slice(i, i + MAX_HOLD))
    t.trades++
    if (r > 0.05) t.wins++
    else if (r < -0.05) t.losses++
    t.totalR += r
    cum += r
    peak = Math.max(peak, cum)
    t.maxDDR = Math.min(t.maxDDR, cum - peak)
    busyUntil = i + MAX_HOLD - 1
  }
}

function planReport(t: PlanTally) {
  const wr = t.trades > 0 ? ((t.wins / t.trades) * 100).toFixed(0) : '—'
  console.log(
    `${t.label.padEnd(10)} trades:${String(t.trades).padStart(3)}  skipped:${String(t.skipped).padStart(3)}  ` +
    `W/L: ${t.wins}/${t.losses} (${wr}%)  totalR:${t.totalR >= 0 ? '+' : ''}${t.totalR.toFixed(1)}R  maxDD:${t.maxDDR.toFixed(1)}R`
  )
}

async function main() {
  const all = await getCandles('1d', 220)
  const closed = all.slice(0, -1) // no look-ahead
  const WARMUP = 60
  if (closed.length < WARMUP + 10) {
    console.log('insufficient candles:', closed.length)
    return
  }

  const v1 = tally('v1 (clone)')
  const v2 = tally('v2 (live)')
  const inv1 = tally('inverse v1')
  const flipLog: string[] = []

  // benchmarks
  const startPx = closed[WARMUP].close
  const endPx = closed[closed.length - 2].close
  const buyHold = ((endPx - startPx) / startPx) * 100
  let alwaysLong = 0
  for (let i = WARMUP; i < closed.length - 1; i++) {
    alwaysLong += ((closed[i + 1].close - closed[i].close) / closed[i].close) * 100
  }

  for (let i = WARMUP; i < closed.length - 1; i++) {
    const visible = closed.slice(0, i + 1) // engine sees candles ≤ i (last dropped)
    const next = closed[i + 1]
    const chg = ((next.close - closed[i].close) / closed[i].close) * 100

    const s1 = v1Score(visible)
    const verdict1 = v1Verdict(s1)
    score(v1, verdict1, chg)

    // inverse-v1 benchmark: fade every actionable v1 signal
    if (verdict1 === 'BUY' || verdict1 === 'STRONG_BUY') score(inv1, 'SELL', chg)
    else if (verdict1 === 'SELL' || verdict1 === 'STRONG_SELL') score(inv1, 'BUY', chg)
    else score(inv1, 'HOLD', chg)

    const tf = analyzeTimeframe('1d', visible)
    const atrVal = atr(closed.slice(0, i), 14)
    const vs = volatilityScale(atrVal != null && closed[i].close > 0 ? (atrVal / closed[i].close) * 100 : null)
    const verdict2 = verdictFromScore(tf.score, vs)
    score(v2, verdict2, chg)

    if (verdict1 !== verdict2) {
      flipLog.push(
        `${new Date(closed[i].time * 1000).toISOString().slice(0, 10)} ${verdict1.padEnd(10)}→${verdict2.padEnd(10)} ` +
        `s1:${s1.toFixed(0)} s2:${tf.score.toFixed(0)} adx:${adx(visible)?.adx?.toFixed(0) ?? '?'} next:${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%`
      )
    }
  }

  const from = new Date(closed[WARMUP].time * 1000).toISOString().slice(0, 10)
  const to = new Date(closed[closed.length - 2].time * 1000).toISOString().slice(0, 10)
  console.log(`\nWalk-forward ${from} → ${to} (${v1.days} scored days, real candles, no look-ahead)`)
  console.log(`BENCHMARKS      buy&hold: ${buyHold >= 0 ? '+' : ''}${buyHold.toFixed(1)}%   always-long: ${alwaysLong >= 0 ? '+' : ''}${alwaysLong.toFixed(1)}%`)
  console.log()
  report(v1)
  report(inv1)
  report(v2)

  // product-reality simulation: the SL/TP plan, not raw direction
  console.log('\n--- Plan-based replay (SL 1.5·ATR, TP ladder 1R/2R/3R, max hold 7d, one position) ---')
  const p1 = planTally('v1 (clone)')
  const p2 = planTally('v2 (live)')
  runPlanReplay('v1', (i, visible) => v1Verdict(v1Score(visible)), closed, p1)
  runPlanReplay(
    'v2',
    (i, visible) => {
      const tf = analyzeTimeframe('1d', visible)
      const atrVal = atr(closed.slice(0, i), 14)
      const vs = volatilityScale(atrVal != null && closed[i].close > 0 ? (atrVal / closed[i].close) * 100 : null)
      return verdictFromScore(tf.score, vs)
    },
    closed,
    p2,
  )
  planReport(p1)
  planReport(p2)

  console.log(`\nverdict flips (v1→v2): ${flipLog.length}`)
  for (const l of flipLog.slice(-25)) console.log(' ', l)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
