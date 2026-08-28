/**
 * QA fixture (dev-only): creates a REAL session via the normal auth flow
 * (nonce → EOA signature → verify), then sets the subscription state in the
 * DB exactly as the on-chain payment verifier would credit it, so the UI
 * (SubscriptionStatus strip) can be browser-tested without a funded wallet.
 * Prints the session cookie for agent-browser injection.
 */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { PrismaClient } from '@prisma/client'

const BASE = 'http://localhost:3000'
const db = new PrismaClient()

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

  // 3. Credit subscription state (as verifyPaymentTx would): expires in 2 days
  const user = await db.user.upsert({
    where: { address },
    create: { address, accessGranted: true, accessGrantedAt: new Date() },
    update: { accessGranted: true, accessGrantedAt: new Date() },
  })
  await db.user.update({
    where: { id: user.id },
    data: { subscriptionUntil: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) },
  })
  console.log('STATE=expiring_soon (2 days left)')
  console.log('USER_ID=' + user.id)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
