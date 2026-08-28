import { NextResponse } from 'next/server'
import { getSessionUser, cookieFromRequest } from '@/lib/auth/session'
import { getTodaySignal, utcDate } from '@/lib/signal/daily'
import { isLifetimeUntil, chain } from '@/lib/config'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Today's signal — the paid product.
 *
 * Entitlement ladder (all enforced server-side):
 *   1. Valid session (wallet signature) — registration & login are FREE
 *   2. Active subscription (day / week / month / year / lifetime)
 *
 * Free tier receives only a neutral teaser (verdict category names are
 * withheld so the paid content never leaks).
 */
export async function GET(req: Request) {
  const rl = rateLimit(`today:${clientIp(req)}`, 30, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const user = await getSessionUser(cookieFromRequest(req))
  const today = utcDate()

  // Ensure the signal exists & is locked for today (also warms the cache).
  let signal
  try {
    signal = await getTodaySignal()
  } catch {
    return NextResponse.json({ error: 'market_data_unavailable' }, { status: 502 })
  }

  if (!user) {
    return NextResponse.json({
      access: 'auth_required',
      date: today,
      updatedAt: signal.generatedAt,
      chainId: chain.id,
    })
  }

  const hasSubscription =
    user.subscriptionUntil != null &&
    (isLifetimeUntil(user.subscriptionUntil) ||
      user.subscriptionUntil.getTime() >= Date.now())

  if (!hasSubscription) {
    return NextResponse.json({
      access: 'subscription_required',
      date: today,
      updatedAt: signal.generatedAt,
      chainId: chain.id,
    })
  }

  return NextResponse.json({
    access: 'granted',
    date: today,
    chainId: chain.id,
    signal,
  })
}
