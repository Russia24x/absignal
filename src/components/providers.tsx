'use client'

/**
 * Client providers.
 *
 * Wallet connection is powered by the Abstract Global Wallet (AGW) —
 * `AbstractWalletProvider` from @abstract-foundation/agw-react wraps
 * WagmiProvider + QueryClientProvider, so every standard wagmi hook
 * (useAccount, useSignMessage, useWriteContract, …) transparently talks to
 * the user's AGW smart-account wallet.
 *
 * Also hosts the i18n (fa/en) provider.
 */

import { useState, type ReactNode } from 'react'
import { QueryClient } from '@tanstack/react-query'
import { AbstractWalletProvider } from '@abstract-foundation/agw-react'
import { I18nProvider } from '@/lib/i18n/context'
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

  return (
    <AbstractWalletProvider chain={appChain} transport={appChainTransport} queryClient={queryClient}>
      <I18nProvider initialLang={initialLang}>{children}</I18nProvider>
      <Toaster position="top-center" richColors theme="dark" />
    </AbstractWalletProvider>
  )
}
