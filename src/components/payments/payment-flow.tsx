'use client'

/**
 * The payment flow: intent → wallet transfer → on-chain verification.
 *
 * The button creates a payment intent on our backend, then the dialog
 * walks the user through paying with their connected wallet. After the
 * tx lands, we verify it against Abstract and credit the entitlement.
 *
 * State-machine note: the dialog content is keyed by the intent id, so
 * each payment starts from a fresh, initialized state (no reset effects).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi } from 'viem'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/lib/i18n/context'
import {
  usePaymentIntent,
  useVerifyPayment,
  type PaymentIntentResponse,
} from '@/hooks/use-app-data'
import { useAbstractProfileByAddress } from '@/hooks/use-abstract-profile'
import { AbstractProfile } from '@/components/abstract/abstract-profile'
import { getDisplayName } from '@/lib/abstract/get-user-profile'
import { appChain, penguAddress, treasuryAddress } from '@/lib/chains'
import { cn } from '@/lib/utils'

export type PayPlanId = 'day' | 'week' | 'month' | 'year' | 'lifetime'

/* ------------------------------- The button ------------------------------- */

export function PayButton({
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
  const [intent, setIntent] = useState<PaymentIntentResponse | null>(null)
  const createIntent = usePaymentIntent()

  const start = async () => {
    try {
      const result = await createIntent.mutateAsync({ planId })
      setIntent(result)
    } catch (err) {
      // Silently ignore already-lifetime; surface others via the mutation error state
      const message = (err as Error).message
      if (message === 'already_lifetime') return
      throw err
    }
  }

  return (
    <>
      <Button
        onClick={start}
        disabled={createIntent.isPending}
        className={cn('gap-2 font-semibold', className)}
        variant={variant}
        size={size}
      >
        {createIntent.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Lock className="size-4" />
        )}
        {children}
      </Button>
      {intent && <PaymentDialog key={intent.intentId} intent={intent} onClose={() => setIntent(null)} />}
    </>
  )
}

/* ------------------------------- The dialog ------------------------------- */

type Step = 'review' | 'wallet' | 'chain' | 'verifying' | 'done' | 'error'

