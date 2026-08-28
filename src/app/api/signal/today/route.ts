import { NextResponse } from 'next/server'
import { getSessionUser, cookieFromRequest } from '@/lib/auth/session'
import { getTodaySignal, utcDate } from '@/lib/signal/daily'
import { db } from '@/lib/db'
import { chain } from '@/lib/config'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Today's signal — the paid product.
 *
 * Entitlement ladder (all enforced server-side):
 *   1. Valid session (wallet signature)
 *   2. Platform access paid (one-time fee)
 *   3. Day unlocked (1 PENGU) OR active subscription
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

  if (!user.accessGranted) {
    return NextResponse.json({
      access: 'access_fee_required',
      date: today,
      updatedAt: signal.generatedAt,
      chainId: chain.id,
    })
  }

  const hasSubscription =
    user.subscriptionUntil != null && user.subscriptionUntil.getTime() >= Date.now()
  const unlocked =
    hasSubscription ||
    (await db.signalUnlock.findUnique({
      where: { userId_signalDate: { userId: user.id, signalDate: today } },
    })) != null

  if (!unlocked) {
    return NextResponse.json({
      access: 'day_unlock_required',
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
