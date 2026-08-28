import { NextResponse } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import {
  chain,
  networkMode,
  penguAddress,
  treasuryAddress,
  subscriptionPackages,
  marketConfig,
  validateConfig,
} from '@/lib/config'

export const dynamic = 'force-dynamic'

/** Public app configuration for the frontend (no secrets). */
export async function GET(req: Request) {
  const rl = rateLimit(`config:${clientIp(req)}`, 60, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const validation = validateConfig()
  return NextResponse.json({
    networkMode,
    chain,
    penguAddress,
    treasuryAddress,
    packages: subscriptionPackages,
    dataSource: {
      provider: 'GeckoTerminal',
      network: marketConfig.network,
      pool: marketConfig.pool,
    },
    configOk: validation.ok,
    configErrors: validation.errors,
  })
}
