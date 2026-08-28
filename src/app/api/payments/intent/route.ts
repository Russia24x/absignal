import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getSessionUser, cookieFromRequest } from '@/lib/auth/session'
import {
  subscriptionPackages,
  isLifetimeUntil,
  authConfig,
  chain,
  treasuryAddress,
} from '@/lib/config'
import { penguToWei } from '@/lib/payments/onchain'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Create a subscription payment intent.
 * Body: { planId: 'day' | 'week' | 'month' | 'year' | 'lifetime' }
 *
 * Returns the exact amount (PENGU + wei) and the treasury address so the
 * wallet can execute a plain ERC-20 transfer. Nothing is trusted from the
 * client except the plan id — the amount always resolves server-side.
 */
export async function POST(req: Request) {
  const user = await getSessionUser(cookieFromRequest(req))
  if (!user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const rl = rateLimit(`intent:${user.address}`, 12, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  let body: { planId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const pkg = subscriptionPackages.find((p) => p.id === body.planId)
  if (!pkg) return NextResponse.json({ error: 'invalid_plan' }, { status: 400 })

  // Lifetime owners already have everything — nothing left to buy.
  if (isLifetimeUntil(user.subscriptionUntil)) {
    return NextResponse.json({ error: 'already_lifetime' }, { status: 400 })
  }

  const amountWei = penguToWei(pkg.price)
  const db = await getDb()
  const intent = await db.paymentIntent.create({
    data: {
      userId: user.id,
      type: 'SUBSCRIPTION',
      days: pkg.days,
      amountWei,
      chainId: chain.id,
      expiresAt: new Date(Date.now() + authConfig.paymentIntentTtlMs),
    },
  })

  return NextResponse.json({
    intentId: intent.id,
    type: 'SUBSCRIPTION',
    planId: pkg.id,
    days: pkg.days,
    amountPengu: pkg.price,
    amountWei,
    treasuryAddress,
    tokenAddress: process.env.NEXT_PUBLIC_APP_NETWORK === 'testnet'
      ? process.env.NEXT_PUBLIC_PENGU_TESTNET
      : process.env.NEXT_PUBLIC_PENGU_MAINNET,
    chainId: chain.id,
    expiresAt: intent.expiresAt,
  })
}
