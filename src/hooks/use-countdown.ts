'use client'

/**
 * Countdown to the next UTC midnight — the moment the daily signal
 * locks. Ticks every second; SSR-safe (starts null, hydrates on client).
 */
import { useEffect, useState } from 'react'

export interface Countdown {
  hours: number
  minutes: number
  seconds: number
  totalSeconds: number
}

function msUntilNextUtcMidnight(): number {
  const now = new Date()
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0
  )
  return Math.max(0, next - now.getTime())
}

function toCountdown(ms: number): Countdown {
  const totalSeconds = Math.floor(ms / 1000)
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalSeconds,
  }
}

export function useNextSignalCountdown(): Countdown | null {
  const [remaining, setRemaining] = useState<Countdown | null>(null)

  useEffect(() => {
    const tick = () => setRemaining(toCountdown(msUntilNextUtcMidnight()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return remaining
}
