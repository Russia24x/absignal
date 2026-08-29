import { NextResponse } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import {
  chain,
  networkMode,
  penguAddress,
  treasuryAddress,
  subscriptionPackages,
  marketConfig,
  binanceConfig,
  coinmarketcapConfig,
  activeMarketSources,
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
    // R38: multi-source fallback chain — which tiers are armed right now.
    marketSources: {
      ...activeMarketSources(),
      // Order = precedence (first success wins). CoinMarketCap only arms
      // when COINMARKETCAP_API_KEY is set; Binance is keyless.
      chain: ['geckoterminal', 'dexscreener', 'binance', 'coinmarketcap'],
      binanceSymbol: binanceConfig.symbol,
      coinmarketcapSymbol: coinmarketcapConfig.symbol,
    },
    configOk: validation.ok,
    configErrors: validation.errors,
  })
}
