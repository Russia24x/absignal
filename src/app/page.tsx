'use client'

/**
 * PenguSignal — single-page application, minimal structure:
 *
 *   hero → live terminal (signal + market tools) → performance →
 *   pricing → FAQ → footer
 *
 * Footer sticks to the viewport bottom.
 */

import { Header } from '@/components/landing/header'
import { Hero } from '@/components/landing/hero'
import { TerminalSection } from '@/components/landing/terminal-section'
import { PerformanceSection } from '@/components/landing/performance-section'
import { Pricing } from '@/components/landing/pricing'
import { Faq } from '@/components/landing/faq'
import { Footer } from '@/components/landing/footer'
import { useI18n } from '@/lib/i18n/context'

export default function Home() {
  const { dir } = useI18n()

  return (
    <div dir={dir} className="relative min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        <Hero />
        <TerminalSection />
        <PerformanceSection />
        <Pricing />
        <Faq />
      </main>

      <Footer />
    </div>
  )
}
