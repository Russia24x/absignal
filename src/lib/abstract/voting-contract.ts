/**
 * Abstract Portal App Voting contract bindings.
 *
 * Implements the official AGW Reusables "Abstract App Voting" pattern
 * (https://build.abs.xyz/docs/abstract-portal/abstract-app-voting) with
 * the canonical on-chain voting contract deployed on Abstract Mainnet:
 * users vote for listed apps per-epoch; every AGW user gets one vote per
 * epoch. Gas for the vote itself is sponsored by the portal.
 *
 * Our app's Portal appId is configurable via NEXT_PUBLIC_ABSTRACT_APP_ID —
 * once the app is listed on the Abstract Portal, set the variable and the
 * voting UI appears automatically.
 */

import type { Address, Abi } from 'viem'

/** Canonical Abstract Portal voting contract (mainnet). */
export const ABSTRACT_VOTING_ADDRESS =
  '0x3b50de27506f0a8c1f4122a1e6f470009a76ce2a' as const

/**
 * Minimal ABI surface used by PenguSignal (from the official
 * abstract-app-voting reusable's full ABI):
 *  - currentEpoch() → uint256
 *  - getUserVotes(address, uint256) → uint256[]  (apps voted this epoch)
 *  - voteForApp(uint256 appId)                   (state-changing)
 */
export const ABSTRACT_VOTING_ABI = [
  {
    inputs: [],
    name: 'currentEpoch',
    outputs: [{ internalType: 'uint256', name: 'epoch', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'user', type: 'address' },
      { internalType: 'uint256', name: 'epoch', type: 'uint256' },
    ],
    name: 'getUserVotes',
    outputs: [{ internalType: 'uint256[]', name: '', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'appId', type: 'uint256' }],
    name: 'voteForApp',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'voter', type: 'address' },
      { indexed: true, internalType: 'uint256', name: 'appId', type: 'uint256' },
      { indexed: true, internalType: 'uint256', name: 'epoch', type: 'uint256' },
    ],
    name: 'Voted',
    type: 'event',
  },
] as const satisfies Abi

/** Our app's Portal listing id (env-configured; undefined = not listed yet). */
export const portalAppId = process.env.NEXT_PUBLIC_ABSTRACT_APP_ID || undefined

/** Voting is only available on Abstract Mainnet (official requirement). */
export const votingSupported = portalAppId !== undefined

/** Parse + validate the configured app id as a bigint (official helper). */
export function formatAppId(appId: string): bigint {
  return BigInt(appId)
}

/** True when the user's votes array contains our app id (official helper). */
export function hasUserVotedForApp(userVotes: readonly bigint[], appId: bigint): boolean {
  return userVotes.some((vote) => vote === appId)
}

export type { Address }
