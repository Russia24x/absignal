/**
 * Central, environment-driven configuration.
 *
 * Nothing in this application is hardcoded: every network parameter,
 * contract address, price and external endpoint resolves from here.
 * See `.env` (and `.env.example`) for all available knobs.
 */

export type NetworkMode = 'mainnet' | 'testnet'

export interface ChainConfig {
  id: number
  name: string
  shortName: string
  rpcUrl: string
  blockExplorerUrl: string
  blockExplorerTxPath: string
  currency: { name: string; symbol: string; decimals: number }
}

const MAINNET_CHAIN: ChainConfig = {
  id: 2741,
  name: 'Abstract',
  shortName: 'Abstract Mainnet',
  rpcUrl: process.env.NEXT_PUBLIC_RPC_MAINNET ?? 'https://api.mainnet.abs.xyz',
  blockExplorerUrl: 'https://explorer.abs.xyz',
  blockExplorerTxPath: '/tx/',
  currency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
}

const TESTNET_CHAIN: ChainConfig = {
  id: 11124,
  name: 'Abstract Testnet',
  shortName: 'Abstract Testnet',
  rpcUrl: process.env.NEXT_PUBLIC_RPC_TESTNET ?? 'https://api.testnet.abs.xyz',
  blockExplorerUrl: 'https://sepolia.explorer.abs.xyz',
  blockExplorerTxPath: '/tx/',
  currency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
}

function readNetwork(): NetworkMode {
  const raw = (process.env.NEXT_PUBLIC_APP_NETWORK ?? 'mainnet').toLowerCase()
  return raw === 'testnet' ? 'testnet' : 'mainnet'
}

/** Currently active network mode. */
export const networkMode: NetworkMode = readNetwork()

/** Currently active Abstract chain. */
export const chain: ChainConfig = networkMode === 'testnet' ? TESTNET_CHAIN : MAINNET_CHAIN

/** Server-side RPC URL (can be overridden separately from the client one). */
export const serverRpcUrl =
  networkMode === 'testnet'
    ? process.env.RPC_URL_TESTNET || TESTNET_CHAIN.rpcUrl
    : process.env.RPC_URL_MAINNET || MAINNET_CHAIN.rpcUrl

/** PENGU (ERC-20) address on the active network. */
function readPenguAddress(): `0x${string}` | null {
  const raw =
    networkMode === 'testnet'
      ? process.env.NEXT_PUBLIC_PENGU_TESTNET || ''
      : process.env.NEXT_PUBLIC_PENGU_MAINNET || ''
  if (!raw || !/^0x[0-9a-fA-F]{40}$/.test(raw)) return null
  return raw.toLowerCase() as `0x${string}`
}

export const penguAddress: `0x${string}` | null = readPenguAddress()

/** Treasury wallet — every PENGU payment lands here. */
export const treasuryAddress: string = (
  process.env.NEXT_PUBLIC_TREASURY_ADDRESS || ''
).toLowerCase()

/** PENGU token has 18 decimals (verified on-chain). */
export const PENGU_DECIMALS = 18

/** Pricing configuration (PENGU units). */
export const pricing = {
  accessFee: Number(process.env.ACCESS_FEE_PENGU ?? 5),
  dailySignal: Number(process.env.DAILY_SIGNAL_PRICE_PENGU ?? 1),
  subscription7d: Number(process.env.SUBSCRIPTION_7D_PRICE_PENGU ?? 7),
  subscription30d: Number(process.env.SUBSCRIPTION_30D_PRICE_PENGU ?? 30),
} as const

/** Subscription package definitions surfaced to the UI. */
export const subscriptionPackages = [
  { id: 'day', days: 1, label: 'day', price: pricing.dailySignal },
  { id: 'week', days: 7, label: 'week', price: pricing.subscription7d },
  { id: 'month', days: 30, label: 'month', price: pricing.subscription30d },
] as const

export type SubscriptionPackageId = (typeof subscriptionPackages)[number]['id']

/** Market data source configuration (GeckoTerminal — free, no key). */
export const marketConfig = {
  network: process.env.GECKOTERMINAL_NETWORK || 'abstract',
  pool: (process.env.GECKOTERMINAL_POOL || '').toLowerCase(),
  baseUrl: 'https://api.geckoterminal.com/api/v2',
  // Free tier: ~30 req/min. We cache aggressively server-side and cap
  // upstream calls with a token bucket (see lib/market/geckoterminal.ts).
  priceTtlMs: 45_000,
  candlesTtlMs: 120_000, // base; per-timeframe TTLs live in the market module
  historyTtlMs: 600_000,
} as const

/** Session / auth configuration. */
export const authConfig = {
  cookieName: 'pengu_session',
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  nonceTtlMs: 10 * 60 * 1000, // 10 minutes
  paymentIntentTtlMs: 30 * 60 * 1000, // 30 minutes
} as const

/** Sanity check used by /api/config — surfaces misconfiguration early. */
export function validateConfig(): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  if (!penguAddress) {
    errors.push(
      `PENGU token address is not configured for "${networkMode}" mode. Set ${
        networkMode === 'testnet' ? 'NEXT_PUBLIC_PENGU_TESTNET' : 'NEXT_PUBLIC_PENGU_MAINNET'
      }.`
    )
  }
  if (!treasuryAddress || !/^0x[0-9a-f]{40}$/.test(treasuryAddress)) {
    errors.push('NEXT_PUBLIC_TREASURY_ADDRESS is missing or invalid.')
  }
  if (!marketConfig.pool) {
    errors.push('GECKOTERMINAL_POOL is not configured.')
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    errors.push('SESSION_SECRET is missing or shorter than 32 chars.')
  }
  return { ok: errors.length === 0, errors }
}
