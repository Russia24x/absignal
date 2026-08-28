import { NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Abstract Portal profile proxy (official AGW Reusable pattern from
 * https://build.abs.xyz/docs/abstract-portal/abstract-profile).
 *
 * Upstream: https://backend.portal.abs.xyz/api/user/address/{address}
 * Returns the connected wallet's Abstract Portal identity (name, tier 1-5,
 * badges, PFP) so any dapp can render Portal profiles.
 *
 * Hardening (project standards):
 * - rate limited 30/min/IP
 * - 5-minute in-memory TTL cache (per official recommendation s-maxage=300)
 * - 15s upstream timeout, EADDR-spam-safe AbortSignal
 * - 404 pass-through for "no profile yet" (the common case — UI falls back)
 */

const PORTAL_API = 'https://backend.portal.abs.xyz/api/user/address'
const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_CACHE = 500

interface CacheEntry {
  status: number
  body: string
  at: number
}

const cache = new Map<string, CacheEntry>()

function cacheGet(key: string): CacheEntry | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  // LRU touch
  cache.delete(key)
  cache.set(key, hit)
  return hit
}

function cacheSet(key: string, status: number, body: string) {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, { status, body, at: Date.now() })
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const rl = rateLimit(`user-profile:${clientIp(_req)}`, 30, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const { address } = await params
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: 'invalid_address' }, { status: 400 })
  }
  const lower = address.toLowerCase()

  const cached = cacheGet(lower)
  if (cached) {
    return new NextResponse(cached.body, {
      status: cached.status,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, s-maxage=300, stale-while-revalidate=600',
        'x-profile-cache': 'hit',
      },
    })
  }

  try {
    const upstream = await fetch(`${PORTAL_API}/${address}`, {
      headers: {
        'content-type': 'application/json',
        'user-agent': 'pengusignal/1.0 (absignal)',
      },
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    })

    if (upstream.status === 404) {
      const body = JSON.stringify({ error: 'profile_not_found' })
      cacheSet(lower, 404, body)
      return new NextResponse(body, {
        status: 404,
        headers: { 'content-type': 'application/json', 'x-profile-cache': 'miss' },
      })
    }
    if (!upstream.ok) {
      return NextResponse.json({ error: 'portal_upstream_error' }, { status: 502 })
    }

    const body = await upstream.text()
    cacheSet(lower, 200, body)
    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, s-maxage=300, stale-while-revalidate=600',
        'x-profile-cache': 'miss',
      },
    })
  } catch {
    return NextResponse.json({ error: 'portal_unreachable' }, { status: 502 })
  }
}
