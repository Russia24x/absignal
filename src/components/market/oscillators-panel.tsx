'use client'

/**
 * OscillatorsPanel — RSI(14) + MACD(12/26/9) subpanels below the main chart.
 * Free preview of the technical depth behind the daily verdict. Shares the
 * same timeframe selection as the parent PriceChart via the `tf` prop.
 *
 * Uses lightweight-charts v5 (one chart per panel — 2 small canvases).
 * Hidden 30/70 reference lines on RSI; histogram coloring for MACD.
 */

import { useEffect, useMemo, useRef } from 'react'
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  LineSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Activity, BarChart3 } from 'lucide-react'
import { useI18n } from '@/lib/i18n/context'
import { useCandles } from '@/hooks/use-app-data'
import { cn } from '@/lib/utils'

/* ----------------------------- math primitives ---------------------------- */

/** Wilder's RSI (period default 14). Returns one value per input (undefined
 *  during warmup of length `period`). */
function rsiWilder(closes: number[], period = 14): Array<number | undefined> {
  if (closes.length < period + 1) return closes.map(() => undefined)
  const out: Array<number | undefined> = []
  // First `period` values have no RSI (warmup)
  for (let i = 0; i < period; i++) out.push(undefined)

  let gainSum = 0
  let lossSum = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff >= 0) gainSum += diff
    else lossSum += -diff
  }
  let avgGain = gainSum / period
  let avgLoss = lossSum / period
  out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss))

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss))
  }
  return out
}

/** EMA over an array (seeds with SMA of first `period` values). */
function emaArr(values: number[], period: number): Array<number | undefined> {
  const out: Array<number | undefined> = []
  const k = 2 / (period + 1)
  let prev: number | undefined
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(undefined)
      continue
    }
    if (prev == null) {
      let sum = 0
      for (let j = 0; j < period; j++) sum += values[j]
      prev = sum / period
    } else {
      prev = values[i] * k + prev * (1 - k)
    }
    out.push(prev)
  }
  return out
}

/** MACD(12,26,9) → { macd, signal, histogram } one value per input. */
function macd(closes: number[]) {
  const ema12 = emaArr(closes, 12)
  const ema26 = emaArr(closes, 26)
  const macdLine = closes.map((_, i) =>
    ema12[i] != null && ema26[i] != null ? (ema12[i] as number) - (ema26[i] as number) : undefined
  )
  // Signal = EMA(9) of MACD line (only defined where macdLine is defined)
  const definedMacd = macdLine.map((v) => v ?? 0)
  const signal = emaArr(definedMacd, 9).map((v, i) => (macdLine[i] == null ? undefined : v))
  const histogram = closes.map((_, i) =>
    macdLine[i] != null && signal[i] != null ? (macdLine[i] as number) - (signal[i] as number) : undefined
  )
  return { macdLine, signal, histogram }
}

/* --------------------------- UI helper component -------------------------- */

type UTCTimestamp = import('lightweight-charts').UTCTimestamp
type LineData = { time: UTCTimestamp; value: number }
type HistData = { time: UTCTimestamp; value: number; color: string }

