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
 *  • GAS SPONSORSHIP is applied at the PROVIDER level (official
 *    `customPaymasterHandler` on `AbstractWalletProvider`, see
 *    wallet/agw-gate.tsx): when NEXT_PUBLIC_SPONSOR_PAYMASTER_ADDRESS is
 *    configured, EVERY wallet transaction — including the signing step
 *    below AND the standard wagmi fallback — automatically carries the
 *    sponsor paymaster, so the user pays zero gas. AGW account deployment
 *    itself is already sponsored by Abstract's default paymaster.
 *
 *  • Falls back gracefully: the caller can catch errors and retry through
 *    a standard wagmi writeContract if the optimistic endpoint is
 *    unavailable.
 */

import { useCallback, useState } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { encodeFunctionData, type Abi, type Address } from 'viem'
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
  onSuccess?: (data: OptimisticTransactionResponse, startTime: number) => void
  onError?: (error: Error) => void
}

/**
 * Sponsor paymaster address (env-configured). The handler itself is mounted
 * in `AgwGate`'s AbstractWalletProvider — this export exists so UI surfaces
 * (e.g. the payment dialog) can display the sponsored-fee state.
 */
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
        const { onSuccess, onError, ...contractParams } = config

        // 1. Encode the contract call.
        const txData = encodeFunctionData({
          abi: contractParams.abi,
          functionName: contractParams.functionName,
          args: contractParams.args as unknown[] | undefined,
        })

        // 2. Prepare the request (gas estimation via the chain RPC). Any
        //    sponsor paymaster is attached automatically by the AGW
        //    provider's customPaymasterHandler during signing.
        const request = {
          to: contractParams.address,
          data: txData,
        } as Parameters<typeof walletClient.prepareTransactionRequest>[0]
        const prepared = await walletClient.prepareTransactionRequest(request)

        // 3. Sign — this triggers the AGW approval UI synchronously within
        //    the caller's user-gesture chain (popup-safe). The AGW client
        //    applies EIP-712 formatting + paymaster params here.
        const signedTransaction = (await walletClient.signTransaction(
          prepared as Parameters<typeof walletClient.signTransaction>[0],
        )) as `0x${string}`

        // 4. Optimistic submission — instant hash, pre-confirmation.
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
