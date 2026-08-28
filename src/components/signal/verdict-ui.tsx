'use client'

/**
 * Shared verdict presentation: styles + the semi-circular score gauge.
 * Used by both the today-signal card and the past-signal detail dialog.
 */

import { Gauge, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export function verdictStyles(verdict: string) {
  switch (verdict) {
    case 'STRONG_BUY':
      return { color: 'text-bull', bg: 'bg-bull/10 border-bull/40', icon: TrendingUp, glow: 'glow-bull' }
    case 'BUY':
      return { color: 'text-bull', bg: 'bg-bull/5 border-bull/25', icon: TrendingUp, glow: '' }
    case 'SELL':
      return { color: 'text-bear', bg: 'bg-bear/5 border-bear/25', icon: TrendingDown, glow: '' }
    case 'STRONG_SELL':
      return { color: 'text-bear', bg: 'bg-bear/10 border-bear/40', icon: TrendingDown, glow: 'glow-bear' }
    default:
      return { color: 'text-frost', bg: 'bg-primary/5 border-primary/25', icon: Gauge, glow: '' }
  }
}

/** Semi-circular score gauge (-100..100). */
export function ScoreGauge({ score, size = 'md' }: { score: number; size?: 'md' | 'sm' }) {
  const angle = ((score + 100) / 200) * 180 // 0..180 deg
  const r = 74
  const cx = 90
  const cy = 90
  const rad = (angle * Math.PI) / 180
  const needleX = cx - r * Math.cos(rad)
  const needleY = cy - r * Math.sin(rad)
  const color = score >= 15 ? '#3ddc97' : score <= -15 ? '#ff6b7a' : '#7be1ff'

  return (
    <div className={cn('relative chart-ltr', size === 'md' ? 'w-[180px] h-[100px]' : 'w-[144px] h-[82px]')} dir="ltr">
      <svg viewBox="0 0 180 100" className="w-full h-full overflow-visible">
        {/* track */}
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} stroke="rgba(123,225,255,0.12)" strokeWidth="12" fill="none" strokeLinecap="round" />
        {/* bear zone */}
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx - r * Math.cos((150 * Math.PI) / 180)} ${cy - r * Math.sin((150 * Math.PI) / 180)}`} stroke="rgba(255,107,122,0.35)" strokeWidth="12" fill="none" strokeLinecap="round" />
        {/* bull zone */}
        <path d={`M ${cx + r * Math.cos((30 * Math.PI) / 180)} ${cy - r * Math.sin((30 * Math.PI) / 180)} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} stroke="rgba(61,220,151,0.35)" strokeWidth="12" fill="none" strokeLinecap="round" />
        {/* needle */}
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={color} strokeWidth="3.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="6" fill={color} />
        <circle cx={cx} cy={cy} r="2.5" fill="#061019" />
        {/* labels */}
        <text x={cx - r - 4} y={cy + 14} fill="#8fb0c5" fontSize="10" textAnchor="middle">-100</text>
        <text x={cx + r + 4} y={cy + 14} fill="#8fb0c5" fontSize="10" textAnchor="middle">+100</text>
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <span className={cn('font-black tabular-nums', size === 'md' ? 'text-2xl' : 'text-xl')} style={{ color }}>
          {score >= 0 ? '+' : ''}
          {score.toFixed(0)}
        </span>
      </div>
    </div>
  )
}
