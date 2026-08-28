'use client'

/**
 * PENGU Market Sentiment gauge — a 0-100 composite index computed
 * server-side from real market components (see lib/market/sentiment.ts).
 * Semicircular SVG gauge with animated needle, zone coloring and a
 * per-component breakdown.
 */

import { useMemo } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus, Snowflake } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/lib/i18n/context'
import { useMarketSentiment, type SentimentComponent } from '@/hooks/use-app-data'
import { cn } from '@/lib/utils'

/* ------------------------------ gauge geometry ----------------------------- */

const CX = 100
const CY = 100
const R = 78

function polar(angleDeg: number, radius = R): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180
  return { x: CX + radius * Math.cos(a), y: CY - radius * Math.sin(a) }
}

function arcPath(fromScore: number, toScore: number): string {
  const a1 = 180 - (fromScore / 100) * 180
  const a2 = 180 - (toScore / 100) * 180
  const p1 = polar(a1)
  const p2 = polar(a2)
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${R} ${R} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
}

const ZONES: Array<{ from: number; to: number; color: string }> = [
  { from: 0, to: 25, color: '#ff6b7a' },
  { from: 25, to: 45, color: '#ffab6b' },
  { from: 45, to: 55, color: '#8fb0c5' },
  { from: 55, to: 75, color: '#86e3ae' },
  { from: 75, to: 100, color: '#3ddc97' },
]

function zoneColor(score: number): string {
  for (let i = ZONES.length - 1; i >= 0; i--) {
    if (score >= ZONES[i].from) return ZONES[i].color
  }
  return ZONES[0].color
}

/* ------------------------------ sub-elements ------------------------------- */

function Gauge({ score }: { score: number }) {
  const needleAngle = (score / 100) * 180 - 90 // -90° (left) … +90° (right)
  const tip = polar(90, R - 16)
  const color = zoneColor(score)

  return (
    <svg viewBox="0 0 200 118" className="w-full max-w-[260px] mx-auto" role="img" aria-label={`Sentiment index ${score}`}>
      {/* zone arcs */}
      {ZONES.map((z) => (
        <path
          key={z.from}
          d={arcPath(z.from, z.to)}
          fill="none"
          stroke={z.color}
          strokeWidth="13"
          strokeLinecap="butt"
          opacity={score >= z.from && score <= z.to ? 0.95 : 0.35}
        />
      ))}
      {/* tick marks at 0 / 25 / 50 / 75 / 100 */}
      {[0, 25, 50, 75, 100].map((s) => {
        const a = 180 - (s / 100) * 180
        const p1 = polar(a, R - 9)
        const p2 = polar(a, R + 9)
        return <line key={s} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(143,176,197,0.5)" strokeWidth="1" />
      })}
      {/* needle — drawn pointing up, rotated to the score */}
      <g
        style={{
          transform: `rotate(${needleAngle}deg)`,
          transformOrigin: `${CX}px ${CY}px`,
          transition: 'transform 1.1s cubic-bezier(0.34, 1.4, 0.64, 1)',
        }}
      >
        <line x1={CX} y1={CY} x2={tip.x} y2={tip.y} stroke={color} strokeWidth="3.5" strokeLinecap="round" />
        <circle cx={CX} cy={CY} r="7" fill="#0b1f30" stroke={color} strokeWidth="3" />
      </g>
      {/* score number */}
      <text x={CX} y={CY - 26} textAnchor="middle" fontSize="30" fontWeight="900" fill={color} className="tabular-nums">
        {score}
      </text>
    </svg>
  )
}

function ComponentRow({ comp }: { comp: SentimentComponent }) {
  const { t } = useI18n()
  const color = zoneColor(comp.score)
  const label = t.sentiment.comp[comp.key]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2.5 py-1 cursor-help">
          <span className="w-28 sm:w-32 shrink-0 text-[11px] text-muted-foreground truncate">{label}</span>
          <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${comp.score}%`, backgroundColor: color }}
            />
          </div>
          <span className="w-24 sm:w-32 shrink-0 text-[10px] font-mono text-muted-foreground text-start truncate" dir="ltr">
            {comp.detail}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <span className="font-semibold">{label}</span>
        <span className="mx-1.5 opacity-50">·</span>
        <span dir="ltr">{comp.detail}</span>
      </TooltipContent>
    </Tooltip>
  )
}

/* --------------------------------- main card -------------------------------- */

export function SentimentGauge() {
  const { t } = useI18n()
  const { data, isLoading } = useMarketSentiment()

  const zoneLabel = useMemo(() => {
    if (!data) return ''
    return t.sentiment.zones[data.zone]
  }, [data, t])

  if (isLoading || !data) {
    return (
      <Card className="glass border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.sentiment.title}</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <div className="mt-3 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full rounded-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const delta = data.delta
  const deltaTone = delta == null || delta === 0 ? 'neutral' : delta > 0 ? 'bull' : 'bear'

  return (
    <Card className="glass card-interactive border-border/60">
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Snowflake className="size-4 text-primary icon-bob" />
            {t.sentiment.title}
          </CardTitle>
          {data.stale && (
            <Badge variant="outline" className="border-amber-400/40 text-amber-300 text-[10px]">
              {t.market.staleData}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t.sentiment.subtitle}</p>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="relative">
          <Gauge score={data.score} />
          <div className="flex items-center justify-center gap-2 -mt-2 pb-2">
            <span
              className="text-sm font-black"
              style={{ color: zoneColor(data.score) }}
            >
              {zoneLabel}
            </span>
            {delta != null && (
              <span
                className={cn(
                  'flex items-center gap-0.5 text-xs font-semibold rounded-full px-2 py-0.5 border',
                  deltaTone === 'bull' && 'text-bull border-bull/30 bg-bull/10',
                  deltaTone === 'bear' && 'text-bear border-bear/30 bg-bear/10',
                  deltaTone === 'neutral' && 'text-muted-foreground border-border/60 bg-secondary'
                )}
                title={t.sentiment.delta24h}
              >
                {delta > 0 ? <ArrowUpRight className="size-3" /> : delta < 0 ? <ArrowDownRight className="size-3" /> : <Minus className="size-3" />}
                <span dir="ltr">{delta > 0 ? `+${delta}` : delta}</span>
              </span>
            )}
          </div>
        </div>

        <TooltipProvider delayDuration={150}>
          <div className="border-t border-border/50 pt-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">{t.sentiment.components}</p>
            {data.components.map((c) => (
              <ComponentRow key={c.key} comp={c} />
            ))}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  )
}
