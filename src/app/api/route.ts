import { NextResponse } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export async function GET(req: Request) {
  const rl = rateLimit(`health:${clientIp(req)}`, 60, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  return NextResponse.json({ status: 'ok', app: 'pengusignal' })
}
