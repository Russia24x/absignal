import type { Candle } from '@/lib/market/geckoterminal'

/**
 * Sort ascending by time and collapse duplicate buckets — keeping the LAST
 * occurrence (for a still-forming bucket the later row is fresher).
 *
 * Why: upstream market-data APIs occasionally emit duplicate timestamps in a
 * single response (observed from GeckoTerminal in production, R39), and
 * lightweight-charts hard-crashes the chart ("data must be asc ordered") on
 * any duplicate/unordered series. Every candle mapper normalizes through
 * here, and the chart applies the same guard client-side (defense in depth).
 */
export function normalizeSeries(rows: Candle[]): Candle[] {
  const sorted = [...rows].sort((a, b) => a.time - b.time)
  const out: Candle[] = []
  for (const c of sorted) {
    if (out.length > 0 && out[out.length - 1].time === c.time) {
      out[out.length - 1] = c
    } else {
      out.push(c)
    }
  }
  return out
}
