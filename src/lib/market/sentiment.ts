/**
 * PENGU Market Sentiment Index — a composite 0-100 gauge computed from REAL
 * market components (no external sentiment API, no hardcoded values):
 *
 *   • Trend      — price position vs EMA20/EMA50 (1h closes)   (weight .25)
 *   • RSI(14)    — classic oscillator on 1h closes             (weight .20)
 *   • Flow       — buy share of 24h DEX transactions           (weight .15)
 *   • Momentum   — 24h price change                            (weight .15)
 *   • MACD       — histogram direction/magnitude (1h)          (weight .15)
 *   • Volatility — ATR% (1h), inverse contributor              (weight .10)
 *
 * When a component is unavailable its weight is re-normalized across the
 * remaining ones, so the index degrades gracefully without inventing data.
 */

import { rsi, ema, macd, atr } from '@/lib/analysis/indicators'
import { getCandlesWithMeta, getMarketOverviewWithMeta, type Candle } from '@/lib/market/geckoterminal'

export type SentimentZone = 'extremeFear' | 'fear' | 'neutral' | 'greed' | 'extremeGreed'

export interface SentimentComponent {
  key: 'trend' | 'rsi' | 'flow' | 'momentum' | 'macd' | 'volatility'
  /** 0-100 normalized component score */
  score: number
  /** Human-readable raw reading, e.g. "RSI 61.3" (language-neutral) */
  detail: string
}

export interface SentimentResult {
  score: number
  zone: SentimentZone
  /** Score change vs the same index computed 24h of candles ago */
  delta: number | null
  components: SentimentComponent[]
  stale: boolean
  updatedAt: number
}

const WEIGHTS: Record<SentimentComponent['key'], number> = {
  trend: 0.25,
  rsi: 0.2,
  flow: 0.15,
  momentum: 0.15,
  macd: 0.15,
  volatility: 0.1,
}

const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v))

export function zoneForScore(score: number): SentimentZone {
  if (score < 25) return 'extremeFear'
  if (score < 45) return 'fear'
  if (score <= 55) return 'neutral'
  if (score <= 75) return 'greed'
  return 'extremeGreed'
}

/* --------------------------- component scorers ---------------------------- */

function scoreTrend(candles: Candle[]): SentimentComponent | null {
  const closes = candles.map((c) => c.close)
  const price = closes[closes.length - 1]
  const e20 = ema(closes, 20)
  const e50 = ema(closes, 50)
  if (!price || e20 == null || e50 == null) return null
  // Relative distance of price from each EMA; ±2% maps to ±50 points.
  const d20 = ((price - e20) / e20) * 100
  const d50 = ((price - e50) / e50) * 100
  const score = clamp((clamp(50 + d20 * 25) + clamp(50 + d50 * 25)) / 2)
  return {
    key: 'trend',
    score,
    detail: `EMA20 ${d20 >= 0 ? '+' : ''}${d20.toFixed(2)}% · EMA50 ${d50 >= 0 ? '+' : ''}${d50.toFixed(2)}%`,
  }
}

function scoreRsi(candles: Candle[]): SentimentComponent | null {
  const closes = candles.map((c) => c.close)
  const value = rsi(closes, 14)
  if (value == null) return null
  return { key: 'rsi', score: clamp(value), detail: `RSI ${value.toFixed(1)}` }
}

function scoreMacd(candles: Candle[]): SentimentComponent | null {
  const closes = candles.map((c) => c.close)
  const price = closes[closes.length - 1]
  const result = macd(closes)
  if (!result || !price) return null
  const histPct = (result.histogram / price) * 100 // histogram as % of price
  const score = clamp(50 + histPct * 1000)
  return {
    key: 'macd',
    score,
    detail: `MACD ${histPct >= 0 ? '+' : ''}${histPct.toFixed(3)}%`,
  }
}

function scoreVolatility(candles: Candle[]): SentimentComponent | null {
  const price = candles[candles.length - 1]?.close
  const value = atr(candles, 14)
  if (!price || value == null) return null
  const atrPct = (value / price) * 100
  // Calm market (ATR ≤ 0.3%/h) → 65; wild market (≥ 3%/h) → 15.
  const score = clamp(65 - ((atrPct - 0.3) / 2.7) * 50, 5, 85)
  return { key: 'volatility', score, detail: `ATR ${atrPct.toFixed(2)}%/h` }
}

function scoreFlow(buys: number | null, sells: number | null): SentimentComponent | null {
  if (buys == null || sells == null || buys + sells <= 0) return null
  const ratio = buys / (buys + sells)
  // Typical DEX buy share is ~0.45-0.55; map 0.40 → 0, 0.60 → 100.
  const score = clamp(((ratio - 0.4) / 0.2) * 100)
  return { key: 'flow', score, detail: `${(ratio * 100).toFixed(1)}% buys` }
}

function scoreMomentum(change24h: number | null): SentimentComponent | null {
  if (change24h == null) return null
  // ±20% daily move maps to ±50 points.
  const score = clamp(50 + change24h * 2.5)
  return { key: 'momentum', score, detail: `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}% 24h` }
}

function weightedScore(components: SentimentComponent[]): number | null {
  if (components.length === 0) return null
  let sum = 0
  let weight = 0
  for (const c of components) {
    const w = WEIGHTS[c.key]
    sum += c.score * w
    weight += w
  }
  return weight > 0 ? sum / weight : null
}

/* ------------------------------ public entry ------------------------------- */

export async function getSentiment(): Promise<SentimentResult> {
  const [candlesRes, overviewRes] = await Promise.all([
    getCandlesWithMeta('1h', 120),
    getMarketOverviewWithMeta().catch(() => null),
  ])

  const candles = candlesRes.candles
  const stale = candlesRes.stale || (overviewRes?.stale ?? false)

  const nowComponents: SentimentComponent[] = []
  const trend = scoreTrend(candles)
  const rsiC = scoreRsi(candles)
  const macdC = scoreMacd(candles)
  const volC = scoreVolatility(candles)
  if (trend) nowComponents.push(trend)
  if (rsiC) nowComponents.push(rsiC)
  if (macdC) nowComponents.push(macdC)
  if (volC) nowComponents.push(volC)

  const flow = overviewRes ? scoreFlow(overviewRes.buys24h, overviewRes.sells24h) : null
  const momentum = overviewRes ? scoreMomentum(overviewRes.priceChange24h) : null
  if (flow) nowComponents.push(flow)
  if (momentum) nowComponents.push(momentum)

  const score = weightedScore(nowComponents)
  if (score == null) throw new Error('not enough market data for sentiment')

  // 24h delta from the candle-only components (flow/momentum have no history).
  const past = candles.slice(0, Math.max(0, candles.length - 24))
  const pastComponents: SentimentComponent[] = []
  const pastTrend = scoreTrend(past)
  const pastRsi = scoreRsi(past)
  const pastMacd = scoreMacd(past)
  const pastVol = scoreVolatility(past)
  if (pastTrend) pastComponents.push(pastTrend)
  if (pastRsi) pastComponents.push(pastRsi)
  if (pastMacd) pastComponents.push(pastMacd)
  if (pastVol) pastComponents.push(pastVol)
  const pastScore = weightedScore(pastComponents)

  // Order components by weight for display.
  const ordered = [...nowComponents].sort(
    (a, b) => WEIGHTS[b.key] - WEIGHTS[a.key]
  )

  return {
    score: Math.round(score),
    zone: zoneForScore(score),
    delta: pastScore != null ? Math.round(score - pastScore) : null,
    components: ordered,
    stale,
    updatedAt: Date.now(),
  }
}
