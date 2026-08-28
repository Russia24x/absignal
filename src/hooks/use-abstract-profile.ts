'use client'

/**
 * React Query hooks for Abstract Portal profiles (official AGW Reusable
 * "abstract-profile" pattern, adapted to this project's proxy + null-for-404
 * fetcher so profile-less wallets don't surface as errors).
 */

import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { getUserProfile } from '@/lib/abstract/get-user-profile'

/** Profile of the currently connected wallet (1-minute freshness). */
export function useAbstractProfile() {
  const { address, isConnecting, isReconnecting } = useAccount()
  const query = useQuery({
    queryKey: ['abstract-profile', address?.toLowerCase()],
    queryFn: async () => {
      if (!address) return null
      return await getUserProfile(address)
    },
    enabled: !!address,
    staleTime: 1000 * 60 * 1,
    refetchOnWindowFocus: false,
  })
  return {
    ...query,
    isLoading: query.isLoading || isConnecting || isReconnecting,
  }
}

/** Profile of any address (5-minute freshness — e.g. the payment treasury). */
export function useAbstractProfileByAddress(address: `0x${string}` | string | undefined) {
  return useQuery({
    queryKey: ['abstract-profile', address?.toLowerCase()],
    queryFn: async () => {
      if (!address) return null
      return await getUserProfile(address)
    },
    enabled: !!address,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    retry: (failureCount, error: Error & { status?: number }) => {
      // 4xx = deterministic outcome (404 no-profile is already null) — don't retry.
      if (error?.status && error.status >= 400 && error.status < 500) return false
      return failureCount < 2
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000),
  })
}
