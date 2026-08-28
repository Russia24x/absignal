import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, cookieFromRequest } from '@/lib/auth/session'
import { verifyPaymentTx } from '@/lib/payments/onchain'
import { isLifetimeUntil, planIdForDays, LIFETIME_SENTINEL_MS } from '@/lib/config'
import { utcDate } from '@/lib/signal/daily'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Verify a payment on-chain and credit the entitlement.
 * Body: { intentId, txHash }
 *
 * The tx hash is the ONLY client input; amount, recipient, sender and
 * timing are all verified against the blockchain itself.
 */
export async function POST(req: Request) {
  const user = await getSessionUser(cookieFromRequest(req))
  if (!user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const rl = rateLimit(`verify:${clientIp(req)}:${user.address}`, 30, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  let body: { intentId?: string; txHash?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const { intentId, txHash } = body
  if (!intentId || !txHash) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }

  const intent = await db.paymentIntent.findUnique({ where: { id: intentId } })
  if (!intent || intent.userId !== user.id) {
    return NextResponse.json({ error: 'intent_not_found' }, { status: 404 })
  }
  if (intent.status === 'PAID') {
    return NextResponse.json({ status: 'already_credited', txHash: intent.txHash })
  }
  if (intent.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: 'intent_expired' }, { status: 400 })
  }

  // Prevent the same tx from being attached to two different intents
  // (unique index on txHash enforces it at the DB level too).
  const txTaken = await db.paymentIntent.findFirst({ where: { txHash, NOT: { id: intent.id } } })
  if (txTaken) {
    return NextResponse.json({ error: 'tx_already_used' }, { status: 400 })
  }

  // Atomic claim (audit finding A-2): flip the intent's txHash from
  // null → txHash in a single conditional write. Concurrent verify calls
  // for the same intent can't both win, so the entitlement is credited
  // exactly once. Re-claiming with the SAME hash (crash-retry) is allowed;
  // a different hash loses the race and gets 409.
  let claimed: { count: number }
  try {
    claimed = await db.paymentIntent.updateMany({
      where: { id: intent.id, status: 'PENDING', OR: [{ txHash: null }, { txHash }] },
      data: { txHash },
    })
  } catch (err) {
    // Unique-index violation = another intent already owns this tx.
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'tx_already_used' }, { status: 400 })
    }
    throw err
  }
  if (claimed.count === 0) {
    return NextResponse.json({ error: 'intent_not_claimable' }, { status: 409 })
  }

  const result = await verifyPaymentTx({
    txHash,
    userAddress: user.address,
    expectedAmountWei: BigInt(intent.amountWei),
    validFromMs: intent.createdAt.getTime(),
    chainId: intent.chainId,
  })

  if (!result.ok) {
    // Release the claim so the user can retry with a valid tx.
    await db.paymentIntent
      .updateMany({ where: { id: intent.id, txHash }, data: { txHash: null } })
      .catch(() => {})
    return NextResponse.json(
      { error: 'verification_failed', reason: result.reason },
      { status: 400 }
    )
  }

  // --- Credit the entitlement (idempotent via intent status) ---

  if (intent.type === 'ACCESS') {
    // Legacy pre-v2 intents only — the current tariff never creates these.
    await db.user.update({
      where: { id: user.id },
      data: { accessGranted: true, accessGrantedAt: new Date() },
    })
  } else if (intent.type === 'SIGNAL_DAY') {
    // Legacy pre-v2 intents only.
    await db.signalUnlock.upsert({
      where: { userId_signalDate: { userId: user.id, signalDate: utcDate() } },
      create: { userId: user.id, signalDate: utcDate(), intentId: intent.id },
      update: {},
    })
  } else if (intent.type === 'SUBSCRIPTION') {
    const current = await db.user.findUnique({
      where: { id: user.id },
      select: { subscriptionUntil: true },
    })
    const currentUntil = current?.subscriptionUntil ?? null
    const currentlyLifetime = isLifetimeUntil(currentUntil)
    const buyingLifetime = intent.days == null

    if (buyingLifetime || currentlyLifetime) {
      // Lifetime always wins — no expiry, no stacking math.
      await db.user.update({
        where: { id: user.id },
        data: {
          subscriptionUntil: new Date(LIFETIME_SENTINEL_MS),
          subscriptionPlan: 'lifetime',
          accessGranted: true,
          accessGrantedAt: currentUntil ? undefined : new Date(),
        },
      })
    } else {
      // Finite plan: renewal days stack on top of remaining time.
      const days = intent.days ?? 1
      const base =
        currentUntil && currentUntil.getTime() > Date.now()
          ? currentUntil.getTime()
          : Date.now()
      const newUntil = new Date(base + days * 24 * 60 * 60 * 1000)
      await db.user.update({
        where: { id: user.id },
        data: {
          subscriptionUntil: newUntil,
          subscriptionPlan: planIdForDays(days),
          accessGranted: true,
          accessGrantedAt: currentUntil ? undefined : new Date(),
        },
      })
    }
  }

  await db.paymentIntent.update({
    where: { id: intent.id },
    data: { status: 'PAID', txHash, creditedAt: new Date() },
  })
  return NextResponse.json({
    status: 'credited',
    type: intent.type,
    planId: planIdForDays(intent.days),
    days: intent.days,
    txHash,
    blockTimestamp: result.blockTimestamp,
  })
}
