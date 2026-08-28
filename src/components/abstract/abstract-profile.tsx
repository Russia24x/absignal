'use client'

/**
 * AbstractProfile — official AGW Reusable from build.abs.xyz
 * (https://build.abs.xyz/docs/abstract-portal/abstract-profile), adapted to
 * this project: i18n tier names, monogram fallback for profile-less wallets
 * (instead of the official static default avatar), and the verified
 * Portal-generated avatar URL pattern.
 *
 * Renders the wallet's Abstract Portal identity: PFP with a tier-colored
 * ring (Bronze/Silver/Gold/Platinum/Diamond), skeleton while loading, and an
 * optional tooltip with the display name.
 */

import React from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { useAbstractProfileByAddress } from '@/hooks/use-abstract-profile'
import { getTierColor, getTierName } from '@/lib/abstract/tier-colors'
import { getDisplayName, resolveAvatarUrl } from '@/lib/abstract/get-user-profile'
import { useI18n } from '@/lib/i18n/context'
import { useAccount } from 'wagmi'
import { cn } from '@/lib/utils'
import type { ClassValue } from 'clsx'

export interface AbstractProfileProps {
  /** Wallet address (defaults to the connected wallet). */
  address?: `0x${string}` | string
  /** Fallback monogram when no PFP resolves (defaults to first 2 chars). */
  fallback?: string
  /** Override the tier ring color. */
  shineColor?: string
  size?: 'sm' | 'md' | 'lg'
  showTooltip?: boolean
  /** Ring glow intensity (default: subtle). */
  glow?: boolean
  className?: ClassValue
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
}

export function AbstractProfile({
  address: providedAddress,
  fallback: providedFallback,
  shineColor,
  size = 'md',
  showTooltip = true,
  glow = false,
  className,
}: AbstractProfileProps) {
  const { lang } = useI18n()
  const { address: connectedAddress, isConnecting, isReconnecting } = useAccount()
  const address = (providedAddress || connectedAddress) as `0x${string}` | undefined

  const fallback =
    providedFallback || (address ? address.slice(2, 4).toUpperCase() : '??')

  const { data: profile, isLoading } = useAbstractProfileByAddress(address)
  const loading = !address || isConnecting || isReconnecting || isLoading

  if (loading) {
    return (
      <div
        className={cn(`relative rounded-full ${SIZE_CLASSES[size]}`, className)}
        style={{ border: `2px solid rgba(255,255,255,0.15)` }}
        aria-busy="true"
      >
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <Skeleton className="h-full w-full rounded-full bg-muted/50" />
        </div>
      </div>
    )
  }

  const avatarSrc = resolveAvatarUrl(profile)
  const displayName = getDisplayName(profile?.user?.name, address ?? undefined)
  const tierColor = getTierColor(profile?.user?.tier)
  const borderColor = shineColor || (profile ? tierColor : 'rgba(255,255,255,0.2)')

  const avatar = (
    <div
      className={cn(`relative shrink-0 rounded-full ${SIZE_CLASSES[size]}`, className)}
      style={{
        border: `2px solid ${borderColor}`,
        boxShadow:
          glow && profile
            ? `0 0 10px ${borderColor}55, inset 0 0 4px ${borderColor}22`
            : undefined,
      }}
    >
      <div className="absolute inset-0 overflow-hidden rounded-full">
        <Avatar className="h-full w-full transition-transform duration-200 hover:scale-110">
          {avatarSrc ? (
            <AvatarImage
              src={avatarSrc}
              alt={`${displayName} Abstract Portal avatar`}
              className="object-cover"
            />
          ) : null}
          <AvatarFallback className="bg-secondary text-[11px] font-bold tracking-wide text-secondary-foreground">
            {fallback}
          </AvatarFallback>
        </Avatar>
      </div>
    </div>
  )

  if (!showTooltip) return avatar

  return (
    <Tooltip>
      <TooltipTrigger asChild>{avatar}</TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        <p className="font-semibold">{displayName}</p>
        {profile?.user?.tier ? (
          <p style={{ color: tierColor }}>
            {getTierName(profile.user.tier, lang)} · Abstract Portal
          </p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}
