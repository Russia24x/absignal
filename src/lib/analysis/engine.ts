/**
 * The Analysis Engine — the heart of PenguSignal.
 *
 * Combines classic technical indicators into a weighted, multi-timeframe
 * composite score (-100..+100) that produces today's verdict:
 * STRONG_BUY / BUY / HOLD / SELL / STRONG_SELL, plus a risk-managed
 * trade plan (entry zone, stop-loss, take-profits) derived from ATR.
 *
 * Design goals:
 *  - Deterministic: same candles → same output (auditable & testable).
 *  - Modular: each indicator is a voter; weights live in INDICATOR_WEIGHTS.
 *  - No look-ahead: only closed candles are used (the last, in-progress
 *    candle is dropped before analysis).
 */

import {
  adx,
  atr,
  bollinger,
  ema,
  macd,
  obvSlope,
  roc,
  rsi,
  sma,
  stochastic,
  swingLevels,
} from '@/lib/analysis/indicators'
import { getCandles, getMarketOverview, type Candle, type Timeframe } from '@/lib/market/geckoterminal'

export type Verdict = 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL'

export type IndicatorVote = 'bullish' | 'bearish' | 'neutral'

export interface IndicatorDetail {
  key: string
  vote: IndicatorVote
  /** Contribution to the timeframe score (-weight..+weight). */
  contribution: number
  value: number | null
  display: string
}

export interface TimeframeAnalysis {
  timeframe: Timeframe
  /** Score in -100..100. */
  score: number
  indicators: IndicatorDetail[]
  trendStrength: number | null // ADX
  note: string
}

export interface TradePlan {
  side: 'long' | 'short' | 'none'
  entryLow: number
  entryHigh: number
  stopLoss: number
  takeProfits: number[]
  riskReward: number
  invalidation: string
}

export interface AnalysisResult {
  date: string // yyyy-mm-dd (UTC)
  generatedAt: number
  priceUsd: number
  verdict: Verdict
  /** Composite multi-timeframe score, -100..100. */
  score: number
  /** 0..100 — agreement between indicators × trend strength. */
  confidence: number
  timeframes: TimeframeAnalysis[]
  plan: TradePlan
  supports: number[]
  resistances: number[]
  atrPercent: number | null
  summary: Record<'en' | 'fa', string>
}

/** Per-indicator weights inside a single timeframe (sum = 1). */
const INDICATOR_WEIGHTS = {
  emaCross: 0.18,
  ema200: 0.14,
  rsi: 0.14,
  macd: 0.16,
  bollinger: 0.1,
  stochastic: 0.1,
  obv: 0.09,
  roc: 0.09,
} as const

/** Multi-timeframe weights (sum = 1). Higher TF = more decisive. */
const TIMEFRAME_WEIGHTS: Record<Timeframe, number> = {
  '1d': 0.4,
  '4h': 0.3,
  '1h': 0.2,
  '15m': 0.1,
}

export const VERDICT_THRESHOLDS = { strongBuy: 40, buy: 15, sell: -15, strongSell: -40 } as const

