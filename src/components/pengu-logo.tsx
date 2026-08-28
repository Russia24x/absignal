'use client'

/**
 * The PenguSignal mascot — a minimal frost penguin.
 * Inline SVG (no external assets), colorable via currentColor + props.
 */

import { cn } from '@/lib/utils'

export function PenguLogo({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="pengu-body" x1="16" y1="8" x2="48" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1E3A56" />
          <stop offset="1" stopColor="#0C2036" />
        </linearGradient>
        <linearGradient id="pengu-belly" x1="24" y1="26" x2="40" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EAF7FF" />
          <stop offset="1" stopColor="#BEE6F8" />
        </linearGradient>
        <linearGradient id="pengu-frost" x1="10" y1="4" x2="54" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7BE1FF" />
          <stop offset="1" stopColor="#4FA8E8" />
        </linearGradient>
      </defs>
      {/* body */}
      <ellipse cx="32" cy="34" rx="19" ry="24" fill="url(#pengu-body)" stroke="url(#pengu-frost)" strokeWidth="2" />
      {/* frost cap */}
      <path d="M14.5 22 C17 10 24 6.5 32 6.5 C40 6.5 47 10 49.5 22 C44 17.5 38 15.5 32 15.5 C26 15.5 20 17.5 14.5 22 Z" fill="url(#pengu-frost)" />
      {/* belly */}
      <ellipse cx="32" cy="40" rx="11.5" ry="15" fill="url(#pengu-belly)" />
      {/* eyes */}
      <circle cx="25.5" cy="27" r="3.1" fill="#0A1624" />
      <circle cx="38.5" cy="27" r="3.1" fill="#0A1624" />
      <circle cx="26.6" cy="25.9" r="1.05" fill="#EAF7FF" />
      <circle cx="39.6" cy="25.9" r="1.05" fill="#EAF7FF" />
      {/* beak */}
      <path d="M28.6 32.5 L35.4 32.5 L32 37.2 Z" fill="#FFB45C" />
      {/* feet */}
      <path d="M24 55.5 L29 55.5 M27 55.5 L26.2 58.8 M23.5 58.5 L28.5 58.5" stroke="#FFB45C" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M35 55.5 L40 55.5 M38 55.5 L37.2 58.8 M34.5 58.5 L39.5 58.5" stroke="#FFB45C" strokeWidth="2.2" strokeLinecap="round" />
      {/* signal wave — the "signal" identity */}
      <path d="M50 18 C53 18 55 15.5 55 12.5" stroke="#3DDC97" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M50 24.5 C56.5 24.5 61 20 61 13.5" stroke="#3DDC97" strokeWidth="2.4" strokeLinecap="round" opacity="0.55" />
    </svg>
  )
}
