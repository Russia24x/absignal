'use client'

/**
 * Live market overview cards: price (with 24h sparkline), 24h change,
 * volume, liquidity, market cap, buy/sell pressure — all real GeckoTerminal data.
 */

import { useMemo } from 'react'
import { ArrowDownRight, ArrowUpRight, BarChart3, Droplets, Landmark, ShoppingBag, TrendingDown, TrendingUp, Volume2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/lib/i18n/context'
import { useMarketOverview, useAppConfig, useCandles } from '@/hooks/use-app-data'

/** Mini SVG sparkline drawn from real 15m candle closes (last 24h). */
function Sparkline({ closes, up }: { closes: number[]; up: boolean }) {
  const path = useMemo(() => {
    if (closes.length < 2) return null
    const min = Math.min(...closes)
    const max = Math.max(...closes)
    const range = max - min || 1
    const w = 120
    const h = 36
    return closes
      .map((c, i) => {
        const x = (i / (closes.length - 1)) * w
        const y = h - ((c - min) / range) * h
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')
  }, [closes])

  if (!path) return null
  const stroke = up ? '#3ddc97' : '#ff6b7a'

  return (
    <svg viewBox="0 0 120 36" className="h-9 w-full" preserveAspectRatio="none" aria-hidden>
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="sparkline-path"
        opacity="0.9"
      />
    </svg>
  )
}

function fmtUsd(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

function fmtPrice(n: number | null): string {
  if (n == null) return '—'
  return `$${n.toFixed(5)}`
}

function StatCard({
  icon,
  label,
  value,
  sub,
  footer,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: React.ReactNode
  footer?: React.ReactNode
  tone?: 'bull' | 'bear' | 'neutral'
}) {
  return (
    <Card className="glass card-interactive border-border/60 overflow-hidden">
      <CardContent className="p-4 gap-1.5 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            {icon}
            {label}
          </span>
          {sub}
        </div>
        <span
          className={`text-xl font-black tabular-nums ${
            tone === 'bull' ? 'text-bull' : tone === 'bear' ? 'text-bear' : 'text-foreground'
          }`}
        >
          {value}
        </span>
        {footer}
      </CardContent>
    </Card>
  )
}

export function MarketOverviewCards() {
  const { t, fmt } = useI18n()
  const { data: market, isLoading } = useMarketOverview()
  const { data: config } = useAppConfig()
  const { data: candles15m } = useCandles('15m')

  // Last 96×15m closes ≈ 24h of real price action for the sparkline
  const sparkCloses = useMemo(
    () => (candles15m?.candles ?? []).slice(-96).map((c) => c.close),
    [candles15m]
  )

  if (isLoading || !market) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    )
  }

  const change = market.priceChange24h
  const changeTone = change == null ? 'neutral' : change >= 0 ? 'bull' : 'bear'
  const buyRatio =
    market.buys24h != null && market.sells24h != null && market.buys24h + market.sells24h > 0
      ? (market.buys24h / (market.buys24h + market.sells24h)) * 100
      : null
  const secondsAgo = Math.max(0, Math.round((Date.now() - market.updatedAt) / 1000))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard
          icon={<span className="size-1.5 rounded-full bg-bull pulse-dot" />}
          label={t.market.price}
          value={fmtPrice(market.priceUsd)}
          tone={changeTone as 'bull' | 'bear' | 'neutral'}
          sub={
            change != null ? (
              <span
                className={`flex items-center gap-0.5 text-xs font-semibold ${change >= 0 ? 'text-bull' : 'text-bear'}`}
              >
                {change >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {change >= 0 ? '+' : ''}
                {change.toFixed(2)}%
              </span>
            ) : undefined
          }
          footer={sparkCloses.length >= 2 ? <Sparkline closes={sparkCloses} up={(change ?? 0) >= 0} /> : undefined}
        />
        <StatCard
          icon={<Volume2 className="size-3.5" />}
          label={t.market.volume24h}
          value={fmtUsd(market.volume24hUsd)}
        />
        <StatCard
          icon={<Droplets className="size-3.5" />}
          label={t.market.liquidity}
          value={fmtUsd(market.liquidityUsd)}
        />
        <StatCard
          icon={<Landmark className="size-3.5" />}
          label={t.market.marketCap}
          value={fmtUsd(market.marketCapUsd)}
        />
        <StatCard
          icon={<BarChart3 className="size-3.5" />}
          label={t.market.buys}
          value={fmt(market.buys24h ?? 0)}
          sub={<TrendingUp className="size-3.5 text-bull" />}
        />
        <StatCard
          icon={<BarChart3 className="size-3.5" />}
          label={t.market.sells}
          value={fmt(market.sells24h ?? 0)}
          sub={<TrendingDown className="size-3.5 text-bear" />}
        />
      </div>

      {/* Buy pressure + meta */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-3 min-w-40 flex-1 max-w-xs">
          <span className="whitespace-nowrap">{t.market.buyPressure}</span>
          {buyRatio != null ? (
            <>
              <Progress value={buyRatio} className="h-1.5 flex-1" />
              <span className="tabular-nums font-semibold text-bull">{buyRatio.toFixed(0)}%</span>
            </>
          ) : (
            <span>—</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {market.stale && (
            <Badge variant="outline" className="border-amber-400/40 text-amber-300 text-[10px]">
              {t.market.staleData}
            </Badge>
          )}
          {config && (
            <span className="hidden sm:inline">
              {t.market.pool}: <span className="text-foreground/80">{market.poolName ?? config.dataSource.pool}</span>
            </span>
          )}
          <span className="whitespace-nowrap">
            {t.market.updated}: {fmt(secondsAgo)} {t.market.updatedSecondsAgo}
          </span>
        </div>
      </div>
    </div>
  )
}
