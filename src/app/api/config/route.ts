import { NextResponse } from 'next/server'
import {
  chain,
  networkMode,
  penguAddress,
  treasuryAddress,
  pricing,
  subscriptionPackages,
  marketConfig,
  validateConfig,
} from '@/lib/config'

export const dynamic = 'force-dynamic'

/** Public app configuration for the frontend (no secrets). */
export async function GET() {
  const validation = validateConfig()
  return NextResponse.json({
    networkMode,
    chain,
    penguAddress,
    treasuryAddress,
    pricing,
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
