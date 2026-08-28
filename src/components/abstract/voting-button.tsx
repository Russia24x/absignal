'use client'

/**
 * AbstractVotingButton — official AGW Reusables "Abstract App Voting"
 * pattern (build.abs.xyz/docs/abstract-portal/abstract-app-voting),
 * adapted to PenguSignal: i18n (fa/en), our Button component, and the
 * same official state machine (not connected → connect-to-vote, loading,
 * voted, upvote). Renders NOTHING when the app is not listed on the
 * Abstract Portal (NEXT_PUBLIC_ABSTRACT_APP_ID unset).
 */

import { ArrowBigUp, Check, Loader2 } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useLoginWithAbstract } from '@abstract-foundation/agw-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/context'
import { portalAppId, votingSupported } from '@/lib/abstract/voting-contract'
import { useUserVoteStatus, useVoteForApp } from '@/hooks/use-app-voting'
import { useWalletStatus } from '@/components/wallet/agw-gate'
import { isEmbeddedBrowser } from '@/lib/wallet/embedded-browser'
import { cn } from '@/lib/utils'

export function AbstractVotingButton({ className }: { className?: string }) {
  const { t } = useI18n()
  const { status } = useWalletStatus()

  // Not listed on the Portal (env unset) → render nothing.
  if (!votingSupported || !portalAppId) return null

  return <VotingButtonInner appId={portalAppId} className={className} walletStatus={status} />
}

function VotingButtonInner({
  appId,
  className,
  walletStatus,
}: {
  appId: string
  className?: string
  walletStatus: 'checking' | 'available' | 'unavailable'
}) {
  const { t } = useI18n()
  const { isConnected } = useAccount()
  const { login } = useLoginWithAbstract()
  const { hasVoted, isLoading: isStatusLoading } = useUserVoteStatus({
    appId,
    enabled: isConnected,
  })
  const { voteForApp, isLoading: isVoteLoading } = useVoteForApp({
    onSuccessMsg: t.vote.success,
    onErrorMsg: t.vote.failed,
  })

  const isLoading = isStatusLoading || isVoteLoading

  const handleVote = async () => {
    if (!isConnected) {
      if (walletStatus === 'unavailable') {
        toast.error(t.auth.walletUnavailableHint)
        return
      }
      if (isEmbeddedBrowser()) toast.warning(t.auth.embeddedBrowserHint, { duration: 8000 })
      await login()
      return
    }
    try {
      await voteForApp(appId)
    } catch {
      // handled in the hook (user-rejection is silent)
    }
  }

  const isButtonDisabled = isLoading || (isConnected && hasVoted)

  return (
    <Button
      onClick={handleVote}
      disabled={isButtonDisabled}
      variant={hasVoted ? 'secondary' : 'default'}
      className={cn(
        'gap-2 whitespace-nowrap font-semibold',
        hasVoted && 'border-bull/40 bg-bull/10 text-bull hover:bg-bull/15',
        className,
      )}
    >
      {isLoading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : hasVoted ? (
        <Check className="size-4" />
      ) : (
        <ArrowBigUp className="size-4" />
      )}
      {hasVoted ? t.vote.voted : isConnected ? t.vote.upvote : t.vote.connectToVote}
    </Button>
  )
}
