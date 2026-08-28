/**
 * Abstract chain definitions.
 *
 * Uses viem's canonical `abstract` / `abstractTestnet` chains — required by
 * AbstractWalletProvider (AGW) — with RPC endpoints configurable via env.
 * Chain IDs & explorers verified against docs.abs.xyz.
 */

import { http } from 'viem'
import { abstract as abstractCanonical, abstractTestnet as abstractTestnetCanonical } from 'viem/chains'

const mainnetRpc = process.env.NEXT_PUBLIC_RPC_MAINNET || 'https://api.mainnet.abs.xyz'
const testnetRpc = process.env.NEXT_PUBLIC_RPC_TESTNET || 'https://api.testnet.abs.xyz'

/** Abstract Mainnet (chain 2741). */
export const abstract = abstractCanonical

/** Abstract Testnet (chain 11124). */
export const abstractTestnet = abstractTestnetCanonical

export const appNetworkMode = process.env.NEXT_PUBLIC_APP_NETWORK === 'testnet' ? 'testnet' : 'mainnet'
export const appChain = appNetworkMode === 'testnet' ? abstractTestnet : abstract
export const appRpcUrl = appNetworkMode === 'testnet' ? testnetRpc : mainnetRpc

/** HTTP transport bound to the active chain's (env-overridable) RPC. */
export const appChainTransport = http(appRpcUrl)

export const penguAddress = (
  appNetworkMode === 'testnet'
    ? process.env.NEXT_PUBLIC_PENGU_TESTNET
    : process.env.NEXT_PUBLIC_PENGU_MAINNET
) as `0x${string}` | undefined

export const treasuryAddress = (
  process.env.NEXT_PUBLIC_TREASURY_ADDRESS || ''
) as `0x${string}`

export const PENGU_DECIMALS = 18
