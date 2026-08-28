'use client'

/**
 * Sticky footer with the essential links, one-click copy for on-chain
 * addresses (PENGU contract + treasury), and the honest disclaimer.
 */

import { useState } from 'react'
import { Check, Copy, ExternalLink, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { PenguLogo } from '@/components/pengu-logo'
import { useI18n } from '@/lib/i18n/context'
import { useAppConfig } from '@/hooks/use-app-data'
import { appChain, treasuryAddress } from '@/lib/chains'

/** Address row: explorer link + one-click copy with feedback. */
function AddressRow({ label, address, href }: { label: string; address: string; href: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    let ok = false
    try {
      await navigator.clipboard.writeText(address)
      ok = true
    } catch {
      // Fallback for browsers without async clipboard API / permissions
      try {
        const ta = document.createElement('textarea')
        ta.value = address
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        ok = false
      }
    }
    if (ok) {
      setCopied(true)
      toast.success(t.footer.copied)
      setTimeout(() => setCopied(false), 1600)
    }
  }

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ExternalLink className="size-3.5 shrink-0" /> {label}
      </a>
      <button
        onClick={copy}
        aria-label={t.footer.copyAddress}
        title={address}
        className="flex items-center gap-1 rounded-md border border-border/50 bg-secondary/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors cursor-pointer"
      >
        {short}
        {copied ? <Check className="size-3 text-bull" /> : <Copy className="size-3" />}
      </button>
    </div>
  )
}

export function Footer() {
  const { t } = useI18n()
  const { data: config } = useAppConfig()
  const year = new Date().getFullYear()
  const explorer = config?.chain.blockExplorerUrl ?? appChain.blockExplorers.default.url

  return (
    <footer className="mt-auto border-t border-border/40 bg-[#050d16]/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
        <div className="grid gap-8 md:grid-cols-[1.3fr_0.85fr_1fr] md:items-start">
          {/* Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <PenguLogo size={30} />
              <span className="font-black text-lg">{t.brand}</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">{t.tagline}</p>
            <p className="text-xs text-muted-foreground">{t.footer.madeOn}</p>
          </div>

          {/* Links */}
          <div className="space-y-2 text-sm">
            <h3 className="font-bold text-xs uppercase tracking-wider text-muted-foreground mb-3 pt-1.5">{t.brand}</h3>
            <a href="#features" className="block text-muted-foreground hover:text-foreground transition-colors">
              {t.nav.features}
            </a>
            <a href="#pricing" className="block text-muted-foreground hover:text-foreground transition-colors">
              {t.nav.pricing}
            </a>
            <a href="#track" className="block text-muted-foreground hover:text-foreground transition-colors">
              {t.nav.track}
            </a>
            <a href="#faq" className="block text-muted-foreground hover:text-foreground transition-colors">
              {t.nav.faq}
            </a>
          </div>

          {/* On-chain links */}
          <div className="space-y-2.5 text-sm">
            <h3 className="font-bold text-xs uppercase tracking-wider text-muted-foreground mb-3 pt-1.5">Abstract</h3>
            <a
              href={explorer}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="size-3.5" /> {t.footer.explorer}
            </a>
            {config?.penguAddress && (
              <AddressRow
                label={t.footer.token}
                address={config.penguAddress}
                href={`${explorer}/token/${config.penguAddress}`}
              />
            )}
            {treasuryAddress && (
              <AddressRow
                label={t.footer.treasury}
                address={treasuryAddress}
                href={`${explorer}/address/${treasuryAddress}`}
              />
            )}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground/90">
            © {year} {t.brand}. {t.footer.rights}
          </p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-primary/70" />
            {t.common.notFinancialAdvice}
          </p>
        </div>

        <div className="mt-4 rounded-xl bg-secondary/40 border border-border/40 p-3.5">
          <p className="text-xs leading-relaxed text-muted-foreground/90">
            <strong className="text-foreground/85">{t.footer.disclaimerTitle}:</strong> {t.footer.disclaimer}
          </p>
        </div>
      </div>
    </footer>
  )
}
