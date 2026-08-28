'use client'

/**
 * LivePriceTicker — thin fixed strip at the top of the page that shows
 * the real-time PENGU price, 24h change %, and a 30-bar mini sparkline.
 * Auto-refreshes every 45 s via useMarketOverview. Click → scrolls to the
 * Live Terminal. Stays visible while the user scrolls through the page so
 * market context is always one glance away.
 *
 * Hidden on small screens (under `sm`) to keep the already-busy mobile
 * header uncluttered — the hero ticker still surfaces the same data.
 *
 * Rendered before <Header /> in page.tsx so the visual stacking is:
 *   Ticker (fixed top-0, h-9)
 *   Header (fixed top-9, h-16)  ← header.tsx applies `sm:top-9` when ticker is mounted
 */

import { useMemo } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { useMarketOverview, useCandles } from '@/hooks/use-app-data'
import { useI18n } from '@/lib/i18n/context'
import { cn } from '@/lib/utils'

/** Build an SVG polyline path for the last N closes (normalised 0..1). */
function sparklinePath(closes: number[], w = 100, h = 24): string {
  if (closes.length < 2) return ''
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const span = max - min || 1
  const step = w / (closes.length - 1)
  return closes
    .map((c, i) => {
      const x = i * step
      const y = h - ((c - min) / span) * h
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

export function LivePriceTicker() {
  const { t, fmt } = useI18n()
  const { data: market } = useMarketOverview()
  const { data: candleData } = useCandles('1h')

  const change = market?.priceChange24h ?? null
  const positive = (change ?? 0) >= 0

  // Sparkline from the most recent 30 1h closes
  const spark = useMemo(() => {
    const arr = candleData?.candles ?? []
    const last30 = arr.slice(-30).map((c) => c.close)
    return last30
  }, [candleData])
  const path = useMemo(() => sparklinePath(spark), [spark])
  const sparkColor = positive ? '#3ddc97' : '#ff6b7a'

  const price = market?.priceUsd
  const vol = market?.volume24hUsd

  return (
    <button
      type="button"
      onClick={() => {
        const el = document.getElementById('app')
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }}
      aria-label={t.ticker.scrollHint}
      className={cn(
        'fixed top-0 inset-x-0 z-[55] hidden sm:block',
        'w-full border-b border-primary/15 bg-gradient-to-r from-[#041019] via-[#061a2c] to-[#041019] backdrop-blur',
        'group cursor-pointer transition-colors hover:border-primary/35'
      )}
    >
      {/* top aurora hairline */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px opacity-60 aurora-line"
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-9 items-center justify-between gap-4">
          {/* Left: LIVE + PENGU + price */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-bull/10 px-2 py-0.5 text-[10px] font-black tracking-widest text-bull">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-bull opacity-75 animate-ping" />
                <span className="relative inline-flex size-1.5 rounded-full bg-bull" />
              </span>
              {t.ticker.liveLabel}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {t.ticker.priceLabel}
            </span>
            <span className="font-mono text-sm font-bold tabular-nums text-foreground">
              {price != null ? `$${price.toFixed(5)}` : '—'}
            </span>
            {change != null && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
                  positive ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'
                )}
              >
                {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                {positive ? '+' : ''}
                {change.toFixed(2)}%
              </span>
            )}
            {market?.stale && (
              <span className="hidden md:inline text-[10px] text-amber-300/70">· {t.ticker.stale}</span>
            )}
          </div>

          {/* Right: sparkline + volume + scroll hint */}
          <div className="flex items-center gap-3 min-w-0">
            {vol != null && (
              <span className="hidden lg:inline text-[11px] text-muted-foreground font-mono">
                {t.ticker.volLabel}: ${(vol / 1000).toFixed(0)}K
              </span>
            )}
            {/* Mini sparkline */}
            <svg
              width="100"
              height="24"
              viewBox="0 0 100 24"
              className="shrink-0 overflow-visible"
              aria-hidden
            >
              {path && (
                <>
                  <path d={path} fill="none" stroke={sparkColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path
                    d={`${path} L100,24 L0,24 Z`}
                    fill={sparkColor}
                    opacity="0.15"
                  />
                  {/* last point dot */}
                  {(() => {
                    const last = spark[spark.length - 1]
                    const min = Math.min(...spark)
                    const max = Math.max(...spark)
                    const span = max - min || 1
                    const cx = 100
                    const cy = 24 - ((last - min) / span) * 24
                    return <circle cx={cx} cy={cy} r="2" fill={sparkColor} />
                  })()}
                </>
              )}
            </svg>
            <span className="hidden md:inline text-[10px] font-semibold uppercase tracking-wider text-primary/80 group-hover:text-primary transition-colors">
              {t.ticker.scrollHint} →
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}
