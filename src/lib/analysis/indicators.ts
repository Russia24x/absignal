/**
 * Pure-TypeScript technical indicators.
 *
 * Every function is deterministic and side-effect free, computed from
 * OHLCV candles. Implementations follow classic definitions
 * (Wilder smoothing for RSI/ATR/ADX, standard EMA/MACD/Bollinger).
 */

import type { Candle } from '@/lib/market/geckoterminal'

/* ------------------------------ Moving averages ------------------------------ */

/** Simple Moving Average over the last `period` values. */
export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null
  const slice = values.slice(-period)
  return slice.reduce((a, b) => a + b, 0) / period
}

/** Exponential Moving Average series (seeded with the first value). */
export function emaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return []
  const k = 2 / (period + 1)
  const out: number[] = [values[0]]
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k))
  }
  return out
}

export function ema(values: number[], period: number): number | null {
  const series = emaSeries(values, period)
  return series.length ? series[series.length - 1] : null
}

/* ------------------------------ RSI (Wilder) ------------------------------ */

export function rsiSeries(closes: number[], period = 14): number[] {
  if (closes.length < period + 1) return []
  const out: number[] = []
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff >= 0) gain += diff
    else loss -= diff
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss))
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    const g = diff > 0 ? diff : 0
    const l = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
    out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss))
  }
  return out
}

export function rsi(closes: number[], period = 14): number | null {
  const series = rsiSeries(closes, period)
  return series.length ? series[series.length - 1] : null
}

/* ------------------------------ MACD ------------------------------ */

export interface MacdResult {
  macd: number
  signal: number
  histogram: number
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult | null {
  if (closes.length < slow + signalPeriod) return null
  const fastEma = emaSeries(closes, fast)
  const slowEma = emaSeries(closes, slow)
  const macdLine = closes.map((_, i) => fastEma[i] - slowEma[i])
  const signalLine = emaSeries(macdLine.slice(slow - 1), signalPeriod)
  const macdVal = macdLine[macdLine.length - 1]
  const signalVal = signalLine[signalLine.length - 1]
  return { macd: macdVal, signal: signalVal, histogram: macdVal - signalVal }
}

/* ------------------------------ Bollinger Bands ------------------------------ */

export interface BollingerResult {
  middle: number
  upper: number
  lower: number
  /** %B — position of the price inside the bands (0 = lower, 1 = upper). */
  percentB: number
  /** Bandwidth in % of the middle band. */
  bandwidth: number
}

export function bollinger(closes: number[], period = 20, mult = 2): BollingerResult | null {
  if (closes.length < period) return null
  const slice = closes.slice(-period)
  const mean = slice.reduce((a, b) => a + b, 0) / period
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period
  const sd = Math.sqrt(variance)
  const upper = mean + mult * sd
  const lower = mean - mult * sd
  const price = closes[closes.length - 1]
  const width = upper - lower
  return {
    middle: mean,
    upper,
    lower,
    percentB: width === 0 ? 0.5 : (price - lower) / width,
    bandwidth: mean === 0 ? 0 : (width / mean) * 100,
  }
}

/* ------------------------------ Stochastic ------------------------------ */

export interface StochResult {
  k: number
  d: number
}

export function stochastic(candles: Candle[], period = 14, smoothK = 3, smoothD = 3): StochResult | null {
  if (candles.length < period + smoothK + smoothD) return null
  const rawK: number[] = []
  for (let i = period - 1; i < candles.length; i++) {
    const window = candles.slice(i - period + 1, i + 1)
    const hh = Math.max(...window.map((c) => c.high))
    const ll = Math.min(...window.map((c) => c.low))
    const close = candles[i].close
    rawK.push(hh === ll ? 50 : ((close - ll) / (hh - ll)) * 100)
  }
  const kVals: number[] = []
  for (let i = smoothK - 1; i < rawK.length; i++) {
    kVals.push(rawK.slice(i - smoothK + 1, i + 1).reduce((a, b) => a + b, 0) / smoothK)
  }
  const dVals: number[] = []
  for (let i = smoothD - 1; i < kVals.length; i++) {
    dVals.push(kVals.slice(i - smoothD + 1, i + 1).reduce((a, b) => a + b, 0) / smoothD)
  }
  return { k: kVals[kVals.length - 1], d: dVals[dVals.length - 1] }
}

/* ------------------------------ ATR (Wilder) ------------------------------ */

export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null
  const trs: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]
    const prev = candles[i - 1]
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)))
  }
  let value = trs.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < trs.length; i++) {
    value = (value * (period - 1) + trs[i]) / period
  }
  return value
}

/* ------------------------------ ADX / DI ------------------------------ */

