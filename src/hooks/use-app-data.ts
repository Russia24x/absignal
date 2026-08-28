'use client'

/**
 * Data hooks (TanStack Query wrappers) for all server state:
 * session, market, signal, track record, payments.
 */

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useAccount, useSignMessage } from 'wagmi'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n/context'

/* ---------------------------------- Types ---------------------------------- */

export interface AppConfig {
  networkMode: 'mainnet' | 'testnet'
  chain: { id: number; name: string; shortName: string; rpcUrl: string; blockExplorerUrl: string; blockExplorerTxPath: string }
  penguAddress: string | null
  treasuryAddress: string
  packages: Array<{ id: string; days: number | null; label: string; price: number; basePrice: number; discountPct: number; popular?: boolean }>
  dataSource: { provider: string; network: string; pool: string }
  configOk: boolean
  configErrors: string[]
}

export interface MarketOverview {
  priceUsd: number
  priceChange24h: number | null
  priceChange6h: number | null
  priceChange1h: number | null
  volume24hUsd: number | null
  volume6hUsd: number | null
  volume1hUsd: number | null
  liquidityUsd: number | null
  fdvUsd: number | null
  marketCapUsd: number | null
  buys24h: number | null
  sells24h: number | null
  poolName: string | null
  updatedAt: number
  /** true when upstream is limited and cached data is being served */
  stale?: boolean
  fetchedAt?: number
}

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface IndicatorDetail {
  key: string
  vote: 'bullish' | 'bearish' | 'neutral'
  contribution: number
  value: number | null
  display: string
}

export interface TimeframeAnalysis {
  timeframe: string
  score: number
  indicators: IndicatorDetail[]
  trendStrength: number | null
  note: string
}

export interface TradePlan {
  side: 'long' | 'short' | 'none'
  entryLow: number
  entryHigh: number
  stopLoss: number
  takeProfits: number[]
  riskReward: number
  invalidation: string
}

export interface SignalData {
  date: string
  generatedAt: number
  priceUsd: number
  verdict: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL'
  score: number
  confidence: number
  timeframes: TimeframeAnalysis[]
  plan: TradePlan
  supports: number[]
  resistances: number[]
  atrPercent: number | null
  summary: { en: string; fa: string }
}

export interface SignalTodayResponse {
  access: 'granted' | 'auth_required' | 'subscription_required'
  date?: string
  updatedAt?: number
  signal?: SignalData
}

export interface HistoryEntry {
  date: string
  verdict: string
  score: number
  confidence: number
  priceAtSignal: number
  priceNextDay: number | null
  changePercent: number | null
  outcome: 'WIN' | 'LOSS' | 'NEUTRAL' | 'PENDING'
  /** True = pre-launch walk-forward reconstruction from real historical candles. */
  backfilled: boolean
}

export interface HistoryResult {
  entries: HistoryEntry[]
  stats: { total: number; wins: number; losses: number; neutral: number; accuracy: number | null }
}

export interface SessionUser {
  address: string
  subscriptionUntil: string | null
  /** Last credited plan: day | week | month | year | lifetime */
  subscriptionPlan: string | null
  isLifetime: boolean
  hasSubscription: boolean
  /** Whole days remaining; null for lifetime plans */
  daysLeft: number | null
  today: string
}

export interface PaymentIntentResponse {
  intentId: string
  type: 'SUBSCRIPTION'
  planId: 'day' | 'week' | 'month' | 'year' | 'lifetime'
  days: number | null
  amountPengu: number
  amountWei: string
  treasuryAddress: string
  tokenAddress: string | null
  chainId: number
  expiresAt: string
}

/* --------------------------------- Fetchers --------------------------------- */

async function jget<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  return res.json()
}

async function jpost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(json.error || `POST ${url} → ${res.status}`), { data: json })
  return json as T
}

/* ---------------------------------- Hooks ---------------------------------- */

export function useAppConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => jget<AppConfig>('/api/config'),
    staleTime: 5 * 60_000,
  })
}

export function useMarketOverview() {
  return useQuery({
    queryKey: ['market-overview'],
    queryFn: () => jget<MarketOverview>('/api/market/overview'),
    refetchInterval: 45_000,
  })
}

export function useCandles(tf: string) {
  return useQuery({
    queryKey: ['candles', tf],
    queryFn: () =>
      jget<{ timeframe: string; candles: Candle[]; stale?: boolean; fetchedAt?: number }>(
        `/api/market/candles?tf=${tf}&limit=180`
      ),
    refetchInterval: 90_000,
  })
}

