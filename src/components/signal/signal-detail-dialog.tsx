'use client'

/**
 * Past-signal detail dialog — click a resolved row in the track record to
 * inspect the full engine output for that day (verdict, gauge, summary,
 * timeframe breakdown, indicators with education tooltips, trade plan).
 * Only resolved days are fetchable; today's signal stays locked.
 */

import { useQuery } from '@tanstack/react-query'
import {
  BadgeCheck,
  CalendarDays,
  History,
  Loader2,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/lib/i18n/context'
import { type SignalData } from '@/hooks/use-app-data'
import { verdictStyles, ScoreGauge } from '@/components/signal/verdict-ui'
import { cn } from '@/lib/utils'

interface DetailResponse {
  date: string
  signal: SignalData
  outcome: 'WIN' | 'LOSS' | 'NEUTRAL'
  changePercent: number | null
}

/** One indicator line with an education tooltip. */
function IndicatorRow({ ind }: { ind: SignalData['timeframes'][number]['indicators'][number] }) {
  const { t } = useI18n()
  const help = (t.indicatorHelp as Record<string, string | undefined>)[ind.key]

  const body = (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-border/40 last:border-0 text-sm hover:bg-secondary/40 transition-colors cursor-help">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            'size-2 rounded-full shrink-0',
            ind.vote === 'bullish' ? 'bg-bull' : ind.vote === 'bearish' ? 'bg-bear' : 'bg-muted-foreground/40'
          )}
        />
        <span className="font-mono text-xs font-semibold uppercase">{ind.key}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-[180px]">{ind.display}</span>
        <span
          className={cn(
            'font-mono text-xs font-bold tabular-nums w-12 text-end',
            ind.contribution > 0 ? 'text-bull' : ind.contribution < 0 ? 'text-bear' : 'text-muted-foreground'
          )}
        >
          {ind.contribution >= 0 ? '+' : ''}
          {(ind.contribution * 100).toFixed(0)}
        </span>
      </div>
    </div>
  )

  if (!help) return body
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>{body}</div>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-72 text-xs leading-relaxed">
          {help}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function SignalDetailDialog({
  date,
  onOpenChange,
}: {
  date: string | null
  onOpenChange: (open: boolean) => void
}) {
  const { t, lang } = useI18n()
  const open = !!date

  const { data, isLoading } = useQuery({
    queryKey: ['signal-detail', date],
    queryFn: async (): Promise<DetailResponse> => {
      const res = await fetch(`/api/signal/detail?date=${date}`, { credentials: 'same-origin' })
      if (!res.ok) throw new Error(`detail ${res.status}`)
      return res.json()
    },
    enabled: open,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const p = (n: number) => `$${n.toFixed(5)}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong border-primary/20 max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <History className="size-5 text-primary" />
            {t.signal.detailTitle}
            {date && (
              <Badge variant="outline" className="border-border font-mono gap-1">
                <CalendarDays className="size-3" />
                {date}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t.signal.historicalNote}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" /> {t.signal.loading}
            </div>
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Verdict + outcome */}
            {(() => {
              const vs = verdictStyles(data.signal.verdict)
              const Icon = vs.icon
              const won = data.outcome === 'WIN'
              const lost = data.outcome === 'LOSS'
              const chg = data.changePercent
              return (
                <div className={cn('rounded-2xl border p-5 flex flex-col sm:flex-row items-center gap-5', vs.bg)}>
                  <ScoreGauge score={data.signal.score} size="sm" />
                  <div className="flex-1 text-center sm:text-start space-y-2">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <span className={cn('text-2xl font-black tracking-tight flex items-center gap-2', vs.color)}>
                        <Icon className="size-6" />
                        {t.signal.verdicts[data.signal.verdict]}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'gap-1',
                          won
                            ? 'border-bull/40 text-bull'
                            : lost
                              ? 'border-bear/40 text-bear'
                              : 'border-border text-muted-foreground'
                        )}
                      >
                        <BadgeCheck className="size-3" />
                        {won ? t.track.win : lost ? t.track.loss : t.track.neutralOutcome}
                        {chg != null && (
                          <span className="font-mono">
                            {chg >= 0 ? '+' : ''}
                            {chg.toFixed(2)}%
                          </span>
                        )}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {data.signal.summary[lang === 'fa' ? 'fa' : 'en']}
                    </p>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="size-3.5" /> {t.signal.confidence}:{' '}
                        {data.signal.confidence.toFixed(0)}%
                      </span>
                      <span>
                        PENGU: <span className="font-mono text-foreground">{p(data.signal.priceUsd)}</span>
                      </span>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Trade plan (live days only — backfilled snapshots have side 'none') */}
            {data.signal.plan.side !== 'none' && (
              <div>
                <h4 className="flex items-center gap-2 text-sm font-bold mb-2.5">
                  <Target className="size-4 text-primary" /> {t.signal.plan}
                  <Badge variant="outline" className={data.signal.plan.side === 'long' ? 'border-bull/40 text-bull' : 'border-bear/40 text-bear'}>
                    {data.signal.plan.side.toUpperCase()}
                  </Badge>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="rounded-xl bg-secondary/50 border border-border/60 p-3">
                    <div className="text-[11px] text-muted-foreground mb-1">{t.signal.entry}</div>
                    <div className="font-mono font-bold text-sm">
                      {p(data.signal.plan.entryLow)} – {p(data.signal.plan.entryHigh)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-secondary/50 border border-bear/25 p-3">
                    <div className="text-[11px] text-muted-foreground mb-1">{t.signal.stopLoss}</div>
                    <div className="font-mono font-bold text-sm text-bear">{p(data.signal.plan.stopLoss)}</div>
                  </div>
                  <div className="rounded-xl bg-secondary/50 border border-border/60 p-3 col-span-2 sm:col-span-1">
                    <div className="text-[11px] text-muted-foreground mb-1">{t.signal.targets}</div>
                    <div className="font-mono font-bold text-sm text-bull flex flex-wrap gap-x-2">
                      {data.signal.plan.takeProfits.map((tp, i) => (
                        <span key={i}>
                          TP{i + 1}: {p(tp)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Timeframe breakdown */}
            <div>
              <h4 className="text-sm font-bold mb-2.5">{t.signal.timeframeBreakdown}</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {data.signal.timeframes.map((tf) => {
                  const s = verdictStyles(tf.score >= 15 ? 'BUY' : tf.score <= -15 ? 'SELL' : 'HOLD')
                  const Icon = s.icon
                  return (
                    <div key={tf.timeframe} className={cn('rounded-xl border p-3', s.bg)}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs font-bold">{tf.timeframe.toUpperCase()}</span>
                        <Icon className={cn('size-4', s.color)} />
                      </div>
                      <div className={cn('text-lg font-black tabular-nums', s.color)}>
                        {tf.score >= 0 ? '+' : ''}
                        {tf.score.toFixed(0)}
                      </div>
                      {tf.trendStrength != null && (
                        <div className="text-[10px] text-muted-foreground mt-1">
                          ADX: <span className="font-mono">{tf.trendStrength.toFixed(0)}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Indicators with tooltips */}
            {data.signal.timeframes[0] && (
              <div>
                <h4 className="text-sm font-bold mb-2.5">
                  {t.signal.indicators} <span className="text-muted-foreground font-normal">· {data.signal.timeframes[0].timeframe.toUpperCase()}</span>
                </h4>
                <div className="rounded-xl border border-border/60 overflow-hidden">
                  {data.signal.timeframes[0].indicators.map((ind) => (
                    <IndicatorRow key={ind.key} ind={ind} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
