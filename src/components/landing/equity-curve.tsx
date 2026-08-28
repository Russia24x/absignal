'use client'

/**
 * Strategy equity curve — cumulative paper return of following every locked
 * verdict (buy → long, sell → short, hold → flat), computed from the real
 * audited track record. Animated SVG area chart with per-point tooltips.
 */

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { ChartLine, TrendingDown, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n/context'
import { useTrackRecord } from '@/hooks/use-app-data'
import { cn } from '@/lib/utils'

interface CurvePoint {
  date: string
  value: number // cumulative %
  daily: number // day strategy return %
}

function directionOf(verdict: string): number {
  if (verdict === 'BUY' || verdict === 'STRONG_BUY') return 1
  if (verdict === 'SELL' || verdict === 'STRONG_SELL') return -1
  return 0
}

function EquityChart({ points, positive }: { points: CurvePoint[]; positive: boolean }) {
  const W = 640
  const H = 190
  const PAD = 8

  const { min, max } = useMemo(() => {
    const values = points.map((p) => p.value)
    return { min: Math.min(0, ...values), max: Math.max(0, ...values) }
  }, [points])

  const range = max - min || 1
  const x = (i: number) => PAD + (i / Math.max(1, points.length - 1)) * (W - 2 * PAD)
  const y = (v: number) => PAD + (1 - (v - min) / range) * (H - 2 * PAD)

  const stroke = positive ? '#3ddc97' : '#ff6b7a'
  const strokeSoft = positive ? 'rgba(61,220,151,0.22)' : 'rgba(255,107,122,0.22)'
  const zeroY = y(0)

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${zeroY.toFixed(1)} L ${x(0).toFixed(1)} ${zeroY.toFixed(1)} Z`
  const zeroIsBottom = Math.abs(zeroY - (H - PAD)) < 2

  return (
    <div className="relative w-full chart-ltr" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
        <defs>
          <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeSoft} />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
        {/* zero line */}
        {!zeroIsBottom && (
          <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="rgba(143,176,197,0.35)" strokeWidth="1" strokeDasharray="4 4" />
        )}
        {/* area */}
        <path d={areaPath} fill="url(#equity-fill)" />
        {/* line */}
        <motion.path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 5px ${strokeSoft})` }}
        />
        {/* points with native tooltips */}
        {points.map((p, i) => (
          <circle
            key={p.date}
            cx={x(i)}
            cy={y(p.value)}
            r={i === points.length - 1 ? 4 : 2.4}
            fill={p.daily >= 0 ? '#3ddc97' : '#ff6b7a'}
            opacity={i === points.length - 1 ? 1 : 0.75}
          >
            <title>{`${p.date} · ${p.daily >= 0 ? '+' : ''}${p.daily.toFixed(2)}% → Σ ${p.value >= 0 ? '+' : ''}${p.value.toFixed(2)}%`}</title>
          </circle>
        ))}
      </svg>
    </div>
  )
}

export function EquityCurve() {
  const { t } = useI18n()
  const { data } = useTrackRecord()

  const points = useMemo<CurvePoint[]>(() => {
    if (!data?.entries) return []
    // oldest → newest, only resolved days with a known next-day change
    const resolved = data.entries
      .filter((e) => e.verdict !== 'LOCKED' && e.outcome !== 'PENDING' && e.changePercent != null)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
    let cum = 0
    return resolved.map((e) => {
      const daily = directionOf(e.verdict) * (e.changePercent ?? 0)
      cum += daily
      return { date: e.date, value: cum, daily }
    })
  }, [data])

  if (points.length < 2) return null

  const final = points[points.length - 1].value
  const positive = final >= 0
  const traded = points.filter((p) => p.daily !== 0).length
  const best = Math.max(...points.map((p) => p.daily))
  const worst = Math.min(...points.map((p) => p.daily))

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <Card className="glass border-border/60 card-interactive">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ChartLine className="size-5 text-primary" />
            {t.equity.title}
          </CardTitle>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">{t.equity.subtitle}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Headline stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-secondary/40 border border-border/60 p-3 text-center">
              <div className={cn('text-xl font-black tabular-nums', positive ? 'text-bull' : 'text-bear')}>
                {positive ? <TrendingUp className="size-4 inline me-1" /> : <TrendingDown className="size-4 inline me-1" />}
                {final >= 0 ? '+' : ''}
                {final.toFixed(1)}%
              </div>
              <div className="text-[11px] text-muted-foreground">{t.equity.totalReturn}</div>
            </div>
            <div className="rounded-xl bg-secondary/40 border border-border/60 p-3 text-center">
              <div className="text-xl font-black tabular-nums">{traded}</div>
              <div className="text-[11px] text-muted-foreground">{t.equity.tradedDays}</div>
            </div>
            <div className="rounded-xl bg-bull/5 border border-bull/20 p-3 text-center">
              <div className="text-xl font-black tabular-nums text-bull">+{best.toFixed(1)}%</div>
              <div className="text-[11px] text-muted-foreground">{t.equity.bestDay}</div>
            </div>
            <div className="rounded-xl bg-bear/5 border border-bear/20 p-3 text-center">
              <div className="text-xl font-black tabular-nums text-bear">{worst.toFixed(1)}%</div>
              <div className="text-[11px] text-muted-foreground">{t.equity.worstDay}</div>
            </div>
          </div>

          {/* The curve */}
          <EquityChart points={points} positive={positive} />

          <p className="text-[11px] text-muted-foreground/80">{t.equity.note}</p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
