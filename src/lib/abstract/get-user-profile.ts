import { isAddress } from 'viem'

/**
 * Abstract Portal profile client (official AGW Reusable "abstract-profile",
 * adapted to this project: our proxy route + a smarter PFP resolver).
 *
 * Shape mirrors https://backend.portal.abs.xyz/api/user/address/{address}
 * (see the official `get-user-profile.ts` in the registry).
 */

export interface PortalProfileBadge {
  badge: {
    id: number
    type: string
    name: string
    icon: string
    description: string
    requirement: string
    url?: string
    timeStart?: number
    timeEnd?: number
  }
  claimed: boolean
}

export interface AbstractPortalProfile {
  user: {
    id: string
    name: string
    description: string
    walletAddress: string
    avatar: { assetType: string; tier: number; key: number; season: number } | null
    banner?: { assetType: string; tier: number; key: number; season: number } | null
    tier: number
    hasCompletedWelcomeTour: boolean
    hasStreamingAccess?: boolean
    overrideProfilePictureUrl: string | null
    lastTierSeen?: number
    badges?: PortalProfileBadge[]
    verification?: string
  }
}

/** Official CDN base for Portal-generated avatars. */
const AVATAR_CDN = 'https://abstract-assets.abs.xyz/avatars'

/**
 * Resolve the best profile-picture URL:
 * 1. custom override (NFT / uploaded PFP), else
 * 2. Portal-generated avatar `{season}-{tier}-{key}.png` (verified pattern:
 *    jarrodwatts s1/t1/k2 -> 1-1-2.png ✓, Peyman24x s1/t1/k3 -> 1-1-3.png ✓),
 * else null (caller shows a monogram fallback).
 *
 * Improvement over the official reusable, which always falls back to a static
 * `1-1-1.png` for everyone — we keep the monogram instead so profile-less
 * users are never shown a misleading default avatar.
 */
export function resolveAvatarUrl(profile: AbstractPortalProfile | null | undefined): string | null {
  const u = profile?.user
  if (!u) return null
  if (u.overrideProfilePictureUrl) return u.overrideProfilePictureUrl
  const a = u.avatar
  if (a && typeof a.season === 'number' && typeof a.tier === 'number' && typeof a.key === 'number') {
    return `${AVATAR_CDN}/${a.season}-${a.tier}-${a.key}.png`
  }
  return null
}

/** Portal profile page URL (https://abs.xyz/profile/{address} — verified 200). */
export function portalProfileUrl(address: string): string {
  return `https://abs.xyz/profile/${address}`
}

export function countClaimedBadges(profile: AbstractPortalProfile | null | undefined): number {
  const badges = profile?.user?.badges
  if (!Array.isArray(badges)) return 0
  return badges.filter((b) => b?.claimed).length
}

/** Trim "0x1234…abcd" style. */
export function trimAddress(address: string, startChars = 6, endChars = 4): string {
  if (!address) return ''
  if (address.length <= startChars + endChars) return address
  return `${address.slice(0, startChars)}…${address.slice(-endChars)}`
}

/**
 * Display name: Portal username if set (and not just an address), else the
 * trimmed address — never "anon" so the UI always shows something useful.
 */
export function getDisplayName(nameOrAddress: string | null | undefined, fallbackAddress?: string): string {
  if (nameOrAddress && !isAddress(nameOrAddress) && nameOrAddress.trim()) return nameOrAddress
  if (fallbackAddress) return trimAddress(fallbackAddress)
  return nameOrAddress ? trimAddress(nameOrAddress) : '—'
}

/**
 * Fetch a wallet's Abstract Portal profile through our hardened proxy
 * (`/api/user-profile/{address}`). Returns null for 404 (no profile yet) —
 * the common case — instead of throwing, so callers can fall back cleanly.
 */
export async function getUserProfile(walletAddress: string): Promise<AbstractPortalProfile | null> {
  const res = await fetch(`/api/user-profile/${walletAddress}`, {
    headers: { 'content-type': 'application/json' },
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const err = new Error(`HTTP error! status: ${res.status}`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return (await res.json()) as AbstractPortalProfile
}
