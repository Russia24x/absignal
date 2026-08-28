'use client'

/**
 * Features grid — security-first messaging + engine + i18n + on-chain.
 */

import { motion } from 'framer-motion'
import {
  BarChart3,
  Database,
  Languages,
  Lock,
  ServerCog,
  Snowflake,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n/context'

export function Features() {
  const { t } = useI18n()

  const items = [
    { icon: ServerCog, title: t.features.securityTitle, desc: t.features.securityDesc, accent: 'text-bull' },
    { icon: BarChart3, title: t.features.engineTitle, desc: t.features.engineDesc, accent: 'text-primary' },
    { icon: Lock, title: t.features.lockedTitle, desc: t.features.lockedDesc, accent: 'text-accent' },
    { icon: Snowflake, title: t.features.onchainTitle, desc: t.features.onchainDesc, accent: 'text-primary' },
    { icon: Database, title: t.features.dataTitle, desc: t.features.dataDesc, accent: 'text-bull' },
    { icon: Languages, title: t.features.i18nTitle, desc: t.features.i18nDesc, accent: 'text-accent' },
  ]

  return (
    <section id="features" className="relative py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <span className="inline-block text-[11px] font-bold uppercase tracking-[0.25em] text-primary/80 mb-3">
            {t.eyebrow.features}
          </span>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-gradient-frost">
            {t.features.title}
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
            {t.features.subtitle}
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.45, delay: (i % 3) * 0.08 }}
            >
              <Card className="glass card-interactive border-border/60 h-full group hover:border-primary/30">
                <CardContent className="p-6 space-y-3">
                  <div
                    className={`flex size-11 items-center justify-center rounded-xl bg-secondary/70 border border-border/60 group-hover:border-primary/30 group-hover:bg-secondary transition-colors ${item.accent}`}
                  >
                    <item.icon className="size-5 icon-bob" />
                  </div>
                  <h3 className="font-bold text-base">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
