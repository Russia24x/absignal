'use client'

/**
 * SignalCalendar — monthly verdict heatmap for the public track record.
 *
 * Each day cell is colored by the locked verdict (bull/bear intensity),
 * carries a WIN/LOSS outcome dot, and opens the full signal detail dialog
 * on click (resolved days only). Month navigation is bounded by the range
 * of real signal data. Persian locale gets Saturday-start weeks and
 * localized Gregorian month names.
 */

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Flame, Lock, Snowflake, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/lib/i18n/context'
import { type HistoryEntry } from '@/hooks/use-app-data'
import { cn } from '@/lib/utils'

/* ------------------------------ Localization ------------------------------ */

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTHS_FA = [
  'ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن',
  'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر',
]
/** Weekday initials. Index 0 = week start (EN: Sunday, FA: Saturday). */
const WEEKDAYS_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const WEEKDAYS_FA = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

/* -------------------------------- Verdicts -------------------------------- */

function verdictCell(verdict: string): string {
  switch (verdict) {
    case 'STRONG_BUY':
      return 'bg-bull/30 border-bull/55 text-bull'
    case 'BUY':
      return 'bg-bull/15 border-bull/30 text-bull/90'
    case 'SELL':
      return 'bg-bear/15 border-bear/30 text-bear/90'
    case 'STRONG_SELL':
      return 'bg-bear/30 border-bear/55 text-bear'
    case 'HOLD':
      return 'bg-muted-foreground/10 border-border/70 text-muted-foreground'
    case 'LOCKED':
      return 'bg-primary/10 border-primary/25 text-primary/70'
    default:
      return 'bg-muted-foreground/10 border-border/70 text-muted-foreground'
  }
}

/* --------------------------------- Streaks -------------------------------- */

function computeStreaks(entries: HistoryEntry[]) {
  const resolved = entries.filter((e) => e.outcome === 'WIN' || e.outcome === 'LOSS')
  let currentType: 'WIN' | 'LOSS' | null = null
  let currentCount = 0
  for (const e of resolved) {
    if (currentType === null) {
      currentType = e.outcome as 'WIN' | 'LOSS'
      currentCount = 1
    } else if (currentType === e.outcome) {
      currentCount += 1
    } else {
      break
    }
  }
  let best = 0
  let run = 0
  for (let i = resolved.length - 1; i >= 0; i--) {
    if (resolved[i].outcome === 'WIN') {
      run += 1
      if (run > best) best = run
    } else {
      run = 0
    }
  }
  return { currentType, currentCount, best }
}

/* ------------------------------- Month utils ------------------------------ */

function monthKey(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth()
}
function sameMonth(d: Date, y: number, m: number): boolean {
  return d.getUTCFullYear() === y && d.getUTCMonth() === m
}

/* ------------------------------- Component -------------------------------- */

