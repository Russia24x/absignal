'use client'

/**
 * AnimatedNumber — count-up animation from 0 to target when the element
 * scrolls into view. Respects `prefers-reduced-motion` (no animation,
 * shows final value immediately). Localizes the formatted number via the
 * i18n `fmt` helper.
 *
 * All `setDisplay` calls happen inside the IntersectionObserver callback
 * (async) or requestAnimationFrame, never synchronously in the effect body,
 * so we don't trip the `react-hooks/set-state-in-effect` rule.
 */

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/context'

interface Props {
  value: number
  /** duration in ms (default 1100) */
  duration?: number
  /** decimal places (default inferred from value magnitude) */
  decimals?: number
  /** prefix (e.g. '+', '$') */
  prefix?: string
  /** suffix (e.g. '%', 'R', 'K') */
  suffix?: string
  /** Intl.NumberFormatOptions to pass to fmt */
  fmtOptions?: Intl.NumberFormatOptions
  className?: string
  /** if true, the value can be negative and sign is forced for negatives */
  signed?: boolean
}

export function AnimatedNumber({
  value,
  duration = 1100,
  decimals,
  prefix = '',
  suffix = '',
  fmtOptions,
  className,
  signed = false,
}: Props) {
  const { fmt } = useI18n()
  const [display, setDisplay] = useState(0)
  const elRef = useRef<HTMLSpanElement>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    const el = elRef.current
    if (!el) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Reduced-motion: skip the count-up, snap to the value on first view
    if (reduce) {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            setDisplay(value)
            io.disconnect()
          }
        },
        { threshold: 0.4 }
      )
      io.observe(el)
      return () => io.disconnect()
    }

    // Normal: animate from 0 to value once visible
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !startedRef.current) {
          startedRef.current = true
          const start = performance.now()
          const from = 0
          const to = value
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration)
            // easeOutExpo
            const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
            setDisplay(from + (to - from) * eased)
            if (t < 1) requestAnimationFrame(tick)
            else setDisplay(to)
          }
          requestAnimationFrame(tick)
        }
      },
      { threshold: 0.4 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [value, duration])

  // Choose decimals: explicit > infer from magnitude
  const dec =
    decimals ??
    (Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : Math.abs(value) >= 1 ? 2 : 4)
  const formatted = fmt(display, {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
    ...fmtOptions,
  })
  const sign = signed && display > 0 ? '+' : ''

  return (
    <span ref={elRef} className={className}>
      {sign}
      {prefix}
      {formatted}
      {suffix}
    </span>
  )
}
