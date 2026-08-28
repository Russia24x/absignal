/**
 * End-to-end backend security test (run with: bun scripts/e2e-auth.ts)
 * Exercises the real auth + payment intent + verification + subscription
 * lifecycle paths against a locally running dev server. Uses a throwaway
 * viem wallet.
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { getDb } from '../src/lib/db'

const BASE = 'http://127.0.0.1:3000'

/** Whole PENGU → wei (18 decimals) as BigInt — no ES2020 literal needed. */
const pengu = (units: string) => BigInt(units + '0'.repeat(18))

/** Same sentinel the app stores for lifetime plans (2099-12-31 UTC). */
const LIFETIME_SENTINEL_MS = Date.parse('2099-12-31T00:00:00.000Z')

function pass(name: string, condition: boolean, detail = '') {
  console.log(`${condition ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!condition) process.exitCode = 1
}

async function main() {
  const db = await getDb()
  const account = privateKeyToAccount(generatePrivateKey())
  console.log(`\n🔑 Test wallet: ${account.address}\n`)

  /* --- 1. Nonce issuance --- */
  const nonceRes = await fetch(`${BASE}/api/auth/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: account.address }),
  })
  const nonceData = await nonceRes.json()
  pass('nonce issued', nonceRes.status === 200 && !!nonceData.message)

  /* --- 2. Invalid address rejected --- */
  const badAddr = await fetch(`${BASE}/api/auth/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: '0xdeadbeef' }),
  })
  pass('invalid address rejected', badAddr.status === 400)

  /* --- 3. Sign & verify (real signature) --- */
  const signature = await account.signMessage({ message: nonceData.message })
  const verifyRes = await fetch(`${BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: account.address, signature }),
  })
  const verifyData = await verifyRes.json()
  const cookie = verifyRes.headers.get('set-cookie')?.split(';')[0] ?? ''
  pass('signature verified & session issued', verifyRes.status === 200 && !!verifyData.user)
  pass('session cookie present', cookie.startsWith('pengu_session='))

  /* --- 4. Nonce replay rejected --- */
  const replayRes = await fetch(`${BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: account.address, signature }),
  })
  pass('nonce replay rejected', replayRes.status === 400)

  /* --- 5. Tampered signature rejected --- */
  const nonceRes2 = await fetch(`${BASE}/api/auth/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: account.address }),
  })
  const nonceData2 = await nonceRes2.json()
  const otherAccount = privateKeyToAccount(generatePrivateKey())
  const forgedSig = await otherAccount.signMessage({ message: nonceData2.message })
  const forgedRes = await fetch(`${BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: account.address, signature: forgedSig }),
  })
  pass('forged signature rejected', forgedRes.status === 401)

  /* --- 6. Session works (me) --- */
  const meRes = await fetch(`${BASE}/api/auth/me`, { headers: { cookie } })
  const meData = await meRes.json()
  pass('session identifies user', meData.user?.address === account.address.toLowerCase())
  pass('no subscription yet (free tier)', meData.user?.hasSubscription === false && meData.user?.subscriptionPlan === null)

  /* --- 7. Signal paywall ladder (v2: free login → subscription gate) --- */
  const signalRes = await fetch(`${BASE}/api/signal/today`, { headers: { cookie } })
  const signalData = await signalRes.json()
  pass('signal gated behind subscription', signalData.access === 'subscription_required')
  pass('no signal payload leak', signalData.signal === undefined)

  /* --- 8. Payment intents (server-side pricing, planId only) --- */
  const intentRes = await fetch(`${BASE}/api/payments/intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ planId: 'day' }),
  })
  const intentData = await intentRes.json()
  pass(
    'day-pass intent with exact amount (10 PENGU)',
    intentRes.status === 200 && BigInt(intentData.amountWei) === pengu('10') && intentData.planId === 'day'
  )
  const monthIntent = await fetch(`${BASE}/api/payments/intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ planId: 'month' }),
  })
  const monthData = await monthIntent.json()
  pass(
    'month intent with exact amount (255 PENGU)',
    monthIntent.status === 200 && BigInt(monthData.amountWei) === pengu('255')
  )
  const lifetimeIntent = await fetch(`${BASE}/api/payments/intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ planId: 'lifetime' }),
  })
  const lifetimeData = await lifetimeIntent.json()
  pass(
    'lifetime intent with exact amount (7650 PENGU)',
    lifetimeIntent.status === 200 &&
      BigInt(lifetimeData.amountWei) === pengu('7650') &&
      lifetimeData.days === null
  )
  pass(
    'intent targets treasury',
    intentData.treasuryAddress?.toLowerCase() === '0x60df4e186364c3a49a550aee29da1d5fe3658818'
  )
  const badPlan = await fetch(`${BASE}/api/payments/intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ planId: 'century' }),
  })
  pass('invalid plan rejected', badPlan.status === 400)

  /* --- 9. Unauthenticated intent rejected --- */
  const noAuthIntent = await fetch(`${BASE}/api/payments/intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId: 'day' }),
  })
  pass('intent requires session', noAuthIntent.status === 401)

  /* --- 10. Fake tx hash rejected --- */
  const fakeVerify = await fetch(`${BASE}/api/payments/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      intentId: intentData.intentId,
      txHash: '0x' + 'ab'.repeat(32),
    }),
  })
  const fakeVerifyData = await fakeVerify.json()
  pass(
    'fake tx rejected by on-chain verification',
    fakeVerify.status === 400 && fakeVerifyData.error === 'verification_failed'
  )

  /* --- 11. Malformed tx hash rejected --- */
  const malformedVerify = await fetch(`${BASE}/api/payments/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ intentId: intentData.intentId, txHash: '0x1234' }),
  })
  pass('malformed tx rejected', malformedVerify.status === 400)

  /* --- 11b. Subscription lifecycle (server-enforced, owner requirement) --- */
  // Simulates the post-verify credited state exactly as the verify route
  // writes it (subscriptionUntil = base + 30 days for the month plan).
  const addr = account.address.toLowerCase()
  const DAY_MS = 24 * 60 * 60 * 1000

  // b1) Month plan active → 30 days of access, real signal payload
  await db.user.update({
    where: { address: addr },
    data: { subscriptionUntil: new Date(Date.now() + 30 * DAY_MS), subscriptionPlan: 'month' },
  })
  const meActive = await (await fetch(`${BASE}/api/auth/me`, { headers: { cookie } })).json()
  pass(
    'month plan → hasSubscription with ~30 days left',
    meActive.user?.hasSubscription === true &&
      meActive.user?.subscriptionPlan === 'month' &&
      (meActive.user?.daysLeft === 30 || meActive.user?.daysLeft === 29),
    `daysLeft=${meActive.user?.daysLeft}`
  )
  const sigActive = await (await fetch(`${BASE}/api/signal/today`, { headers: { cookie } })).json()
  pass(
    'active month → signal payload delivered',
    sigActive.access === 'granted' && !!sigActive.signal?.verdict && !!sigActive.signal?.plan
  )

  // b2) Expired one minute ago → access CUT, no payload, must buy again
  await db.user.update({
    where: { address: addr },
    data: { subscriptionUntil: new Date(Date.now() - 60_000) },
  })
  const meExpired = await (await fetch(`${BASE}/api/auth/me`, { headers: { cookie } })).json()
  pass(
    'expired subscription → hasSubscription false',
    meExpired.user?.hasSubscription === false && meExpired.user?.daysLeft === 0
  )
  const sigExpired = await (await fetch(`${BASE}/api/signal/today`, { headers: { cookie } })).json()
  pass(
    'expired subscription → access cut, no signal leak',
    sigExpired.access === 'subscription_required' && sigExpired.signal === undefined
  )

  // b3) Expiry boundary: exactly at the deadline still counts (>= now)
  await db.user.update({
    where: { address: addr },
    data: { subscriptionUntil: new Date(Date.now() + 1_000) },
  })
  const sigBoundary = await (await fetch(`${BASE}/api/signal/today`, { headers: { cookie } })).json()
  pass('still active 1s before expiry', sigBoundary.access === 'granted')

  // b4) Lifetime sentinel → permanent access
  await db.user.update({
    where: { address: addr },
    data: { subscriptionUntil: new Date(LIFETIME_SENTINEL_MS), subscriptionPlan: 'lifetime' },
  })
  const meLife = await (await fetch(`${BASE}/api/auth/me`, { headers: { cookie } })).json()
  const sigLife = await (await fetch(`${BASE}/api/signal/today`, { headers: { cookie } })).json()
  pass(
    'lifetime sentinel → permanent access',
    meLife.user?.isLifetime === true && sigLife.access === 'granted' && !!sigLife.signal
  )

  // b5) Buying again after expiry starts a fresh window (stacking math):
  // the verify route computes base = max(currentUntil, now). With an expired
  // plan the base is NOW, so a month purchase = exactly 30 fresh days.
  await db.user.update({
    where: { address: addr },
    data: { subscriptionUntil: new Date(Date.now() - 60_000), subscriptionPlan: null },
  })
  const meRenew = await (await fetch(`${BASE}/api/auth/me`, { headers: { cookie } })).json()
  pass('expired user must re-subscribe (no free ride)', meRenew.user?.hasSubscription === false)

  // Reset to the free tier for the remaining checks.
  await db.user.update({
    where: { address: addr },
    data: { subscriptionUntil: null, subscriptionPlan: null, accessGranted: false, accessGrantedAt: null },
  })

  /* --- 11c. Client-side / browser tampering cannot bypass the paywall --- */
  // c1) Forged cookie (HMAC intact-looking but wrong signature)
  const parts = cookie.split('=')
  const [sid, secret, sig] = parts[1].split('.')
  const forgedCookie = `pengu_session=${sid}.${secret}.${'0'.repeat(64)}`
  const meForged = await fetch(`${BASE}/api/auth/me`, { headers: { cookie: forgedCookie } })
  const meForgedData = await meForged.json()
  pass('forged cookie signature rejected', meForgedData.user === null)

  // c2) Cookie with a swapped secret (wrong hash + wrong HMAC)
  const swappedCookie = `pengu_session=${sid}.${'f'.repeat(64)}.${sig}`
  const meSwapped = await (await fetch(`${BASE}/api/auth/me`, { headers: { cookie: swappedCookie } })).json()
  pass('swapped cookie secret rejected', meSwapped.user === null)

  // c3) No cookie at all → auth_required, no payload
  const sigAnon = await (await fetch(`${BASE}/api/signal/today`)).json()
  pass('anonymous call → auth_required, no leak', sigAnon.access === 'auth_required' && sigAnon.signal === undefined)

  // c4) Intent amount tampering: client can only send planId — verify the
  // server resolves the amount itself (price never trusted from browser)
  const tamperIntent = await fetch(`${BASE}/api/payments/intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ planId: 'month', amount: 1, price: 0, amountWei: '1' }),
  })
  const tamperData = await tamperIntent.json()
  pass(
    'client price tampering ignored (server-side pricing)',
    tamperIntent.status === 200 && BigInt(tamperData.amountWei) === pengu('255'),
    `amountWei=${tamperData.amountWei}`
  )

  /* --- 12. Logout kills session --- */
  await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { cookie } })
  const meAfter = await fetch(`${BASE}/api/auth/me`, { headers: { cookie } })
  const meAfterData = await meAfter.json()
  pass('logout destroys session', meAfterData.user === null)

  /* --- 13. Public endpoints healthy --- */
  const market = await fetch(`${BASE}/api/market/overview`)
  const marketData = await market.json()
  pass('market overview public & live', market.status === 200 && marketData.priceUsd > 0)

  // Security check = "is it public?" (a 401/403 would fail). The GeckoTerminal
  // upstream can transiently throttle and 502 with a cold cache — back off
  // exponentially (the token bucket refills over ~60s) before judging, so
  // availability flakiness ≠ security failure.
  let candlesStatus = 0
  let candlesLen = 0
  for (let attempt = 0; attempt < 5 && candlesLen <= 50; attempt++) {
    const candles = await fetch(`${BASE}/api/market/candles?tf=4h`)
    const candlesData = await candles.json().catch(() => ({ candles: [] }))
    candlesStatus = candles.status
    candlesLen = candlesData.candles?.length ?? 0
    if (candlesStatus === 401 || candlesStatus === 403) break
    if (candlesLen <= 50) await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)))
  }
  pass(
    'candles endpoint public',
    candlesStatus !== 401 && candlesStatus !== 403 && candlesLen > 50,
    `status=${candlesStatus} len=${candlesLen}`
  )

  const history = await fetch(`${BASE}/api/signal/history`)
  const historyData = await history.json()
  const todayEntry = historyData.entries?.find((e: { outcome: string }) => e.outcome === 'PENDING')
  pass(
    'history masks unresolved verdicts (no leak)',
    history.status === 200 && (todayEntry ? todayEntry.verdict === 'LOCKED' : true)
  )

  /* --- 14. Cleanup throwaway test data --- */
  try {
    await db.session.deleteMany({ where: { user: { address: addr } } })
    await db.paymentIntent.deleteMany({ where: { userId: (await db.user.findUnique({ where: { address: addr } }))?.id ?? '' } })
    await db.signalUnlock.deleteMany({ where: { userId: (await db.user.findUnique({ where: { address: addr } }))?.id ?? '' } })
    await db.user.deleteMany({ where: { address: addr } })
    pass('throwaway test user cleaned up', true)
  } catch {
    pass('throwaway test user cleaned up', false)
  }

  console.log('\n🧪 E2E auth/payment security test complete.\n')
}

main().catch((e) => {
  console.error('E2E test crashed:', e)
  process.exitCode = 1
})
