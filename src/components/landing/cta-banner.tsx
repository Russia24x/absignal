'use client'

/**
 * Final CTA banner — the closing conversion moment between the FAQ and
 * the footer. Solves the "flat ending" (page previously dropped straight
 * from the FAQ accordion into the footer void): now the page ends with
 * the next-signal countdown, one clear CTA and a trust microcopy row.
 */

import { motion } from 'framer-motion'
import { Lock, MousePointerClick, ShieldCheck, Timer, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/context'
import { useNextSignalCountdown } from '@/hooks/use-countdown'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function CtaBanner() {
  const { t } = useI18n()
  const countdown = useNextSignalCountdown()

  const trust = [
    { icon: ShieldCheck, label: t.ctaBanner.trust1 },
    { icon: Wallet, label: t.ctaBanner.trust2 },
    { icon: Lock, label: t.ctaBanner.trust3 },
  ]

  return (
    <section aria-labelledby="cta-banner-title" className="relative pt-10 pb-16 sm:pt-14 sm:pb-20">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.55 }}
          className="glass card-interactive relative overflow-hidden rounded-3xl border border-primary/20 px-6 py-10 text-center sm:px-12 sm:py-12"
        >
          {/* Top aurora edge + ambient glow */}
          <div aria-hidden className="absolute inset-x-0 top-0 h-px aurora-line" />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 start-1/2 h-48 w-[36rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
          />

          <h2
            id="cta-banner-title"
            className="text-2xl sm:text-4xl font-black tracking-tight text-gradient-frost"
          >
            {t.ctaBanner.title}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm sm:text-base leading-relaxed text-muted-foreground">
            {t.ctaBanner.subtitle}
          </p>

          {/* Next-signal countdown */}
          {countdown && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Timer className="size-4 text-primary text-glow-pulse" />
                {t.ctaBanner.countdownLabel}
              </span>
              <span
                dir="ltr"
                className="pill-status inline-flex items-center gap-2 rounded-xl border-primary/40 px-4 py-2 font-mono text-xl font-black tabular-nums text-glow-pulse"
              >
                {pad(countdown.hours)}
                <span className="text-primary/50">:</span>
                {pad(countdown.minutes)}
                <span className="text-primary/50">:</span>
                {pad(countdown.seconds)}
              </span>
            </div>
          )}

          {/* CTAs */}
          <div className="mt-8 flex flex-col items-center justify-center gap-3.5 sm:flex-row">
            <a href="#app" className="btn-aurora-halo w-full rounded-xl sm:w-auto">
              <Button
                size="lg"
                className="btn-aurora h-13 w-full gap-2 border-0 px-9 text-base font-black tracking-tight text-primary-foreground sm:w-auto"
              >
                <MousePointerClick className="size-5" />
                {t.ctaBanner.cta}
              </Button>
            </a>
            <a href="#pricing" className="w-full sm:w-auto">
              <Button
                size="lg"
                variant="outline"
                className="w-full gap-2 border-border/60 px-6 font-medium text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground sm:w-auto"
              >
                {t.ctaBanner.secondary}
              </Button>
            </a>
          </div>

          {/* Trust microcopy */}
          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5">
            {trust.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2 text-xs font-semibold text-foreground/70">
                <Icon className="size-4 text-primary/80" />
                {label}
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </section>
  )
}
