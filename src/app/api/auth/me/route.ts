import { NextResponse } from 'next/server'
import { getSessionUser, cookieFromRequest } from '@/lib/auth/session'
import { utcDate } from '@/lib/signal/daily'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Session + entitlement snapshot used by the dashboard. */
export async function GET(req: Request) {
  const user = await getSessionUser(cookieFromRequest(req))
  if (!user) return NextResponse.json({ user: null })

  const today = utcDate()
  const hasSubscription =
    user.subscriptionUntil != null && user.subscriptionUntil.getTime() >= Date.now()
  const unlockedToday = hasSubscription
    ? true
    : (await db.signalUnlock.findUnique({
        where: { userId_signalDate: { userId: user.id, signalDate: today } },
      })) != null

  return NextResponse.json({
    user: {
      address: user.address,
      accessGranted: user.accessGranted,
      subscriptionUntil: user.subscriptionUntil,
      hasSubscription,
      unlockedToday,
      today,
    },
  })
}
