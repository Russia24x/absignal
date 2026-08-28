'use client'

/**
 * Pricing — the free tier + 5 time-based PENGU plans
 * (day / week / month / year / lifetime).
 * Prices render from live /api/config — never hardcoded.
 * No session keys: plain ERC-20 transfers verified on-chain.
 */

import { motion } from 'framer-motion'
import {
  CalendarCheck,
  CalendarDays,
  Check,
  Compass,
  Crown,
  Infinity as InfinityIcon,
  Lock,
  TrendingDown,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/lib/i18n/context'
import { useAppConfig } from '@/hooks/use-app-data'
import { cn } from '@/lib/utils'

const PLAN_ICONS: Record<string, LucideIcon> = {
  day: Zap,
  week: CalendarDays,
  month: Crown,
  year: CalendarCheck,
  lifetime: InfinityIcon,
}

/** Hard cap of the Round-17 discount staircase (percent). */
const DISCOUNT_CAP = 30

/** Height (px) of the tallest bar in the staircase visual. */
const LADDER_MAX_PX = 52

/** Trim a per-day rate to a clean display string ("10", "0.71", "0.27"). */
function rateLabel(rate: number): string {
  return rate.toFixed(2).replace(/\.?0+$/, '')
}

/** Short staircase label per plan id. */
const LADDER_LABELS: Record<string, 'ladderDay' | 'ladderWeek' | 'ladderMonth' | 'ladderYear' | 'ladderLifetime'> = {
  day: 'ladderDay',
  week: 'ladderWeek',
  month: 'ladderMonth',
  year: 'ladderYear',
  lifetime: 'ladderLifetime',
}

/** Discount staircase visual — 5 rising bars capped by the 30% dashed line. */
function StaircaseLadder({
  packages,
}: {
  packages: Array<{ id: string; discountPct: number }>
}) {
  const { t, fmt } = useI18n()
  const discounted = packages.some((p) => p.discountPct > 0)
  if (!discounted) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45 }}
      className="mt-6 max-w-2xl mx-auto"
    >
      <div className="glass rounded-2xl border border-border/60 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-center gap-2 text-xs font-semibold text-muted-foreground">
          <TrendingDown className="size-3.5 text-bull" aria-hidden />
          {t.pricing.ladderTitle}
        </div>
        <div className="mt-4 flex items-end justify-center gap-3 sm:gap-6">
          {packages.map((p) => {
            const isCap = p.discountPct >= DISCOUNT_CAP
            const height = 6 + (p.discountPct / DISCOUNT_CAP) * (LADDER_MAX_PX - 6)
            return (
              <div key={p.id} className="flex w-11 sm:w-14 flex-col items-center gap-1.5">
                <span
                  className={cn(
                    'text-[10px] font-black tabular-nums leading-none',
                    p.discountPct > 0 ? 'text-bull' : 'text-muted-foreground/70'
                  )}
                  dir="ltr"
                >
                  {p.discountPct > 0 ? `−${fmt(p.discountPct)}%` : `${fmt(0)}%`}
                </span>
                <div
                  className={cn(
                    'w-full rounded-t-md border border-b-0 transition-colors',
                    isCap
                      ? 'border-bull/50 bg-gradient-to-t from-bull/25 to-bull/60'
                      : 'border-primary/40 bg-gradient-to-t from-primary/20 to-primary/55'
                  )}
                  style={{ height: `${height}px` }}
                  role="img"
                  aria-label={`${p.id}: ${p.discountPct}%`}
                />
                <span className="text-[9px] font-medium text-muted-foreground/80 whitespace-nowrap leading-none">
                  {t.pricing[LADDER_LABELS[p.id] ?? 'ladderDay']}
                </span>
              </div>
            )
          })}
        </div>
        {/* 30% cap rule — dashed line exactly at the tallest bar's top */}
        <div className="mx-auto mt-2 max-w-[280px] sm:max-w-[360px]">
          <div className="relative border-t border-dashed border-bull/40 pt-1">
            <span
              className="absolute -top-2 end-1 rounded-full border border-bull/30 bg-bull/10 px-1.5 py-px text-[9px] font-bold text-bull"
            >
              {t.pricing.ladderCap}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function Pricing() {
  const { t, tf, fmt } = useI18n()
  const { data: config } = useAppConfig()
  const packages = config?.packages ?? []

  const freeChips = [
    t.pricing.freeChipMarket,
    t.pricing.freeChipTrack,
    t.pricing.freeChipBacktest,
    t.pricing.freeChipRisk,
  ]

  const featureFor = (id: string): string[] => {
    const base = [t.pricing.featSignal, t.pricing.featStack]
    switch (id) {
      case 'day':
        return [t.pricing.featSignal, t.pricing.featTry]
      case 'week':
        return [...base, t.pricing.featFlex]
      case 'month':
        return [...base, t.pricing.featPopular]
      case 'year':
        return [...base, t.pricing.featBestRate]
      case 'lifetime':
        return [t.pricing.featSignal, t.pricing.featForever, t.pricing.featStack]
      default:
        return base
    }
  }

  const durationFor = (days: number | null): string => {
    if (days == null) return t.pricing.forever
    if (days === 365) return t.pricing.durationYear
    if (days === 1) return t.pricing.durationDay
    return tf(t.pricing.durationDays, { days: fmt(days) })
  }

  return (
    <section id="pricing" className="relative py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <span className="inline-block text-[11px] font-bold uppercase tracking-[0.25em] text-primary/80 mb-3">
            {t.eyebrow.pricing}
          </span>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-gradient-frost">
            {t.pricing.title}
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
            {t.pricing.subtitle}
          </p>
        </motion.div>

        {/* Free tier — registration & login cost nothing */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.45 }}
          className="mb-6 max-w-5xl mx-auto"
        >
          <div className="glass rounded-2xl border border-border/60 p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-4 sm:gap-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary/70 border border-border/60 text-primary">
              <Compass className="size-6" />
            </div>
            <div className="flex-1 text-center sm:text-start min-w-0">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h3 className="font-bold text-base">{t.pricing.freeTitle}</h3>
                <Badge
                  variant="outline"
                  className="border-bull/40 text-bull gap-1 font-bold"
                >
                  <Check className="size-3" strokeWidth={3} />
                  {t.pricing.freePrice}
                </Badge>
              </div>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {t.pricing.freeDesc}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5 justify-center sm:justify-start">
                {freeChips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-border/60 bg-secondary/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-2.5 shrink-0">
              <span className="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold text-amber-200">
                <Lock className="size-3" />
                {t.pricing.freeChip}
              </span>
              <a
                href="#app"
                className="text-xs font-bold text-primary hover:text-primary/80 transition-colors"
              >
                {t.pricing.freeCta} →
              </a>
            </div>
          </div>
        </motion.div>

        {/* The 5 plans — stacked full-width on mobile, 2-up on small tablets, 5-across on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 max-w-6xl mx-auto items-stretch">
          {packages.map((p, i) => {
            const Icon = PLAN_ICONS[p.id] ?? Zap
            const popular = !!p.popular
            const perDay = p.days ? p.price / p.days : null
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.45, delay: i * 0.08 }}
                className={cn('h-full', p.id === 'lifetime' && 'sm:col-span-2 lg:col-span-1')}
              >
                <Card
                  className={cn(
                    'glass h-full flex flex-col relative overflow-hidden transition-all duration-300 hover:-translate-y-1',
                    popular
                      ? 'border-primary/50 glow-frost bg-primary/[0.04]'
                      : 'border-border/60 hover:border-primary/25'
                  )}
                >
                  {popular && <div className="absolute top-0 inset-x-0 h-px aurora-line" aria-hidden />}
                  <CardHeader className="pb-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex size-9 items-center justify-center rounded-xl bg-secondary/70 border border-border/60 text-primary">
                        <Icon className="size-4.5" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {p.discountPct > 0 && (
                          <Badge
                            variant="outline"
                            className="border-bull/40 text-bull font-bold text-[10px] px-2 gap-1"
                          >
                            <TrendingDown className="size-3" aria-hidden />
                            {tf(t.pricing.savePct, { pct: fmt(p.discountPct) })}
                            {p.discountPct >= DISCOUNT_CAP && (
                              <span className="text-bull/70">· {t.pricing.maxBadge}</span>
                            )}
                          </Badge>
                        )}
                        {popular && (
                          <Badge className="bg-primary/20 text-primary border-primary/50 hover:bg-primary/20 font-bold glow-frost text-[10px] px-2">
                            {t.sub.mostPopular}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <h3 className="font-bold text-base mt-2">{t.pricing[`${p.id}Title` as keyof typeof t.pricing] as string}</h3>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {t.pricing[`${p.id}Desc` as keyof typeof t.pricing] as string}
                    </p>
                  </CardHeader>
                  <CardContent className="pt-0 p-4 flex flex-col flex-1 gap-3">
                    <div dir="ltr" className="flex items-baseline gap-1.5 flex-wrap">
                      {p.basePrice > p.price && (
                        <span
                          className="text-xs font-semibold text-muted-foreground/60 line-through tabular-nums"
                          title={`${p.basePrice} PENGU`}
                        >
                          {fmt(p.basePrice)}
                        </span>
                      )}
                      <span className="text-2xl font-black tabular-nums text-gradient-frost">
                        {fmt(p.price)}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                        PENGU
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground -mt-1.5 space-y-0.5">
                      <div className="font-semibold text-foreground/80">{durationFor(p.days)}</div>
                      {perDay != null ? (
                        <div>{tf(t.sub.perDay, { price: fmt(Number(rateLabel(perDay))) })}</div>
                      ) : (
                        <div className="flex items-center gap-1 text-accent/90 font-semibold">
                          <InfinityIcon className="size-3" />
                          {t.pricing.foreverNote}
                        </div>
                      )}
                    </div>
                    <ul className="space-y-1.5 flex-1">
                      {featureFor(p.id).map((point) => (
                        <li key={point} className="flex items-start gap-1.5 text-xs sm:text-[11px] text-muted-foreground">
                          <Check className="size-3 text-bull shrink-0 mt-0.5" strokeWidth={2.5} />
                          <span className="leading-relaxed">{point}</span>
                        </li>
                      ))}
                    </ul>
                    <a href="#app" className="block">
                      <span
                        className={cn(
                          'block w-full text-center rounded-xl px-3 py-2.5 text-xs font-bold transition-all',
                          popular
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90 glow-frost'
                            : 'bg-secondary/80 border border-primary/25 text-foreground hover:border-primary/60 hover:text-primary'
                        )}
                      >
                        {t.pricing.cta}
                      </span>
                    </a>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>

        {/* Staircase — the tiered-discount ladder, capped at 30% */}
        <StaircaseLadder packages={packages} />

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-6 text-center text-[11px] text-muted-foreground max-w-xl mx-auto leading-relaxed"
        >
          {t.pricing.note}
        </motion.p>
      </div>
    </section>
  )
}
