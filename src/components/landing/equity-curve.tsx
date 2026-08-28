'use client'

/**
 * Strategy equity curve — cumulative paper return of following every locked
 * verdict (buy → long, sell → short, hold → flat), computed from the real
 * audited track record. Animated SVG area chart with per-point tooltips.
 *
 * Round 14 upgrades: period selector (30d / 90d / All), taller chart with
 * y-axis labels + gridlines, high-contrast stroke, drawdown (underwater)
 * sub-curve, and a verdict-distribution donut.
 */

import { useMemo, useState } from 'react'
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
  peak: number // running peak of cumulative value
  drawdown: number // drawdown from peak (<= 0)
}

type Period = '30' | '90' | 'all'

function directionOf(verdict: string): number {
  if (verdict === 'BUY' || verdict === 'STRONG_BUY') return 1
  if (verdict === 'SELL' || verdict === 'STRONG_SELL') return -1
  return 0
}

function EquityChart({ points, positive }: { points: CurvePoint[]; positive: boolean }) {
  const W = 640
  const H = 230
  const PAD_L = 44
  const PAD_R = 10
  const PAD_T = 10
  const PAD_B = 22

  const { min, max } = useMemo(() => {
    const values = points.map((p) => p.value)
    return { min: Math.min(0, ...values), max: Math.max(0, ...values) }
  }, [points])

  const range = max - min || 1
  const x = (i: number) => PAD_L + (i / Math.max(1, points.length - 1)) * (W - PAD_L - PAD_R)
  const y = (v: number) => PAD_T + (1 - (v - min) / range) * (H - PAD_T - PAD_B)

  const stroke = positive ? '#3ddc97' : '#ff6b7a'
  const strokeSoft = positive ? 'rgba(61,220,151,0.28)' : 'rgba(255,107,122,0.28)'
  const zeroY = y(0)

  // Nice round gridline values (4-5 lines)
  const gridlines = useMemo(() => {
    const out: number[] = []
    const step = range / 4
    for (let i = 0; i <= 4; i++) out.push(min + i * step)
    return out
  }, [min, range])

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${zeroY.toFixed(1)} L ${x(0).toFixed(1)} ${zeroY.toFixed(1)} Z`
  const zeroIsBottom = Math.abs(zeroY - (H - PAD_B)) < 2

  // X-axis date labels: first / middle / last
  const dateLabels = useMemo(() => {
    const n = points.length
    if (n < 3) return []
    const idxs = [0, Math.floor(n / 2), n - 1]
    return idxs.map((i) => ({ i, label: points[i].date.slice(5) }))
  }, [points])

  return (
    <div className="relative w-full chart-ltr" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
        <defs>
          <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeSoft} />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
        {/* gridlines + y-axis labels */}
        {gridlines.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD_L}
              y1={y(v)}
              x2={W - PAD_R}
              y2={y(v)}
              stroke="rgba(123, 225, 255, 0.06)"
              strokeWidth="1"
            />
            <text
              x={PAD_L - 6}
              y={y(v) + 3}
              fill="#8fb0c5"
              fontSize="9"
              textAnchor="end"
              fontFamily="var(--font-mono, monospace)"
            >
              {v >= 0 ? '+' : ''}{v.toFixed(0)}%
            </text>
          </g>
        ))}
        {/* zero line — stronger when inside the range */}
        {!zeroIsBottom && (
          <line x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY} stroke="rgba(143,176,197,0.35)" strokeWidth="1" strokeDasharray="4 4" />
        )}
        {/* area */}
        <path d={areaPath} fill="url(#equity-fill)" />
        {/* line */}
        <motion.path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 6px ${strokeSoft})` }}
        />
        {/* x-axis date labels */}
        {dateLabels.map(({ i, label }) => (
          <text
            key={label + i}
            x={x(i)}
            y={H - 6}
            fill="#8fb0c5"
            fontSize="9"
            textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
            fontFamily="var(--font-mono, monospace)"
          >
            {label}
          </text>
        ))}
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

