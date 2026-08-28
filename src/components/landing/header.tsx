'use client'

/**
 * Minimal sticky header: brand · 4 links · language · connect.
 * One hairline border when scrolled; nothing else.
 */

import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PenguLogo } from '@/components/pengu-logo'
import { ConnectWalletButton } from '@/components/wallet/connect-button'
import { useI18n } from '@/lib/i18n/context'
import { cn } from '@/lib/utils'

export function Header() {
  const { t, toggleLang } = useI18n()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navItems = [
    { href: '#signal', label: t.nav.signal },
    { href: '#performance', label: t.nav.performance },
    { href: '#pricing', label: t.nav.pricing },
    { href: '#faq', label: t.nav.faq },
  ]

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        scrolled || menuOpen
          ? 'border-b border-border bg-background/85 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-3">
          {/* Brand */}
          <a href="#top" className="flex items-center gap-2.5">
            <PenguLogo size={30} />
            <span className="text-[15px] font-bold tracking-tight">{t.brand}</span>
          </a>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {/* Language switch */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLang}
              className="px-2.5 font-semibold"
              aria-label="Switch language"
            >
              <span className="text-xs">{t.switchLang}</span>
            </Button>

            <div className="hidden sm:block">
              <ConnectWalletButton />
            </div>

            {/* Mobile menu toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Menu"
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-border bg-background/95 backdrop-blur-md">
          <div className="mx-auto max-w-6xl space-y-1 px-4 py-4">
            <nav className="grid gap-1" aria-label="Mobile">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                >
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="pt-2 sm:hidden">
              <ConnectWalletButton />
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
