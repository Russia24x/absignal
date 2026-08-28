'use client'

/**
 * Animated count-up: smoothly ramps a number from 0 → target when the
 * element scrolls into view. Uses requestAnimationFrame; SSR-safe
 * (returns 0 until mounted).
 */
import { useEffect, useRef, useState } from 'react'

export function useCountUp(target: number, durationMs = 1200, decimals = 0): number {
  const [value, setValue] = useState(0)
  const startedRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    let startTime: number | null = null
    const step = (ts: number) => {
      if (startTime == null) startTime = ts
      const progress = Math.min(1, (ts - startTime) / durationMs)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = target * eased
      const factor = Math.pow(10, decimals)
      setValue(Math.round(current * factor) / factor)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step)
      }
    }
    rafRef.current = requestAnimationFrame(step)

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [target, durationMs, decimals])

  return value
}
