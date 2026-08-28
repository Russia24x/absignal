'use client'

/**
 * Backtest Sandbox section — deterministic 1D-engine replay over real
 * history (see /api/backtest and lib/backtest/replay.ts).
 *
 * Visuals: gradient stat cards with animated counters, an animated SVG
 * step-equity curve in R units with hover tooltips, and a compact trades
 * table with outcome badges. Fully bilingual (fa/en) + RTL-safe charts.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { FlaskConical, Info, TrendingDown, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/lib/i18n/context'
import { useBacktest, type BacktestTrade } from '@/hooks/use-app-data'
import { useCountUp } from '@/hooks/use-count-up'
import { cn } from '@/lib/utils'

/* --------------------------------- helpers -------------------------------- */

function rColor(r: number): string {
  if (r > 0.05) return '#3ddc97'
  if (r < -0.05) return '#ff6b7a'
  return '#7be1ff'
}

const OUTCOME_STYLES: Record<BacktestTrade['outcome'], string> = {
  TP3: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  TP2: 'border-emerald-400/30 bg-emerald-400/5 text-emerald-300',
  TP1: 'border-teal-400/30 bg-teal-400/5 text-teal-300',
  BE: 'border-sky-400/30 bg-sky-400/5 text-sky-300',
  TIMEOUT: 'border-amber-400/30 bg-amber-400/5 text-amber-300',
  SL: 'border-rose-400/30 bg-rose-400/5 text-rose-300',
}

/* ------------------------------- sub-widgets ------------------------------- */

function StatCard({
  label,
  value,
  sub,
  tone = 'neutral',
  suffix,
}: {
  label: string
  value: ReactNode
  sub?: string
  tone?: 'positive' | 'negative' | 'neutral'
  suffix?: string
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-b from-secondary/40 to-transparent p-3.5">
      <div
        className={cn(
          'pointer-events-none absolute -top-8 h-16 w-16 rounded-full blur-2xl transition-opacity',
          tone === 'positive' && 'bg-emerald-400/15',
          tone === 'negative' && 'bg-rose-400/10',
          tone === 'neutral' && 'bg-cyan-400/10',
        )}
      />
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-xl font-black tabular-nums tracking-tight',
          tone === 'positive' && 'text-bull',
          tone === 'negative' && 'text-bear',
          tone === 'neutral' && 'text-foreground',
        )}
        dir="ltr"
      >
        {value}
        {suffix && <span className="ms-0.5 text-xs font-semibold text-muted-foreground">{suffix}</span>}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground/80">{sub}</p>}
    </div>
  )
}

