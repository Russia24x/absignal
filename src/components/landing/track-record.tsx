'use client'

/**
 * Track record body (rendered inside PerformanceSection): every locked
 * daily verdict scored against the real next-day move. Transparency is
 * the product's trust anchor.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { History, Info, Lock, Trophy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/lib/i18n/context'
import { useTrackRecord } from '@/hooks/use-app-data'
import { useCountUp } from '@/hooks/use-count-up'
import { SignalDetailDialog } from '@/components/signal/signal-detail-dialog'
import { EquityCurve } from '@/components/landing/equity-curve'
import { SignalCalendar, SignalCalendarSkeleton } from '@/components/landing/signal-calendar'
import { cn } from '@/lib/utils'

/* ----------------------------- Visual widgets ----------------------------- */

/** SVG donut ring showing directional accuracy (0-100%). */
function AccuracyDonut({ accuracy }: { accuracy: number | null }) {
  const animated = useCountUp(accuracy ?? 0, 1300, 0)
  const r = 34
  const c = 2 * Math.PI * r
  const filled = (animated / 100) * c
  const color = animated >= 60 ? '#3ddc97' : animated >= 45 ? '#7be1ff' : '#ff6b7a'

  return (
    <div className="relative size-24 shrink-0 chart-ltr" dir="ltr">
      <svg viewBox="0 0 80 80" className="size-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(123,225,255,0.12)" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          style={{ filter: 'drop-shadow(0 0 6px rgba(123,225,255,0.35))' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black tabular-nums" style={{ color }}>
          {animated.toFixed(0)}%
        </span>
      </div>
    </div>
  )
}

/** Count-up number that starts when scrolled into view. */
function CountUpStat({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const v = useCountUp(value, 1100, decimals)
  return (
    <span className="tabular-nums">{decimals ? v.toFixed(decimals) : v.toFixed(0)}</span>
  )
}

function verdictBadge(verdict: string, labels: Record<string, string>) {
  const label = labels[verdict] ?? verdict
  switch (verdict) {
    case 'LOCKED':
      return (
        <Badge variant="outline" className="border-primary/30 text-primary gap-1 hover:bg-transparent">
          <Lock className="size-3" />
          {label}
        </Badge>
      )
    case 'STRONG_BUY':
      return <Badge className="bg-bull/15 text-bull border-bull/40 hover:bg-bull/15">{label}</Badge>
    case 'BUY':
      return <Badge className="bg-bull/8 text-bull border-bull/25 hover:bg-bull/8">{label}</Badge>
    case 'SELL':
      return <Badge className="bg-bear/8 text-bear border-bear/25 hover:bg-bear/8">{label}</Badge>
    case 'STRONG_SELL':
      return <Badge className="bg-bear/15 text-bear border-bear/40 hover:bg-bear/15">{label}</Badge>
    default:
      return <Badge variant="outline" className="border-primary/25 text-primary">{label}</Badge>
  }
}

export function TrackRecord() {
  const { t, lang } = useI18n()
  const { data, isLoading } = useTrackRecord()
  const [detailDate, setDetailDate] = useState<string | null>(null)

  const stats = data?.stats

  return (
    <div>
      {/* Equity curve */}
      <div className="mb-6">
        <EquityCurve />
      </div>

        {/* Stats */}
        {stats && stats.total > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 max-w-3xl mx-auto"
          >
            <div className="rounded-2xl glass card-interactive border-border/60 p-4 text-center">
              <div className="text-2xl font-black tabular-nums">
                <CountUpStat value={stats.total} />
              </div>
              <div className="text-[11px] text-muted-foreground">{t.track.signals}</div>
            </div>
            <div className="rounded-2xl glass card-interactive border-bull/25 p-4 text-center">
              <div className="text-2xl font-black tabular-nums text-bull">
                <CountUpStat value={stats.wins} />
              </div>
              <div className="text-[11px] text-muted-foreground">{t.track.wins}</div>
            </div>
            <div className="rounded-2xl glass card-interactive border-bear/25 p-4 text-center">
              <div className="text-2xl font-black tabular-nums text-bear">
                <CountUpStat value={stats.losses} />
              </div>
              <div className="text-[11px] text-muted-foreground">{t.track.losses}</div>
            </div>
            <div className="rounded-2xl glass card-interactive border-primary/25 p-4 flex items-center justify-center gap-3">
              <AccuracyDonut accuracy={stats.accuracy} />
              <div className="text-start">
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  {t.track.accuracy}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="size-3 text-muted-foreground/60 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-64 text-xs">
                        <p>{t.track.howComputedDesc}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Signal calendar (monthly verdict heatmap) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.12 }}
          className="mb-6"
        >
          {isLoading ? (
            <SignalCalendarSkeleton />
          ) : data && data.entries.length > 0 ? (
            <SignalCalendar
              entries={data.entries}
              onPickDate={(d) => setDetailDate(d)}
            />
          ) : null}
        </motion.div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <Card className="glass border-border/60 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="size-4 text-accent" />
                {t.track.title}
                <span className="ms-auto text-[11px] font-normal text-muted-foreground flex items-center gap-1.5">
                  <History className="size-3.5" />
                  <span className="hidden sm:inline">{t.signal.detailHint}</span>
                  <span className="sm:hidden">↗</span>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 rounded-lg" />
                  ))}
                </div>
              ) : !data || data.entries.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">{t.track.empty}</div>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card/95 backdrop-blur z-10">
                      <TableRow className="hover:bg-transparent border-border/40">
                        <TableHead className="text-xs">{t.track.date}</TableHead>
                        <TableHead className="text-xs">{t.track.verdict}</TableHead>
                        <TableHead className="text-xs hidden sm:table-cell">{t.track.score}</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">{t.track.priceThen}</TableHead>
                        <TableHead className="text-xs hidden sm:table-cell">{t.track.nextDay}</TableHead>
                        <TableHead className="text-xs">{t.track.outcome}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.entries.map((e) => {
                        const clickable = e.verdict !== 'LOCKED' && e.outcome !== 'PENDING'
                        return (
                          <TableRow
                            key={e.date}
                            className={cn(
                              'border-border/30',
                              e.verdict === 'LOCKED' && 'opacity-70',
                              clickable
                                ? 'cursor-pointer hover:bg-primary/5 transition-colors'
                                : 'hover:bg-transparent'
                            )}
                            onClick={clickable ? () => setDetailDate(e.date) : undefined}
                          >
                          <TableCell className="font-mono text-xs whitespace-nowrap">{e.date}</TableCell>
                          <TableCell>{verdictBadge(e.verdict, t.signal.verdicts as Record<string, string>)}</TableCell>
                          <TableCell
                            className={cn(
                              'font-mono text-xs font-bold tabular-nums hidden sm:table-cell',
                              e.verdict === 'LOCKED'
                                ? 'text-muted-foreground'
                                : e.score > 5
                                  ? 'text-bull'
                                  : e.score < -5
                                    ? 'text-bear'
                                    : 'text-muted-foreground'
                            )}
                          >
                            {e.verdict === 'LOCKED' ? '· · ·' : `${e.score >= 0 ? '+' : ''}${e.score.toFixed(0)}`}
                          </TableCell>
                          <TableCell className="font-mono text-xs hidden md:table-cell">
                            {e.verdict === 'LOCKED' ? '· · ·' : `$${e.priceAtSignal.toFixed(5)}`}
                          </TableCell>
                          <TableCell
                            className={cn(
                              'font-mono text-xs hidden sm:table-cell',
                              (e.changePercent ?? 0) >= 0 ? 'text-bull' : 'text-bear'
                            )}
                          >
                            {e.changePercent != null
                              ? `${e.changePercent >= 0 ? '+' : ''}${e.changePercent.toFixed(2)}%`
                              : '—'}
                          </TableCell>
                          <TableCell>
                            {clickable && (
                              <History className="size-3.5 text-primary/50 inline me-1 sm:hidden" aria-hidden />
                            )}
                            {e.outcome === 'WIN' && (
                              <Badge className="bg-bull/15 text-bull border-bull/40 hover:bg-bull/15">
                                {t.track.win}
                              </Badge>
                            )}
                            {e.outcome === 'LOSS' && (
                              <Badge className="bg-bear/15 text-bear border-bear/40 hover:bg-bear/15">
                                {t.track.loss}
                              </Badge>
                            )}
                            {e.outcome === 'NEUTRAL' && (
                              <Badge variant="outline" className="text-muted-foreground">
                                {t.track.neutralOutcome}
                              </Badge>
                            )}
                            {e.outcome === 'PENDING' && (
                              <Badge variant="outline" className="border-primary/30 text-primary">
                                {t.track.pending}
                              </Badge>
                            )}
                          </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

      <SignalDetailDialog date={detailDate} onOpenChange={(open) => !open && setDetailDate(null)} />
    </div>
  )
}
