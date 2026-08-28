'use client'

/**
 * Hero: the big question ("buy or sell PENGU today?"), live price ticker,
 * trust badges, and the two CTAs. Framer-motion entrance, penguin mascot floating.
 */

import { motion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight, BadgeCheck, LineChart, MousePointerClick, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PenguLogo } from '@/components/pengu-logo'
import { useI18n } from '@/lib/i18n/context'
import { useMarketOverview } from '@/hooks/use-app-data'

export function Hero() {
  const { t } = useI18n()
  const { data: market } = useMarketOverview()
  const change = market?.priceChange24h ?? null
  const positive = (change ?? 0) >= 0

  return (
    <section id="top" className="relative pt-28 pb-14 sm:pt-36 sm:pb-20 overflow-hidden">
      {/* Glow orbs */}
      <div aria-hidden className="absolute -top-32 start-1/2 -translate-x-1/2 w-[560px] h-[560px] rounded-full bg-primary/10 blur-[140px] pointer-events-none" />
      <div aria-hidden className="absolute top-40 end-0 w-[300px] h-[300px] rounded-full bg-accent/5 blur-[100px] pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-10 items-center">
          <div className="space-y-6 text-center lg:text-start">
            {/* Badge */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary">
                <span className="size-1.5 rounded-full bg-bull animate-pulse" />
                {t.heroBadge}
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.15] tracking-tight"
            >
              {t.heroTitle1}{' '}
              <span className="text-bull">{t.heroTitleBuy}</span>{' '}
              <span className="text-muted-foreground font-bold text-3xl sm:text-4xl lg:text-5xl">{t.heroTitleOr}</span>{' '}
              <span className="text-bear">{t.heroTitleSell}</span>{' '}
              <span className="text-gradient-frost">{t.heroTitle2}</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto lg:mx-0 leading-relaxed"
            >
              {t.heroSubtitle}
            </motion.p>

            {/* Live price ticker */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="inline-flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl glass px-5 py-3.5"
            >
              <span className="text-xs text-muted-foreground">{t.livePrice}</span>
              <span className="flex items-center gap-2">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-bull opacity-75 animate-ping" />
                  <span className="relative inline-flex size-2 rounded-full bg-bull" />
                </span>
                <span className="font-mono font-black text-xl tabular-nums">
                  {market ? `$${market.priceUsd.toFixed(5)}` : '…'}
                </span>
              </span>
              {change != null && (
                <span
                  className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-sm font-bold ${
                    positive ? 'text-bull bg-bull/10 glow-pulse' : 'text-bear bg-bear/10'
                  }`}
                >
                  {positive ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                  {positive ? '+' : ''}
                  {change.toFixed(2)}%
                </span>
              )}
              {market?.volume24hUsd != null && (
                <span className="text-xs text-muted-foreground font-mono">
                  Vol: ${(market.volume24hUsd / 1000).toFixed(0)}K
                </span>
              )}
            </motion.div>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-wrap items-center justify-center lg:justify-start gap-3"
            >
              <a href="#app">
                <Button size="lg" className="btn-aurora gap-2 font-bold text-base px-7 h-13 border-0 text-primary-foreground">
                  <MousePointerClick className="size-5" />
                  {t.heroCtaPrimary}
                </Button>
              </a>
              <a href="#track">
                <Button size="lg" variant="outline" className="gap-2 font-semibold px-6 border-primary/25 hover:border-primary/50 hover:bg-primary/5">
                  <LineChart className="size-5" />
                  {t.heroCtaSecondary}
                </Button>
              </a>
            </motion.div>

            {/* Trust badges */}
            <motion.ul
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.55 }}
              className="flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2 text-[11px] text-muted-foreground"
            >
              <li className="flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-bull/80" />
                {t.trustSecurity}
              </li>
              <li className="flex items-center gap-1.5">
                <BadgeCheck className="size-3.5 text-primary/80" />
                {t.trustOnchain}
              </li>
              <li className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-accent/80" />
                {t.trustReal}
              </li>
              <li className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-frost/80" />
                {t.trustLocked}
              </li>
            </motion.ul>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="text-xs text-muted-foreground/70"
            >
              {t.poweredBy}
            </motion.p>
          </div>

          {/* Mascot */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="hidden lg:flex items-center justify-center"
          >
            <div className="relative">
              <div className="absolute inset-0 blur-3xl bg-primary/20 rounded-full scale-110" aria-hidden />
              <div className="relative animate-float">
                <PenguLogo size={220} />
              </div>
              {/* Frost ring */}
              <div className="absolute inset-0 rounded-full border border-primary/15 animate-float-slow" aria-hidden />
              <div className="absolute inset-6 rounded-full border border-primary/10" aria-hidden />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
