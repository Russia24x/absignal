'use client'

/**
 * Wallet connect + signature auth — Abstract Global Wallet (AGW) only.
 *
 * `login()` opens the official AGW signup/sign-in modal (email, social or
 * external wallet — all become the user's AGW smart-account wallet).
 * Once connected, sign-in is fully automatic: connect → nonce → sign → session.
 *
 * Also exposes the wallet menu (address, PENGU balance, explorer, disconnect)
 * and a wrong-network switcher as a safety net.
 */

import { useEffect, useRef, useState } from 'react'
import { useAccount, useSwitchChain, useReadContract } from 'wagmi'
import { useLoginWithAbstract } from '@abstract-foundation/agw-react'
import { erc20Abi, formatUnits } from 'viem'
import { ChevronDown, Copy, ExternalLink, LogOut, Loader2, ShieldCheck, Award, UserRound, WifiOff, Crown, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/lib/i18n/context'
import { useWalletSignIn, useLogout, useSession } from '@/hooks/use-app-data'
import { useWalletStatus } from '@/components/wallet/agw-gate'
import { useAbstractProfile } from '@/hooks/use-abstract-profile'
import { getTierName, getTierColor } from '@/lib/abstract/tier-colors'
import { countClaimedBadges, getDisplayName, portalProfileUrl } from '@/lib/abstract/get-user-profile'
import { AbstractProfile } from '@/components/abstract/abstract-profile'
import { appChain, penguAddress } from '@/lib/chains'
import { toast } from 'sonner'

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/**
 * Gate: renders the real AGW button only when the wallet backend is
 * reachable. On blocked networks the user gets an honest, actionable
 * state instead of a dead button — and the rest of the app keeps working
 * (safe wagmi config from Providers).
 */
export function ConnectWalletButton() {
  const { t } = useI18n()
  const { status, retry } = useWalletStatus()

  if (status !== 'available') {
    return (
      <Button
        size="lg"
        variant={status === 'checking' ? 'secondary' : 'outline'}
        disabled={status === 'checking'}
        aria-busy={status === 'checking'}
        onClick={() => {
          toast.info(t.auth.walletUnavailableHint)
          retry()
        }}
        title={status === 'unavailable' ? t.auth.walletUnavailableHint : undefined}
        className="gap-2 font-semibold"
      >
        {status === 'checking' ? (
          <>
            <Loader2 className="size-4 animate-spin" /> {t.auth.walletChecking}
          </>
        ) : (
          <>
            <WifiOff className="size-4 text-amber-400" /> {t.auth.walletUnavailable}
          </>
        )}
      </Button>
    )
  }

  return <AgwConnectButton />
}

function AgwConnectButton() {
  const { t, lang, tf, fmt } = useI18n()
  const { address, isConnected, chainId } = useAccount()
  const { login, logout: agwLogout } = useLoginWithAbstract()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const signIn = useWalletSignIn()
  const logout = useLogout()
  const session = useSession()
  const [loginOpening, setLoginOpening] = useState(false)
  const { data: portalProfile } = useAbstractProfile()
  const hasPortalProfile = !!portalProfile?.user

  const sessionAddress = session.data?.user?.address ?? null
  const sessionUser = session.data?.user ?? null
  const authed = !!sessionAddress
  const wrongNetwork = isConnected && chainId !== appChain.id

  const { data: penguBalance } = useReadContract({
    address: penguAddress as `0x${string}` | undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: appChain.id,
    query: { enabled: !!address && !!penguAddress },
  })

  const penguBalanceLabel = penguBalance
    ? `${Number(formatUnits(penguBalance, 18)).toLocaleString('en-US', { maximumFractionDigits: 2 })} PENGU`
    : null

  // Auto sign-in once the AGW wallet is connected but not yet authenticated.
  const attempted = useRef<string | null>(null)
  useEffect(() => {
    if (address && !authed && attempted.current !== address && !signIn.isPending) {
      attempted.current = address
      signIn.mutate()
    }
    if (!address) attempted.current = null
  }, [address, authed, signIn])

  const signInState =
    isConnected && !authed && signIn.isPending ? t.auth.signingIn : null

  const openAgwLogin = async () => {
    setLoginOpening(true)
    // Dead-stack guard: if the AGW backend died AFTER the gate probe
    // (e.g. network dropped mid-session), login() hangs with no modal.
    // Detect that after a grace period and surface an actionable hint
    // instead of a stuck "Connecting…" spinner.
    let deadStack = false
    const guard = setTimeout(() => {
      const modalPresent = document.querySelector(
        'iframe[src*="privy"], iframe[title*="Privy" i]',
      )
      if (!modalPresent) {
        deadStack = true
        setLoginOpening(false)
        toast.error(t.auth.walletUnavailableHint)
      }
    }, 12_000)
    try {
      await login()
    } catch (err) {
      const msg = (err as Error)?.message ?? ''
      if (/fetch|network|timeout|abort/i.test(msg)) {
        toast.error(t.auth.walletUnavailableHint)
      }
      // Otherwise the user closed the AGW modal before finishing — nothing to report.
    } finally {
      clearTimeout(guard)
      if (!deadStack) setLoginOpening(false)
    }
  }

  if (!isConnected) {
    return (
      <Button onClick={openAgwLogin} disabled={loginOpening} className="gap-2 font-semibold" size="lg">
        {loginOpening ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
        {loginOpening ? t.auth.connecting : t.auth.connectAgw}
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {wrongNetwork && (
        <Button
          size="sm"
          variant="destructive"
          className="gap-1.5"
          onClick={() => switchChain({ chainId: appChain.id })}
          disabled={isSwitching}
        >
          {isSwitching ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
          <span className="hidden sm:inline">{t.auth.wrongNetwork}</span>
        </Button>
      )}
      <DropdownMenu dir={lang === 'fa' ? 'rtl' : 'ltr'}>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" className="gap-2 font-mono text-xs sm:text-sm">
            <AbstractProfile size="sm" showTooltip={false} className="-ml-0.5" />
            {address ? shortAddress(address) : ''}
            {signInState && <span className="text-[10px] text-muted-foreground hidden sm:inline">· {signInState}</span>}
            <ChevronDown className="size-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 glass-strong">
          <DropdownMenuLabel className="p-3">
            <div className="flex items-center gap-3">
              <AbstractProfile size="lg" showTooltip={false} glow />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-sm font-bold text-foreground" dir="ltr">
                  {getDisplayName(portalProfile?.user?.name, address ?? undefined)}
                </span>
                {hasPortalProfile ? (
                  <span
                    className="flex items-center gap-1.5 text-xs font-semibold"
                    style={{ color: getTierColor(portalProfile.user.tier) }}
                  >
                    <Award className="size-3.5" />
                    {getTierName(portalProfile.user.tier, lang)} · {t.auth.portalProfile}
                    <span className="text-muted-foreground">
                      · {tf(t.auth.badgesCount, { n: fmt(countClaimedBadges(portalProfile)) })}
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <UserRound className="size-3.5" />
                    {t.auth.portalNoProfile}
                    <a
                      href="https://abs.xyz"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t.auth.portalCreateHint}
                    </a>
                  </span>
                )}
                <span className="font-mono text-[11px] break-all text-muted-foreground">{address}</span>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="w-fit gap-1 border-primary/40 text-primary">
                <ShieldCheck className="size-3" /> {t.auth.agwBadge}
              </Badge>
              {authed && (
                <Badge variant="outline" className="w-fit border-emerald-400/40 text-emerald-300">
                  {t.auth.connected} ✓
                </Badge>
              )}
            </div>
            <span className="mt-1.5 block text-xs text-muted-foreground">
              {t.pay.balance}:{' '}
              <span className="font-semibold text-primary">
                {penguBalanceLabel ?? '—'}
              </span>
            </span>
            {sessionUser && (
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                {sessionUser.hasSubscription ? (
                  <>
                    <Crown className="size-3.5 shrink-0 text-accent" />
                    <span className="font-semibold text-accent">
                      {sessionUser.isLifetime
                        ? t.sub.lifetimeActive
                        : tf(t.auth.subDaysLeft, { days: fmt(sessionUser.daysLeft ?? 0) })}
                    </span>
                  </>
                ) : (
                  <>
                    <Lock className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground">{t.auth.noSubscription}</span>
                    <a
                      href="#pricing"
                      className="font-semibold text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t.auth.choosePlan} →
                    </a>
                  </>
                )}
              </span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(address ?? '')
                toast.success(t.auth.copied)
              } catch {
                toast.error(t.common.error)
              }
            }}
            className="gap-2"
          >
            <Copy className="size-4" /> {t.auth.copyAddress}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href={`${appChain.blockExplorers.default.url}/address/${address}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2"
            >
              <ExternalLink className="size-4" /> {t.footer.explorer}
            </a>
          </DropdownMenuItem>
          {hasPortalProfile && address && (
            <DropdownMenuItem asChild>
              <a
                href={portalProfileUrl(address)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2"
              >
                <Award className="size-4" style={{ color: getTierColor(portalProfile.user.tier) }} />{' '}
                {t.auth.viewPortal}
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              logout.mutate()
              agwLogout()
            }}
            className="gap-2 text-red-300 focus:text-red-300"
          >
            <LogOut className="size-4" /> {t.auth.disconnect}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
