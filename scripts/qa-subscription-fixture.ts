/**
 * QA fixture (dev-only): creates a REAL session via the normal auth flow
 * (nonce → EOA signature → verify), then sets the subscription state in the
 * DB exactly as the on-chain payment verifier would credit it, so the UI
 * (plan grid, SubscriptionStatus strip, lifetime badge) can be browser-
 * tested without a funded wallet.
 * Prints the session cookie for agent-browser injection.
 *
 * Usage: bun scripts/qa-subscription-fixture.ts [expiring|active|lifetime]
 */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { PrismaClient } from '@prisma/client'

const BASE = 'http://localhost:3000'
const db = new PrismaClient()

// Must mirror LIFETIME_SENTINEL_MS in src/lib/config.ts (2099-12-31)
const LIFETIME_SENTINEL = new Date('2099-12-31T00:00:00.000Z')

const MODE =
  process.argv[2] === 'lifetime' ? 'lifetime' : process.argv[2] === 'active' ? 'active' : 'expiring'

async function main() {
  const account = privateKeyToAccount(generatePrivateKey())
  const address = account.address.toLowerCase()
  console.log('QA_USER=' + address)

  // 1. Nonce
  const nonceRes = await fetch(`${BASE}/api/auth/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  })
  const { message } = (await nonceRes.json()) as { message: string }

  // 2. Sign + verify
  const signature = await account.signMessage({ message })
  const verifyRes = await fetch(`${BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, signature }),
  })
  const setCookie = verifyRes.headers.get('set-cookie') ?? ''
  const cookieValue = /pengu_session=([^;]+)/.exec(setCookie)?.[1] ?? ''
  if (!cookieValue) throw new Error('no session cookie issued')
  console.log('SESSION_COOKIE=' + cookieValue)

  // 3. Credit subscription state (as verifyPaymentTx would)
  const user = await db.user.upsert({
    where: { address },
    create: { address, accessGranted: true, accessGrantedAt: new Date() },
    update: { accessGranted: true, accessGrantedAt: new Date() },
  })
  const credit =
    MODE === 'lifetime'
      ? { subscriptionUntil: LIFETIME_SENTINEL, subscriptionPlan: 'lifetime' }
      : MODE === 'active'
        ? {
            subscriptionUntil: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
            subscriptionPlan: 'month',
          }
        : {
            subscriptionUntil: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
            subscriptionPlan: 'week',
          }
  await db.user.update({ where: { id: user.id }, data: credit })
  console.log(
    `STATE=${MODE === 'lifetime' ? 'lifetime (2099 sentinel)' : MODE === 'active' ? 'active (20 days, month plan)' : 'expiring_soon (2 days left, week plan)'}`
  )
  console.log('USER_ID=' + user.id)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
