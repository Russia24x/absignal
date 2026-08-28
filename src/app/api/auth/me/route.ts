import { NextResponse } from 'next/server'
import { getSessionUser, cookieFromRequest } from '@/lib/auth/session'
import { utcDate } from '@/lib/signal/daily'
import { isLifetimeUntil } from '@/lib/config'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/** Session + entitlement snapshot used by the dashboard. */
export async function GET(req: Request) {
  const rl = rateLimit(`me:${clientIp(req)}`, 60, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const user = await getSessionUser(cookieFromRequest(req))
  if (!user) return NextResponse.json({ user: null })

  const until = user.subscriptionUntil
  const isLifetime = isLifetimeUntil(until)
  const hasSubscription =
    !!until && (isLifetime || until.getTime() >= Date.now())
  const daysLeft = isLifetime
    ? null
    : hasSubscription
      ? Math.max(0, Math.ceil((until!.getTime() - Date.now()) / 86_400_000))
      : 0

  return NextResponse.json({
    user: {
      address: user.address,
      hasSubscription,
      subscriptionUntil: until,
      subscriptionPlan: isLifetime ? 'lifetime' : user.subscriptionPlan,
      isLifetime,
      daysLeft,
      today: utcDate(),
    },
  })
}
