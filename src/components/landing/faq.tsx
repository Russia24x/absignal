'use client'

/**
 * Faq — accordion with a live client-side search filter. The filter input
 * matches against both the question and the answer in the current locale.
 * Shows an empty-state message when nothing matches. Keyboard hint chip
 * tells the user they can press "/" to focus the search field.
 */
import { motion } from 'framer-motion'
import { Search, Slash, X } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/lib/i18n/context'
import { useEffect, useRef, useState } from 'react'

export function Faq() {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const items = [
    { q: t.faq.q1, a: t.faq.a1 },
    { q: t.faq.q2, a: t.faq.a2 },
    { q: t.faq.q3, a: t.faq.a3 },
    { q: t.faq.q4, a: t.faq.a4 },
    { q: t.faq.q5, a: t.faq.a5 },
    { q: t.faq.q6, a: t.faq.a6 },
    { q: t.faq.q7, a: t.faq.a7 },
  ]

  // "/" keyboard shortcut to focus the search field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      // Don't hijack typing in any input / textarea / contenteditable
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? items.filter((it) => {
        const text = `${it.q} ${it.a}`.toLowerCase()
        return text.includes(q)
      })
    : items

  return (
    <section id="faq" className="relative py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <span className="inline-block text-[11px] font-bold uppercase tracking-[0.25em] text-primary/80 mb-3">
            {t.eyebrow.faq}
          </span>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-gradient-frost">
            {t.faq.title}
          </h2>
        </motion.div>

        {/* Search filter */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="mb-6"
        >
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.faq.searchPlaceholder}
              aria-label={t.faq.searchAria}
              className="ps-10 pe-20 h-11 glass border-border/60 focus-visible:border-primary/50 focus-visible:ring-primary/20"
            />
            <div className="absolute end-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={t.faq.clear}
                  className="size-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                >
                  <X className="size-3.5" />
                </button>
              ) : (
                <kbd
                  className="hidden sm:flex items-center gap-0.5 rounded-md border border-border/60 bg-secondary/40 px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono"
                  aria-hidden
                >
                  <Slash className="size-2.5" />
                </kbd>
              )}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground/80 text-center" aria-live="polite">
            {q
              ? t.faq.resultCount.replace('{n}', String(filtered.length))
              : t.faq.searchHint}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-border/60 glass p-8 text-center">
              <Search className="mx-auto size-6 text-muted-foreground/60 mb-3" />
              <p className="text-sm text-muted-foreground">{t.faq.noResults}</p>
              <button
                onClick={() => setQuery('')}
                className="mt-3 text-xs text-primary hover:text-primary/80 transition-colors font-semibold"
              >
                {t.faq.clearFilter}
              </button>
            </div>
          ) : (
            <Accordion
              type="single"
              collapsible
              className="space-y-3"
              // Re-mount on query so the open state resets when filter changes
              key={q}
            >
              {filtered.map((item, i) => (
                <AccordionItem
                  key={`${i}-${item.q}`}
                  value={`q-${i}`}
                  className="glass border border-border/60 rounded-2xl px-5 !mt-0 hover:border-primary/25 data-[state=open]:border-primary/30 transition-colors"
                >
                  <AccordionTrigger
                    className="text-start text-sm sm:text-base font-semibold hover:no-underline hover:text-primary transition-colors py-4 [&>svg]:size-5 [&>svg]:text-primary/70 [&>svg]:transition-transform"
                  >
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </motion.div>
      </div>
    </section>
  )
}
