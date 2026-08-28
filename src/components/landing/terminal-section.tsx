'use client'

/**
 * Live terminal — the product itself.
 * Today's signal on one side, market tools (chart / alerts / risk) on
 * the other behind a segmented control. One section, one job.
 */

import { useState } from 'react'
import { Bell, CandlestickChart, Scale } from 'lucide-react'
import { useI18n } from '@/lib/i18n/context'
import { SignalCard } from '@/components/signal/signal-card'
import { PriceChart } from '@/components/market/price-chart'
import { PriceAlerts } from '@/components/market/price-alerts'
import { RiskCalculator } from '@/components/landing/risk-calculator'
import { cn } from '@/lib/utils'

type Tool = 'chart' | 'alerts' | 'risk'

export function TerminalSection() {
  const { t } = useI18n()
  const [tool, setTool] = useState<Tool>('chart')

  const tabs: Array<{ id: Tool; label: string; icon: typeof CandlestickChart }> = [
    { id: 'chart', label: t.terminal.tabChart, icon: CandlestickChart },
    { id: 'alerts', label: t.terminal.tabAlerts, icon: Bell },
    { id: 'risk', label: t.terminal.tabRisk, icon: Scale },
  ]

  return (
    <section id="signal" className="py-14 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section header */}
        <div className="mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {t.terminal.title}
          </h2>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">
            {t.terminal.subtitle}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] items-start">
          {/* The product: today's signal */}
          <SignalCard />

          {/* Market tools */}
          <div className="space-y-4">
            {/* Segmented control */}
            <div
              role="tablist"
              aria-label={t.terminal.title}
              className="flex w-full rounded-xl border border-border bg-card p-1"
            >
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tool === id}
                  onClick={() => setTool(id)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-colors',
                    tool === id
                      ? 'bg-primary/12 text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Active tool */}
            <div id={`tool-${tool}`} role="tabpanel">
              {tool === 'chart' && <PriceChart />}
              {tool === 'alerts' && <PriceAlerts />}
              {tool === 'risk' && <RiskCalculator />}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
