'use client'

/**
 * Client providers.
 *
 * Wallet connection is powered by the Abstract Global Wallet (AGW) — but AGW
 * is now mounted *through* `AgwGate` (see wallet/agw-gate.tsx): a "safe"
 * wagmi config (chain + transport, no connectors, zero network at init) is
 * ALWAYS mounted, and the real AGW provider is layered on top only when the
 * Privy backend is reachable. If the wallet backend is blocked
 * (privy.abs.xyz / auth.privy.io — "Failed to fetch"), the whole app still
 * works and the connect button reports the degraded state instead of the
 * page crashing or the wallet dying silently.
 *
 * Also hosts the i18n (fa/en) provider.
 */

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createConfig, WagmiProvider } from 'wagmi'
import type { Chain } from 'viem'
import { I18nProvider } from '@/lib/i18n/context'
import { AgwGate } from '@/components/wallet/agw-gate'
import { appChain, appChainTransport } from '@/lib/chains'
import { Toaster } from '@/components/ui/sonner'

export function Providers({ children, initialLang }: { children: ReactNode; initialLang: 'fa' | 'en' }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            // Avoid refetch storms on focus — market endpoints poll on their
            // own intervals and the upstream (GeckoTerminal free tier) is
            // rate-limited.
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  )

  // Safe wagmi config — always mounted, never initializes wallets or
  // connectors: keeps every standard wagmi hook working (account state,
  // contract reads via transport) even when the AGW/Privy backend is
  // unreachable. AGW replaces this context for its subtree when mounted.
  const [safeConfig] = useState(() => {
    // Widen to `Chain` (same as the AGW SDK's own provider) so wagmi's
    // Transports map accepts the single computed key.
    const chain: Chain = appChain
    return createConfig({
      chains: [chain],
      ssr: true,
      connectors: [],
      transports: { [chain.id]: appChainTransport },
    })
  })

  return (
    <WagmiProvider config={safeConfig}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider initialLang={initialLang}>
          <AgwGate queryClient={queryClient}>{children}</AgwGate>
          <Toaster position="top-center" richColors theme="dark" />
        </I18nProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
