'use client'

/**
 * Candlestick chart (lightweight-charts v5 — TradingView's open-source lib).
 * Timeframe switcher: 15m / 1h / 4h / 1d. Data from our cached API.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/lib/i18n/context'
import { useCandles } from '@/hooks/use-app-data'
import { cn } from '@/lib/utils'

const TIMEFRAMES = ['15m', '1h', '4h', '1d'] as const
type TF = (typeof TIMEFRAMES)[number]

/** Classic EMA over closes; returns one value per input (undefined while warming up). */
function emaSeries(closes: number[], period: number): Array<number | undefined> {
  const out: Array<number | undefined> = []
  const k = 2 / (period + 1)
  let prev: number | undefined
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      out.push(undefined)
      continue
    }
    if (prev == null) {
      // seed with SMA of the first `period` closes
      let sum = 0
      for (let j = 0; j < period; j++) sum += closes[j]
      prev = sum / period
    } else {
      prev = closes[i] * k + prev * (1 - k)
    }
    out.push(prev)
  }
  return out
}

export function PriceChart() {
  const { t } = useI18n()
  const [tf, setTf] = useState<TF>('1h')
  const [showEma20, setShowEma20] = useState(true)
  const [showEma50, setShowEma50] = useState(true)
  const { data, isLoading } = useCandles(tf)

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const ema20Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const ema50Ref = useRef<ISeriesApi<'Line'> | null>(null)

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8fb0c5',
        fontFamily: 'var(--font-inter), system-ui, sans-serif',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(123, 225, 255, 0.05)' },
        horzLines: { color: 'rgba(123, 225, 255, 0.05)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(123, 225, 255, 0.4)', labelBackgroundColor: '#10273c' },
        horzLine: { color: 'rgba(123, 225, 255, 0.4)', labelBackgroundColor: '#10273c' },
      },
      rightPriceScale: { borderColor: 'rgba(123, 225, 255, 0.15)' },
      timeScale: {
        borderColor: 'rgba(123, 225, 255, 0.15)',
        timeVisible: tf !== '1d',
        secondsVisible: false,
      },
      autoSize: true,
    })
    chartRef.current = chart

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#3ddc97',
      downColor: '#ff6b7a',
      wickUpColor: '#3ddc97',
      wickDownColor: '#ff6b7a',
      borderVisible: false,
      priceLineColor: 'rgba(123, 225, 255, 0.5)',
    })
    seriesRef.current = candles

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      lastValueVisible: false,
      priceLineVisible: false,
    })
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    volumeRef.current = volume

    // EMA overlays (20 fast / 50 slow)
    const ema20 = chart.addSeries(LineSeries, {
      color: '#7be1ff',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })
    ema20Ref.current = ema20

    const ema50 = chart.addSeries(LineSeries, {
      color: '#b48cff',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })
    ema50Ref.current = ema50

    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      volumeRef.current = null
      ema20Ref.current = null
      ema50Ref.current = null
    }
     
  }, [])

  // Update data when candles arrive
  useEffect(() => {
    if (!seriesRef.current || !volumeRef.current || !data?.candles?.length) return
    const candles = data.candles.map((c) => ({
      time: c.time as import('lightweight-charts').UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))
    seriesRef.current.setData(candles)
    const volumes = data.candles.map((c) => ({
      time: c.time as import('lightweight-charts').UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(61, 220, 151, 0.35)' : 'rgba(255, 107, 122, 0.35)',
    }))
    volumeRef.current.setData(volumes)

    // EMA overlays from real candle closes
    const closes = data.candles.map((c) => c.close)
    const times = data.candles.map((c) => c.time as import('lightweight-charts').UTCTimestamp)
    const buildEma = (period: number) => {
      const ema = emaSeries(closes, period)
      return times
        .map((time, i) => ({ time, value: ema[i] }))
        .filter((p): p is { time: import('lightweight-charts').UTCTimestamp; value: number } => p.value != null)
    }
    ema20Ref.current?.setData(buildEma(20))
    ema50Ref.current?.setData(buildEma(50))

    chartRef.current?.timeScale().fitContent()
  }, [data, tf])

  // EMA visibility toggles
  useEffect(() => {
    ema20Ref.current?.applyOptions({ visible: showEma20 })
  }, [showEma20])
  useEffect(() => {
    ema50Ref.current?.applyOptions({ visible: showEma50 })
  }, [showEma50])

  // Update time visibility when timeframe changes
  useEffect(() => {
    chartRef.current?.timeScale().applyOptions({
      timeVisible: tf !== '1d',
      secondsVisible: false,
    })
  }, [tf])

  const loading = isLoading || !data

  const last = useMemo(() => data?.candles?.[data.candles.length - 1] ?? null, [data])

  return (
    <Card className="glass border-border/60 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            PENGU / USD
            {last && (
              <span className={`text-sm font-mono ${last.close >= last.open ? 'text-bull' : 'text-bear'}`}>
                ${last.close.toFixed(5)}
              </span>
            )}
            {data?.stale && (
              <Badge variant="outline" className="border-amber-400/40 text-amber-300 text-[10px]">
                {t.market.staleData}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1 rounded-xl bg-secondary/60 p-1" role="tablist" aria-label={t.market.timeframe}>
            {TIMEFRAMES.map((item) => (
              <button
                key={item}
                role="tab"
                aria-selected={tf === item}
                onClick={() => setTf(item)}
                className={cn(
                  'px-3 py-1 text-xs font-semibold rounded-lg transition-all',
                  tf === item
                    ? 'bg-primary text-primary-foreground shadow'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="relative h-[380px] chart-ltr">
          <div ref={containerRef} className="absolute inset-0" />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-sm rounded-xl">
              <Skeleton className="h-full w-full rounded-xl" />
            </div>
          )}
        </div>
        {/* EMA legend / toggles */}
        <div className="flex flex-wrap items-center gap-2 mt-2" aria-label={t.market.emaLegend}>
          <span className="text-[11px] text-muted-foreground">{t.market.emaLegend}:</span>
          <button
            onClick={() => setShowEma20((v) => !v)}
            aria-pressed={showEma20}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-all cursor-pointer',
              showEma20
                ? 'border-primary/40 text-primary bg-primary/10'
                : 'border-border/60 text-muted-foreground opacity-60 hover:opacity-100'
            )}
          >
            <span className="h-0.5 w-4 rounded-full bg-[#7be1ff]" aria-hidden />
            {t.market.ema20}
          </button>
          <button
            onClick={() => setShowEma50((v) => !v)}
            aria-pressed={showEma50}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-all cursor-pointer',
              showEma50
                ? 'border-[#b48cff]/40 text-[#c9aaff] bg-[#b48cff]/10'
                : 'border-border/60 text-muted-foreground opacity-60 hover:opacity-100'
            )}
          >
            <span className="h-0.5 w-4 rounded-full bg-[#b48cff]" aria-hidden />
            {t.market.ema50}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
