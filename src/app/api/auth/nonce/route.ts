import { NextResponse } from 'next/server'
import { createNonce } from '@/lib/auth/session'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Step 1 of wallet sign-in: issue a single-use nonce for the address.
 * Body: { address: "0x…" }
 */
export async function POST(req: Request) {
  const ip = clientIp(req)
  const rl = rateLimit(`nonce:${ip}`, 10, 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  let body: { address?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const address = body.address?.toLowerCase()
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: 'invalid_address' }, { status: 400 })
  }

  // EIP-4361 domain: the requesting host (prevents cross-site message reuse).
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const domain = host || undefined

  const { message, expiresAt } = await createNonce(address, domain)
  return NextResponse.json({ message, expiresAt })
}
