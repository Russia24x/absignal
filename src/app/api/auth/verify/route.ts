import { NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { getDb } from '@/lib/db'
import { consumeNonce, createSession, cookieFromRequest, getPendingNonceMessage } from '@/lib/auth/session'
import { authConfig, chain, networkMode, serverRpcUrl } from '@/lib/config'
import { abstract, abstractTestnet } from '@/lib/chains'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Public client for signature verification.
 *
 * AGW wallets are SMART CONTRACT accounts: their signatures are validated
 * via ERC-1271 `isValidSignature` (with ERC-6492 support for counterfactual
 * accounts). The root `verifyMessage` from 'viem' only supports EOAs — we
 * MUST use the action form bound to a public client.
 */
const publicClient = createPublicClient({
  chain: networkMode === 'testnet' ? abstractTestnet : abstract,
  transport: http(serverRpcUrl),
})

/**
 * Step 2 of wallet sign-in: verify the signature, upsert the user,
 * issue the session cookie.
 * Body: { address, signature }
 */
export async function POST(req: Request) {
  const ip = clientIp(req)
  const rl = rateLimit(`verify:${ip}`, 10, 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  let body: { address?: string; signature?: string; nonce?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const address = body.address?.toLowerCase()
  const signature = body.signature?.toLowerCase()
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: 'invalid_address' }, { status: 400 })
  }
  // EOA signatures are exactly 65 bytes; AGW smart-account (ERC-1271)
  // signatures are longer. Accept any well-formed hex of >= 65 bytes.
  if (
    !signature ||
    !/^0x[0-9a-f]+$/.test(signature) ||
    signature.length % 2 !== 0 ||
    (signature.length - 2) / 2 < 65
  ) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  // Locate the pending nonce bound to this address (most recent, unused)
  // and use the exact stored message — no reconstruction.
  const pending = await getPendingNonceMessage(address)
  if (!pending) {
    return NextResponse.json({ error: 'nonce_not_found' }, { status: 400 })
  }

  let valid = false
  try {
    // Smart-account-aware verification (ERC-1271 / ERC-6492 via publicClient).
    valid = await publicClient.verifyMessage({
      address: address as `0x${string}`,
      message: pending.message,
      signature: signature as `0x${string}`,
    })
  } catch {
    return NextResponse.json({ error: 'verification_failed' }, { status: 401 })
  }
  if (!valid) {
    return NextResponse.json({ error: 'signature_mismatch' }, { status: 401 })
  }

  // Consume the nonce (single use).
  const consumed = await consumeNonce(pending.nonce)
  if (!consumed) {
    return NextResponse.json({ error: 'nonce_already_used' }, { status: 400 })
  }

  // Upsert user.
  const db = await getDb()
  const user = await db.user.upsert({
    where: { address },
    create: { address },
    update: {},
  })

  const { cookieValue, expiresAt } = await createSession(user.id, {
    userAgent: req.headers.get('user-agent'),
    ip,
  })

  const res = NextResponse.json({
    user: {
      address: user.address,
      accessGranted: user.accessGranted,
      subscriptionUntil: user.subscriptionUntil,
      chainId: chain.id,
    },
    expiresAt,
  })
  res.cookies.set(authConfig.cookieName, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
  return res
}

/** GET = "who am I" (session check). */
export async function GET(req: Request) {
  const { getSessionUser } = await import('@/lib/auth/session')
  const user = await getSessionUser(cookieFromRequest(req))
  if (!user) return NextResponse.json({ user: null })
  return NextResponse.json({
    user: {
      address: user.address,
      accessGranted: user.accessGranted,
      subscriptionUntil: user.subscriptionUntil,
    },
  })
}
