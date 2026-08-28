'use client'

/**
 * Abstract Portal App Voting hooks — official AGW Reusables pattern
 * (build.abs.xyz/docs/abstract-portal/abstract-app-voting), adapted to
 * PenguSignal: TanStack Query instead of raw useMutation wiring, i18n-aware
 * toasts, and reads bound to our app chain.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAccount, useReadContract, useWalletClient } from 'wagmi'
import type { Address } from 'viem'
import { toast } from 'sonner'
import {
  ABSTRACT_VOTING_ABI,
  ABSTRACT_VOTING_ADDRESS,
  formatAppId,
  hasUserVotedForApp,
} from '@/lib/abstract/voting-contract'
import { appChain } from '@/lib/chains'

interface UseUserVoteStatusProps {
  appId: string
  enabled?: boolean
}

/**
 * Check whether the connected user has already voted for our app in the
 * current epoch (official pattern: currentEpoch → getUserVotes → includes).
 */
export function useUserVoteStatus({ appId, enabled = true }: UseUserVoteStatusProps) {
  const { address, isConnected } = useAccount()

  const { data: currentEpoch, isLoading: isEpochLoading } = useReadContract({
    address: ABSTRACT_VOTING_ADDRESS,
    abi: ABSTRACT_VOTING_ABI,
    functionName: 'currentEpoch',
    chainId: appChain.id,
    query: { enabled: enabled && isConnected },
  })

  const {
    data: userVotes,
    isLoading: isVotesLoading,
    refetch,
  } = useReadContract({
    address: ABSTRACT_VOTING_ADDRESS,
    abi: ABSTRACT_VOTING_ABI,
    functionName: 'getUserVotes',
    args: address && currentEpoch !== undefined ? [address, currentEpoch] : undefined,
    chainId: appChain.id,
    query: {
      enabled: enabled && isConnected && !!address && currentEpoch !== undefined,
    },
  })

  const hasVoted = userVotes
    ? hasUserVotedForApp(userVotes as readonly bigint[], formatAppId(appId))
    : false

  return {
    hasVoted,
    isLoading: isEpochLoading || isVotesLoading,
    refetch,
  }
}

interface UseVoteForAppProps {
  onSuccessMsg?: string
  onErrorMsg?: string
}

/**
 * Submit a vote for our app through the wallet (official pattern: wallet
 * client writeContract → wait for receipt → invalidate vote status).
 */
export function useVoteForApp({ onSuccessMsg, onErrorMsg }: UseVoteForAppProps = {}) {
  const { isConnected, chainId } = useAccount()
  const { data: walletClient } = useWalletClient()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (appId: string): Promise<Address> => {
      if (!isConnected) throw new Error('wallet not connected')
      if (!walletClient) throw new Error('wallet client not available')
      if (chainId && chainId !== appChain.id) {
        throw new Error('voting is only supported on Abstract mainnet')
      }
      // The AGW client signs + sends; sponsorship applies via the provider
      // (portal votes are gas-sponsored on-chain by Abstract).
      const hash = (await walletClient.writeContract({
        address: ABSTRACT_VOTING_ADDRESS,
        abi: ABSTRACT_VOTING_ABI,
        functionName: 'voteForApp',
        args: [formatAppId(appId)],
        chain: appChain,
      })) as Address
      return hash
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['readContract'] })
      if (onSuccessMsg) toast.success(onSuccessMsg)
    },
    onError: (error: Error) => {
      const userRejected = /reject|denied|cancel/i.test(error.message ?? '')
      if (!userRejected && onErrorMsg) toast.error(onErrorMsg)
    },
  })

  return {
    voteForApp: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error,
  }
}
