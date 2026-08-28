'use client'

/**
 * HeroMascot — the minimal frost penguin.
 *
 * Flat by design (matches the R24 flat system): solid fills, one hairline
 * frost stroke, no gradients, no glow. Two quiet CSS animations give it
 * life — a 5s bob and a slow blink — without adding visual noise.
 * Decorative only (aria-hidden).
 */

import { cn } from '@/lib/utils'

export function HeroMascot({
  className,
  size = 64,
}: {
  className?: string
  size?: number
}) {
  return (
    <div
      className={cn('animate-mascot-bob', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="size-full"
      >
        {/* body — flat deep navy with a hairline frost edge */}
        <ellipse
          cx="31"
          cy="35"
          rx="18"
          ry="23"
          fill="#122B42"
          stroke="rgba(123,225,255,0.4)"
          strokeWidth="1.5"
        />
        {/* frost cap — solid */}
        <path
          d="M14.5 23 C17 11.5 24 8 31 8 C38 8 45 11.5 47.5 23 C42 18.5 36.5 16.5 31 16.5 C25.5 16.5 20 18.5 14.5 23 Z"
          fill="#7BE1FF"
        />
        {/* belly — flat */}
        <ellipse cx="31" cy="41" rx="10.5" ry="13.5" fill="#E8F6FC" />
        {/* eyes (blink via CSS) */}
        <g className="mascot-eyes">
          <circle cx="24.8" cy="28.5" r="2.9" fill="#0A1624" />
          <circle cx="37.2" cy="28.5" r="2.9" fill="#0A1624" />
          <circle cx="25.8" cy="27.5" r="0.95" fill="#E8F6FC" />
          <circle cx="38.2" cy="27.5" r="0.95" fill="#E8F6FC" />
        </g>
        {/* beak */}
        <path d="M28.2 33.5 L33.8 33.5 L31 37.8 Z" fill="#FFB45C" />
        {/* one signal wave — the brand's identity, bull green */}
        <path
          d="M50 21 C53 21 55 18.6 55 15.8"
          stroke="#3DDC97"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M50 27 C55.8 27 59.6 23 59.6 17.2"
          stroke="#3DDC97"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>
    </div>
  )
}
