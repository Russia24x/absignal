'use client'

/**
 * Performance — proof, in two tabs: the live track record (every verdict
 * scored against the real next-day move) and the replayable backtest.
 */

import { useState } from 'react'
import { FlaskConical, History } from 'lucide-react'
import { useI18n } from '@/lib/i18n/context'
import { TrackRecord } from '@/components/landing/track-record'
import { BacktestSandbox } from '@/components/landing/backtest'
import { cn } from '@/lib/utils'

type View = 'track' | 'backtest'

export function PerformanceSection() {
  const { t } = useI18n()
  const [view, setView] = useState<View>('track')

  const tabs: Array<{ id: View; label: string; icon: typeof History }> = [
    { id: 'track', label: t.performance.tabTrack, icon: History },
    { id: 'backtest', label: t.performance.tabBacktest, icon: FlaskConical },
  ]

  return (
    <section id="performance" className="border-t border-border/60 py-14 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section header */}
        <div className="mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {t.performance.title}
          </h2>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">
            {t.performance.subtitle}
          </p>
        </div>

        {/* Segmented control */}
        <div
          role="tablist"
          aria-label={t.performance.title}
          className="mb-6 flex w-full max-w-md rounded-xl border border-border bg-card p-1"
        >
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-colors',
                view === id
                  ? 'bg-primary/12 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Active view */}
        <div id={`perf-${view}`} role="tabpanel">
          {view === 'track' ? <TrackRecord /> : <BacktestSandbox />}
        </div>
      </div>
    </section>
  )
}
