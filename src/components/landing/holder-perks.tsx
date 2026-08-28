'use client'

/**
 * HolderPerks — landing section between Pricing and FAQ that describes
 * layered benefits for wallets holding PENGU above the holder threshold.
 * Drives adoption of the token itself by framing payment as one of many
 * benefits, not the only use case.
 */

import { motion } from 'framer-motion'
import { Eye, Percent, BellRing, Gift, Wallet, ShieldCheck } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/lib/i18n/context'

export function HolderPerks() {
  const { t } = useI18n()

  const perks = [
    {
      icon: Eye,
      title: t.holderPerks.perk1Title,
      desc: t.holderPerks.perk1Desc,
      accent: 'text-bull',
      ring: 'group-hover:border-bull/40',
    },
    {
      icon: Percent,
      title: t.holderPerks.perk2Title,
      desc: t.holderPerks.perk2Desc,
      accent: 'text-primary',
      ring: 'group-hover:border-primary/40',
    },
    {
      icon: BellRing,
      title: t.holderPerks.perk3Title,
      desc: t.holderPerks.perk3Desc,
      accent: 'text-accent',
      ring: 'group-hover:border-accent/40',
    },
    {
      icon: Gift,
      title: t.holderPerks.perk4Title,
      desc: t.holderPerks.perk4Desc,
      accent: 'text-[#b48cff]',
      ring: 'group-hover:border-[#b48cff]/40',
    },
  ]

  return (
    <section id="perks" className="relative py-16 sm:py-20 overflow-hidden">
      {/* ambient glow */}
      <div
        aria-hidden
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] h-[480px] rounded-full bg-primary/5 blur-[140px] pointer-events-none"
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <span className="inline-block text-[11px] font-bold uppercase tracking-[0.25em] text-accent/80 mb-3">
            {t.eyebrow.holderPerks}
          </span>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-gradient-frost">
            {t.holderPerks.title}
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {t.holderPerks.subtitle}
          </p>

          {/* Threshold pill with tooltip */}
          <div className="mt-5 flex justify-center">
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                  >
                    <ShieldCheck className="size-3.5" />
                    {t.holderPerks.thresholdLabel}:
                    <span className="font-mono font-black tracking-tight">
                      {t.holderPerks.thresholdValue}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-center">
                  {t.holderPerks.tooltipText}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {perks.map((perk, i) => (
            <motion.div
              key={perk.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.45, delay: (i % 4) * 0.08 }}
            >
              <Card
                className={`glass card-interactive border-border/60 h-full group ${perk.ring}`}
              >
                <CardContent className="p-5 space-y-3 h-full flex flex-col">
                  <div className="flex items-start justify-between">
                    <div
                      className={`flex size-11 items-center justify-center rounded-xl bg-secondary/70 border border-border/60 group-hover:bg-secondary transition-colors ${perk.accent}`}
                    >
                      <perk.icon className="size-5 icon-bob" />
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[9px] uppercase tracking-wider font-bold border-primary/25 text-primary/80 bg-primary/5"
                    >
                      {t.holderPerks.badgeLabel}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-sm leading-tight">{perk.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed flex-1">{perk.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* CTA card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-8"
        >
          <Card className="glass border-primary/20 overflow-hidden">
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-5 text-center md:text-start">
                <div className="flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 border border-primary/30 text-primary shrink-0">
                    <Wallet className="size-6" />
                  </div>
                  <div>
                    <h3 className="font-black text-base sm:text-lg text-glow">
                      {t.holderPerks.ctaTitle}
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                      {t.holderPerks.ctaDesc}
                    </p>
                  </div>
                </div>
                <a href="#app" className="shrink-0">
                  <Button className="btn-aurora gap-2 font-bold border-0 text-primary-foreground">
                    <Wallet className="size-4" />
                    {t.holderPerks.ctaButton}
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  )
}
