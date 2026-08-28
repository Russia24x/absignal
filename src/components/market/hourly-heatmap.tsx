'use client'

/**
 * 24h hourly performance heatmap — one cell per UTC hour, colored by that
 * hour's real open→close move (from live 1h candles). Shares the chart's
 * ['candles','1h'] query cache — zero extra requests.
 */

import { useMemo } from 'react'
import { CalendarClock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/lib/i18n/context'
import { useCandles } from '@/hooks/use-app-data'
import { cn } from '@/lib/utils'

interface HourCell {
  hour: number // UTC hour 0-23
  change: number // percent
}

function cellColor(change: number): string {
  const magnitude = Math.min(Math.abs(change), 3) / 3 // 0…1
  const alpha = 0.16 + magnitude * 0.66
  return change >= 0
    ? `rgba(61, 220, 151, ${alpha.toFixed(2)})`
    : `rgba(255, 107, 122, ${alpha.toFixed(2)})`
}

export function HourlyHeatmap() {
  const { t } = useI18n()
  const { data, isLoading } = useCandles('1h')

  const cells = useMemo<HourCell[]>(() => {
    const list = data?.candles ?? []
    return list.slice(-24).map((c) => ({
      hour: new Date(c.time * 1000).getUTCHours(),
      change: c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0,
    }))
  }, [data])

  const best = useMemo(() => (cells.length ? cells.reduce((a, b) => (b.change > a.change ? b : a)) : null), [cells])
  const worst = useMemo(() => (cells.length ? cells.reduce((a, b) => (b.change < a.change ? b : a)) : null), [cells])

  return (
    <Card className="glass card-interactive border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4 text-primary" />
            {t.heatmap.title}
          </CardTitle>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground" dir="ltr">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded" style={{ backgroundColor: cellColor(1.5) }} />
              {t.heatmap.up}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded" style={{ backgroundColor: cellColor(-1.5) }} />
              {t.heatmap.down}
            </span>
            {data?.stale && (
              <Badge variant="outline" className="border-amber-400/40 text-amber-300 text-[10px]">
                {t.market.staleData}
              </Badge>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t.heatmap.hint}</p>
      </CardHeader>
      <CardContent className="pb-4">
        {isLoading ? (
          <div className="grid grid-cols-8 sm:grid-cols-12 gap-1.5" dir="ltr">
            {Array.from({ length: 24 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-8 sm:grid-cols-12 gap-1.5" dir="ltr" role="list" aria-label={t.heatmap.title}>
              {cells.map((c, i) => {
                const isBest = best != null && c.hour === best.hour && i === cells.findIndex((x) => x.hour === best.hour)
                const isWorst = worst != null && c.hour === worst.hour && i === cells.findIndex((x) => x.hour === worst.hour)
                return (
                  <div
                    key={i}
                    role="listitem"
                    title={`${String(c.hour).padStart(2, '0')}:00 UTC · ${c.change >= 0 ? '+' : ''}${c.change.toFixed(2)}%`}
                    aria-label={`${t.heatmap.hour} ${String(c.hour).padStart(2, '0')}:00, ${t.heatmap.change} ${c.change.toFixed(2)}%`}
                    className={cn(
                      'group relative aspect-square rounded-lg flex flex-col items-center justify-center border transition-transform duration-200 hover:scale-110 hover:z-10 cursor-default',
                      isBest ? 'border-bull/70' : isWorst ? 'border-bear/70' : 'border-white/5'
                    )}
                    style={{ backgroundColor: cellColor(c.change) }}
                  >
                    <span className="text-[9px] leading-none text-foreground/60 font-medium">
                      {String(c.hour).padStart(2, '0')}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] leading-tight font-bold tabular-nums',
                        c.change >= 0 ? 'text-bull' : 'text-bear'
                      )}
                    >
                      {c.change >= 0 ? '+' : ''}
                      {c.change.toFixed(1)}
                    </span>
                  </div>
                )
              })}
            </div>
            {/* best / worst summary */}
            {best && worst && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground" dir="ltr">
                <span>
                  🏆 {String(best.hour).padStart(2, '0')}:00{' '}
                  <span className="text-bull font-semibold">
                    +{best.change.toFixed(2)}%
                  </span>
                </span>
                <span>
                  🧊 {String(worst.hour).padStart(2, '0')}:00{' '}
                  <span className="text-bear font-semibold">
                    {worst.change.toFixed(2)}%
                  </span>
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
