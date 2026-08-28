import { NextResponse } from 'next/server'
import { destroySession, cookieFromRequest } from '@/lib/auth/session'
import { authConfig } from '@/lib/config'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const rl = rateLimit(`logout:${clientIp(req)}`, 10, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  await destroySession(cookieFromRequest(req))
  const res = NextResponse.json({ ok: true })
  res.cookies.set(authConfig.cookieName, '', { path: '/', expires: new Date(0) })
  return res
}
