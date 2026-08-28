/**
 * Wallet-based authentication (SIWE-style) with server sessions.
 *
 * Flow:
 *  1. POST /api/auth/nonce  → server stores a single-use nonce bound to the address
 *  2. User signs a structured message with their wallet (personal_sign)
 *  3. POST /api/auth/verify → server verifies the signature with viem,
 *     recovers the address, issues an HMAC-signed session cookie.
 *
 * Security properties:
 *  - Nonces are single-use and expire (replay protection)
 *  - Session tokens are random 32-byte secrets; only their SHA-256 hash is stored
 *  - Cookies are httpOnly + sameSite=lax + secure in production
 */

import { createHmac, randomBytes, timingSafeEqual, createHash } from 'crypto'
import { db } from '@/lib/db'
import { authConfig } from '@/lib/config'

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set (>= 32 chars). Generate with: openssl rand -hex 32')
  }
  return secret
}

export function hmac(value: string): string {
  return createHmac('sha256', sessionSecret()).update(value).digest('hex')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export interface AuthNonceRecord {
  nonce: string
  message: string
  expiresAt: Date
}

/** Create a single-use sign-in nonce for a wallet address. */
export async function createNonce(address: string): Promise<AuthNonceRecord> {
  const nonce = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + authConfig.nonceTtlMs)
  const message = [
    'PenguSignal — Sign in with your Abstract wallet',
    '',
    `Address: ${address}`,
    `Network: Abstract`,
    `Nonce: ${nonce}`,
    `Issued: ${new Date().toISOString()}`,
    '',
    'This signature proves wallet ownership. It does not move funds.',
  ].join('\n')
  // The exact message is stored verbatim — the verify step compares against
  // this string, so there is zero reconstruction drift.
  await db.authNonce.create({
    data: { address: address.toLowerCase(), nonce, message, expiresAt },
  })
  return { nonce, message, expiresAt }
}

/** Consume a nonce (marks used). Returns the bound address or null. */
export async function consumeNonce(nonce: string): Promise<string | null> {
  const record = await db.authNonce.findUnique({ where: { nonce } })
  if (!record) return null
  if (record.usedAt || record.expiresAt.getTime() < Date.now()) return null
  await db.authNonce.update({ where: { nonce }, data: { usedAt: new Date() } })
  return record.address
}

/** Look up the exact stored message for a pending nonce. */
export async function getPendingNonceMessage(address: string): Promise<{ nonce: string; message: string } | null> {
  const record = await db.authNonce.findFirst({
    where: { address, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  })
  if (!record) return null
  return { nonce: record.nonce, message: record.message }
}

export interface SessionUser {
  id: string
  address: string
  accessGranted: boolean
  subscriptionUntil: Date | null
  /** Last credited plan id: day | week | month | year | lifetime */
  subscriptionPlan: string | null
}

/** Create a DB-backed session and return the cookie value to set. */
export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null }
): Promise<{ cookieValue: string; expiresAt: Date }> {
  const secret = randomBytes(32).toString('hex')
  const tokenHash = sha256(secret)
  const expiresAt = new Date(Date.now() + authConfig.sessionTtlMs)
  await db.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    },
  })
  // Cookie format: <sessionId>.<secret>.<hmac> — tamper-evident.
  const id = await db.session.findFirst({ where: { tokenHash }, select: { id: true } })
  const cookieValue = `${id?.id}.${secret}.${hmac(`${id?.id}.${secret}`)}`
  return { cookieValue, expiresAt }
}

/** Validate a session cookie value and return the user. */
export async function getSessionUser(cookieValue: string | undefined): Promise<SessionUser | null> {
  if (!cookieValue) return null
  const parts = cookieValue.split('.')
  if (parts.length !== 3) return null
  const [sessionId, secret, sig] = parts
  if (!safeEqual(sig, hmac(`${sessionId}.${secret}`))) return null
  const tokenHash = sha256(secret)
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  })
  if (!session) return null
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }
  await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {})
  return {
    id: session.user.id,
    address: session.user.address,
    accessGranted: session.user.accessGranted,
    subscriptionUntil: session.user.subscriptionUntil,
    subscriptionPlan: session.user.subscriptionPlan,
  }
}

/** Delete a session (logout). */
export async function destroySession(cookieValue: string | undefined): Promise<void> {
  if (!cookieValue) return
  const parts = cookieValue.split('.')
  if (parts.length !== 3) return
  const secret = parts[1]
  await db.session.delete({ where: { tokenHash: sha256(secret) } }).catch(() => {})
}

/** Read the session cookie from a Request (Route Handler). */
export function cookieFromRequest(req: Request): string | undefined {
  const header = req.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === authConfig.cookieName) return rest.join('=')
  }
  return undefined
}
