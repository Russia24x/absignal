'use client'

/**
 * Pricing: one-time access (5 PENGU) → day passes (1 PENGU) → subscriptions.
 * Prices render from live /api/config — never hardcoded.
 */

import { motion } from 'framer-motion'
import { Check, Crown, Sparkles, Ticket } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/lib/i18n/context'
import { useAppConfig } from '@/hooks/use-app-data'
import { cn } from '@/lib/utils'

export function Pricing() {
  const { t, tf } = useI18n()
  const { data: config } = useAppConfig()
  const pricing = config?.pricing
  const fee = pricing?.accessFee ?? 5
  const daily = pricing?.dailySignal ?? 1
  const monthly = pricing?.subscription30d ?? 30

  const cards = [
    {
      id: 'access',
      icon: Ticket,
      title: t.pricing.accessTitle,
      desc: t.pricing.accessDesc,
      price: tf(t.pricing.accessPrice, { fee }),
      unit: t.pricing.once,
      points: [t.pricing.accessDesc, t.features.dataTitle, t.features.i18nTitle],
      popular: false,
    },
    {
      id: 'day',
      icon: Sparkles,
      title: t.pricing.dayTitle,
      desc: t.pricing.dayDesc,
      price: tf(t.pricing.dayPrice, { price: daily }),
      unit: t.pricing.perSignal,
      points: [
        t.signal.timeframeBreakdown,
        t.signal.plan + ' · ' + t.signal.entry + ' / ' + t.signal.stopLoss + ' / ' + t.signal.targets,
        t.signal.indicators,
      ],
      popular: false,
    },
    {
      id: 'sub',
      icon: Crown,
      title: t.pricing.subTitle,
      desc: t.pricing.subDesc,
      price: tf(t.pricing.subPrice, { price: monthly }),
      unit: t.pricing.perMonth,
      points: [t.sub.month + ' · ' + t.sub.monthDesc, t.sub.week + ' · ' + t.sub.weekDesc, t.pricing.note],
      popular: true,
    },
  ]

  return (
    <section id="pricing" className="relative py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
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

        <div className="grid md:grid-cols-3 gap-4 max-w-5xl mx-auto items-stretch">
          {cards.map((card, i) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.45, delay: i * 0.1 }}
              className="h-full"
            >
              <Card
                className={cn(
                  'glass h-full flex flex-col relative overflow-hidden transition-all duration-300 hover:-translate-y-1',
                  card.popular
                    ? 'border-primary/50 glow-frost bg-primary/[0.04]'
                    : 'border-border/60 hover:border-primary/25'
                )}
              >
                {card.popular && (
                  <div className="absolute top-0 inset-x-0 h-px aurora-line" aria-hidden />
                )}
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-secondary/70 border border-border/60 text-primary">
                      <card.icon className="size-5" />
                    </div>
                    {card.popular && (
                      <Badge className="bg-primary/20 text-primary border-primary/50 hover:bg-primary/20 font-bold glow-frost">
                        {t.sub.mostPopular}
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-bold text-lg mt-2">{card.title}</h3>
                  <p className="text-xs text-muted-foreground">{card.desc}</p>
                </CardHeader>
                <CardContent className="pt-0 flex flex-col flex-1 gap-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black tabular-nums text-gradient-frost" dir="ltr">{card.price}</span>
                    <span className="pb-0.5 text-[11px] font-medium text-muted-foreground">{card.unit}</span>
                  </div>
                  <ul className="space-y-2.5 flex-1">
                    {card.points.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Check className="size-3.5 text-bull shrink-0 mt-0.5" strokeWidth={2.5} />
                        <span className="leading-relaxed">{point}</span>
                      </li>
                    ))}
                  </ul>
                  <a href="#app" className="block">
                    <span
                      className={cn(
                        'block w-full text-center rounded-xl px-4 py-3 text-sm font-bold transition-all',
                        card.popular
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90 glow-frost'
                          : 'bg-secondary/70 border border-border/60 text-foreground/90 hover:border-primary/40 hover:text-primary hover:bg-secondary'
                      )}
                    >
                      {t.pricing.cta}
                    </span>
                  </a>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
