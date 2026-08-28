'use client'

/**
 * PenguSignal — single-page application.
 * Sections: hero → live terminal (market + signal) → track record →
 * backtest → features → pricing → holder perks → FAQ.
 * Footer sticks to the viewport bottom.
 */

import { Header } from '@/components/landing/header'
import { Hero } from '@/components/landing/hero'
import { LivePriceTicker } from '@/components/landing/live-ticker'
import { LiveStatsStrip } from '@/components/landing/live-stats-strip'
import { ScrollProgressBar } from '@/components/landing/scroll-progress'
import { TrackRecord } from '@/components/landing/track-record'
import { BacktestSandbox } from '@/components/landing/backtest'
import { Features } from '@/components/landing/features'
import { Pricing } from '@/components/landing/pricing'
import { HolderPerks } from '@/components/landing/holder-perks'
import { Faq } from '@/components/landing/faq'
import { Footer } from '@/components/landing/footer'
import { Snowfall } from '@/components/landing/snowfall'
import { BackToTop } from '@/components/landing/back-to-top'
import { MarketOverviewCards } from '@/components/market/overview-cards'
import { PriceChart } from '@/components/market/price-chart'
import { PriceAlerts } from '@/components/market/price-alerts'
import { SentimentGauge } from '@/components/market/sentiment-gauge'
import { HourlyHeatmap } from '@/components/market/hourly-heatmap'
import { SignalCard } from '@/components/signal/signal-card'
import { useI18n } from '@/lib/i18n/context'

export default function Home() {
  const { t, dir } = useI18n()

  return (
    <div dir={dir} className="relative min-h-screen flex flex-col">
      <Snowfall count={20} />
      <ScrollProgressBar />
      <LivePriceTicker />
      <Header />

      <main className="relative z-10 flex-1">
        <Hero />
        <LiveStatsStrip />

        {/* Live terminal */}
        <section id="app" className="relative py-10 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 space-y-6">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary/80">
                {t.eyebrow.terminal}
              </span>
              <div className="flex items-center gap-4">
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-gradient-frost whitespace-nowrap">
                  {t.market.title}
                </h2>
                <div className="aurora-line flex-1" aria-hidden />
              </div>
            </div>

            <MarketOverviewCards />

            <div className="grid lg:grid-cols-[1.25fr_1fr] gap-6 items-start">
              {/* Market column: chart + hourly heatmap + price alerts */}
              <div className="space-y-6">
                <PriceChart />
                <HourlyHeatmap />
                <PriceAlerts />
              </div>
              {/* Intelligence column: today's signal + sentiment index */}
              <div className="space-y-6">
                <SignalCard />
                <SentimentGauge />
              </div>
            </div>
          </div>
        </section>

        <TrackRecord />
        <BacktestSandbox />
        <Features />
        <Pricing />
        <HolderPerks />
        <Faq />
      </main>

      <Footer />
      <BackToTop />
    </div>
  )
}
