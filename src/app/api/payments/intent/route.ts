import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, cookieFromRequest } from '@/lib/auth/session'
import { pricing, subscriptionPackages, authConfig, chain, treasuryAddress } from '@/lib/config'
import { penguToWei } from '@/lib/payments/onchain'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

type IntentType = 'ACCESS' | 'SIGNAL_DAY' | 'SUBSCRIPTION'

/**
 * Create a payment intent.
 * Body: { type: 'ACCESS' | 'SIGNAL_DAY' | 'SUBSCRIPTION', days?: number }
 *
 * Returns the exact amount (PENGU + wei) and the treasury address so the
 * wallet can execute a plain ERC-20 transfer. Nothing is trusted from the
 * client except the intent type.
 */
export async function POST(req: Request) {
  const user = await getSessionUser(cookieFromRequest(req))
  if (!user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const rl = rateLimit(`intent:${user.address}`, 12, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  let body: { type?: string; days?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const type = body.type as IntentType
  let days: number | null = null
  let units: number

  if (type === 'ACCESS') {
    if (user.accessGranted) {
      return NextResponse.json({ error: 'already_granted' }, { status: 400 })
    }
    units = pricing.accessFee
  } else if (type === 'SIGNAL_DAY') {
    units = pricing.dailySignal
  } else if (type === 'SUBSCRIPTION') {
    const pkg = subscriptionPackages.find((p) => p.days === Number(body.days))
    if (!pkg) return NextResponse.json({ error: 'invalid_package' }, { status: 400 })
    days = pkg.days
    units = pkg.price
  } else {
    return NextResponse.json({ error: 'invalid_type' }, { status: 400 })
  }

  const amountWei = penguToWei(units)
  const intent = await db.paymentIntent.create({
    data: {
      userId: user.id,
      type,
      days,
      amountWei,
      chainId: chain.id,
      expiresAt: new Date(Date.now() + authConfig.paymentIntentTtlMs),
    },
  })

  return NextResponse.json({
    intentId: intent.id,
    type,
    days,
    amountPengu: units,
    amountWei,
    treasuryAddress,
    tokenAddress: process.env.NEXT_PUBLIC_APP_NETWORK === 'testnet'
      ? process.env.NEXT_PUBLIC_PENGU_TESTNET
      : process.env.NEXT_PUBLIC_PENGU_MAINNET,
    chainId: chain.id,
    expiresAt: intent.expiresAt,
  })
}