export function verdictFromScore(score: number): Verdict {
  if (score >= VERDICT_THRESHOLDS.strongBuy) return 'STRONG_BUY'
  if (score >= VERDICT_THRESHOLDS.buy) return 'BUY'
  if (score <= VERDICT_THRESHOLDS.strongSell) return 'STRONG_SELL'
  if (score <= VERDICT_THRESHOLDS.sell) return 'SELL'
  return 'HOLD'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Analyze one timeframe: drop the in-progress candle, vote, and score. */
export function analyzeTimeframe(tf: Timeframe, allCandles: Candle[]): TimeframeAnalysis {
  // Drop the last candle — it is still forming.
  const candles = allCandles.slice(0, -1)
  const closes = candles.map((c) => c.close)
  const price = closes[closes.length - 1] ?? 0
  const indicators: IndicatorDetail[] = []

  const push = (
    key: string,
    vote: IndicatorVote,
    weight: number,
    strength: number,
    value: number | null,
    display: string
  ) => {
    const contribution = vote === 'bullish' ? weight * strength : vote === 'bearish' ? -weight * strength : 0
    indicators.push({ key, vote, contribution, value, display })
  }

  // --- 1) EMA 20/50 cross state ---
  const ema20 = ema(closes, 20)
  const ema50 = ema(closes, 50)
  if (ema20 != null && ema50 != null && ema50 !== 0) {
    const dist = ((ema20 - ema50) / ema50) * 100
    const strength = clamp(Math.abs(dist) / 2, 0.25, 1)
    const vote: IndicatorVote = dist > 0.05 ? 'bullish' : dist < -0.05 ? 'bearish' : 'neutral'
    push('emaCross', vote, INDICATOR_WEIGHTS.emaCross, strength, dist, `EMA20 ${dist >= 0 ? '▲' : '▼'} ${Math.abs(dist).toFixed(2)}% vs EMA50`)
  } else {
    push('emaCross', 'neutral', INDICATOR_WEIGHTS.emaCross, 0, null, 'insufficient data')
  }

  // --- 2) Price vs EMA 200 (long-term trend) ---
  const ema200 = ema(closes, 200) ?? sma(closes, Math.min(closes.length, 100))
  if (ema200 != null && ema200 !== 0 && price > 0) {
    const dist = ((price - ema200) / ema200) * 100
    const strength = clamp(Math.abs(dist) / 5, 0.25, 1)
    const vote: IndicatorVote = dist > 0.1 ? 'bullish' : dist < -0.1 ? 'bearish' : 'neutral'
    push('ema200', vote, INDICATOR_WEIGHTS.ema200, strength, dist, `Price ${dist >= 0 ? 'above' : 'below'} EMA200 (${dist >= 0 ? '+' : ''}${dist.toFixed(2)}%)`)
  } else {
    push('ema200', 'neutral', INDICATOR_WEIGHTS.ema200, 0, null, 'insufficient data')
  }

  // --- 3) RSI (14) zones ---
  const rsiVal = rsi(closes, 14)
  if (rsiVal != null) {
    let vote: IndicatorVote = 'neutral'
    let strength = 0.3
    if (rsiVal >= 70) { vote = 'bearish'; strength = clamp((rsiVal - 70) / 15, 0.4, 1) }
    else if (rsiVal <= 30) { vote = 'bullish'; strength = clamp((30 - rsiVal) / 15, 0.4, 1) }
    else if (rsiVal > 55) { vote = 'bullish'; strength = clamp((rsiVal - 55) / 15, 0.2, 0.7) }
    else if (rsiVal < 45) { vote = 'bearish'; strength = clamp((45 - rsiVal) / 15, 0.2, 0.7) }
    push('rsi', vote, INDICATOR_WEIGHTS.rsi, strength, rsiVal, `RSI(14) = ${rsiVal.toFixed(1)}`)
  } else {
    push('rsi', 'neutral', INDICATOR_WEIGHTS.rsi, 0, null, 'insufficient data')
  }

  // --- 4) MACD histogram ---
  const macdRes = macd(closes)
  if (macdRes) {
    const norm = closes[closes.length - 1] !== 0 ? macdRes.histogram / closes[closes.length - 1] * 1000 : 0
    const strength = clamp(Math.abs(norm) / 1.5, 0.25, 1)
    const vote: IndicatorVote = macdRes.histogram > 0 ? 'bullish' : macdRes.histogram < 0 ? 'bearish' : 'neutral'
    push('macd', vote, INDICATOR_WEIGHTS.macd, strength, macdRes.histogram, `MACD hist ${macdRes.histogram >= 0 ? '+' : ''}${macdRes.histogram.toExponential(2)}`)
  } else {
    push('macd', 'neutral', INDICATOR_WEIGHTS.macd, 0, null, 'insufficient data')
  }

  // --- 5) Bollinger %B ---
  const bb = bollinger(closes, 20, 2)
  if (bb) {
    const pb = bb.percentB
    let vote: IndicatorVote = 'neutral'
    let strength = 0.3
    if (pb > 1) { vote = 'bearish'; strength = 0.8 } // above upper band → stretched
    else if (pb < 0) { vote = 'bullish'; strength = 0.8 }
    else if (pb > 0.6) { vote = 'bullish'; strength = clamp((pb - 0.6) / 0.4, 0.2, 0.8) }
    else if (pb < 0.4) { vote = 'bearish'; strength = clamp((0.4 - pb) / 0.4, 0.2, 0.8) }
    push('bollinger', vote, INDICATOR_WEIGHTS.bollinger, strength, pb, `%B = ${(pb * 100).toFixed(0)}%`)
  } else {
    push('bollinger', 'neutral', INDICATOR_WEIGHTS.bollinger, 0, null, 'insufficient data')
  }

  // --- 6) Stochastic ---
  const stoch = stochastic(candles)
  if (stoch) {
    let vote: IndicatorVote = 'neutral'
    let strength = 0.3
    if (stoch.k >= 80) { vote = 'bearish'; strength = clamp((stoch.k - 80) / 15, 0.4, 1) }
    else if (stoch.k <= 20) { vote = 'bullish'; strength = clamp((20 - stoch.k) / 15, 0.4, 1) }
    else if (stoch.k > stoch.d && stoch.k > 50) { vote = 'bullish'; strength = 0.4 }
    else if (stoch.k < stoch.d && stoch.k < 50) { vote = 'bearish'; strength = 0.4 }
    push('stochastic', vote, INDICATOR_WEIGHTS.stochastic, strength, stoch.k, `Stoch %K=${stoch.k.toFixed(0)} %D=${stoch.d.toFixed(0)}`)
  } else {
    push('stochastic', 'neutral', INDICATOR_WEIGHTS.stochastic, 0, null, 'insufficient data')
  }

  // --- 7) OBV slope (volume-confirmed trend) ---
  const obv = obvSlope(candles, 20)
  if (obv != null) {
    const strength = clamp(Math.abs(obv) / 0.6, 0.25, 1)
    const vote: IndicatorVote = obv > 0.02 ? 'bullish' : obv < -0.02 ? 'bearish' : 'neutral'
    push('obv', vote, INDICATOR_WEIGHTS.obv, strength, obv, `OBV slope ${obv >= 0 ? '+' : ''}${obv.toFixed(2)} (vol-weighted)`)
  } else {
    push('obv', 'neutral', INDICATOR_WEIGHTS.obv, 0, null, 'insufficient data')
  }

  // --- 8) ROC momentum ---
  const rocVal = roc(closes, 10)
  if (rocVal != null) {
    const strength = clamp(Math.abs(rocVal) / 4, 0.25, 1)
    const vote: IndicatorVote = rocVal > 0.1 ? 'bullish' : rocVal < -0.1 ? 'bearish' : 'neutral'
    push('roc', vote, INDICATOR_WEIGHTS.roc, strength, rocVal, `ROC(10) = ${rocVal >= 0 ? '+' : ''}${rocVal.toFixed(2)}%`)
  } else {
    push('roc', 'neutral', INDICATOR_WEIGHTS.roc, 0, null, 'insufficient data')
  }

  const score = clamp(indicators.reduce((a, i) => a + i.contribution, 0) * 100, -100, 100)
  const trendStrength = adx(candles, 14)?.adx ?? null

  const bullish = indicators.filter((i) => i.vote === 'bullish').length
  const bearish = indicators.filter((i) => i.vote === 'bearish').length
  const note = `${bullish}▲ / ${indicators.filter((i) => i.vote === 'neutral').length}= / ${bearish}▼`

  return { timeframe: tf, score, indicators, trendStrength, note }
}

/** Build the risk-managed trade plan from the daily ATR. */
function buildPlan(verdict: Verdict, price: number, atrValue: number | null): TradePlan {
  const a = atrValue ?? price * 0.04
  if (verdict === 'BUY' || verdict === 'STRONG_BUY') {
    const entryLow = price - 0.3 * a
    const entryHigh = price + 0.1 * a
    const entry = (entryLow + entryHigh) / 2
    const sl = entry - 1.5 * a
    const risk = entry - sl
    return {
      side: 'long',
      entryLow,
      entryHigh,
      stopLoss: sl,
      takeProfits: [entry + risk, entry + 2 * risk, entry + 3 * risk],
      riskReward: risk > 0 ? (entry + 2 * risk - entry) / risk : 0,
      invalidation: 'Close below stop-loss on the daily candle invalidates the long idea.',
    }
  }
  if (verdict === 'SELL' || verdict === 'STRONG_SELL') {
    const entryLow = price - 0.1 * a
    const entryHigh = price + 0.3 * a
    const entry = (entryLow + entryHigh) / 2
    const sl = entry + 1.5 * a
    const risk = sl - entry
    return {
      side: 'short',
      entryLow,
      entryHigh,
      stopLoss: sl,
      takeProfits: [entry - risk, entry - 2 * risk, entry - 3 * risk],
      riskReward: risk > 0 ? (entry - (entry - 2 * risk)) / risk : 0,
      invalidation: 'Close above stop-loss on the daily candle invalidates the short idea.',
    }
  }
  return {
    side: 'none',
    entryLow: 0,
    entryHigh: 0,
    stopLoss: 0,
    takeProfits: [],
    riskReward: 0,
    invalidation: 'No active plan while the market is ranging — wait for a breakout of the marked levels.',
  }
}

function buildSummary(verdict: Verdict, score: number, confidence: number, price: number) {
  const pct = Math.abs(score).toFixed(0)
  const conf = confidence.toFixed(0)
  const p = price.toFixed(5)
  const en =
    verdict === 'STRONG_BUY'
      ? `PENGU shows strong bullish confluence today (composite +${pct}, confidence ${conf}%). Bias: buy dips toward the entry zone with the posted stop-loss. Price: $${p}.`
      : verdict === 'BUY'
        ? `PENGU is leaning bullish today (composite +${pct}, confidence ${conf}%). Accumulate cautiously inside the entry zone and respect the stop. Price: $${p}.`
        : verdict === 'SELL'
          ? `PENGU is leaning bearish today (composite ${pct}, confidence ${conf}%). Scale out / reduce longs; shorts may target the posted levels. Price: $${p}.`
          : verdict === 'STRONG_SELL'
            ? `PENGU shows strong bearish confluence today (composite ${pct}, confidence ${conf}%). Bias: sell rallies toward the entry zone with the posted stop-loss. Price: $${p}.`
            : `PENGU is range-bound today (composite ${pct}, confidence ${conf}%). No edge — sit on your flippers and wait for a decisive break of support/resistance. Price: $${p}.`
  const fa =
    verdict === 'STRONG_BUY'
      ? `پنگو امروز همگرایی صعودی قوی نشان می‌دهد (امتیاز مرکب +${pct}، اطمینان ${conf}%). تمایل: خرید در پولبک به محدوده ورود با حد ضرر اعلام‌شده. قیمت: $${p}.`
      : verdict === 'BUY'
        ? `پنگو امروز متمایل به صعود است (امتیاز مرکب +${pct}، اطمینان ${conf}%). محتاطانه در محدوده ورود خرید کنید و حد ضرر را رعایت کنید. قیمت: $${p}.`
        : verdict === 'SELL'
          ? `پنگو امروز متمایل به نزول است (امتیاز ${pct}، اطمینان ${conf}%). بهتر است موقعیت‌های خرید را کاهش دهید؛ فروش در سقف‌های کوچک قابل بررسی است. قیمت: $${p}.`
          : verdict === 'STRONG_SELL'
            ? `پنگو امروز همگرایی نزولی قوی نشان می‌دهد (امتیاز ${pct}، اطمینان ${conf}%). تمایل: فروش در رالی‌ها به محدوده ورود با حد ضرر اعلام‌شده. قیمت: $${p}.`
            : `پنگو امروز در محدوده رنج است (امتیاز ${pct}، اطمینان ${conf}%). لبه‌ای وجود ندارد — صبر کنید تا حمایت/مقاومت به‌طور قاطع بشکند. قیمت: $${p}.`
  return { en, fa }
}

/**
 * Run the full multi-timeframe analysis.
 * Candles are fetched in parallel; a failing timeframe degrades gracefully.
 */
export async function runAnalysis(): Promise<AnalysisResult> {
  const [overview, candles15m, candles1h, candles4h, candles1d] = await Promise.all([
    getMarketOverview(),
    getCandles('15m', 220).catch(() => [] as Candle[]),
    getCandles('1h', 250).catch(() => [] as Candle[]),
    getCandles('4h', 250).catch(() => [] as Candle[]),
    getCandles('1d', 220).catch(() => [] as Candle[]),
  ])

  const tfData: Array<[Timeframe, Candle[]]> = [
    ['1d', candles1d],
    ['4h', candles4h],
    ['1h', candles1h],
    ['15m', candles15m],
  ]

  const timeframes: TimeframeAnalysis[] = tfData
    .filter(([, candles]) => candles.length >= 40)
    .map(([tf, candles]) => analyzeTimeframe(tf, candles))

  // Weighted composite. If a timeframe is missing, renormalize weights.
  let totalWeight = 0
  let weighted = 0
  for (const tf of timeframes) {
    const w = TIMEFRAME_WEIGHTS[tf.timeframe]
    weighted += tf.score * w
    totalWeight += w
  }
  const score = totalWeight > 0 ? clamp(weighted / totalWeight, -100, 100) : 0
  const verdict = verdictFromScore(score)

  // Confidence: indicator agreement × trend strength.
  const main = timeframes[0]
  let agreement = 0.5
  if (main && main.indicators.length) {
    const dir = Math.sign(score) || 1
    const agreeing = main.indicators.filter(
      (i) => (dir > 0 ? i.vote === 'bullish' : i.vote === 'bearish')
    ).length
    agreement = agreeing / main.indicators.length
  }
  const adxVal = main?.trendStrength ?? null
  const trendFactor = adxVal != null ? clamp(adxVal / 40, 0.4, 1) : 0.6
  const confidence = clamp(agreement * trendFactor * 100, 5, 95)

  const price = overview.priceUsd
  const dailyCandles = candles1d.length ? candles1d : candles4h.length ? candles4h : []
  const atrValue = dailyCandles.length ? atr(dailyCandles.slice(0, -1), 14) : null
  const levels = swingLevels(dailyCandles.length ? dailyCandles.slice(0, -1) : [], 60, 3)

  const date = new Date().toISOString().slice(0, 10)
  const result: AnalysisResult = {
    date,
    generatedAt: Date.now(),
    priceUsd: price,
    verdict,
    score,
    confidence,
    timeframes,
    plan: buildPlan(verdict, price, atrValue),
    supports: levels.supports,
    resistances: levels.resistances,
    atrPercent: atrValue != null && price > 0 ? (atrValue / price) * 100 : null,
    summary: buildSummary(verdict, score, confidence, price),
  }
  return result
}
