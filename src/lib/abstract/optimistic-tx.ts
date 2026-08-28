/**
 * Abstract optimistic transaction client.
 *
 * Implements the official AGW Reusables pattern from
 * https://build.abs.xyz/docs/experimental/use-optimistic-write-contract —
 * submits a signed transaction through Abstract's
 * `unstable_sendRawTransactionWithDetailedOutput` RPC endpoint, which
 * returns a transaction hash (plus storage logs / events) IMMEDIATELY,
 * before block inclusion. The UI can react instantly while confirmation
 * is polled separately.
 *
 * The endpoint URL is our active chain RPC (mainnet by default, env
 * overridable via NEXT_PUBLIC_RPC_MAINNET — see src/lib/chains.ts).
 */

import { appRpcUrl } from '@/lib/chains'

export interface StorageLog {
  address: `0x${string}`
  key: `0x${string}`
  writtenValue: `0x${string}`
}

export interface OptimisticEvent {
  address: `0x${string}`
  topics: `0x${string}`[]
  data: `0x${string}`
  blockHash: `0x${string}` | null
  blockNumber: `0x${string}` | null
  l1BatchNumber: `0x${string}` | null
  transactionHash: `0x${string}`
  transactionIndex: `0x${string}` | null
  logIndex: `0x${string}` | null
  transactionLogIndex: `0x${string}` | null
  logType: `0x${string}` | null
  removed: boolean
}

/** Instant response returned by the optimistic endpoint (pre-confirmation). */
export interface OptimisticTransactionResponse {
  transactionHash: `0x${string}`
  storageLogs: StorageLog[]
  events: OptimisticEvent[]
}

interface AbstractRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: 'unstable_sendRawTransactionWithDetailedOutput'
  /** Signed transaction hex. */
  params: [string]
}

interface AbstractRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: OptimisticTransactionResponse
  error?: { code: number; message: string }
}

let rpcId = 0

/**
 * Submit a signed transaction to Abstract's optimistic endpoint.
 * Maps raw RPC errors to human-readable messages (per the official
 * reusable's error handling guidance).
 */
export async function sendRawTransactionWithDetailedOutput(
  signedTransaction: `0x${string}`,
): Promise<OptimisticTransactionResponse> {
  const request: AbstractRpcRequest = {
    jsonrpc: '2.0',
    id: ++rpcId,
    method: 'unstable_sendRawTransactionWithDetailedOutput',
    params: [signedTransaction],
  }

  const response = await fetch(appRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`Abstract RPC error (HTTP ${response.status})`)
  }

  const data = (await response.json()) as AbstractRpcResponse

  if (data.error) {
    const errorMessage = data.error.message
    let humanReadable: string
    if (errorMessage.includes('insufficient funds')) {
      humanReadable = 'insufficient funds for gas'
    } else if (errorMessage.includes('known transaction')) {
      humanReadable = 'nonce issue — please retry'
    } else if (errorMessage.includes('nonce too low')) {
      humanReadable = 'nonce issue — please retry'
    } else if (errorMessage.includes('gas required exceeds allowance')) {
      humanReadable = 'gas issue — please retry'
    } else if (errorMessage.includes('replacement transaction underpriced')) {
      humanReadable = 'gas issue — please retry'
    } else if (errorMessage.includes('max fee per gas less than block base fee')) {
      humanReadable = 'transaction fee too low for current network conditions'
    } else {
      humanReadable = `transaction failed (${errorMessage})`
    }
    throw new Error(humanReadable)
  }

  if (!data.result || !data.result.transactionHash) {
    throw new Error('transaction submission did not return a hash — please retry')
  }

  return data.result
}
