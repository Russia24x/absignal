import { NextResponse } from 'next/server'
import { destroySession, cookieFromRequest } from '@/lib/auth/session'
import { authConfig } from '@/lib/config'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  await destroySession(cookieFromRequest(req))
  const res = NextResponse.json({ ok: true })
  res.cookies.set(authConfig.cookieName, '', { path: '/', expires: new Date(0) })
  return res
}