/** A single small chart panel — title, latest-value badge, chart canvas. */
function MiniChartPanel({
  title,
  icon,
  latestLabel,
  latestValue,
  latestState,
  children,
  legend,
}: {
  title: string
  icon: React.ReactNode
  latestLabel: string
  latestValue: string | null
  latestState: 'bull' | 'bear' | 'neutral' | null
  children: React.ReactNode
  legend?: React.ReactNode
}) {
  const stateClass = {
    bull: 'text-bull bg-bull/10 border-bull/30',
    bear: 'text-bear bg-bear/10 border-bear/30',
    neutral: 'text-muted-foreground bg-secondary/60 border-border/40',
  }
  return (
    <div className="rounded-xl bg-secondary/30 border border-border/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            {icon}
          </span>
          <span className="text-xs font-bold tracking-wide">{title}</span>
        </div>
        {latestValue != null && (
          <Badge
            variant="outline"
            className={cn(
              'text-[11px] font-mono font-bold border',
              stateClass[latestState ?? 'neutral']
            )}
          >
            {latestLabel}: {latestValue}
          </Badge>
        )}
      </div>
      <div className="relative h-[120px] chart-ltr">{children}</div>
      {legend && <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">{legend}</div>}
    </div>
  )
}

/* ------------------------------- main panel ------------------------------- */

export function OscillatorsPanel({ tf }: { tf: string }) {
  const { t } = useI18n()
  const { data, isLoading } = useCandles(tf)

  const rsiContainerRef = useRef<HTMLDivElement>(null)
  const macdContainerRef = useRef<HTMLDivElement>(null)
  const rsiChartRef = useRef<IChartApi | null>(null)
  const macdChartRef = useRef<IChartApi | null>(null)
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const macdLineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const macdSignalSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const macdHistSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)

  // Compute RSI + MACD from candle closes
  const computed = useMemo(() => {
    const candles = data?.candles ?? []
    if (candles.length < 30) return null
    const closes = candles.map((c) => c.close)
    const times = candles.map((c) => c.time as UTCTimestamp)
    const rsiArr = rsiWilder(closes, 14)
    const { macdLine, signal, histogram } = macd(closes)

    const rsiData: LineData[] = times
      .map((time, i) => ({ time, value: rsiArr[i] }))
      .filter((p): p is LineData => p.value != null && p.value >= 0 && p.value <= 100)

    const macdData: LineData[] = times
      .map((time, i) => ({ time, value: macdLine[i] }))
      .filter((p): p is LineData => p.value != null)

    const signalData: LineData[] = times
      .map((time, i) => ({ time, value: signal[i] }))
      .filter((p): p is LineData => p.value != null)

    const histData: HistData[] = times
      .map((time, i) => ({
        time,
        value: histogram[i] ?? 0,
        color:
          histogram[i] == null
            ? 'rgba(123, 225, 255, 0.0)'
            : histogram[i] >= 0
              ? 'rgba(61, 220, 151, 0.45)'
              : 'rgba(255, 107, 122, 0.45)',
      }))
      .filter((p) => p.value !== 0 || true)

    // Latest values for the badge
    const lastRsi = rsiArr[rsiArr.length - 1]
    const lastMacd = macdLine[macdLine.length - 1]
    const lastSignal = signal[signal.length - 1]
    const lastHist = histogram[histogram.length - 1]

    return { rsiData, macdData, signalData, histData, lastRsi, lastMacd, lastSignal, lastHist }
  }, [data])

  // Create RSI chart
  useEffect(() => {
    if (!rsiContainerRef.current) return
    const chart = createChart(rsiContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8fb0c5',
        fontFamily: 'var(--font-inter), system-ui, sans-serif',
        attributionLogo: false,
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(123, 225, 255, 0.04)' },
        horzLines: { color: 'rgba(123, 225, 255, 0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(123, 225, 255, 0.4)', labelBackgroundColor: '#10273c' },
        horzLine: { color: 'rgba(123, 225, 255, 0.4)', labelBackgroundColor: '#10273c' },
      },
      rightPriceScale: { borderColor: 'rgba(123, 225, 255, 0.15)' },
      timeScale: { borderColor: 'rgba(123, 225, 255, 0.15)', timeVisible: tf !== '1d', secondsVisible: false },
      autoSize: true,
    })
    rsiChartRef.current = chart

    const series = chart.addSeries(LineSeries, {
      color: '#b48cff',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
    })
    rsiSeriesRef.current = series

    // 70 (overbought) and 30 (oversold) reference lines
    series.createPriceLine({
      price: 70,
      color: 'rgba(255, 107, 122, 0.45)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: '70',
    })
    series.createPriceLine({
      price: 30,
      color: 'rgba(61, 220, 151, 0.45)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: '30',
    })
    series.createPriceLine({
      price: 50,
      color: 'rgba(123, 225, 255, 0.18)',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: false,
      title: '',
    })

    return () => {
      chart.remove()
      rsiChartRef.current = null
      rsiSeriesRef.current = null
    }
  }, [tf])

  // Create MACD chart
  useEffect(() => {
    if (!macdContainerRef.current) return
    const chart = createChart(macdContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8fb0c5',
        fontFamily: 'var(--font-inter), system-ui, sans-serif',
        attributionLogo: false,
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(123, 225, 255, 0.04)' },
        horzLines: { color: 'rgba(123, 225, 255, 0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(123, 225, 255, 0.4)', labelBackgroundColor: '#10273c' },
        horzLine: { color: 'rgba(123, 225, 255, 0.4)', labelBackgroundColor: '#10273c' },
      },
      rightPriceScale: { borderColor: 'rgba(123, 225, 255, 0.15)' },
      timeScale: { borderColor: 'rgba(123, 225, 255, 0.15)', timeVisible: tf !== '1d', secondsVisible: false },
      autoSize: true,
    })
    macdChartRef.current = chart

    const hist = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'price', precision: 6, minMove: 0.000001 },
      priceLineVisible: false,
      lastValueVisible: false,
    })
    macdHistSeriesRef.current = hist

    const macdLineSeries = chart.addSeries(LineSeries, {
      color: '#7be1ff',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
    })
    macdLineSeriesRef.current = macdLineSeries

    const signalSeries = chart.addSeries(LineSeries, {
      color: '#ffb45c',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
    })
    macdSignalSeriesRef.current = signalSeries

    // Zero baseline
    hist.createPriceLine({
      price: 0,
      color: 'rgba(123, 225, 255, 0.25)',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: false,
      title: '',
    })

    return () => {
      chart.remove()
      macdChartRef.current = null
      macdLineSeriesRef.current = null
      macdSignalSeriesRef.current = null
      macdHistSeriesRef.current = null
    }
  }, [tf])

  // Push data
  useEffect(() => {
    if (!computed) return
    rsiSeriesRef.current?.setData(computed.rsiData)
    macdHistSeriesRef.current?.setData(computed.histData)
    macdLineSeriesRef.current?.setData(computed.macdData)
    macdSignalSeriesRef.current?.setData(computed.signalData)
    rsiChartRef.current?.timeScale().fitContent()
    macdChartRef.current?.timeScale().fitContent()
  }, [computed])

  // RSI state for badge
  const rsiState: 'bull' | 'bear' | 'neutral' | null = (() => {
    const v = computed?.lastRsi
    if (v == null) return null
    if (v >= 70) return 'bear'
    if (v <= 30) return 'bull'
    return 'neutral'
  })()
  const rsiStateLabel = (() => {
    if (rsiState === 'bear') return t.market.rsiOverbought
    if (rsiState === 'bull') return t.market.rsiOversold
    return t.market.rsiNeutral
  })()

  // MACD state (bullish if hist > 0, bear if < 0)
  const macdState: 'bull' | 'bear' | 'neutral' | null = (() => {
    const v = computed?.lastHist
    if (v == null) return null
    if (v > 0) return 'bull'
    if (v < 0) return 'bear'
    return 'neutral'
  })()

  return (
    <Card className="glass border-border/60 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4 text-primary" />
            {t.market.oscillatorsTitle}
          </CardTitle>
          <span className="text-[10px] text-muted-foreground/70 hidden sm:inline">
            · {t.market.timeframe}: {tf}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        {/* Always render the chart containers so refs are available when the
            createChart effect runs. The Skeleton overlays on top while loading. */}
        <div className="relative">
          {isLoading && (
            <div className="absolute inset-0 z-10 grid md:grid-cols-2 gap-3">
              <Skeleton className="h-[180px] rounded-xl" />
              <Skeleton className="h-[180px] rounded-xl" />
            </div>
          )}
          <div
            className={cn(
              'grid md:grid-cols-2 gap-3 transition-opacity',
              isLoading ? 'opacity-0' : 'opacity-100'
            )}
            aria-hidden={isLoading}
          >
            <MiniChartPanel
              title={t.market.rsiTitle}
              icon={<Activity className="size-3.5" />}
              latestLabel={t.market.rsiValue}
              latestValue={computed?.lastRsi != null ? computed.lastRsi.toFixed(1) : null}
              latestState={rsiState}
              legend={
                <>
                  <span className="flex items-center gap-1">
                    <span className="h-0.5 w-3 rounded-full bg-[#b48cff]" /> {t.market.rsiValue}
                  </span>
                  <span className="flex items-center gap-1 text-bear/80">
                    <span className="h-0.5 w-3 rounded-full bg-bear/60 border-t border-dashed border-bear" />
                    {t.market.rsiOverbought} (70)
                  </span>
                  <span className="flex items-center gap-1 text-bull/80">
                    <span className="h-0.5 w-3 rounded-full bg-bull/60" />
                    {t.market.rsiOversold} (30)
                  </span>
                </>
              }
            >
              <div ref={rsiContainerRef} className="absolute inset-0" />
              <div className="absolute top-1 end-2 text-[10px] font-semibold text-muted-foreground/70">
                {rsiStateLabel}
              </div>
            </MiniChartPanel>

            <MiniChartPanel
              title={t.market.macdTitle}
              icon={<BarChart3 className="size-3.5" />}
              latestLabel={t.market.macdHistogram}
              latestValue={
                computed?.lastHist != null
                  ? (computed.lastHist >= 0 ? '+' : '') + computed.lastHist.toFixed(5)
                  : null
              }
              latestState={macdState}
              legend={
                <>
                  <span className="flex items-center gap-1">
                    <span className="h-0.5 w-3 rounded-full bg-[#7be1ff]" /> {t.market.macdLine}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-0.5 w-3 rounded-full bg-[#ffb45c]" /> {t.market.macdSignal}
                  </span>
                  <span className="flex items-center gap-1 text-bull/70">
                    <span className="size-2 rounded-sm bg-bull/50" /> {t.market.bullHist}
                  </span>
                  <span className="flex items-center gap-1 text-bear/70">
                    <span className="size-2 rounded-sm bg-bear/50" /> {t.market.bearHist}
                  </span>
                </>
              }
            >
              <div ref={macdContainerRef} className="absolute inset-0" />
            </MiniChartPanel>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
