'use client'

/**
 * AGW mount gate — resilience layer for the Abstract Global Wallet stack.
 *
 * Why this exists: AGW (via @privy-io/cross-app-connect) initializes Privy
 * inside wagmi `createConfig` during React render, fetching its app config
 * from `privy.abs.xyz` / `auth.privy.io`. On networks where those hosts are
 * unreachable (regional blocks, corporate filters, aggressive ad-blockers),
 * that fetch rejects with "Failed to fetch" as an unhandled rejection
 * surfacing through the render tree — the wallet stack then dies silently
 * (dead connect button; dev overlay shows the runtime error).
 *
 * Strategy (fail-safe, not fail-fast):
 * 1. A wagmi "safe config" (chain + transport, no connectors) is ALWAYS
 *    mounted by `Providers`, so the entire app (market data, signals,
 *    pricing, i18n) keeps working without AGW.
 * 2. AGW is only mounted AFTER a no-cors reachability probe of both Privy
 *    hosts succeeds → the failing init never runs on blocked networks, so
 *    the unhandled rejection never happens in the first place.
 * 3. An error boundary remains as a safety net: if AGW ever throws during
 *    render for any other reason, we fall back to the safe tree (page
 *    stays alive) instead of a white screen.
 */

import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { AbstractWalletProvider } from '@abstract-foundation/agw-react'
import type { QueryClient } from '@tanstack/react-query'
import { appChain, appChainTransport } from '@/lib/chains'

export type WalletStatus = 'checking' | 'available' | 'unavailable'

interface WalletStatusValue {
  status: WalletStatus
  /** Re-run the reachability probe (used by the connect button). */
  retry: () => void
}

const WalletStatusContext = createContext<WalletStatusValue>({
  status: 'checking',
  retry: () => {},
})

export function useWalletStatus(): WalletStatusValue {
  return useContext(WalletStatusContext)
}

/**
 * Hosts the AGW stack needs at init (observed from the connector's network
 * traffic; see worklog round 8). Any HTTP response (even 404) counts as
 * reachable — we only care about network-level failure, which is exactly
 * the "Failed to fetch" mode being guarded against.
 */
const WALLET_BACKENDS = ['https://privy.abs.xyz/', 'https://auth.privy.io/']
const PROBE_TIMEOUT_MS = 8_000

async function probeWalletBackends(): Promise<boolean> {
  const results = await Promise.allSettled(
    WALLET_BACKENDS.map(
      (url) =>
        fetch(url, {
          mode: 'no-cors',
          cache: 'no-store',
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        }) as Promise<unknown>,
    ),
  )
  return results.every((r) => r.status === 'fulfilled')
}

/**
 * Error boundary: an AGW render crash falls back to the safe tree instead
 * of a white screen. `onCrash` flips the gate to "unavailable" so the UI
 * communicates the degraded state and offers retry.
 */
class AgwBoundary extends Component<{ onCrash: () => void; children: ReactNode }> {
  state = { crashed: false }
  static getDerivedStateFromError() {
    return { crashed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn('[AGW] wallet provider failed to render, falling back:', error)
    this.props.onCrash()
  }
  render() {
    return this.state.crashed ? null : this.props.children
  }
}

/**
 * Mounts `AbstractWalletProvider` only when the wallet backend is
 * reachable; otherwise renders children directly under the safe wagmi
 * config from `Providers`.
 */
export function AgwGate({
  queryClient,
  children,
}: {
  queryClient: QueryClient
  children: ReactNode
}) {
  const [status, setStatus] = useState<WalletStatus>('checking')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    probeWalletBackends()
      .then((ok) => {
        if (!cancelled) setStatus(ok ? 'available' : 'unavailable')
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  // "checking" is flipped in the event handler (not the effect) to avoid a
  // synchronous setState cascade; the effect only reports the async result.
  const retry = useCallback(() => {
    setStatus('checking')
    setAttempt((a) => a + 1)
  }, [])

  if (status === 'available') {
    return (
      <WalletStatusContext.Provider value={{ status, retry }}>
        <AgwBoundary onCrash={() => setStatus('unavailable')}>
          <AbstractWalletProvider
            chain={appChain}
            transport={appChainTransport}
            queryClient={queryClient}
          >
            {children}
          </AbstractWalletProvider>
        </AgwBoundary>
      </WalletStatusContext.Provider>
    )
  }

  // 'checking' | 'unavailable' → safe tree (no AGW, no Privy init).
  return (
    <WalletStatusContext.Provider value={{ status, retry }}>
      {children}
    </WalletStatusContext.Provider>
  )
}
