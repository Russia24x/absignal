/**
 * Lightweight in-memory sliding-window rate limiter.
 * Per-process (sufficient for a single free-tier instance); swap for
 * Cloudflare rate limiting / KV when scaling out (see docs/DEPLOYMENT.md).
 */

interface Bucket {
  hits: number[]
}

const buckets = new Map<string, Bucket>()

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterMs: number
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(key) ?? { hits: [] }
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs)
  if (bucket.hits.length >= limit) {
    const retryAfterMs = windowMs - (now - bucket.hits[0])
    buckets.set(key, bucket)
    return { ok: false, remaining: 0, retryAfterMs: Math.max(retryAfterMs, 0) }
  }
  bucket.hits.push(now)
  buckets.set(key, bucket)
  if (buckets.size > 5000) {
    // Opportunistic cleanup of stale buckets.
    for (const [k, v] of buckets) {
      if (v.hits.length === 0 || now - v.hits[v.hits.length - 1] > windowMs * 2) buckets.delete(k)
    }
  }
  return { ok: true, remaining: limit - bucket.hits.length, retryAfterMs: 0 }
}

/** Best-effort client IP from proxy headers. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}