export function useSignalToday(enabled = true) {
  return useQuery({
    queryKey: ['signal-today'],
    queryFn: () => jget<SignalTodayResponse>('/api/signal/today'),
    enabled,
    staleTime: 60_000,
  })
}

export function useTrackRecord() {
  return useQuery({
    queryKey: ['track-record'],
    queryFn: () => jget<HistoryResult>('/api/signal/history'),
    staleTime: 5 * 60_000,
  })
}

export interface BacktestTrade {
  date: string
  exitDate: string
  side: 'long' | 'short'
  verdict: string
  entry: number
  stopLoss: number
  takeProfits: number[]
  r: number
  holdDays: number
  outcome: 'TP3' | 'TP2' | 'TP1' | 'BE' | 'SL' | 'TIMEOUT'
}

export interface BacktestData {
  from: string
  to: string
  tradingDays: number
  stats: {
    trades: number
    wins: number
    losses: number
    breakeven: number
    winRate: number
    totalR: number
    avgR: number
    bestR: number
    worstR: number
    profitFactor: number | null
    maxDrawdownR: number
    avgHoldDays: number
    skippedSignals: number
    holdDays: number
  }
  trades: BacktestTrade[]
  equity: Array<{ date: string; r: number }>
  cached?: boolean
}

export function useBacktest() {
  return useQuery({
    queryKey: ['backtest'],
    queryFn: () => jget<BacktestData>('/api/backtest'),
    staleTime: 30 * 60_000,
    retry: 1,
  })
}

export function useSession() {
  const { address, isConnected } = useAccount()
  return useQuery({
    queryKey: ['session', address ?? null],
    queryFn: () => jget<{ user: SessionUser | null }>('/api/auth/me'),
    enabled: true,
    staleTime: 10_000,
    select: (data) => ({ ...data, walletAddress: address ?? null, isConnected }),
  })
}

/* --------------------------- Wallet sign-in flow --------------------------- */

/**
 * Full sign-in: nonce → personal_sign → verify → session cookie.
 * Triggered automatically once a wallet is connected.
 */
export function useWalletSignIn() {
  const { address, chainId } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const queryClient = useQueryClient()
  const { t } = useI18n()

  return useMutation({
    mutationFn: async (): Promise<boolean> => {
      if (!address) return false
      const { message } = await jpost<{ message: string }>('/api/auth/nonce', { address })
      let signature: string
      try {
        signature = await signMessageAsync({ message })
      } catch {
        toast.error(t.auth.authDeclined)
        return false
      }
      const result = await jpost<{ user: unknown }>('/api/auth/verify', { address, signature })
      return !!result.user
    },
    onSuccess: (ok) => {
      if (ok) {
        toast.success(t.toasts.sessionStarted)
        queryClient.invalidateQueries({ queryKey: ['session'] })
        queryClient.invalidateQueries({ queryKey: ['signal-today'] })
      }
    },
    onError: () => {
      toast.error(t.auth.authFailed)
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  const { t } = useI18n()
  return useMutation({
    mutationFn: () => jpost('/api/auth/logout', {}),
    onSuccess: () => {
      toast(t.toasts.sessionEnded, { icon: '🐧' })
      queryClient.invalidateQueries({ queryKey: ['session'] })
      queryClient.invalidateQueries({ queryKey: ['signal-today'] })
    },
  })
}

/* --------------------------------- Payments --------------------------------- */

export function usePaymentIntent() {
  return useMutation({
    mutationFn: (payload: { planId: 'day' | 'week' | 'month' | 'year' | 'lifetime' }) =>
      jpost<PaymentIntentResponse>('/api/payments/intent', payload),
  })
}

export function useVerifyPayment() {
  const queryClient = useQueryClient()
  const { t } = useI18n()
  return useMutation({
    mutationFn: (payload: { intentId: string; txHash: string }) =>
      jpost<{ status: string }>('/api/payments/verify', payload),
    onSuccess: () => {
      toast.success(t.toasts.paymentVerified)
      queryClient.invalidateQueries({ queryKey: ['session'] })
      queryClient.invalidateQueries({ queryKey: ['signal-today'] })
    },
    onError: (err: Error & { data?: { reason?: string } }) => {
      toast.error(t.toasts.paymentError, {
        description: err.data?.reason ?? err.message,
      })
    },
  })
}
