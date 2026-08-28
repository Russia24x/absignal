'use client'

/**
 * LiveStatsStrip — a row of 4 compact stat tiles sitting just below the
 * hero. Each tile uses AnimatedNumber for a tasteful count-up on scroll
 * into view, and shows: Market Cap, 24h Volume, Liquidity, Buy Pressure
 * (with a proportion bar). Hooks the user's eye with hard numbers right
 * after the hero, no scrolling required.
 *
 * Falls back to a single skeleton tile when market data is unavailable
 * (e.g., upstream rate-limited); never throws or blocks the page.
 */
import { motion } from 'framer-motion'
import { Activity, Droplets, Layers, TrendingUp } from 'lucide-react'
import { AnimatedNumber } from '@/components/landing/animated-number'
import { useI18n } from '@/lib/i18n/context'
import { useMarketOverview } from '@/hooks/use-app-data'

type StatProps = {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
  delay?: number
}

function StatTile({ icon, label, children, delay = 0 }: StatProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay }}
      className="stat-tile rounded-2xl p-4 sm:p-5 flex flex-col gap-2 min-w-0"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          {icon}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wider truncate">{label}</span>
      </div>
      <div className="text-xl sm:text-2xl font-black tabular-nums text-foreground truncate">
        {children}
      </div>
    </motion.div>
  )
}

/** Split a large USD number into a small value + SI suffix for count-up display. */
function splitMagnitude(n: number | null | undefined): { value: number; suffix: string } | null {
  if (n == null || !isFinite(n)) return null
  if (n >= 1_000_000_000) return { value: n / 1_000_000_000, suffix: 'B' }
  if (n >= 1_000_000) return { value: n / 1_000_000, suffix: 'M' }
  if (n >= 1_000) return { value: n / 1_000, suffix: 'K' }
  return { value: n, suffix: '' }
}

export function LiveStatsStrip() {
  const { t } = useI18n()
  const { data: market, isLoading } = useMarketOverview()

  const mcapSplit = splitMagnitude(market?.marketCapUsd ?? null)
  const volSplit = splitMagnitude(market?.volume24hUsd ?? null)
  const liqSplit = splitMagnitude(market?.liquidityUsd ?? null)
  const buys = market?.buys24h ?? null
  const sells = market?.sells24h ?? null
  const totalTx = buys != null && sells != null ? buys + sells : null
  const buyPct = totalTx && totalTx > 0 ? Math.round((buys! / totalTx) * 100) : null

  const skeleton = <div className="h-7 w-20 rounded-md bg-secondary/40 animate-pulse" />

  return (
    <section aria-label={t.stats.title} className="relative py-2">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatTile icon={<Layers className="size-4" />} label={t.stats.marketCap} delay={0}>
            {isLoading || !mcapSplit ? (
              skeleton
            ) : (
              <AnimatedNumber value={mcapSplit.value} prefix="$" suffix={mcapSplit.suffix} decimals={2} />
            )}
          </StatTile>

          <StatTile icon={<Activity className="size-4" />} label={t.stats.volume24h} delay={0.05}>
            {isLoading || !volSplit ? (
              skeleton
            ) : (
              <AnimatedNumber value={volSplit.value} prefix="$" suffix={volSplit.suffix} decimals={2} />
            )}
          </StatTile>

          <StatTile icon={<Droplets className="size-4" />} label={t.stats.liquidity} delay={0.1}>
            {isLoading || !liqSplit ? (
              skeleton
            ) : (
              <AnimatedNumber value={liqSplit.value} prefix="$" suffix={liqSplit.suffix} decimals={2} />
            )}
          </StatTile>

          <StatTile icon={<TrendingUp className="size-4" />} label={t.stats.buyPressure} delay={0.15}>
            {isLoading || buyPct == null ? (
              skeleton
            ) : (
              <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex items-baseline gap-1">
                  <AnimatedNumber value={buyPct} suffix="%" decimals={0} className="text-bull" />
                  <span className="text-xs text-muted-foreground font-mono">
                    {buys}/{sells}
                  </span>
                </div>
                <div
                  className="stat-bar-track h-1.5 rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuenow={buyPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t.stats.buyPressureAria}
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-bull/70 to-bull transition-[width] duration-700"
                    style={{ width: `${buyPct}%` }}
                  />
                </div>
              </div>
            )}
          </StatTile>
        </div>
      </div>
    </section>
  )
}
