'use client'

/**
 * Risk & Position Size Calculator — a real trader tool.
 * Inputs: account size (USD), risk % per trade, entry / stop / target prices.
 * The direction (long/short) is auto-detected from the level geometry:
 *   long  = stop < entry < target
 *   short = stop > entry > target
 * Outputs: risk amount, position size (USD + PENGU units), R multiple,
 * profit at target and loss at stop. Entry defaults to the live PENGU price.
 * Persian/Arabic digits are normalized so FA users can type natively.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Calculator,
  Info,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/lib/i18n/context'
import { useMarketOverview } from '@/hooks/use-app-data'
import { cn } from '@/lib/utils'

/* ------------------------------- number utils ------------------------------ */

/** Map Persian (۰-۹) and Arabic (٠-٩) digits to Latin so FA input works. */
function normalizeDigits(s: string): string {
  return s.replace(/[۰-۹٠-٩]/g, (d) => {
    const fa = '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)
    return String(fa >= 0 ? fa : '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
  })
}

function parseNum(s: string): number | null {
  const v = parseFloat(normalizeDigits(s).replace(/,/g, '').trim())
  return Number.isFinite(v) && v > 0 ? v : null
}

function fmtUsd(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (abs >= 10_000) return `$${(v / 1_000).toFixed(1)}K`
  if (abs >= 1) return `$${v.toFixed(2)}`
  return `$${v.toFixed(4)}`
}

function fmtPrice(v: number): string {
  return v >= 1 ? v.toFixed(4) : v.toPrecision(4)
}

function fmtUnits(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return Math.round(v).toLocaleString('en-US')
  return v.toFixed(1)
}

/* --------------------------------- component -------------------------------- */

const RISK_PRESETS = [0.5, 1, 2, 3, 5]

function Field({
  label,
  value,
  onChange,
  placeholder,
  suffix,
  id,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  suffix?: string
  id: string
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-10 font-mono text-sm tabular-nums ps-3 pe-12 glass border-border/60 focus-visible:border-primary/50 focus-visible:ring-primary/20"
        />
        {suffix && (
          <span className="absolute end-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

function ResultRow({
  label,
  value,
  accent,
  big,
}: {
  label: string
  value: string
  accent?: 'bull' | 'bear' | 'primary'
  big?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 py-2.5 border-b border-border/30 last:border-0',
        big && 'py-3'
      )}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        dir="ltr"
        className={cn(
          'font-mono tabular-nums font-black',
          big ? 'text-xl' : 'text-[15px]',
          accent === 'bull' && 'text-bull',
          accent === 'bear' && 'text-bear',
          accent === 'primary' && 'text-primary',
          !accent && 'text-foreground'
        )}
      >
        {value}
      </span>
    </div>
  )
}

export function RiskCalculator() {
  const { t } = useI18n()
  const { data: market } = useMarketOverview()
  const livePrice = market?.priceUsd ?? null

  const [account, setAccount] = useState('1000')
  const [riskPct, setRiskPct] = useState(2)

  /** Levels (entry/stop/target) — initialized from the live price on first
   * arrival via the render-phase update pattern (no effect needed). */
  const [levels, setLevels] = useState<{
    entry: string
    stop: string
    target: string
  } | null>(null)

  if (!levels && livePrice) {
    setLevels({
      entry: String(Number(livePrice.toPrecision(4))),
      stop: String(Number((livePrice * 0.95).toPrecision(4))),
      target: String(Number((livePrice * 1.1).toPrecision(4))),
    })
  }

  const entry = levels?.entry ?? ''
  const stop = levels?.stop ?? ''
  const target = levels?.target ?? ''

  const setEntry = (v: string) => setLevels((l) => ({ entry: v, stop: l?.stop ?? '', target: l?.target ?? '' }))
  const setStop = (v: string) => setLevels((l) => ({ entry: l?.entry ?? '', stop: v, target: l?.target ?? '' }))
  const setTarget = (v: string) => setLevels((l) => ({ entry: l?.entry ?? '', stop: l?.stop ?? '', target: v }))

  const applyLivePrice = () => {
    if (!livePrice) return
    setLevels({
      entry: String(Number(livePrice.toPrecision(4))),
      stop: String(Number((livePrice * 0.95).toPrecision(4))),
      target: String(Number((livePrice * 1.1).toPrecision(4))),
    })
  }

  const calc = useMemo(() => {
    const acc = parseNum(account)
    const e = parseNum(entry)
    const s = parseNum(stop)
    const tg = parseNum(target)

    if (!acc || !e || !s || !tg) return { status: 'incomplete' as const }
    if (e === s) return { status: 'equalStop' as const }

    const isLong = s < e
    // Valid geometry: stop opposite side of entry from target
    const valid = isLong ? tg > e : tg < e
    if (!valid) return { status: 'invalid' as const }

    const riskAmount = (acc * riskPct) / 100
    const perUnitRisk = Math.abs(e - s) // $ lost per PENGU if stop hits
    const units = riskAmount / perUnitRisk
    const positionUsd = units * e
    const rr = Math.abs(tg - e) / perUnitRisk
    const profit = units * Math.abs(tg - e)
    const loss = units * perUnitRisk // == riskAmount (by construction)

    return {
      status: 'ok' as const,
      isLong,
      riskAmount,
      units,
      positionUsd,
      rr,
      profit,
      loss,
    }
  }, [account, riskPct, entry, stop, target])

  const ok = calc.status === 'ok'

  return (
    <section id="risk" className="relative py-14 sm:py-20">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-8 text-center"
        >
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-primary/80">
            {t.eyebrow.risk}
          </p>
          <h2 className="text-2xl font-black tracking-tight sm:text-3xl text-gradient-frost">
            {t.risk.title}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {t.risk.subtitle}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5, delay: 0.05 }}
        >
          <Card className="glass card-interactive border-border/60 overflow-hidden">
            {/* Toolbar strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-secondary/20 px-4 py-2.5 sm:px-6">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Calculator className="size-3.5 text-primary" />
                {livePrice ? (
                  <span>
                    PENGU <span className="font-mono tabular-nums text-foreground" dir="ltr">${fmtPrice(livePrice)}</span>{' '}
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary/90">{t.risk.autoDetected}</span>
                  </span>
                ) : (
                  <span>PENGU</span>
                )}
              </div>
              <button
                type="button"
                onClick={applyLivePrice}
                disabled={!livePrice}
                className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-secondary/40 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40 disabled:pointer-events-none"
              >
                <RefreshCw className="size-3" />
                {t.risk.useLivePrice}
              </button>
            </div>

            <CardContent className="p-4 sm:p-6">
              <div className="grid gap-8 lg:grid-cols-2">
                {/* Inputs */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      id="risk-account"
                      label={t.risk.accountLabel}
                      value={account}
                      onChange={setAccount}
                      placeholder={t.risk.accountPlaceholder}
                      suffix="USD"
                    />
                    <div className="space-y-1.5">
                      <label htmlFor="risk-pct" className="text-xs font-semibold text-muted-foreground">
                        {t.risk.riskLabel}
                      </label>
                      <div className="flex h-10 items-center gap-2 rounded-xl border border-border/60 bg-secondary/30 px-3 glass">
                        <input
                          id="risk-pct"
                          type="range"
                          min={0.25}
                          max={10}
                          step={0.25}
                          value={riskPct}
                          onChange={(e) => setRiskPct(Number(e.target.value))}
                          className="risk-slider h-4 flex-1"
                          aria-valuetext={`${riskPct}%`}
                        />
                        <span className="w-12 text-end font-mono text-sm font-bold tabular-nums text-primary" dir="ltr">
                          {riskPct.toFixed(2).replace(/\.?0+$/, '') || '0'}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Risk presets */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="me-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                      {t.risk.presets}
                    </span>
                    {RISK_PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setRiskPct(p)}
                        aria-pressed={riskPct === p}
                        className={cn(
                          'rounded-md border px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors',
                          riskPct === p
                            ? 'border-primary/60 bg-primary/20 text-primary ring-1 ring-primary/40'
                            : 'border-border/60 bg-secondary/30 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                        )}
                        dir="ltr"
                      >
                        {p}%
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <Field
                      id="risk-entry"
                      label={t.risk.entryLabel}
                      value={entry}
                      onChange={setEntry}
                      placeholder="0.0093"
                      suffix="USD"
                    />
                    <Field
                      id="risk-stop"
                      label={t.risk.stopLabel}
                      value={stop}
                      onChange={setStop}
                      placeholder="0.0088"
                      suffix="USD"
                    />
                    <Field
                      id="risk-target"
                      label={t.risk.targetLabel}
                      value={target}
                      onChange={setTarget}
                      placeholder="0.0102"
                      suffix="USD"
                    />
                  </div>
                </div>

                {/* Results — direction badge as the panel header */}
                <div className="rounded-2xl border border-border/50 border-s-2 border-s-primary/50 bg-secondary/25 p-4 sm:p-5">
                  <div className="mb-2 flex items-center justify-between border-b border-border/40 pb-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                      {t.risk.direction}
                    </span>
                    {ok && calc.isLong ? (
                      <span className="flex items-center gap-1.5 rounded-full border border-bull/30 bg-bull/10 px-2.5 py-1 text-xs font-bold text-bull">
                        <TrendingUp className="size-3.5" /> {t.risk.long}
                      </span>
                    ) : ok ? (
                      <span className="flex items-center gap-1.5 rounded-full border border-bear/30 bg-bear/10 px-2.5 py-1 text-xs font-bold text-bear">
                        <TrendingDown className="size-3.5" /> {t.risk.short}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/60">—</span>
                    )}
                  </div>
                  {calc.status === 'equalStop' || calc.status === 'invalid' ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                      <ShieldAlert className="size-6 text-amber-400/90" />
                      <p className="text-xs text-muted-foreground">
                        {calc.status === 'equalStop' ? t.risk.entryEqualsStop : t.risk.invalidLevels}
                      </p>
                    </div>
                  ) : !ok ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                      <Info className="size-6 text-muted-foreground/50" />
                      <p className="text-xs text-muted-foreground/70">
                        {t.risk.positionSize} — {t.risk.riskAmount}
                      </p>
                    </div>
                  ) : (
                    <>
                      <ResultRow label={t.risk.riskAmount} value={fmtUsd(calc.riskAmount)} accent="bear" />
                      <ResultRow
                        label={t.risk.positionSize}
                        value={fmtUsd(calc.positionUsd)}
                      />
                      <ResultRow label={t.risk.units} value={fmtUnits(calc.units)} />
                      <ResultRow
                        label={t.risk.rrMultiple}
                        value={`${calc.rr.toFixed(2)}R`}
                        accent={calc.rr >= 2 ? 'bull' : calc.rr >= 1 ? 'primary' : 'bear'}
                        big
                      />
                      <ResultRow label={t.risk.profitAtTarget} value={`+${fmtUsd(calc.profit)}`} accent="bull" />
                      <ResultRow label={t.risk.lossAtStop} value={`−${fmtUsd(calc.loss)}`} accent="bear" />
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <p className="mt-3 text-center text-[11px] text-muted-foreground/70">
            <ShieldAlert className="me-1 inline size-3 -translate-y-px" />
            {t.risk.disclaimer}
          </p>
        </motion.div>
      </div>
    </section>
  )
}
