'use client'

/**
 * PriceAlerts — client-side PENGU price alerts.
 *
 * Users set a direction + target price; alerts are checked on every market
 * refresh (45 s while the tab is open). On trigger: toast + optional browser
 * notification. Alerts persist in localStorage — no account, no server.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BellRing,
  CheckCheck,
  Plus,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/lib/i18n/context'
import { useMarketOverview } from '@/hooks/use-app-data'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'pengu_price_alerts_v1'
const MAX_ACTIVE = 6
const KEEP_TRIGGERED = 3

interface PriceAlert {
  id: string
  direction: 'above' | 'below'
  target: number
  createdAt: number
  triggeredAt: number | null
}

function loadAlerts(): PriceAlert[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (a): a is PriceAlert =>
        typeof a === 'object' &&
        a !== null &&
        typeof (a as PriceAlert).id === 'string' &&
        ((a as PriceAlert).direction === 'above' || (a as PriceAlert).direction === 'below') &&
        typeof (a as PriceAlert).target === 'number' &&
        Number.isFinite((a as PriceAlert).target)
    )
  } catch {
    return []
  }
}

export function PriceAlerts() {
  const { t, lang, fmt } = useI18n()
  const { data: market } = useMarketOverview()
  const price = market?.priceUsd ?? null

  const [alerts, setAlerts] = useState<PriceAlert[]>([])
  const [direction, setDirection] = useState<'above' | 'below'>('above')
  const [targetInput, setTargetInput] = useState('')
  const [notifPermission, setNotifPermission] = useState<'unsupported' | 'default' | 'granted' | 'denied'>('unsupported')

  // Hydration-safe load (deferred to a microtask so the first client render
  // matches the server HTML, and setState stays out of the effect body).
  // loadedRef gates the persist effect so we never overwrite stored alerts
  // with the initial empty array before the load completes.
  const loadedRef = useRef(false)
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      loadedRef.current = true
      setAlerts(loadAlerts())
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setNotifPermission(Notification.permission)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Persist (only after the initial load — see loadedRef above)
  useEffect(() => {
    if (typeof window === 'undefined' || !loadedRef.current) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts))
    } catch {
      // storage unavailable (private mode) — alerts live for this session only
    }
  }, [alerts])

  const firedRef = useRef<Set<string>>(new Set())

  // Check alerts whenever a fresh price arrives OR the alert list changes
  // (a newly added alert that is already satisfied must fire immediately).
  // Hit detection is pure (reads `alerts` from closure); the state updater
  // maps by id, so React double-invocation in dev is harmless.
  useEffect(() => {
    if (price == null) return
    const hits = alerts.filter(
      (a) =>
        a.triggeredAt == null &&
        !firedRef.current.has(a.id) &&
        (a.direction === 'above' ? price >= a.target : price <= a.target)
    )
    if (hits.length === 0) return
    const now = Date.now()
    const hitIds = new Set(hits.map((h) => h.id))
    for (const h of hits) firedRef.current.add(h.id)
    setAlerts((prev) => prev.map((a) => (hitIds.has(a.id) ? { ...a, triggeredAt: now } : a)))
    for (const h of hits) {
      const priceStr = `$${h.target.toFixed(5)}`
      const msg = t.alerts.triggeredToast.replace('{price}', priceStr)
      toast.success(msg, { icon: <BellRing className="size-4" /> })
      if (notifPermission === 'granted' && typeof window !== 'undefined' && 'Notification' in window) {
        try {
          new window.Notification('PenguSignal', { body: msg })
        } catch {
          // some browsers block the constructor — the toast still fired
        }
      }
    }
  }, [price, alerts, notifPermission, t.alerts.triggeredToast])

  const active = useMemo(() => alerts.filter((a) => a.triggeredAt == null), [alerts])
  const triggered = useMemo(
    () => alerts.filter((a) => a.triggeredAt != null).sort((a, b) => b.triggeredAt! - a.triggeredAt!).slice(0, KEEP_TRIGGERED),
    [alerts]
  )

  const addAlert = useCallback(
    (dir: 'above' | 'below', target: number) => {
      setAlerts((prev) => {
        const act = prev.filter((a) => a.triggeredAt == null)
        if (act.length >= MAX_ACTIVE) {
          toast.error(t.alerts.maxAlerts)
          return prev
        }
        if (act.some((a) => a.direction === dir && Math.abs(a.target - target) < 1e-9)) {
          toast.error(t.alerts.duplicate)
          return prev
        }
        return [
          ...prev,
          { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, direction: dir, target, createdAt: Date.now(), triggeredAt: null },
        ]
      })
    },
    [t.alerts.maxAlerts, t.alerts.duplicate]
  )

  const submit = useCallback(() => {
    const v = Number.parseFloat(targetInput)
    if (!Number.isFinite(v) || v <= 0) {
      toast.error(t.alerts.invalid)
      return
    }
    addAlert(direction, v)
    setTargetInput('')
  }, [targetInput, direction, addAlert, t.alerts.invalid])

  const remove = useCallback((id: string) => {
    firedRef.current.delete(id)
    setAlerts((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const requestNotifications = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    try {
      const res = await Notification.requestPermission()
      setNotifPermission(res)
      if (res === 'denied') toast.error(t.alerts.notifyDenied)
    } catch {
      toast.error(t.alerts.notifyUnsupported)
    }
  }, [t.alerts.notifyDenied, t.alerts.notifyUnsupported])

  // Quick % chips relative to the live price
  const quickChips = useMemo(() => {
    if (price == null) return []
    return [
      { dir: 'above' as const, factor: 1.05, label: '+5%' },
      { dir: 'above' as const, factor: 1.1, label: '+10%' },
      { dir: 'below' as const, factor: 0.95, label: '−5%' },
      { dir: 'below' as const, factor: 0.9, label: '−10%' },
    ].map((c) => ({ ...c, target: price * c.factor }))
  }, [price])

  const timeFmt = useCallback(
    (ts: number) => {
      try {
        return new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(ts))
      } catch {
        return ''
      }
    },
    [lang]
  )

  return (
    <Card className="glass border-border/60 overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="size-4 text-accent" />
          {t.alerts.title}
          {notifPermission === 'granted' && (
            <Badge on text={t.alerts.notifyGranted} />
          )}
          <span className="ms-auto flex items-center gap-1.5">
            {price != null && (
              <span className="text-[11px] font-normal text-muted-foreground font-mono tabular-nums">
                {t.alerts.currentPrice}: ${price.toFixed(5)}
              </span>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add form */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex rounded-lg border border-border/70 overflow-hidden h-9 shrink-0" role="group" aria-label={t.alerts.direction}>
            <button
              type="button"
              onClick={() => setDirection('above')}
              aria-pressed={direction === 'above'}
              className={cn(
                'flex items-center gap-1 px-3 text-xs font-bold transition-colors',
                direction === 'above'
                  ? 'bg-bull/20 text-bull'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              )}
            >
              <ArrowUpRight className="size-3.5" /> {t.alerts.above}
            </button>
            <button
              type="button"
              onClick={() => setDirection('below')}
              aria-pressed={direction === 'below'}
              className={cn(
                'flex items-center gap-1 px-3 text-xs font-bold border-s border-border/70 transition-colors',
                direction === 'below'
                  ? 'bg-bear/20 text-bear'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              )}
            >
              <ArrowDownRight className="size-3.5" /> {t.alerts.below}
            </button>
          </div>
          <Input
            value={targetInput}
            onChange={(e) => setTargetInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            inputMode="decimal"
            placeholder={t.alerts.target}
            className="h-9 font-mono tabular-nums"
            aria-label={t.alerts.target}
          />
          <Button onClick={submit} className="h-9 shrink-0 gap-1" size="sm">
            <Plus className="size-3.5" /> {t.alerts.add}
          </Button>
        </div>

        {/* Quick chips */}
        {quickChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
              {t.alerts.quick}
            </span>
            {quickChips.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => addAlert(c.dir, c.target)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-bold font-mono tabular-nums transition-all hover:scale-105',
                  c.dir === 'above'
                    ? 'border-bull/30 text-bull/90 hover:bg-bull/10'
                    : 'border-bear/30 text-bear/90 hover:bg-bear/10'
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {/* Notification opt-in */}
        {notifPermission === 'default' && (
          <button
            type="button"
            onClick={requestNotifications}
            className="flex items-center gap-2 text-[11px] font-semibold text-primary/90 hover:text-primary transition-colors"
          >
            <Bell className="size-3.5" /> {t.alerts.notifyEnable}
          </button>
        )}

        {/* Lists */}
        {active.length === 0 && triggered.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2 text-center">{t.alerts.empty}</p>
        ) : (
          <div className="space-y-1.5 max-h-56 overflow-y-auto nice-scroll pe-0.5">
            {active.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-secondary/30 px-3 py-2 group"
              >
                {a.direction === 'above' ? (
                  <ArrowUpRight className="size-4 text-bull shrink-0" />
                ) : (
                  <ArrowDownRight className="size-4 text-bear shrink-0" />
                )}
                <span className="font-mono text-xs font-bold tabular-nums">${a.target.toFixed(5)}</span>
                <span className="text-[10px] text-muted-foreground truncate">
                  {a.direction === 'above' ? t.alerts.firesAbove : t.alerts.firesBelow}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 ms-auto opacity-40 group-hover:opacity-100 transition-opacity"
                  onClick={() => remove(a.id)}
                  aria-label={t.alerts.remove}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
            {triggered.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2.5 rounded-lg border border-bull/25 bg-bull/8 px-3 py-2 group"
              >
                <CheckCheck className="size-4 text-bull shrink-0" />
                <span className="font-mono text-xs font-bold tabular-nums">${a.target.toFixed(5)}</span>
                <span className="text-[10px] text-bull/80">
                  {t.alerts.triggeredLabel} · {a.triggeredAt ? timeFmt(a.triggeredAt) : ''}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 ms-auto opacity-40 group-hover:opacity-100 transition-opacity"
                  onClick={() => remove(a.id)}
                  aria-label={t.alerts.remove}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
          {t.alerts.disclaimer} {active.length > 0 && `· ${fmt(active.length)}/${fmt(MAX_ACTIVE)}`}
        </p>
      </CardContent>
    </Card>
  )
}

/** Small inline badge used in the header. */
function Badge({ on, text }: { on: boolean; text: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider',
        on ? 'bg-bull/12 text-bull border border-bull/25' : 'bg-muted text-muted-foreground'
      )}
    >
      <span className={cn('size-1.5 rounded-full', on ? 'bg-bull animate-pulse' : 'bg-muted-foreground/50')} />
      {text}
    </span>
  )
}
