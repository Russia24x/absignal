'use client'

/**
 * Lightweight CSS snowfall — pure CSS animation, zero JS per frame.
 * Reduced motion respected via media query.
 */

import { useMemo } from 'react'

export function Snowfall({ count = 24 }: { count?: number }) {
  const flakes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const size = 3 + ((i * 7) % 6)
        const left = (i * 97) % 100
        const duration = 9 + ((i * 13) % 11)
        const delay = -((i * 31) % 20)
        const drift = ((i % 5) - 2) * 30
        return { size, left, duration, delay, drift, key: i }
      }),
    [count]
  )

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden z-0 print:hidden snow-container">
      {flakes.map((f) => (
        <span
          key={f.key}
          className="snowflake"
          style={{
            left: `${f.left}%`,
            width: f.size,
            height: f.size,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(220,242,255,0.9) 0%, rgba(123,225,255,0.25) 70%, transparent 100%)',
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
            ['--snow-x' as string]: `${f.drift}px`,
          }}
        />
      ))}
    </div>
  )
}
