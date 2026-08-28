'use client'

/**
 * Pricing — 5 time-based PENGU plans, one action per card.
 *
 * Every card's button ALWAYS works (BuyPlanButton owns the whole
 * ladder: wallet login → sign-in → payment dialog). Prices render from
 * live /api/config — never hardcoded. Lifetime owners see "Owned".
 */

import { Check, CheckCheck } from 'lucide-react'
import { useI18n } from '@/lib/i18n/context'
import { useAppConfig, useSession } from '@/hooks/use-app-data'
import { BuyPlanButton } from '@/components/payments/buy-plan-button'
import type { PayPlanId } from '@/components/payments/payment-flow'
import { cn } from '@/lib/utils'

export function Pricing() {
  const { t, tf, fmt } = useI18n()
  const { data: config } = useAppConfig()
  const packages = config?.packages ?? []

  const { data: session } = useSession()
  const isLifetimeOwner = !!session?.user?.isLifetime

  const durationFor = (days: number | null): string => {
    if (days == null) return t.pricing.forever
    if (days === 365) return t.pricing.durationYear
    if (days === 1) return t.pricing.durationDay
    return tf(t.pricing.durationDays, { days: fmt(days) })
  }

  return (
    <section id="pricing" className="border-t border-border/60 py-14 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section header */}
        <div className="mb-10 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {t.pricing.title}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            {t.pricing.subtitle}
          </p>
        </div>

        {/* The 5 plans */}
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 items-stretch">
          {packages.map((p) => {
            const popular = !!p.popular
            const perDay = p.days ? p.price / p.days : null
            return (
              <div
                key={p.id}
                className={cn('h-full', p.id === 'lifetime' && 'sm:col-span-2 lg:col-span-1')}
              >
                <div
                  className={cn(
                    'flex h-full flex-col rounded-2xl border bg-card p-5 transition-colors',
                    popular
                      ? 'border-primary/40'
                      : 'border-border hover:border-muted-foreground/25',
                  )}
                >
                  {/* Name + duration */}
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold">
                      {t.pricing[`${p.id}Title` as keyof typeof t.pricing] as string}
                    </h3>
                    {popular && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                        {t.sub.mostPopular}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {durationFor(p.days)}
                  </p>

                  {/* Price */}
                  <div dir="ltr" className="mt-4 flex items-baseline gap-1.5">
                    {p.basePrice > p.price && (
                      <span className="text-xs font-medium text-muted-foreground/60 line-through tabular-nums">
                        {fmt(p.basePrice)}
                      </span>
                    )}
                    <span className="text-[1.65rem] leading-none font-bold tabular-nums">
                      {fmt(p.price)}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      PENGU
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {perDay != null ? (
                      <>
                        ≈ {fmt(Number((perDay).toFixed(2)))} {t.pricing.perDayShort}
                        {p.discountPct > 0 && (
                          <span className="text-bull"> · −{fmt(p.discountPct)}%</span>
                        )}
                      </>
                    ) : (
                      t.pricing.foreverNote
                    )}
                  </p>

                  {/* CTA — always functional */}
                  <div className="mt-5 flex-1" />
                  <div className="mt-auto">
                    {isLifetimeOwner ? (
                      <span className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-bull/40 bg-bull/10 px-3 py-2.5 text-xs font-bold text-bull">
                        <CheckCheck className="size-3.5" strokeWidth={2.5} />
                        {t.pricing.owned}
                      </span>
                    ) : (
                      <BuyPlanButton
                        planId={p.id as PayPlanId}
                        variant={popular ? 'default' : 'outline'}
                        size="default"
                        className={cn(
                          'w-full rounded-xl px-3 py-2.5 text-xs font-bold',
                          !popular && 'border-border bg-transparent hover:border-primary/50 hover:bg-primary/5 hover:text-primary',
                        )}
                      >
                        {tf(t.pricing.ctaPay, { price: fmt(p.price) })}
                      </BuyPlanButton>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Free tier — one quiet line */}
        <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
          <Check className="me-1 inline size-3.5 text-bull" strokeWidth={3} />
          {t.pricing.freeLine}
        </p>

        {/* Payment note */}
        <p className="mx-auto mt-3 max-w-xl text-center text-[11px] leading-relaxed text-muted-foreground/70">
          {t.pricing.note}
        </p>
      </div>
    </section>
  )
}