export interface AdxResult {
  adx: number
  plusDi: number
  minusDi: number
}

export function adx(candles: Candle[], period = 14): AdxResult | null {
  if (candles.length < period * 2 + 1) return null
  const plusDm: number[] = []
  const minusDm: number[] = []
  const trs: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]
    const p = candles[i - 1]
    const up = c.high - p.high
    const down = p.low - c.low
    plusDm.push(up > down && up > 0 ? up : 0)
    minusDm.push(down > up && down > 0 ? down : 0)
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)))
  }
  const wilder = (arr: number[]): number => {
    let sum = arr.slice(0, period).reduce((a, b) => a + b, 0)
    for (let i = period; i < arr.length; i++) sum = sum - sum / period + arr[i]
    return sum
  }
  const trS = wilder(trs)
  const plusS = wilder(plusDm)
  const minusS = wilder(minusDm)
  const plusDi = trS === 0 ? 0 : (100 * plusS) / trS
  const minusDi = trS === 0 ? 0 : (100 * minusS) / trS
  const dx = plusDi + minusDi === 0 ? 0 : (100 * Math.abs(plusDi - minusDi)) / (plusDi + minusDi)
  // Smoothed DX (single pass approximation is fine for trend strength).
  const dxs: number[] = []
  for (let i = period; i < candles.length - 1; i++) {
    const sub = candles.slice(i - period + 1, i + 1)
    const subAdx = adxDx(sub, period)
    if (subAdx != null) dxs.push(subAdx)
  }
  const adxVal = dxs.length ? dxs.reduce((a, b) => a + b, 0) / dxs.length : dx
  return { adx: adxVal, plusDi, minusDi }
}

function adxDx(candles: Candle[], period: number): number | null {
  if (candles.length < period + 1) return null
  let plus = 0
  let minus = 0
  let tr = 0
  for (let i = 1; i <= period; i++) {
    const c = candles[i]
    const p = candles[i - 1]
    const up = c.high - p.high
    const down = p.low - c.low
    if (up > down && up > 0) plus += up
    if (down > up && down > 0) minus += down
    tr += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close))
  }
  if (tr === 0) return null
  const pdi = (100 * plus) / tr
  const mdi = (100 * minus) / tr
  if (pdi + mdi === 0) return 0
  return (100 * Math.abs(pdi - mdi)) / (pdi + mdi)
}

/* ------------------------------ OBV ------------------------------ */

export function obvSeries(candles: Candle[]): number[] {
  let running = 0
  const out: number[] = [0]
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) running += candles[i].volume
    else if (candles[i].close < candles[i - 1].close) running -= candles[i].volume
    out.push(running)
  }
  return out
}

/** OBV slope normalized by average volume over the window. */
export function obvSlope(candles: Candle[], window = 20): number | null {
  if (candles.length < window + 2) return null
  const series = obvSeries(candles)
  const recent = series.slice(-window)
  const avgVolume =
    candles.slice(-window).reduce((a, c) => a + c.volume, 0) / Math.max(window, 1)
  if (avgVolume === 0) return null
  // Linear regression slope over the recent OBV window.
  const n = recent.length
  const xMean = (n - 1) / 2
  const yMean = recent.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (recent[i] - yMean)
    den += (i - xMean) ** 2
  }
  if (den === 0) return null
  return num / den / avgVolume
}

/* ------------------------------ ROC (momentum) ------------------------------ */

export function roc(closes: number[], period = 10): number | null {
  if (closes.length < period + 1) return null
  const past = closes[closes.length - 1 - period]
  if (past === 0) return null
  return ((closes[closes.length - 1] - past) / past) * 100
}

/* ------------------------------ Swing levels ------------------------------ */

export interface SwingLevels {
  supports: number[]
  resistances: number[]
}

/** Detect nearby support/resistance from swing highs/lows (fractal method). */
export function swingLevels(candles: Candle[], lookback = 60, strength = 3): SwingLevels {
  const window = candles.slice(-lookback)
  const highs: number[] = []
  const lows: number[] = []
  for (let i = strength; i < window.length - strength; i++) {
    const sliceH = window.slice(i - strength, i + strength + 1).map((c) => c.high)
    const sliceL = window.slice(i - strength, i + strength + 1).map((c) => c.low)
    if (window[i].high === Math.max(...sliceH)) highs.push(window[i].high)
    if (window[i].low === Math.min(...sliceL)) lows.push(window[i].low)
  }
  const price = window[window.length - 1]?.close ?? 0
  return {
    supports: lows.filter((l) => l < price).sort((a, b) => b - a).slice(0, 3),
    resistances: highs.filter((h) => h > price).sort((a, b) => a - b).slice(0, 3),
  }
}