export function PaymentDialog({
  intent,
  onClose,
}: {
  intent: PaymentIntentResponse
  onClose: () => void
}) {
  const { t, tf, fmt, lang } = useI18n()
  // Treasury identity from the Abstract Portal (verified receiver — the
  // profile of the wallet that receives PENGU payments).
  const { data: treasuryProfile } = useAbstractProfileByAddress(treasuryAddress)
  const treasuryName = treasuryProfile?.user
    ? getDisplayName(treasuryProfile.user.name, treasuryAddress)
    : null
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const verify = useVerifyPayment()

  const [step, setStep] = useState<Step>('review')
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)

  const wrongNetwork = chainId !== intent.chainId

  const { data: receipt, isLoading: waitingReceipt } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
    chainId: intent.chainId,
  })

  // Derived: once the receipt is in, the UI switches to "verifying"
  // without an extra state write.
  const effectiveStep: Step =
    step === 'chain' && receipt ? 'verifying' : step

  // Fire the backend verification exactly once when the receipt arrives.
  // The effect only talks to an external system (the mutation); all state
  // transitions happen in the mutation callbacks.
  const verifyStarted = useRef(false)
  useEffect(() => {
    if (txHash && receipt && step === 'chain' && !verifyStarted.current) {
      verifyStarted.current = true
      verify.mutate(
        { intentId: intent.intentId, txHash },
        {
          onSuccess: () => setStep('done'),
          onError: (err: Error & { data?: { reason?: string } }) => {
            setError(err.data?.reason ?? err.message)
            setStep('error')
          },
        }
      )
    }
  }, [txHash, receipt, step, intent.intentId, verify])

  const pay = useCallback(async () => {
    if (!intent || !address) return
    setError(null)
    setStep('wallet')
    try {
      const hash = await writeContractAsync({
        address: penguAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [treasuryAddress as `0x${string}`, BigInt(intent.amountWei)],
        chainId: intent.chainId,
      })
      setTxHash(hash)
      setStep('chain')
    } catch (err) {
      const message = (err as Error).message ?? ''
      if (/insufficient/i.test(message)) setError(t.pay.insufficientBalance)
      else if (/rejected|denied|user rejected|User rejected/i.test(message)) setError(t.pay.failed)
      else setError(message)
      setStep('error')
    }
  }, [intent, address, writeContractAsync, t])

  const steps = [
    { id: 1, label: t.pay.steps.request },
    { id: 2, label: t.pay.steps.send },
    { id: 3, label: t.pay.steps.verify },
    { id: 4, label: t.pay.steps.done },
  ]
  const currentStepIdx =
    effectiveStep === 'review'
      ? 1
      : effectiveStep === 'wallet'
        ? 2
        : effectiveStep === 'chain' || effectiveStep === 'verifying'
          ? 3
          : 4

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-strong max-w-md" dir={lang === 'fa' ? 'rtl' : 'ltr'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {effectiveStep === 'done' ? (
              <>
                <CheckCircle2 className="size-5 text-bull" />
                {t.pay.success}
              </>
            ) : (
              <>
                <ShieldCheck className="size-5 text-primary" />
                {t.pay.title}
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {effectiveStep === 'done'
              ? t.pay.successDesc
              : t.pay.subtitle.replace('{amount}', String(intent.amountPengu))}
          </DialogDescription>
        </DialogHeader>

        {/* Steps indicator */}
        <div className="flex items-center justify-between gap-1 px-1">
          {steps.map((s, i) => {
            const done = currentStepIdx > s.id || effectiveStep === 'done'
            const active = currentStepIdx === s.id && step !== 'done'
            return (
              <div key={s.id} className="flex-1 flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'flex size-7 items-center justify-center rounded-full text-[11px] font-bold border transition-all',
                    done && 'bg-bull/20 border-bull/50 text-bull',
                    active && 'bg-primary/15 border-primary/60 text-primary glow-frost',
                    !done && !active && 'bg-secondary border-border text-muted-foreground'
                  )}
                >
                  {done ? <Check className="size-3.5" /> : s.id}
                </div>
                <span
                  className={cn(
                    'text-[10px] text-center leading-tight',
                    active ? 'text-primary font-semibold' : done ? 'text-bull' : 'text-muted-foreground'
                  )}
                >
                  {s.label}
                </span>
                {i < steps.length - 1 && (
                  <div className={cn('h-px w-full -mt-4 mb-3.5', done ? 'bg-bull/40' : 'bg-border')} />
                )}
              </div>
            )
          })}
        </div>

        {/* Details */}
        <div className="rounded-xl bg-secondary/50 border border-border/60 p-3.5 space-y-2.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t.pay.plan}</span>
            <span className="font-semibold">
              {intent.days == null
                ? t.pay.planLifetime
                : intent.days === 365
                  ? t.pay.planYear
                  : tf(t.pay.planDays, { days: fmt(intent.days) })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t.pay.amount}</span>
            <span className="font-bold text-primary text-base">
              {intent.amountPengu.toLocaleString('en-US')} PENGU
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t.pay.treasury}</span>
            {treasuryName ? (
              <span className="flex min-w-0 items-center gap-1.5" title={intent.treasuryAddress}>
                <AbstractProfile address={intent.treasuryAddress as `0x${string}`} size="sm" showTooltip={false} />
                <span className="truncate text-xs font-semibold text-foreground" dir="ltr">
                  {treasuryName}
                </span>
                <span className="hidden shrink-0 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300 sm:inline">
                  {t.auth.paidToVerified}
                </span>
              </span>
            ) : (
              <span className="font-mono text-[11px] truncate max-w-[200px]" title={intent.treasuryAddress}>
                {intent.treasuryAddress.slice(0, 10)}…{intent.treasuryAddress.slice(-8)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t.pay.network}</span>
            <span className="font-semibold">
              {intent.chainId === 2741 ? 'Abstract Mainnet' : 'Abstract Testnet'}
            </span>
          </div>
        </div>

        {/* Status / actions */}
        {effectiveStep === 'review' && (
          <div className="space-y-3">
            {wrongNetwork ? (
              <>
                <div className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
                  <AlertTriangle className="size-4 shrink-0" />
                  {t.pay.wrongChain}
                </div>
                <Button className="w-full" size="lg" onClick={() => switchChain({ chainId: appChain.id })}>
                  {t.pay.switchChain}
                </Button>
              </>
            ) : (
              <Button className="w-full gap-2" size="lg" onClick={pay}>
                <Wallet className="size-4" />
                {t.pay.start.replace('{amount}', String(intent.amountPengu))}
              </Button>
            )}
            <Button variant="ghost" className="w-full" onClick={onClose}>
              {t.pay.cancel}
            </Button>
          </div>
        )}

        {(effectiveStep === 'wallet' || effectiveStep === 'chain' || effectiveStep === 'verifying') && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3.5">
              <Loader2 className="size-5 animate-spin text-primary shrink-0" />
              <div className="text-sm">
                {effectiveStep === 'wallet' && (
                  <>
                    <div className="font-semibold">{t.pay.waitingWallet}</div>
                    <div className="text-xs text-muted-foreground">{t.pay.approveInWallet}</div>
                  </>
                )}
                {effectiveStep === 'chain' && (
                  <>
                    <div className="font-semibold">{t.pay.waitingChain}</div>
                    <div className="text-xs text-muted-foreground">{t.pay.autoRetry}</div>
                  </>
                )}
                {effectiveStep === 'verifying' && (
                  <>
                    <div className="font-semibold">{t.pay.verifying}</div>
                    <div className="text-xs text-muted-foreground">Abstract RPC → smart-contract logs</div>
                  </>
                )}
              </div>
            </div>
            {effectiveStep === 'wallet' && (
              <Button variant="ghost" className="w-full" onClick={onClose}>
                {t.pay.cancel}
              </Button>
            )}
          </div>
        )}

        {effectiveStep === 'done' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-bull/30 bg-bull/10 p-3.5">
              <Sparkles className="size-5 text-bull shrink-0" />
              <div className="text-sm font-semibold text-bull">{t.pay.success}</div>
            </div>
            {txHash && (
              <a
                href={`${appChain.blockExplorers.default.url}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 text-xs text-primary hover:underline"
              >
                <ExternalLink className="size-3.5" /> {t.pay.viewTx}
              </a>
            )}
            <Button className="w-full" size="lg" onClick={onClose}>
              {t.pay.close}
            </Button>
          </div>
        )}

        {effectiveStep === 'error' && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-red-400/30 bg-red-400/10 p-3.5 text-sm">
              <AlertTriangle className="size-5 text-bear shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-bear">{t.pay.failed}</div>
                {error && <div className="text-xs text-muted-foreground mt-1 break-words">{error}</div>}
              </div>
            </div>
            <Button variant="secondary" className="w-full" onClick={() => setStep('review')}>
              {t.common.retry}
            </Button>
            <Button variant="ghost" className="w-full" onClick={onClose}>
              {t.pay.close}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
