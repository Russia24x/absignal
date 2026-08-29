'use client'

/**
 * Minimal hero: mascot → live price badge → headline → one sentence → two CTAs.
 * The price pill is the only live element; the mascot is the single brand mark.
 * R38: the pill also shows WHICH venue served the price (multi-source chain:
 * GeckoTerminal → DexScreener → Binance → CoinMarketCap) — honest data
 * provenance in a whisper-quiet label.
 */

import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/context'
import { useMarketOverview } from '@/hooks/use-app-data'
import { HeroMascot } from '@/components/landing/hero-mascot'
import { cn } from '@/lib/utils'

export function Hero() {
  const { t } = useI18n()
  const { data: market } = useMarketOverview()
  const change = market?.priceChange24h ?? null
  const positive = (change ?? 0) >= 0
  const sourceName = market?.source
    ? (t.market.sourceNames as Record<string, string>)[market.source]
    : null

  return (
    <section id="top" className="pt-32 pb-16 sm:pt-40 sm:pb-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          {/* Minimal mascot — the frost penguin, quietly presenting the market */}
          <div className="flex justify-center mb-5">
            <HeroMascot size={64} className="sm:hidden" />
            <HeroMascot size={72} className="hidden sm:block" />
          </div>

          {/* Live price badge */}
          <div className="inline-flex items-center gap-2.5 rounded-full border border-border bg-card px-4 py-1.5 text-sm">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-bull opacity-60 animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-bull" />
            </span>
            <span className="font-mono font-semibold tabular-nums" dir="ltr">
              {market ? `$${market.priceUsd.toFixed(5)}` : '…'}
            </span>
            {change != null && (
              <span
                className={cn(
                  'flex items-center gap-0.5 font-semibold tabular-nums',
                  positive ? 'text-bull' : 'text-bear',
                )}
                dir="ltr"
              >
                {positive ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {positive ? '+' : ''}
                {change.toFixed(2)}%
              </span>
            )}
            {sourceName && (
              <>
                <span aria-hidden className="h-3 w-px bg-border" />
                <span
                  className="text-[10px] uppercase tracking-wider text-muted-foreground/80"
                  title={`${t.market.sourceVia} ${sourceName}`}
                >
                  {sourceName}
                </span>
              </>
            )}
          </div>

          {/* Headline */}
          <h1 className="mt-6 text-4xl sm:text-5xl lg:text-[3.4rem] font-bold leading-[1.12] tracking-tight">
            {t.heroTitle1}{' '}
            <span className="text-bull">{t.heroTitleBuy}</span>{' '}
            <span className="text-muted-foreground font-semibold text-2xl sm:text-3xl lg:text-4xl">
              {t.heroTitleOr}
            </span>{' '}
            <span className="text-bear">{t.heroTitleSell}</span>{' '}
            {t.heroTitle2}
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mt-5 max-w-xl text-base sm:text-lg leading-relaxed text-muted-foreground">
            {t.heroSubtitle}
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" className="h-12 px-7 text-[15px] font-bold" asChild>
              <a href="#pricing">{t.heroCtaPrimary}</a>
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-6 text-[15px] font-semibold" asChild>
              <a href="#signal">{t.heroCtaSecondary}</a>
            </Button>
          </div>

          {/* Trust points — one quiet line */}
          <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <li>{t.trustReal}</li>
            <li aria-hidden className="hidden sm:block h-1 w-1 rounded-full bg-border" />
            <li>{t.trustOnchain}</li>
            <li aria-hidden className="hidden sm:block h-1 w-1 rounded-full bg-border" />
            <li>{t.trustLocked}</li>
          </ul>
        </div>
      </div>
    </section>
  )
}
