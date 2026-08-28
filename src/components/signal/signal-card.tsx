'use client'

/**
 * Today's Signal card — the paid product.
 * Handles the full entitlement ladder (connect → sign → subscribe) and
 * renders the complete engine output. Registration & login are free; only
 * the signal itself sits behind a time-based PENGU subscription
 * (day / week / month / year / lifetime — plain ERC-20 transfers, no
 * session keys).
 */

import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import {
  Activity,
  BadgeCheck,
  CalendarDays,
  CheckCheck,
  Crown,
  Gauge,
  Infinity as InfinityIcon,
  Layers,
  Loader2,
  Lock,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/lib/i18n/context'
import { useSignalToday, useSession, useAppConfig, useTrackRecord } from '@/hooks/use-app-data'
import { useNextSignalCountdown } from '@/hooks/use-countdown'
import { PayButton } from '@/components/payments/payment-flow'
import { verdictStyles, ScoreGauge } from '@/components/signal/verdict-ui'
import { cn } from '@/lib/utils'

/* ------------------------------- Verdict UI ------------------------------- */

/* ------------------------------ Locked states ------------------------------ */

/**
 * Locked-state preview panel. Instead of a bare icon + CTA, we show:
 *  - a checklist of what unlocks (the product pitch),
 *  - a blurred-but-real glimpse of yesterday's resolved signal (verdict +
 *    gauge + plan numbers) — real data from the public history API, no
 *    leak of today's verdict,
 *  - a mini accuracy strip for the last 15 resolved days (win/loss dots).
 * The goal: a locked state that *sells* by showing the shape of the
 * product, not an empty box.
 */
function LockedPreview() {
  const { t, tf } = useI18n()
  const { data: track } = useTrackRecord()

  // Latest resolved entry (verdict !== LOCKED, outcome !== PENDING)
  const resolved = track?.entries.filter((e) => e.verdict !== 'LOCKED' && e.outcome !== 'PENDING') ?? []
  const yesterday = resolved[0] ?? null
  const last15 = resolved.slice(0, 15)
  const wins = last15.filter((e) => e.outcome === 'WIN').length
  const accuracy = last15.length > 0 ? Math.round((wins / last15.length) * 100) : null

  const unlocks = [
    { icon: TrendingUp, text: t.signal.previewVerdict },
    { icon: Target, text: t.signal.previewPlan },
    { icon: Gauge, text: t.signal.previewTimeframes },
    { icon: Activity, text: t.signal.previewIndicators },
    { icon: Layers, text: t.signal.previewLevels },
  ]

  return (
    <div className="space-y-4">
      {/* What you unlock — checklist */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {unlocks.map(({ icon: Icon, text }) => (
          <div
            key={text}
            className="flex items-center gap-2 rounded-xl border border-border/60 bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground"
            title={text}
          >
            <Icon className="size-3.5 shrink-0 text-primary/80" />
            <span className="leading-tight">{text}</span>
          </div>
        ))}
      </div>

      {/* Yesterday's real signal — blurred teaser */}
      {yesterday && (() => {
        const vs = verdictStyles(yesterday.verdict)
        return (
          <div className="relative rounded-2xl border border-border/60 bg-secondary/20 overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {t.signal.previewSampleTitle}
              </span>
              <span className="text-[10px] text-muted-foreground/70 font-mono">{yesterday.date}</span>
            </div>
            <div className="relative px-4 pb-4" aria-hidden>
              {/* Blurred content — decorative silhouette of a real signal */}
              <div className="flex items-center gap-4 blur-[4px] select-none pointer-events-none opacity-90">
                <ScoreGauge score={yesterday.score} size="sm" />
                <div className="flex-1 space-y-2">
                  <div className={cn('text-2xl font-black tracking-tight', vs.color)}>
                    {t.signal.verdicts[yesterday.verdict as keyof typeof t.signal.verdicts] ?? yesterday.verdict}
                  </div>
                  <div className="grid grid-cols-3 gap-2 font-mono text-[10px] text-muted-foreground">
                    <div>ENTRY<br />$0.0093–35</div>
                    <div className="text-bear">SL<br />$0.0089</div>
                    <div className="text-bull">TP1-3<br />$0.0097+</div>
                  </div>
                </div>
              </div>
              {/* Lock badge overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="pill-status flex items-center gap-2 rounded-full px-4 py-2">
                  <Lock className="size-4 text-primary" />
                  <span className="text-xs font-bold text-primary">{t.signal.previewUnlockCta}</span>
                </div>
              </div>
            </div>
            <div className="px-4 pb-3 -mt-1">
              <a
                href="#track"
                className="inline-flex items-center gap-1 text-[11px] text-primary/80 hover:text-primary transition-colors font-semibold"
              >
                {t.signal.previewSampleNote} →
              </a>
            </div>
          </div>
        )
      })()}

      {/* Mini accuracy strip — last 15 resolved days */}
      {last15.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-secondary/20 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {t.signal.previewRecentTitle}
            </span>
            {accuracy != null && (
              <span className="text-xs font-mono font-bold text-bull">
                {tf(t.signal.previewAccuracy, { n: accuracy })}
                <span className="text-muted-foreground font-normal">
                  {' '}{tf(t.signal.previewFromSignals, { n: last15.length })}
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 chart-ltr" dir="ltr">
            {last15.map((e) => (
              <TooltipProvider key={e.date}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        'h-6 flex-1 min-w-2 rounded-sm cursor-help transition-transform hover:scale-y-110',
                        e.outcome === 'WIN'
                          ? 'bg-bull/70'
                          : e.outcome === 'LOSS'
                            ? 'bg-bear/70'
                            : 'bg-muted-foreground/30'
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <span className="font-mono">{e.date}</span> ·{' '}
                    {t.signal.verdicts[e.verdict as keyof typeof t.signal.verdicts] ?? e.verdict} ·{' '}
                    <span className={e.outcome === 'WIN' ? 'text-bull' : e.outcome === 'LOSS' ? 'text-bear' : ''}>
                      {e.outcome}
                    </span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LockedState({ kind }: { kind: 'connect' | 'signing' | 'subscribe' }) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col items-center text-center gap-4 py-6 px-3 sm:px-4">
      <div className="relative">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 glow-frost">
          {kind === 'connect' && <Wallet className="size-6 text-primary" />}
          {kind === 'signing' && <Loader2 className="size-6 text-primary animate-spin" />}
          {kind === 'subscribe' && <Crown className="size-6 text-primary" />}
        </div>
      </div>

      {kind === 'connect' && (
        <>
          <h3 className="text-lg font-bold">{t.signal.connectFirst}</h3>
          <p className="text-sm text-muted-foreground max-w-md">{t.signal.lockedDesc}</p>
        </>
      )}

      {kind === 'signing' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {t.signal.signInPrompt}
        </div>
      )}

      {kind === 'subscribe' && (
        <>
          <h3 className="text-lg font-bold">{t.signal.subscriptionRequired}</h3>
          <p className="text-sm text-muted-foreground max-w-md">{t.signal.subscriptionRequiredDesc}</p>
          <div className="w-full max-w-2xl">
            <PlanGrid />
          </div>
        </>
      )}

      {/* Product preview — sells the unlock with real resolved data */}
      <div className="w-full pt-2 border-t border-border/40">
        <LockedPreview />
      </div>
    </div>
  )
}

/**
 * The 5-plan picker (day / week / month / year / lifetime), rendered from
 * live /api/config — prices are never hardcoded. Also used as the renewal
 * picker inside SubscriptionStatus.
 */
function PlanGrid() {
  const { t, lang, fmt } = useI18n()
  const { data: config } = useAppConfig()
  const packages = config?.packages ?? []
  if (!packages.length) return null

  return (
    <div className="w-full">
      <div className="flex items-center gap-3 justify-center text-xs text-muted-foreground">
        <span>{t.sub.title}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-2">
        {packages.map((p) => (
          <PayButton
            key={p.id}
            planId={p.id as 'day' | 'week' | 'month' | 'year' | 'lifetime'}
            variant={p.popular ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'h-auto w-full flex-col items-center justify-center gap-0.5 py-2.5 leading-tight',
              p.popular && 'glow-frost'
            )}
          >
            <span className="text-[11px] font-medium opacity-90">
              {p.days == null
                ? t.sub.lifetime
                : `${fmt(p.days)} ${lang === 'fa' ? 'روز' : p.days === 1 ? 'day' : 'days'}`}
            </span>
            <span className="text-sm font-black">{fmt(p.price)} PENGU</span>
            {p.discountPct > 0 && (
              <span className="text-[9px] font-bold leading-none text-bull" dir="ltr">
                −{fmt(p.discountPct)}%
              </span>
            )}
          </PayButton>
        ))}
      </div>
      <p className="mt-2 text-center text-[10px] text-muted-foreground/80">{t.pricing.note}</p>
    </div>
  )
}

/* ------------------------------ Full signal ------------------------------ */

/** Share button — Web Share API when available, clipboard fallback. */
function ShareSignalButton({ text }: { text: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  const share = async () => {
    // Prefer the native share sheet (mobile)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'PenguSignal', text })
        return
      } catch {
        // user dismissed or share failed — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success(t.signal.shareCopied)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error(t.signal.shareFailed)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={share}
      aria-label={t.signal.share}
      className="gap-1.5 h-8 border-border/60 hover:border-primary/40 hover:text-primary"
    >
      {copied ? <CheckCheck className="size-3.5 text-bull" /> : <Share2 className="size-3.5" />}
      <span className="hidden sm:inline">{t.signal.share}</span>
    </Button>
  )
}

function FullSignal({ signal }: { signal: NonNullable<ReturnType<typeof useSignalToday>['data']>['signal'] }) {
  const { t, lang, fmt } = useI18n()
  if (!signal) return null

  const vs = verdictStyles(signal.verdict)
  const verdictLabel = t.signal.verdicts[signal.verdict]
  const daily = signal.timeframes.find((tf) => tf.timeframe === '1d') ?? signal.timeframes[0]
  const isLong = signal.plan.side === 'long'
  const isShort = signal.plan.side === 'short'

  const p = (n: number) => `$${n.toFixed(5)}`

  const shareText = [
    `PenguSignal — ${signal.date}`,
    `${verdictLabel} (score ${signal.score >= 0 ? '+' : ''}${signal.score.toFixed(0)})`,
    signal.plan.side !== 'none'
      ? `${isLong ? 'LONG' : 'SHORT'} · entry ${p(signal.plan.entryLow)}–${p(signal.plan.entryHigh)} · SL ${p(signal.plan.stopLoss)} · TP1 ${p(signal.plan.takeProfits[0] ?? 0)}`
      : '',
    `penguin signal on Abstract — data, not vibes.`,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div className="space-y-5">
      {/* Verdict hero */}
      <div className={cn('rounded-2xl border p-5 flex flex-col sm:flex-row items-center gap-6', vs.bg, vs.glow)}>
        <ScoreGauge score={signal.score} />
        <div className="flex-1 text-center sm:text-start space-y-2">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <span className={cn('text-3xl font-black tracking-tight', vs.color)}>{verdictLabel}</span>
            <Badge variant="outline" className="border-primary/30 text-primary gap-1">
              <ShieldCheck className="size-3" />
              {t.signal.confidence}: {signal.confidence.toFixed(0)}%
            </Badge>
            <ShareSignalButton text={shareText} />
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {signal.summary[lang === 'fa' ? 'fa' : 'en']}
          </p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" /> {signal.date}
            </span>
            <span>
              PENGU: <span className="font-mono text-foreground">{p(signal.priceUsd)}</span>
            </span>
            {signal.atrPercent != null && (
              <span>
                {t.signal.atrNote}: <span className="font-mono text-foreground">{signal.atrPercent.toFixed(2)}%</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Trade plan */}
      {signal.plan.side !== 'none' && (
        <div>
          <h4 className="flex items-center gap-2 text-sm font-bold mb-2.5">
            <Target className="size-4 text-primary" /> {t.signal.plan}
            <Badge variant="outline" className={isLong ? 'border-bull/40 text-bull' : 'border-bear/40 text-bear'}>
              {isLong ? 'LONG' : 'SHORT'}
            </Badge>
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="rounded-xl bg-secondary/50 border border-border/60 p-3">
              <div className="text-[11px] text-muted-foreground mb-1">{t.signal.entry}</div>
              <div className="font-mono font-bold text-sm">
                {p(signal.plan.entryLow)} – {p(signal.plan.entryHigh)}
              </div>
            </div>
            <div className="rounded-xl bg-secondary/50 border border-bear/25 p-3">
              <div className="text-[11px] text-muted-foreground mb-1">{t.signal.stopLoss}</div>
              <div className="font-mono font-bold text-sm text-bear">{p(signal.plan.stopLoss)}</div>
            </div>
            <div className="rounded-xl bg-secondary/50 border border-border/60 p-3 col-span-2 sm:col-span-1">
              <div className="text-[11px] text-muted-foreground mb-1">{t.signal.targets}</div>
              <div className="font-mono font-bold text-sm text-bull flex flex-wrap gap-x-2">
                {signal.plan.takeProfits.map((tp, i) => (
                  <span key={i}>
                    TP{i + 1}: {p(tp)}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
            <span>
              {t.signal.riskReward}:{' '}
              <span className="font-mono text-foreground">1 : {signal.plan.riskReward.toFixed(1)}</span>
            </span>
            <span className="opacity-50">·</span>
            <span>{signal.plan.invalidation}</span>
          </div>
        </div>
      )}

      {/* Timeframe breakdown */}
      <div>
        <h4 className="text-sm font-bold mb-2.5">{t.signal.timeframeBreakdown}</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {signal.timeframes.map((tf) => {
            const s = verdictStyles(
              tf.score >= 15 ? 'BUY' : tf.score <= -15 ? 'SELL' : 'HOLD'
            )
            const Icon = s.icon
            return (
              <div key={tf.timeframe} className={cn('rounded-xl border p-3', s.bg)}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs font-bold">{tf.timeframe.toUpperCase()}</span>
                  <Icon className={cn('size-4', s.color)} />
                </div>
                <div className={cn('text-lg font-black tabular-nums', s.color)}>
                  {tf.score >= 0 ? '+' : ''}
                  {tf.score.toFixed(0)}
                </div>
                <div className="text-[10px] text-muted-foreground">{tf.note}</div>
                {tf.trendStrength != null && (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    ADX: <span className="font-mono">{tf.trendStrength.toFixed(0)}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Indicators (daily timeframe detail) */}
      {daily && (
        <div>
          <h4 className="text-sm font-bold mb-2.5">
            {t.signal.indicators} <span className="text-muted-foreground font-normal">· 1D</span>
          </h4>
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <div className="max-h-72 overflow-y-auto">
              {daily.indicators.map((ind) => {
                const help = (t.indicatorHelp as Record<string, string | undefined>)[ind.key]
                return (
                  <TooltipProvider key={ind.key}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-border/40 last:border-0 text-sm hover:bg-secondary/40 transition-colors cursor-help">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={cn(
                                'size-2 rounded-full shrink-0',
                                ind.vote === 'bullish' ? 'bg-bull' : ind.vote === 'bearish' ? 'bg-bear' : 'bg-muted-foreground/40'
                              )}
                            />
                            <span className="font-mono text-xs font-semibold uppercase">{ind.key}</span>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-[180px]">
                              {ind.display}
                            </span>
                            <span
                              className={cn(
                                'font-mono text-xs font-bold tabular-nums w-12 text-end',
                                ind.contribution > 0 ? 'text-bull' : ind.contribution < 0 ? 'text-bear' : 'text-muted-foreground'
                              )}
                            >
                              {ind.contribution >= 0 ? '+' : ''}
                              {(ind.contribution * 100).toFixed(0)}
                            </span>
                          </div>
                        </div>
                      </TooltipTrigger>
                      {help && (
                        <TooltipContent side="left" className="max-w-72 text-xs leading-relaxed">
                          {help}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Levels */}
      {(signal.supports.length > 0 || signal.resistances.length > 0) && (
        <div className="grid grid-cols-2 gap-2.5">
          {signal.supports.length > 0 && (
            <div className="rounded-xl bg-bull/5 border border-bull/20 p-3">
              <div className="text-[11px] text-bull font-semibold mb-1.5 flex items-center gap-1">
                <TrendingUp className="size-3" /> {t.signal.supports}
              </div>
              <div className="font-mono text-sm space-y-0.5">
                {signal.supports.map((s, i) => (
                  <div key={i}>{p(s)}</div>
                ))}
              </div>
            </div>
          )}
          {signal.resistances.length > 0 && (
            <div className="rounded-xl bg-bear/5 border border-bear/20 p-3">
              <div className="text-[11px] text-bear font-semibold mb-1.5 flex items-center gap-1">
                <TrendingDown className="size-3" /> {t.signal.resistances}
              </div>
              <div className="font-mono text-sm space-y-0.5">
                {signal.resistances.map((r, i) => (
                  <div key={i}>{p(r)}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Separator />
      <p className="text-[11px] leading-relaxed text-muted-foreground flex gap-2">
        <ShieldCheck className="size-4 shrink-0 mt-0.5 text-primary/70" />
        {t.signal.disclaimer}
      </p>
    </div>
  )
}

/* ------------------------------ Countdown ------------------------------ */

/** Live HH:MM:SS countdown to the next UTC-midnight signal lock. */
function NextSignalCountdown() {
  const { t } = useI18n()
  const cd = useNextSignalCountdown()

  const pad = (n: number) => String(n).padStart(2, '0')
  const cells: Array<[string, string]> = cd
    ? [
        [pad(cd.hours), 'HH'],
        [pad(cd.minutes), 'MM'],
        [pad(cd.seconds), 'SS'],
      ]
 : [
        ['––', 'HH'],
        ['––', 'MM'],
        ['––', 'SS'],
      ]

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-1.5 cursor-help">
            <Timer className="size-4 text-primary" />
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground leading-tight text-start">{t.signal.nextSignal}</span>
              <div className="flex items-center gap-1 chart-ltr" dir="ltr">
                {cells.map(([val, unit], i) => (
                  <span key={unit} className="flex items-center gap-1">
                    <span className="countdown-cell rounded-md px-1.5 py-0.5 font-mono text-sm font-bold tabular-nums text-primary">
                      {val}
                    </span>
                    {i < cells.length - 1 && <span className="text-primary/50 text-xs font-bold">:</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-64">
          <p>{t.signal.nextSignalHint}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/* --------------------------- Subscription status --------------------------- */

/**
 * Subscription lifecycle strip: days remaining, progress, expiry warning
 * and the full plan picker for renewal. Renewal days stack on top of the
 * current plan (server-side), so renewing early never loses time.
 *
 * Payments are plain ERC-20 transfers verified on-chain — no session keys,
 * no auto-charges, no card on file. The user stays in control.
 */
function SubscriptionStatus({
  user,
}: {
  user: { subscriptionUntil: string | null; isLifetime?: boolean }
}) {
  const { t, tf, fmt } = useI18n()
  const until = user.subscriptionUntil ? new Date(user.subscriptionUntil) : null
  if (!until) return null

  if (user.isLifetime) {
    return (
      <div className="mb-4 rounded-xl border border-accent/25 bg-accent/5 p-4 flex flex-wrap items-center justify-between gap-2 card-interactive">
        <div className="flex items-center gap-2 min-w-0">
          <Crown className="size-4 shrink-0 text-accent" />
          <span className="text-sm font-semibold truncate">{t.sub.lifetimeActive}</span>
          <Badge variant="outline" className="gap-1 border-accent/40 text-accent whitespace-nowrap font-mono">
            <InfinityIcon className="size-3" />
            {t.sub.foreverBadge}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">{t.sub.lifetimeThanks}</span>
      </div>
    )
  }

  const msLeft = until.getTime() - Date.now()
  const active = msLeft > 0
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000))
  const expiringSoon = active && daysLeft <= 3
  // Progress relative to a 30-day window (longest package).
  const pct = Math.min(100, Math.max(2, Math.round((msLeft / (30 * 86_400_000)) * 100)))
  const dateStr = until.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div
      className={cn(
        'mb-4 rounded-xl border p-4 flex flex-col gap-3 card-interactive',
        expiringSoon
          ? 'border-amber-400/30 bg-amber-400/5'
          : active
            ? 'border-accent/25 bg-accent/5'
            : 'border-rose-400/30 bg-rose-400/5'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Crown
            className={cn(
              'size-4 shrink-0',
              expiringSoon ? 'text-amber-400' : active ? 'text-accent' : 'text-rose-400'
            )}
          />
          <span className="text-sm font-semibold truncate">
            {expiringSoon
              ? t.signal.expiresSoon
              : active
                ? t.signal.activeSubscription
                : t.signal.expired}
          </span>
          {active && (
            <Badge
              variant="outline"
              className={cn(
                'gap-1 whitespace-nowrap font-mono',
                expiringSoon ? 'border-amber-400/40 text-amber-300' : 'border-accent/40 text-accent'
              )}
            >
              <Timer className="size-3" />
              {tf(t.signal.daysLeft, { days: fmt(daysLeft) })}
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">{dateStr}</span>
      </div>

      {active && (
        <div
          className="h-2 rounded-full bg-muted overflow-hidden"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn(
              'h-full rounded-full transition-all duration-700',
              expiringSoon
                ? 'bg-amber-400 shadow-[0_0_12px_2px_rgba(251,191,36,0.45)]'
                : 'bg-accent shadow-[0_0_12px_2px_rgba(74,222,128,0.35)]'
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {(expiringSoon || !active) && (
        <div className="space-y-2">
          <p className="text-xs text-foreground/75 leading-relaxed">{t.signal.renewNote}</p>
          <PlanGrid />
        </div>
      )}
    </div>
  )
}

/* ------------------------------ The card ------------------------------ */

export function SignalCard() {
  const { t } = useI18n()
  const { isConnected } = useAccount()
  const session = useSession()
  const { data, isLoading } = useSignalToday(isConnected || !!session.data?.user)

  const user = session.data?.user ?? null

  // Entitlement ladder mirrored client-side (the server remains the source
  // of truth): connect → signing → subscribe (free tier) → full signal.
  const state = useMemo(() => {
    if (isLoading && !data && (isConnected || user)) return 'loading'
    if (!isConnected && !user) return 'connect'
    if (!user) return 'signing'
    if (user.hasSubscription) return data?.signal ? 'full' : 'loading'
    return 'subscribe'
  }, [isLoading, data, isConnected, user])

  const subscriptionLabel = user?.hasSubscription
    ? user.isLifetime
      ? t.sub.lifetime
      : user.subscriptionUntil
        ? new Date(user.subscriptionUntil).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        : null
    : null

  return (
    <Card className="glass border-primary/15 overflow-hidden" id="signal">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="size-5 text-primary" />
            {t.signal.title}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {subscriptionLabel && (
              <Badge variant="outline" className="border-accent/40 text-accent gap-1">
                <Crown className="size-3" />
                {user?.isLifetime ? (
                  subscriptionLabel
                ) : (
                  <>
                    {t.signal.activeSubscription} · {t.signal.subscriptionUntil} {subscriptionLabel}
                  </>
                )}
              </Badge>
            )}
            {data?.date && (
              <Badge variant="outline" className="border-border font-mono gap-1">
                <CalendarDays className="size-3" />
                {data.date}
              </Badge>
            )}
            <NextSignalCountdown />
          </div>
        </div>
        <div className="aurora-line mt-3" />
      </CardHeader>
      <CardContent>
        {user?.subscriptionUntil && <SubscriptionStatus user={user} />}
        {state === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary" />
            <span className="text-sm">{t.signal.loading}</span>
          </div>
        )}
        {state === 'connect' && <LockedState kind="connect" />}
        {state === 'signing' && <LockedState kind="signing" />}
        {state === 'subscribe' && <LockedState kind="subscribe" />}
        {state === 'full' && data?.signal && <FullSignal signal={data.signal} />}
      </CardContent>
    </Card>
  )
}
