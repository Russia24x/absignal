'use client'

/**
 * useOptimisticWriteContract — official AGW Reusables pattern
 * (https://build.abs.xyz/docs/experimental/use-optimistic-write-contract),
 * adapted for PenguSignal:
 *
 *  • Encodes the contract call, prepares + signs the transaction with the
 *    connected AGW wallet client, then submits it through Abstract's
 *    `unstable_sendRawTransactionWithDetailedOutput` endpoint → the UI
 *    receives a transaction hash INSTANTLY (pre-confirmation) while the
 *    receipt is polled separately.
 *
 *  • GAS SPONSORSHIP: when a sponsor paymaster is configured
 *    (NEXT_PUBLIC_SPONSOR_PAYMASTER_ADDRESS — the "General" flow from the
 *    official useWriteContractSponsored hook), the paymaster fields are
 *    attached to the transaction request so the USER PAYS ZERO GAS
 *    (the app sponsors it). AGW account deployment itself is already
 *    sponsored by Abstract's default paymaster, so brand-new wallets can
 *    transact too (see AGW FAQ, docs.abs.xyz).
 *
 *  • Falls back gracefully: the caller can catch errors and retry through
 *    a standard wagmi writeContract if the optimistic endpoint is
 *    unavailable.
 */

import { useCallback, useState } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import {
  encodeFunctionData,
  type Abi,
  type Address,
  type Hex,
} from 'viem'
import { getGeneralPaymasterInput } from 'viem/zksync'
import {
  sendRawTransactionWithDetailedOutput,
  type OptimisticTransactionResponse,
} from '@/lib/abstract/optimistic-tx'

export interface OptimisticWriteConfig {
  /** Target contract (e.g. the PENGU token). */
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
  /**
   * Explicit paymaster override for this call. When omitted, the app-wide
   * sponsor paymaster (NEXT_PUBLIC_SPONSOR_PAYMASTER_ADDRESS) is used if
   * configured.
   */
  paymaster?: Address
  paymasterInput?: Hex
  onSuccess?: (data: OptimisticTransactionResponse, startTime: number) => void
  onError?: (error: Error) => void
}

/** Sponsor paymaster (General flow) — optional, env-configured. */
export const sponsorPaymasterAddress = (
  process.env.NEXT_PUBLIC_SPONSOR_PAYMASTER_ADDRESS || undefined
) as Address | undefined

/** True when the app-wide gas sponsorship is active. */
export const isGasSponsored = !!sponsorPaymasterAddress

export function useOptimisticWriteContract() {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()

  const [isPending, setIsPending] = useState(false)
  const [data, setData] = useState<OptimisticTransactionResponse | undefined>()
  const [error, setError] = useState<Error | undefined>()

  const writeContractAsync = useCallback(
    async (config: OptimisticWriteConfig): Promise<OptimisticTransactionResponse> => {
      if (!address || !walletClient) throw new Error('wallet not connected')

      setIsPending(true)
      setError(undefined)
      setData(undefined)

      try {
        const { onSuccess, onError, paymaster, paymasterInput, ...contractParams } = config

        // 1. Encode the contract call.
        const txData = encodeFunctionData({
          abi: contractParams.abi,
          functionName: contractParams.functionName,
          args: contractParams.args as unknown[] | undefined,
        })

        // 2. Gas sponsorship (official useWriteContractSponsored pattern):
        //    attach paymaster fields so the paymaster covers the user's gas.
        const effectivePaymaster = paymaster ?? sponsorPaymasterAddress
        const request = {
          to: contractParams.address,
          data: txData,
          ...(effectivePaymaster
            ? {
                paymaster: effectivePaymaster,
                paymasterInput:
                  paymasterInput ?? getGeneralPaymasterInput({ innerInput: '0x' }),
              }
            : {}),
          // zksync-specific request fields are structurally valid here; cast
          // for viem's generic transaction-request typing.
        } as Parameters<typeof walletClient.prepareTransactionRequest>[0]

        // 3. Prepare (gas estimation via the chain RPC)…
        const prepared = await walletClient.prepareTransactionRequest(request)

        // 4. …and sign — this triggers the AGW approval UI synchronously
        //    within the caller's user-gesture chain (popup-safe).
        const signedTransaction = (await walletClient.signTransaction(
          prepared as Parameters<typeof walletClient.signTransaction>[0],
        )) as `0x${string}`

        // 5. Optimistic submission — instant hash, pre-confirmation.
        const startTime = Date.now()
        const result = await sendRawTransactionWithDetailedOutput(signedTransaction)

        setData(result)
        onSuccess?.(result, startTime)
        return result
      } catch (err) {
        const e = err instanceof Error ? err : new Error('unknown error')
        setError(e)
        config.onError?.(e)
        throw e
      } finally {
        setIsPending(false)
      }
    },
    [address, walletClient],
  )

  /** Fire-and-forget variant that never throws (errors land in `error`). */
  const writeContract = useCallback(
    (config: OptimisticWriteConfig) => {
      writeContractAsync(config).catch(() => {
        // handled via onError / error state
      })
    },
    [writeContractAsync],
  )

  const reset = useCallback(() => {
    setData(undefined)
    setError(undefined)
    setIsPending(false)
  }, [])

  return {
    writeContract,
    writeContractAsync,
    isPending,
    data,
    error,
    isSuccess: !!data,
    isError: !!error,
    reset,
  }
}