/** Underwater (drawdown) sub-curve — distance below the running peak, in %. */
function DrawdownChart({ points }: { points: CurvePoint[] }) {
  const W = 640
  const H = 74
  const PAD_L = 44
  const PAD_R = 10
  const PAD_T = 6
  const PAD_B = 14

  const worst = useMemo(() => Math.min(-1, ...points.map((p) => p.drawdown)), [points])
  const x = (i: number) => PAD_L + (i / Math.max(1, points.length - 1)) * (W - PAD_L - PAD_R)
  // 0% at top, worst at bottom
  const y = (v: number) => PAD_T + (v / worst) * (H - PAD_T - PAD_B)

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.drawdown).toFixed(1)}`)
    .join(' ')
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`

  return (
    <div className="relative w-full chart-ltr" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-hidden>
        <defs>
          <linearGradient id="dd-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,107,122,0.04)" />
            <stop offset="100%" stopColor="rgba(255,107,122,0.30)" />
          </linearGradient>
        </defs>
        {/* 0 line */}
        <line x1={PAD_L} y1={y(0)} x2={W - PAD_R} y2={y(0)} stroke="rgba(143,176,197,0.3)" strokeWidth="1" />
        {/* worst line + label */}
        <line x1={PAD_L} y1={y(worst)} x2={W - PAD_R} y2={y(worst)} stroke="rgba(255,107,122,0.25)" strokeWidth="1" strokeDasharray="3 3" />
        <text x={PAD_L - 6} y={y(0) + 3} fill="#8fb0c5" fontSize="9" textAnchor="end" fontFamily="var(--font-mono, monospace)">0%</text>
        <text x={PAD_L - 6} y={y(worst) + 3} fill="#ff6b7a" fontSize="9" textAnchor="end" fontFamily="var(--font-mono, monospace)">{worst.toFixed(0)}%</text>
        {/* area */}
        <path d={areaPath} fill="url(#dd-fill)" />
        {/* line */}
        <path d={linePath} fill="none" stroke="rgba(255,107,122,0.85)" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/** Verdict distribution donut — share of BUY / SELL / HOLD days. */
function VerdictDonut({ counts }: { counts: { buy: number; sell: number; hold: number } }) {
  const { t } = useI18n()
  const total = counts.buy + counts.sell + counts.hold
  if (total === 0) return null

  const R = 15.9155 // radius that makes circumference = 100 (for % math)
  const C = 2 * Math.PI * R
  const segs = [
    { n: counts.buy, color: '#3ddc97', label: t.equity.distBuy },
    { n: counts.sell, color: '#ff6b7a', label: t.equity.distSell },
    { n: counts.hold, color: '#7be1ff', label: t.equity.distHold },
  ]
  let offset = 0

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 40 40" className="size-20 shrink-0 -rotate-90" role="img" aria-label={t.equity.distTitle}>
        <circle cx="20" cy="20" r={R} fill="none" stroke="rgba(123,225,255,0.08)" strokeWidth="5" />
        {segs.map((s) => {
          const frac = s.n / total
          const len = frac * C
          const el = (
            <circle
              key={s.color}
              cx="20"
              cy="20"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="5"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              opacity="0.9"
            />
          )
          offset += len
          return el
        })}
      </svg>
      <div className="flex flex-col gap-1.5 min-w-0">
        {segs.map((s) => (
          <div key={s.color} className="flex items-center gap-2 text-xs">
            <span className="size-2.5 rounded-sm shrink-0" style={{ background: s.color }} aria-hidden />
            <span className="text-muted-foreground truncate">{s.label}</span>
            <span className="font-mono font-bold tabular-nums ms-auto">{s.n}</span>
            <span className="text-muted-foreground/60 text-[10px] font-mono tabular-nums w-9 text-end">
              {Math.round((s.n / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function EquityCurve() {
  const { t } = useI18n()
  const { data } = useTrackRecord()
  const [period, setPeriod] = useState<Period>('all')

  const allPoints = useMemo<CurvePoint[]>(() => {
    if (!data?.entries) return []
    // oldest → newest, only resolved days with a known next-day change
    const resolved = data.entries
      .filter((e) => e.verdict !== 'LOCKED' && e.outcome !== 'PENDING' && e.changePercent != null)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
    let cum = 0
    let peak = 0
    return resolved.map((e) => {
      const daily = directionOf(e.verdict) * (e.changePercent ?? 0)
      cum += daily
      peak = Math.max(peak, cum)
      return { date: e.date, value: cum, daily, peak, drawdown: cum - peak }
    })
  }, [data])

  const points = useMemo(() => {
    if (period === 'all' || allPoints.length === 0) return allPoints
    const n = period === '30' ? 30 : 90
    return allPoints.slice(-n)
  }, [allPoints, period])

  const verdictCounts = useMemo(() => {
    let buy = 0, sell = 0, hold = 0
    // Count from raw entries matching the selected window
    const dates = new Set(points.map((p) => p.date))
    for (const e of data?.entries ?? []) {
      if (!dates.has(e.date)) continue
      const d = directionOf(e.verdict)
      if (d > 0) buy++
      else if (d < 0) sell++
      else hold++
    }
    return { buy, sell, hold }
  }, [points, data])

  if (allPoints.length < 2) return null

  const final = points[points.length - 1].value
  const positive = final >= 0
  const traded = points.filter((p) => p.daily !== 0).length
  const best = Math.max(...points.map((p) => p.daily))
  const worst = Math.min(...points.map((p) => p.daily))
  const maxDD = Math.min(...points.map((p) => p.drawdown))

  const periods: Array<{ id: Period; label: string }> = [
    { id: '30', label: t.equity.period30 },
    { id: '90', label: t.equity.period90 },
    { id: 'all', label: t.equity.periodAll },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <Card className="glass border-border/60 card-interactive">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ChartLine className="size-5 text-primary" />
              {t.equity.title}
            </CardTitle>
            {/* Period selector */}
            <div className="flex items-center gap-0.5 rounded-xl bg-secondary/60 p-1" role="tablist" aria-label={t.equity.periodLabel}>
              {periods.map((p) => (
                <button
                  key={p.id}
                  role="tab"
                  aria-selected={period === p.id}
                  onClick={() => setPeriod(p.id)}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer',
                    period === p.id
                      ? 'bg-primary text-primary-foreground shadow'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
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
          <EquityChart key={period} points={points} positive={positive} />

          {/* Drawdown sub-curve */}
          <div className="rounded-xl border border-border/50 bg-secondary/20 px-2 py-1.5">
            <div className="flex items-center justify-between px-2 pt-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.equity.drawdownTitle}</span>
              <span className="text-[10px] font-mono text-bear tabular-nums">{maxDD.toFixed(1)}% {t.equity.drawdownMax}</span>
            </div>
            <DrawdownChart points={points} />
          </div>

          {/* Verdict distribution donut */}
          <div className="rounded-xl border border-border/50 bg-secondary/20 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">{t.equity.distTitle}</div>
            <VerdictDonut counts={verdictCounts} />
          </div>

          <p className="text-[11px] text-muted-foreground/80">{t.equity.note}</p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
