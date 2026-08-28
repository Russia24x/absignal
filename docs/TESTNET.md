# Running against Abstract Testnet

The app is network-agnostic: one env switch moves every wallet interaction
(connect, chain checks, PENGU transfers, on-chain verification) from Abstract
mainnet (chain 2741) to Abstract Testnet (chain 11124).

## 1. Configure

```env
NEXT_PUBLIC_APP_NETWORK=testnet
NEXT_PUBLIC_PENGU_TESTNET=0xYourTestTokenAddress   # required
# Optional overrides:
NEXT_PUBLIC_RPC_TESTNET=https://api.testnet.abs.xyz
```

> There is **no official PENGU token on testnet** — that's exactly why the
> address is an env var. Point it at any ERC-20 you control or deploy for
> testing (see below). The market data (prices/candles/track record) always
> streams from the **real mainnet** PENGU pool, because a testnet has no
> market to analyze — the signals you test are the real product.

## 2. Get test funds

- ETH for gas: Abstract Testnet faucet — https://portal.abs.xyz/ (Faucet section,
  requires a free Portal account).
- A test PENGU: any ERC-20 on testnet works. Easiest options:
  1. Deploy OpenZeppelin's ERC-20 from [Remix](https://remix.ethereum.org) in
     2 minutes (mint yourself e.g. 1,000 tokens, 18 decimals), or
  2. Use an existing test token you already hold on Abstract Sepolia.

## 3. Restart & verify

```bash
bun run dev
curl http://localhost:3000/api/config | jq .networkMode   # → "testnet"
```

In the UI:

- The header badge shows **Abstract Testnet**.
- Payment dialogs expect chain `11124` (wrong-network switching targets testnet).
- The whole ladder works: connect → sign → 5 test-PENGU access → 1 test-PENGU
  day unlock — with on-chain verification running against the testnet RPC.

## 4. What differs from mainnet

| Aspect | Mainnet | Testnet |
|---|---|---|
| Wallet chain | Abstract (2741) | Abstract Testnet (11124) |
| Payment token | real PENGU | your configured test ERC-20 |
| Market data & signals | real (always) | real (always) |
| Explorer links | explorer.abs.xyz | sepolia.explorer.abs.xyz |
| Payment verification | mainnet RPC | testnet RPC |

## 5. Switching back

```env
NEXT_PUBLIC_APP_NETWORK=mainnet
```

No code changes, no rebuild of logic — the config module (`src/lib/config.ts`)
revalidates everything (including a clear error if a required address is
missing) exposed at `GET /api/config`.