/** Animated SVG step curve of cumulative R with per-trade hover dots. */
function EquitySteps({ equity, lang }: { equity: Array<{ date: string; r: number }>; lang: 'fa' | 'en' }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 660
  const H = 200
  const PAD = 10

  const { min, max } = useMemo(() => {
    const values = equity.map((p) => p.r)
    return { min: Math.min(0, ...values), max: Math.max(0, ...values) }
  }, [equity])

  const range = max - min || 1
  const x = (i: number) => PAD + (i / Math.max(1, equity.length - 1)) * (W - 2 * PAD)
  const y = (v: number) => H - PAD - ((v - min) / range) * (H - 2 * PAD)
  const zeroY = y(0)
  const positive = (equity[equity.length - 1]?.r ?? 0) >= 0
  const stroke = positive ? '#3ddc97' : '#ff6b7a'

  // Step path: horizontal to next x, then vertical.
  const path = useMemo(() => {
    if (!equity.length) return ''
    let d = `M ${x(0)} ${y(equity[0].r)}`
    for (let i = 1; i < equity.length; i++) {
      d += ` L ${x(i)} ${y(equity[i - 1].r)} L ${x(i)} ${y(equity[i].r)}`
    }
    return d
  }, [equity])

  const area = `${path} L ${x(equity.length - 1)} ${zeroY} L ${x(0)} ${zeroY} Z`
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-US', {
      month: 'short',
      day: 'numeric',
    })

  return (
    <div className="relative chart-ltr" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        <defs>
          <linearGradient id="btFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* zero line */}
        <line x1={PAD} x2={W - PAD} y1={zeroY} y2={zeroY} stroke="rgba(123,225,255,0.18)" strokeDasharray="3 5" />
        <motion.path
          d={area}
          fill="url(#btFill)"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1, delay: 0.4 }}
        />
        <motion.path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.6, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 5px ${stroke}55)` }}
        />
        {equity.map((p, i) => (
          <circle
            key={p.date + i}
            cx={x(i)}
            cy={y(p.r)}
            r={hover === i ? 5 : 3}
            fill={hover === i ? '#fff' : stroke}
            stroke={stroke}
            strokeWidth="1.5"
            className="cursor-pointer transition-all"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {hover != null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD}
              y2={H - PAD}
              stroke="rgba(123,225,255,0.25)"
              strokeWidth="1"
            />
          </g>
        )}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-border/60 bg-popover/95 px-2.5 py-1.5 text-[11px] shadow-lg backdrop-blur"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            top: 0,
          }}
          dir="ltr"
        >
          <span className="font-semibold text-foreground">
            {fmtDate(equity[hover].date)}
          </span>
          <span className="mx-1 text-muted-foreground">·</span>
          <span className="font-bold tabular-nums" style={{ color: stroke }}>
            {equity[hover].r > 0 ? '+' : ''}
            {equity[hover].r.toFixed(2)}R
          </span>
        </div>
      )}
    </div>
  )
}

/** Animated counter stat. */
function AnimatedStat({
  target,
  decimals = 0,
  suffix,
  tone,
}: {
  target: number
  decimals?: number
  suffix?: string
  tone?: 'positive' | 'negative'
}) {
  const v = useCountUp(target, 1400, decimals)
  return (
    <span
      className={cn(
        'tabular-nums',
        tone === 'positive' && 'text-bull',
        tone === 'negative' && 'text-bear',
      )}
      dir="ltr"
    >
      {v.toFixed(decimals)}
      {suffix}
    </span>
  )
}

/* --------------------------------- section -------------------------------- */

export function BacktestSandbox() {
  const { t, lang, fmt } = useI18n()
  const { data, isLoading, isError } = useBacktest()

  const stats = data?.stats
  const totalRTone = (stats?.totalR ?? 0) >= 0 ? 'positive' : 'negative'

  return (
    <section id="backtest" className="relative py-14 sm:py-20">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-8 text-center"
        >
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-primary/80">
            {t.backtest.eyebrow}
          </p>
          <h2 className="text-2xl font-black tracking-tight sm:text-3xl">{t.backtest.title}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {t.backtest.subtitle}
          </p>
          {data && (
            <p className="mt-2 text-[11px] text-muted-foreground/70" dir="ltr">
              {data.from} → {data.to} · {fmt(data.tradingDays)} {t.backtest.days}
            </p>
          )}
        </motion.div>

        {isLoading && (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[76px] rounded-xl" />
            ))}
          </div>
        )}

        {isError && (
          <Card className="border-border/60">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              {t.backtest.empty}
            </CardContent>
          </Card>
        )}

        {data && stats && (
          <>
            {/* Stat grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard
                label={t.backtest.trades}
                value={fmt(stats.trades)}
                sub={`${fmt(stats.wins)}W · ${fmt(stats.losses)}L`}
              />
              <StatCard
                label={t.backtest.winRate}
                value={<AnimatedStat target={stats.winRate} decimals={0} suffix="%" />}
                tone={stats.winRate >= 50 ? 'positive' : 'neutral'}
              />
              <StatCard
                label={t.backtest.totalR}
                value={
                  <AnimatedStat
                    target={stats.totalR}
                    decimals={2}
                    suffix="R"
                    tone={totalRTone as 'positive' | 'negative'}
                  />
                }
                tone={totalRTone as 'positive' | 'negative'}
                sub={`${t.backtest.avgR}: ${stats.avgR > 0 ? '+' : ''}${stats.avgR.toFixed(2)}R`}
              />
              <StatCard
                label={t.backtest.profitFactor}
                value={stats.profitFactor != null ? stats.profitFactor.toFixed(2) : '∞'}
                tone={(stats.profitFactor ?? 1) >= 1 ? 'positive' : 'negative'}
              />
              <StatCard
                label={t.backtest.maxDD}
                value={`−${stats.maxDrawdownR.toFixed(2)}R`}
                tone="negative"
                sub={`${t.backtest.avgHold}: ${fmt(stats.avgHoldDays)} ${t.backtest.days}`}
              />
              <StatCard
                label={`${t.backtest.best} / ${t.backtest.worst}`}
                value={`${stats.bestR > 0 ? '+' : ''}${stats.bestR.toFixed(1)} / ${stats.worstR.toFixed(1)}R`}
                sub={t.backtest.rUnit}
              />
            </div>

            {/* Equity curve */}
            <Card className="mt-4 border-border/60 glass">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <TrendingUp className="size-4 text-primary" />
                    {t.backtest.equityTitle}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-muted-foreground transition-colors hover:text-foreground" aria-label="info">
                        <Info className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-64 text-xs">
                      {t.backtest.equityNote}
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.equity.length > 1 ? (
                  <EquitySteps equity={data.equity} lang={lang} />
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">{t.backtest.empty}</p>
                )}
              </CardContent>
            </Card>

            {/* Trades table */}
            <Card className="mt-4 border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FlaskConical className="size-4 text-primary" />
                  {t.backtest.tradesList}
                  <span className="ms-auto text-[10px] font-normal text-muted-foreground">
                    {fmt(stats.skippedSignals)} {t.backtest.skipped}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-96 overflow-y-auto nice-scroll">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background/95 backdrop-blur">
                      <TableRow>
                        <TableHead className="text-start">{t.backtest.date}</TableHead>
                        <TableHead className="text-start">{t.backtest.side}</TableHead>
                        <TableHead className="text-start">{t.backtest.entry}</TableHead>
                        <TableHead className="text-start">{t.backtest.outcome}</TableHead>
                        <TableHead className="text-start">{t.backtest.hold}</TableHead>
                        <TableHead className="text-end">{t.backtest.result}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.trades.map((tr) => (
                        <TableRow key={tr.date} className="text-xs">
                          <TableCell className="font-mono text-[11px]" dir="ltr">
                            {tr.date.slice(5)}
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 font-bold',
                                tr.side === 'long' ? 'text-bull' : 'text-bear',
                              )}
                              dir="ltr"
                            >
                              {tr.side === 'long' ? (
                                <TrendingUp className="size-3" />
                              ) : (
                                <TrendingDown className="size-3" />
                              )}
                              {tr.side === 'long' ? t.backtest.long : t.backtest.short}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-[11px] tabular-nums" dir="ltr">
                            ${tr.entry < 0.01 ? tr.entry.toPrecision(3) : tr.entry.toFixed(4)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn('text-[10px] font-bold', OUTCOME_STYLES[tr.outcome])}
                            >
                              {tr.outcome}
                            </Badge>
                          </TableCell>
                          <TableCell className="tabular-nums text-muted-foreground" dir="ltr">
                            {tr.holdDays}d
                          </TableCell>
                          <TableCell
                            className="text-end font-bold tabular-nums"
                            style={{ color: rColor(tr.r) }}
                            dir="ltr"
                          >
                            {tr.r > 0 ? '+' : ''}
                            {tr.r.toFixed(2)}R
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Disclaimer */}
            <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-[11px] leading-relaxed text-amber-200/80">
              ⚠️ {t.backtest.disclaimer}
            </p>
          </>
        )}
      </div>
    </section>
  )
}
