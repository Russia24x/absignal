'use client'

/**
 * Shared AGW login action — the single entry point every "connect /
 * buy" control on the page uses.
 *
 * Wraps the official `useLoginWithAbstract()` with the safety layers we
 * need everywhere (embedded-browser popup warning + dead-stack guard
 * when the Privy backend dies AFTER the reachability probe).
 *
 * Returns the same `loginOpening` flag the old connect-button carried
 * internally, so every caller renders one consistent "Connecting…"
 * state.
 */

import { useState } from 'react'
import { useLoginWithAbstract } from '@abstract-foundation/agw-react'
import { useI18n } from '@/lib/i18n/context'
import { isEmbeddedBrowser } from '@/lib/wallet/embedded-browser'
import { toast } from 'sonner'

export function useAgwLogin() {
  const { t } = useI18n()
  const { login } = useLoginWithAbstract()
  const [loginOpening, setLoginOpening] = useState(false)

  const openAgwLogin = async () => {
    // Popup-safety (official AGW/Privy guidance): in-app browsers
    // (Telegram/Instagram/…) block wallet popups — warn before attempting.
    if (isEmbeddedBrowser()) toast.warning(t.auth.embeddedBrowserHint, { duration: 8000 })
    setLoginOpening(true)
    // Dead-stack guard: if the AGW backend died AFTER the gate probe,
    // login() hangs with no modal — surface an actionable hint after a
    // grace period instead of a stuck spinner.
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
      // Otherwise the user closed the AGW modal before finishing — fine.
    } finally {
      clearTimeout(guard)
      if (!deadStack) setLoginOpening(false)
    }
  }

  return { openAgwLogin, loginOpening }
}
