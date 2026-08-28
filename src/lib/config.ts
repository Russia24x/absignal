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

/**
 * Pricing configuration (PENGU units).
 *
 * Tariff model (owner decision — Round 16, rebalanced Round 17):
 *  - Registration & wallet login are FREE; signals stay locked (free tier).
 *  - Time-based plans unlock the daily signal; renewals stack days.
 *  - NO session keys: plain ERC-20 transfers, verified on-chain.
 *
 * Round-17 balance rule (owner-mandated):
 *  - 1 day = 10 PENGU is the fixed baseline (per-day reference rate).
 *  - Longer plans get a STAIRCASE (tiered) discount off the linear base,
 *    monotonically increasing and HARD-CAPPED at 30%:
 *      day  0%  → 10    (10.00 / day)
 *      week  7%  → 65    (9.29 / day, base 70)
 *      month 15% → 255   (8.50 / day, base 300)
 *      year  25% → 2750  (7.53 / day, base 3650)
 *      life  30% → 7650  (cap; base = 3-year linear 10950)
 */
export const pricing = {
  subscription1d: Number(process.env.SUBSCRIPTION_1D_PRICE_PENGU ?? 10),
  subscription7d: Number(process.env.SUBSCRIPTION_7D_PRICE_PENGU ?? 65),
  subscription30d: Number(process.env.SUBSCRIPTION_30D_PRICE_PENGU ?? 255),
  subscription365d: Number(process.env.SUBSCRIPTION_365D_PRICE_PENGU ?? 2750),
  subscriptionLifetime: Number(process.env.SUBSCRIPTION_LIFETIME_PRICE_PENGU ?? 7650),
} as const

/** Plan ids accepted by the payment intent API. */
export type SubscriptionPackageId = 'day' | 'week' | 'month' | 'year' | 'lifetime'

export interface SubscriptionPackage {
  id: SubscriptionPackageId
  /** Days of access; null = lifetime */
  days: number | null
  label: string
  /** Price in whole PENGU */
  price: number
  /** Undiscounted linear base (whole PENGU) used for the "save X%" badge. */
  basePrice: number
  /** Staircase discount vs basePrice (0–30, hard-capped by the tariff rule). */
  discountPct: number
  popular?: boolean
}

/** Effective staircase discount of a package vs its linear base (0–30 by design). */
function discountOf(price: number, basePrice: number): number {
  if (basePrice <= 0 || price >= basePrice) return 0
  return Math.round((1 - price / basePrice) * 100)
}

/**
 * Subscription package definitions — the single source of truth for prices.
 * `basePrice` = 10 PENGU × days (lifetime: 3-year basis); `discountPct` is the
 * Round-17 staircase: 0 / 7 / 15 / 25 / 30 — capped at 30 by design and
 * recomputed from the live price so badges stay truthful after env overrides.
 */
export const subscriptionPackages: readonly SubscriptionPackage[] = [
  { id: 'day', days: 1, label: 'day', price: pricing.subscription1d, basePrice: 10, discountPct: discountOf(pricing.subscription1d, 10) },
  { id: 'week', days: 7, label: 'week', price: pricing.subscription7d, basePrice: 70, discountPct: discountOf(pricing.subscription7d, 70) },
  { id: 'month', days: 30, label: 'month', price: pricing.subscription30d, basePrice: 300, discountPct: discountOf(pricing.subscription30d, 300), popular: true },
  { id: 'year', days: 365, label: 'year', price: pricing.subscription365d, basePrice: 3650, discountPct: discountOf(pricing.subscription365d, 3650) },
  { id: 'lifetime', days: null, label: 'lifetime', price: pricing.subscriptionLifetime, basePrice: 10950, discountPct: discountOf(pricing.subscriptionLifetime, 10950) },
]

/** Sentinel stored in `User.subscriptionUntil` for lifetime plans (2099-12-31). */
export const LIFETIME_SENTINEL_MS = Date.parse('2099-12-31T00:00:00.000Z')

/** True when a `subscriptionUntil` value represents a lifetime plan. */
export function isLifetimeUntil(until: Date | string | null | undefined): boolean {
  if (!until) return false
  return new Date(until).getTime() >= LIFETIME_SENTINEL_MS
}

/** Map a payment intent's `days` back to its plan id (null → lifetime). */
export function planIdForDays(days: number | null): SubscriptionPackageId {
  if (days == null) return 'lifetime'
  const pkg = subscriptionPackages.find((p) => p.days === days)
  return pkg?.id ?? 'month'
}

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
  // Tariff sanity (Round-17 balance rule): per-day rate must be
  // non-increasing as duration grows, and no plan may exceed the 30%
  // staircase cap. Guards against future env typos reintroducing an
  // unbalanced ladder (e.g. week cheaper than day).
  const withRates = subscriptionPackages
    .filter((p) => p.days != null)
    .sort((a, b) => (a.days as number) - (b.days as number))
  for (let i = 1; i < withRates.length; i++) {
    const prev = withRates[i - 1]
    const cur = withRates[i]
    if (cur.price / (cur.days as number) > prev.price / (prev.days as number)) {
      errors.push(
        `Tariff imbalance: "${cur.id}" per-day rate exceeds "${prev.id}" — longer plans must not be more expensive per day.`
      )
    }
  }
  for (const p of subscriptionPackages) {
    if (p.price > p.basePrice || p.discountPct > 30) {
      errors.push(`Tariff cap violated: "${p.id}" exceeds its base price or the 30% discount cap.`)
    }
  }
  return { ok: errors.length === 0, errors }
}
