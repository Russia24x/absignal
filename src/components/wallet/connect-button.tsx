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
import { ChevronDown, Copy, ExternalLink, LogOut, Loader2, ShieldCheck } from 'lucide-react'
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
import { appChain, penguAddress } from '@/lib/chains'
import { toast } from 'sonner'

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function ConnectWalletButton() {
  const { t, lang } = useI18n()
  const { address, isConnected, chainId } = useAccount()
  const { login, logout: agwLogout } = useLoginWithAbstract()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const signIn = useWalletSignIn()
  const logout = useLogout()
  const session = useSession()
  const [loginOpening, setLoginOpening] = useState(false)

  const sessionAddress = session.data?.user?.address ?? null
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
    try {
      await login()
    } catch {
      // User closed the AGW modal before finishing — nothing to report.
    } finally {
      setLoginOpening(false)
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
            <span className="relative flex size-2">
              <span
                className={`absolute inline-flex h-full w-full rounded-full ${authed ? 'bg-emerald-400' : 'bg-amber-400'} opacity-75 animate-ping`}
              />
              <span
                className={`relative inline-flex size-2 rounded-full ${authed ? 'bg-emerald-400' : 'bg-amber-400'}`}
              />
            </span>
            {address ? shortAddress(address) : ''}
            {signInState && <span className="text-[10px] text-muted-foreground hidden sm:inline">· {signInState}</span>}
            <ChevronDown className="size-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 glass-strong">
          <DropdownMenuLabel className="flex flex-col gap-1">
            <Badge variant="outline" className="w-fit border-primary/40 text-primary gap-1">
              <ShieldCheck className="size-3" /> {t.auth.agwBadge}
            </Badge>
            <span className="text-xs text-muted-foreground">{t.auth.wallet}</span>
            <span className="font-mono text-xs break-all">{address}</span>
            <span className="text-xs text-muted-foreground">
              {t.pay.balance}:{' '}
              <span className="font-semibold text-primary">
                {penguBalanceLabel ?? '—'}
              </span>
            </span>
            {authed && (
              <Badge variant="outline" className="w-fit border-emerald-400/40 text-emerald-300">
                {t.auth.connected} ✓
              </Badge>
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
