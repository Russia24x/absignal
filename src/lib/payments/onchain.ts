/**
 * On-chain payment verification.
 *
 * We NEVER trust the client about money. The browser only hands us a tx
 * hash; everything else is verified against the Abstract RPC:
 *
 *  1. Receipt exists and status == success
 *  2. tx.to == PENGU token contract (an ERC-20 transfer call)
 *  3. tx.from == the authenticated user's address
 *  4. The receipt logs contain a ERC-20 `Transfer` event with
 *     from == user, to == treasury, value >= expected amount
 *  5. The block timestamp is inside the intent's validity window
 *  6. The tx hash has not been used by any other intent (unique index)
 *
 * This makes double-spend and "someone else paid for me" attacks impossible.
 */

import { serverRpcUrl, chain, penguAddress, treasuryAddress, PENGU_DECIMALS } from '@/lib/config'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export interface VerifyResult {
  ok: boolean
  reason?: string
  amountWei?: bigint
  blockTimestamp?: number
}

interface RpcLog {
  address: string
  topics: string[]
  data: string
}

interface RpcReceipt {
  status: string
  from: string
  to: string | null
  blockNumber: string
  blockHash: string
  transactionHash: string
  logs: RpcLog[]
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(serverRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  const json = await res.json()
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`)
  return json.result as T
}

function decodeAddress(topic: string): string {
  // A Solidity address topic is 32 bytes, left-padded — take the last 20.
  return '0x' + topic.slice(-40).toLowerCase()
}

function decodeUint(data: string): bigint {
  return BigInt(data === '0x' ? '0' : data)
}

/** Verify an ERC-20 PENGU payment made to the treasury. */
export async function verifyPaymentTx(params: {
  txHash: string
  userAddress: string
  expectedAmountWei: bigint
  validFromMs: number
  chainId: number
}): Promise<VerifyResult> {
  const { txHash, userAddress, expectedAmountWei, validFromMs, chainId } = params
  const user = userAddress.toLowerCase()

  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { ok: false, reason: 'invalid tx hash' }
  if (chainId !== chain.id) return { ok: false, reason: 'wrong chain' }
  if (!penguAddress) return { ok: false, reason: 'payment token not configured' }

  let receipt: RpcReceipt
  try {
    receipt = await rpc<RpcReceipt>('eth_getTransactionReceipt', [txHash])
  } catch (e) {
    return { ok: false, reason: `rpc error: ${(e as Error).message}` }
  }
  if (!receipt) return { ok: false, reason: 'transaction not found yet' }
  if (receipt.status !== '0x1') return { ok: false, reason: 'transaction reverted on-chain' }
  if (!receipt.to || receipt.to.toLowerCase() !== penguAddress.toLowerCase()) {
    return { ok: false, reason: 'transaction is not a PENGU token transfer' }
  }
  if (receipt.from.toLowerCase() !== user) {
    return { ok: false, reason: 'transaction sender does not match your wallet' }
  }

  // Find the Transfer(user → treasury) log.
  let amountWei: bigint | null = null
  for (const log of receipt.logs ?? []) {
    if (log.topics?.[0]?.toLowerCase() !== TRANSFER_TOPIC) continue
    if (log.address?.toLowerCase() !== penguAddress.toLowerCase()) continue
    if (log.topics.length < 3) continue
    const from = decodeAddress(log.topics[1])
    const to = decodeAddress(log.topics[2])
    if (from === user && to === treasuryAddress) {
      const value = decodeUint(log.data)
      if (amountWei === null || value > amountWei) amountWei = value
    }
  }
  if (amountWei === null) return { ok: false, reason: 'no PENGU transfer to the treasury found in this tx' }
  if (amountWei < expectedAmountWei) {
    return { ok: false, reason: 'transferred amount is less than required' }
  }

  // Block timestamp must fall inside the intent window.
  const block = await rpc<{ timestamp: string }>('eth_getBlockByHash', [receipt.blockHash, false])
  const blockTimestamp = Number(BigInt(block?.timestamp ?? '0')) * 1000
  const now = Date.now()
  if (blockTimestamp < validFromMs - 5 * 60_000) {
    return { ok: false, reason: 'transaction predates the payment request' }
  }
  if (blockTimestamp > now + 5 * 60_000) {
    return { ok: false, reason: 'transaction timestamp is in the future' }
  }

  return { ok: true, amountWei, blockTimestamp }
}

/** Format PENGU units → wei string. */
export function penguToWei(units: number): string {
  return BigInt(Math.round(units * 10 ** PENGU_DECIMALS)).toString()
}

/** Format wei string → PENGU units (display). */
export function weiToPengu(wei: string | bigint): number {
  return Number(BigInt(wei)) / 10 ** PENGU_DECIMALS
}
