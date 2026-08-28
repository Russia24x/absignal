/**
 * Abstract Portal tier system (official mapping from the AGW Reusable
 * "abstract-profile" — https://build.abs.xyz/docs/abstract-portal/abstract-profile).
 *
 * Tiers 1-5: Bronze, Silver, Gold, Platinum, Diamond.
 * Colors are used for the avatar ring; names are shown next to the avatar
 * (English names are the official Portal terms; Persian names are our i18n).
 */

export const TIER_COLORS = {
  1: '#CD7F32', // Bronze
  2: '#C0C0C0', // Silver
  3: '#FFD700', // Gold
  4: '#E5E4E2', // Platinum
  5: '#B9F2FF', // Diamond
} as const

export type TierLevel = keyof typeof TIER_COLORS

export function getTierColor(tier: number | null | undefined): string {
  if (!tier || tier < 1 || tier > 5) return TIER_COLORS[1]
  return TIER_COLORS[tier as TierLevel]
}

const TIER_NAMES_EN = {
  1: 'Bronze',
  2: 'Silver',
  3: 'Gold',
  4: 'Platinum',
  5: 'Diamond',
} as const

const TIER_NAMES_FA = {
  1: 'برنزی',
  2: 'نقره‌ای',
  3: 'طلایی',
  4: 'پلاتینی',
  5: 'الماس',
} as const

export function getTierName(tier: number | null | undefined, lang: 'en' | 'fa' = 'en'): string {
  if (!tier || tier < 1 || tier > 5) {
    return lang === 'fa' ? TIER_NAMES_FA[1] : TIER_NAMES_EN[1]
  }
  return lang === 'fa' ? TIER_NAMES_FA[tier as TierLevel] : TIER_NAMES_EN[tier as TierLevel]
}

/** Tailwind text color class per tier (for badges / labels). */
export function getTierTextClass(tier: number | null | undefined): string {
  switch (tier) {
    case 5:
      return 'text-cyan-200'
    case 4:
      return 'text-slate-200'
    case 3:
      return 'text-amber-300'
    case 2:
      return 'text-zinc-300'
    default:
      return 'text-orange-300'
  }
}