export function SignalCalendar({
  entries,
  onPickDate,
}: {
  entries: HistoryEntry[]
  onPickDate?: (date: string) => void
}) {
  const { t, lang } = useI18n()
  const fa = lang === 'fa'

  const months = MONTHS_EN
  const weekdays = fa ? WEEKDAYS_FA : WEEKDAYS_EN
  const weekStart = fa ? 6 : 0 // FA weeks start Saturday; EN weeks start Sunday

  // Data range → navigation bounds + default month
  const bounds = useMemo(() => {
    if (entries.length === 0) return null
    const times = entries.map((e) => new Date(`${e.date}T00:00:00Z`).getTime())
    const filtered = times.filter((n) => !Number.isNaN(n))
    if (filtered.length === 0) return null
    return { min: new Date(Math.min(...filtered)), max: new Date(Math.max(...filtered)) }
  }, [entries])

  const [cursor, setCursor] = useState<Date | null>(null)
  const view = useMemo(() => {
    if (bounds === null) return null
    const c = cursor ?? bounds.max
    return { year: c.getUTCFullYear(), month: c.getUTCMonth() }
  }, [cursor, bounds])

  const byDate = useMemo(() => {
    const m = new Map<string, HistoryEntry>()
    for (const e of entries) m.set(e.date, e)
    return m
  }, [entries])

  const streaks = useMemo(() => computeStreaks(entries), [entries])

  // UTC today for the "today" ring
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])

  if (entries.length === 0 || view === null || bounds === null) {
    return (
      <div className="rounded-2xl glass border-border/60 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Snowflake className="size-4 text-primary/80" />
          <span className="text-xs font-semibold text-muted-foreground">{t.calendar.title}</span>
        </div>
        <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">
          {t.calendar.noData}
        </div>
      </div>
    )
  }

  const { year, month } = view
  const canPrev = monthKey(new Date(Date.UTC(year, month, 1))) > monthKey(bounds.min)
  const canNext = monthKey(new Date(Date.UTC(year, month, 1))) < monthKey(bounds.max)

  // Grid math (all UTC — signal dates are UTC days)
  const firstOfMonth = new Date(Date.UTC(year, month, 1))
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const lead = (firstOfMonth.getUTCDay() + 7 - weekStart) % 7
  const cells: Array<{ day: number | null; dateStr: string | null }> = []
  for (let i = 0; i < lead; i++) cells.push({ day: null, dateStr: null })
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, dateStr })
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, dateStr: null })

  const monthLabel = `${fa ? MONTHS_FA[month] : months[month]} ${fa ? toFaDigits(String(year)) : year}`

  const go = (delta: number) => {
    const next = new Date(Date.UTC(year, month + delta, 1))
    setCursor(next)
  }

  const prevIcon = fa ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />
  const nextIcon = fa ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />

  return (
    <div className="rounded-2xl glass border-border/60 p-4 sm:p-5">
      {/* Header: title + streak chips + month nav */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Snowflake className="size-4 text-primary/80 shrink-0" aria-hidden />
        <span className="text-xs font-semibold text-muted-foreground me-auto">{t.calendar.title}</span>

        {streaks.currentCount > 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
              streaks.currentType === 'WIN'
                ? 'bg-bull/15 text-bull border border-bull/30'
                : 'bg-bear/15 text-bear border border-bear/30'
            )}
          >
            {streaks.currentType === 'WIN' ? <Flame className="size-3" /> : <Snowflake className="size-3" />}
            {streaks.currentType === 'WIN'
              ? streaks.currentCount === 1
                ? t.calendar.streakWinOne
                : t.calendar.streakWins.replace('{n}', fa ? toFaDigits(String(streaks.currentCount)) : String(streaks.currentCount))
              : streaks.currentCount === 1
                ? t.calendar.streakLossOne
                : t.calendar.streakLosses.replace('{n}', fa ? toFaDigits(String(streaks.currentCount)) : String(streaks.currentCount))}
          </span>
        )}
        {streaks.best > 1 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/25 px-2 py-0.5 text-[10px] font-bold">
            <Trophy className="size-3" />
            {t.calendar.bestStreak}: {fa ? toFaDigits(String(streaks.best)) : streaks.best}
          </span>
        )}

        <div className="flex items-center gap-1 ms-auto sm:ms-0">
          <Button
            variant="outline"
            size="icon"
            className="size-7 rounded-lg"
            disabled={!canPrev}
            onClick={() => go(-1)}
            aria-label={t.calendar.prevMonth}
          >
            {prevIcon}
          </Button>
          <span className="text-xs font-bold tabular-nums min-w-[110px] text-center" dir={fa ? 'rtl' : 'ltr'}>
            {monthLabel}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-7 rounded-lg"
            disabled={!canNext}
            onClick={() => go(1)}
            aria-label={t.calendar.nextMonth}
          >
            {nextIcon}
          </Button>
        </div>
      </div>

      {/* Weekday header row */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5" dir="ltr">
        {weekdays.map((w, i) => (
          <div key={i} className="text-center text-[10px] font-bold text-muted-foreground/70 py-1">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5" dir="ltr">
        {cells.map((cell, i) => {
          if (cell.day === null) {
            return <div key={i} className="aspect-square" aria-hidden />
          }
          const entry = cell.dateStr ? byDate.get(cell.dateStr) : undefined
          const has = !!entry
          const isLocked = entry?.verdict === 'LOCKED' || entry?.outcome === 'PENDING'
          const clickable = has && !isLocked && !!onPickDate
          const isToday = cell.dateStr === todayStr

          const body = (
            <div
              className={cn(
                'relative aspect-square rounded-lg border flex flex-col items-center justify-center',
                'transition-all duration-150 select-none',
                has ? verdictCell(entry!.verdict) : 'border-border/30 text-muted-foreground/30',
                clickable && 'cursor-pointer hover:scale-[1.08] hover:shadow-[0_0_12px_rgba(123,225,255,0.18)]',
                isToday && 'ring-1 ring-primary/70 ring-offset-1 ring-offset-[#081420]',
                has && isLocked && 'opacity-80'
              )}
            >
              <span className={cn('text-[11px] sm:text-xs font-bold tabular-nums leading-none', has && !isLocked && 'drop-shadow')}>
                {fa ? toFaDigits(String(cell.day)) : cell.day}
              </span>
              {isLocked && <Lock className="size-2.5 mt-0.5 opacity-70" aria-hidden />}
              {has && (entry!.outcome === 'WIN' || entry!.outcome === 'LOSS') && (
                <span
                  className={cn(
                    'absolute bottom-1 end-1 size-1.5 rounded-full',
                    entry!.outcome === 'WIN' ? 'bg-bull' : 'bg-bear'
                  )}
                  aria-hidden
                />
              )}
            </div>
          )

          if (!has || !entry) {
            return <div key={i}>{body}</div>
          }

          const verdictLabel = (t.signal.verdicts as Record<string, string>)[entry.verdict] ?? entry.verdict
          const tipParts: string[] = [verdictLabel]
          if (!isLocked) {
            tipParts.push(`${t.track.score}: ${entry.score >= 0 ? '+' : ''}${entry.score.toFixed(0)}`)
            if (entry.changePercent != null) {
              tipParts.push(
                `${t.track.nextDay}: ${entry.changePercent >= 0 ? '+' : ''}${entry.changePercent.toFixed(2)}%`
              )
            }
            tipParts.push(
              entry.outcome === 'WIN'
                ? t.track.win
                : entry.outcome === 'LOSS'
                  ? t.track.loss
                  : entry.outcome === 'NEUTRAL'
                    ? t.track.neutralOutcome
                    : t.track.pending
            )
          }

          return (
            <TooltipProvider key={i}>
              <Tooltip>
                <TooltipTrigger asChild>
                  {clickable ? (
                    <button type="button" className="w-full text-start" onClick={() => onPickDate?.(cell.dateStr!)}>
                      {body}
                    </button>
                  ) : (
                    <div className="w-full">{body}</div>
                  )}
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-52">
                  <div className="font-mono font-semibold">{cell.dateStr}</div>
                  <div className="mt-0.5 leading-relaxed">{tipParts.join(' · ')}</div>
                  {clickable && <div className="mt-1 text-[10px] text-primary/80">{t.calendar.clickHint}</div>}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        })}
      </div>
      {/* Legend: verdict colors + outcome dots + today ring */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-2.5 border-t border-border/40 text-[9px] text-muted-foreground" dir={fa ? 'rtl' : 'ltr'}>
        <span className="font-semibold">{t.calendar.legendVerdict}</span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-[3px] bg-bull/30 border border-bull/55" /> {t.signal.verdicts.STRONG_BUY}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-[3px] bg-bear/30 border border-bear/55" /> {t.signal.verdicts.STRONG_SELL}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-bull" /> {t.track.win}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-bear" /> {t.track.loss}
        </span>
        <span className="flex items-center gap-1 ms-auto">
          <span className="size-2.5 rounded-[3px] border border-border/50 ring-1 ring-primary/70" /> {t.calendar.legendToday}
        </span>
      </div>
    </div>
  )
}

/** Latin → Persian digits. */
export function toFaDigits(s: string): string {
  return s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
}

/** Loading skeleton export used by the track record while fetching. */
export function SignalCalendarSkeleton() {
  return (
    <div className="rounded-2xl glass border-border/60 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-40" />
      </div>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={`h${i}`} className="h-4 rounded" />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    </div>
  )
}
