'use client'

/**
 * i18n context. The language persists in a cookie so SSR renders the
 * correct direction (RTL for Persian) without any flash — no
 * client-side effect/state sync is required.
 */

import { createContext, useCallback, useContext, useState } from 'react'
import { dict, interpolate, type Dict, type Lang } from '@/lib/i18n/dict'

interface I18nContextValue {
  lang: Lang
  dir: 'rtl' | 'ltr'
  t: Dict
  tf: (template: string, vars?: Record<string, string | number>) => string
  setLang: (lang: Lang) => void
  toggleLang: () => void
  fmt: (n: number, opts?: Intl.NumberFormatOptions) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children, initialLang }: { children: React.ReactNode; initialLang: Lang }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    // Cookie → SSR picks it up on the next request; also update the
    // document immediately for instant direction switching.
    document.cookie = `pengu_lang=${next}; path=/; max-age=31536000; samesite=lax`
    document.documentElement.lang = next
    document.documentElement.dir = next === 'fa' ? 'rtl' : 'ltr'
  }, [])

  const toggleLang = useCallback(() => {
    setLang(lang === 'fa' ? 'en' : 'fa')
  }, [lang, setLang])

  const t = dict[lang]
  const dir = lang === 'fa' ? 'rtl' : 'ltr'

  const tf = useCallback(
    (template: string, vars?: Record<string, string | number>) => interpolate(template, vars),
    []
  )

  const fmt = useCallback(
    (n: number, opts?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US', opts).format(n),
    [lang]
  )

  return (
    <I18nContext.Provider value={{ lang, dir, t, tf, setLang, toggleLang, fmt }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}
