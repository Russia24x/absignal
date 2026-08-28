'use client'

/**
 * ScrollProgressBar — sticky aurora strip at the top of the viewport that
 * fills in lockstep with the page scroll position. Purely decorative +
 * progressive-enhancement: SSR-safe (renders nothing until mounted), and
 * hides itself when scroll is 0 (e.g. at the very top of a long page).
 *
 * Positioned above the LiveTicker (z-60) so it never collides with the
 * sticky header. Uses requestAnimationFrame for smooth, throttle-free
 * updates.
 */
import { useEffect, useState } from 'react'

export function ScrollProgressBar() {
  const [progress, setProgress] = useState<number | null>(null)

  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const doc = document.documentElement
      const scrollable = doc.scrollHeight - doc.clientHeight
      const ratio = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0
      setProgress(ratio)
    }
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  if (progress == null) return null

  // Hide completely at the very top — bar appears only once user starts scrolling
  if (progress <= 0.001) return null

  return (
    <div
      aria-hidden
      className="fixed top-0 inset-x-0 z-[60] h-[3px] pointer-events-none"
    >
      <div
        className="scroll-progress h-full"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  )
}
