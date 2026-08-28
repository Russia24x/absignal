'use client'

/**
 * BuyPlanButton — a plan CTA that ALWAYS works, wherever it is mounted.
 *
 * It owns the full purchase ladder end-to-end:
 *
 *   wallet backend unreachable → honest toast + retry probe
 *   not connected              → open the AGW login modal
 *   connected, not signed in   → fire the SIWE sign-in
 *   signed in                  → create the payment intent and open the
 *                                payment dialog immediately
 *
 * If the user arrives unauthenticated, the chosen plan is remembered
 * (`pendingPlan`) and the payment dialog opens automatically the moment
 * the ladder completes — one click, zero extra steps.
 */

import { useEffect, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/context'
import {
  usePaymentIntent,
  useSession,
  useWalletSignIn,
  type PaymentIntentResponse,
} from '@/hooks/use-app-data'
import { useWalletStatus } from '@/components/wallet/agw-gate'
import { useAgwLogin } from '@/hooks/use-agw-login'
import { PaymentDialog, type PayPlanId } from '@/components/payments/payment-flow'
import { toast } from 'sonner'

/** Abandon the remembered plan if the user never finishes the ladder. */
const PENDING_TIMEOUT_MS = 5 * 60_000

export function BuyPlanButton({
  planId,
  children,
  className,
  variant = 'default',
  size = 'lg',
}: {
  planId: PayPlanId
  children: React.ReactNode
  className?: string
  variant?: 'default' | 'secondary' | 'outline'
  size?: 'default' | 'lg' | 'sm'
}) {
  const { t } = useI18n()
  const { status, retry } = useWalletStatus()
  const { isConnected } = useAccount()
  const session = useSession()
  const authed = !!session.data?.user

  const { openAgwLogin, loginOpening } = useAgwLogin()
  const signIn = useWalletSignIn()
  const createIntent = usePaymentIntent()

  const [intent, setIntent] = useState<PaymentIntentResponse | null>(null)
  const [pendingPlan, setPendingPlan] = useState<PayPlanId | null>(null)
  const firedFor = useRef<PayPlanId | null>(null)

  // Forget the remembered plan after a while (user abandoned the flow).
  useEffect(() => {
    if (!pendingPlan) return
    const id = setTimeout(() => setPendingPlan(null), PENDING_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [pendingPlan])

  // Ladder completion watcher: once the remembered plan exists AND the
  // user is connected + signed in, open the payment dialog automatically.
  // (All setState happens in async callbacks — never synchronously here.)
  useEffect(() => {
    if (!pendingPlan) return
    if (status !== 'available') return
    if (!isConnected || !authed) return
    if (firedFor.current === pendingPlan) return
    firedFor.current = pendingPlan
    createIntent
      .mutateAsync({ planId: pendingPlan })
      .then((result) => {
        setIntent(result)
        setPendingPlan(null)
      })
      .catch((err: Error) => {
        firedFor.current = null
        setPendingPlan(null)
        if (err.message !== 'already_lifetime') {
          toast.error(err.message || t.common.error)
        }
      })
  }, [pendingPlan, isConnected, authed, status, createIntent, t])

  const busy = loginOpening || signIn.isPending || createIntent.isPending

  const start = async () => {
    // 1. Wallet backend unreachable (blocked network) — honest feedback.
    if (status !== 'available') {
      toast.info(t.auth.walletUnavailableHint)
      retry()
      return
    }
    // 2. Not connected yet — open AGW login; the watcher above opens the
    //    payment dialog once connect + auto sign-in complete.
    if (!isConnected) {
      setPendingPlan(planId)
      await openAgwLogin()
      return
    }
    // 3. Connected but the session is missing — sign in, then the
    //    watcher takes over.
    if (!authed) {
      setPendingPlan(planId)
      signIn.mutate()
      return
    }
    // 4. Fully authenticated — straight to the payment dialog.
    try {
      const result = await createIntent.mutateAsync({ planId })
      setIntent(result)
    } catch (err) {
      const message = (err as Error).message
      if (message === 'already_lifetime') return
      toast.error(message || t.common.error)
    }
  }

  return (
    <>
      <Button
        onClick={start}
        disabled={busy}
        className={className}
        variant={variant}
        size={size}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {children}
      </Button>
      {intent && (
        <PaymentDialog key={intent.intentId} intent={intent} onClose={() => setIntent(null)} />
      )}
    </>
  )
}
