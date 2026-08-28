'use client'

/**
 * Sticky glass header: brand, nav, language switch, network badge,
 * wallet connect.
 */

import { useEffect, useState } from 'react'
import { Menu, X, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PenguLogo } from '@/components/pengu-logo'
import { ConnectWalletButton } from '@/components/wallet/connect-button'
import { useI18n } from '@/lib/i18n/context'
import { useAppConfig } from '@/hooks/use-app-data'
import { cn } from '@/lib/utils'

export function Header() {
  const { t, toggleLang, lang } = useI18n()
  const { data: config } = useAppConfig()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navItems = [
    { href: '#app', label: t.nav.app },
    { href: '#track', label: t.nav.track },
    { href: '#features', label: t.nav.features },
    { href: '#pricing', label: t.nav.pricing },
    { href: '#faq', label: t.nav.faq },
  ]

  return (
    <header
      className={cn(
        'fixed inset-x-0 z-50 transition-all duration-300',
        'top-0 sm:top-9', // sm+: pushed below the LivePriceTicker (h-9); mobile: top of viewport (ticker hidden)
        scrolled ? 'glass-strong shadow-lg shadow-black/20' : 'bg-transparent'
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-3">
          {/* Brand */}
          <a href="#top" className="flex items-center gap-2.5 group">
            <span className="transition-transform group-hover:-translate-y-0.5">
              <PenguLogo size={34} />
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-black text-lg tracking-tight text-glow">{t.brand}</span>
              <span className="text-[10px] text-muted-foreground hidden sm:block">{t.tagline}</span>
            </span>
          </a>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1" aria-label="Main">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/60 transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {/* Network badge */}
            {config && (
              <Badge
                variant="outline"
                className="hidden md:flex gap-1.5 border-primary/30 text-primary bg-primary/5"
                title={config.chain.rpcUrl}
              >
                <span className="size-1.5 rounded-full bg-bull animate-pulse" />
                {config.networkMode === 'testnet' ? t.networkBadgeTestnet : t.networkBadge}
              </Badge>
            )}

            {/* Language switch */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLang}
              className="gap-1.5 font-semibold"
              aria-label={lang === 'fa' ? 'Switch to English' : 'تغییر به فارسی'}
            >
              <Globe className="size-4" />
              <span className="text-xs">{t.switchLang}</span>
            </Button>

            <div className="hidden sm:block">
              <ConnectWalletButton />
            </div>

            {/* Mobile menu toggle */}
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="lg:hidden glass-strong border-t border-border/40">
          <div className="mx-auto max-w-7xl px-4 py-4 space-y-3">
            <nav className="grid gap-1" aria-label="Mobile">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/60"
                >
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="sm:hidden pt-2 border-t border-border/40">
              <ConnectWalletButton />
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
