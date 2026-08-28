# Abstract Portal registration & wallet setup

The project owner registers once at **[portal.abs.xyz](https://portal.abs.xyz)** —
Abstract's official gateway — and uses that same wallet as the project treasury
and for managing the project's presence in the Abstract ecosystem.

## 1. Create your Abstract account & wallet

1. Go to **https://portal.abs.xyz** and connect or create a wallet:
   - **With an existing EVM wallet** (MetaMask, Rabby, …): connect it and the
     Portal treats that address as your identity.
   - **With an Abstract Global Wallet**: follow the in-portal flow
     (email / social login creates a smart-account wallet).
2. This address becomes your **treasury** — all PENGU payments from the app
   land here:
   ```
   0x60Df4E186364c3a49A550Aee29Da1d5fe3658818
   ```
   > If you prefer a different treasury address later, change
   > `NEXT_PUBLIC_TREASURY_ADDRESS` — nothing else in the app is hardcoded to it.

## 2. Fund the workflow (what each wallet needs)

| Wallet | Needs | Why |
|---|---|---|
| Treasury (`0x60Df…8818`) | nothing to receive PENGU | receiving is free |
| Your personal wallet (for testing) | a few PENGU + a little ETH on Abstract | to test the 5 PENGU access fee and 1 PENGU unlocks end-to-end |
| Users | PENGU + ETH for gas | they transfer PENGU and pay gas |

To move PENGU from another chain onto Abstract, use the official bridge
(https://bridge.abs.xyz). ETH for gas on Abstract can also be bridged.

## 3. Add the Abstract network to your browser wallet

The app offers a one-click network switch, but you can also add Abstract
manually:

| Field | Mainnet | Testnet |
|---|---|---|
| Network name | Abstract | Abstract Testnet |
| RPC URL | `https://api.mainnet.abs.xyz` | `https://api.testnet.abs.xyz` |
| Chain ID | `2741` | `11124` |
| Currency | ETH | ETH |
| Explorer | `https://explorer.abs.xyz` | `https://sepolia.explorer.abs.xyz` |

## 4. Register / manage the project on the portal

1. In the Portal, register your project (**Abstract Portal → Projects/Apps**)
   with the app's name, URL and description.
2. Use the same connected wallet for verification — this ties the project to
   your on-chain identity.
3. Optional integrations the Portal unlocks (not required by this codebase):
   - Additional RPC endpoints / analytics keys if you outgrow the public RPC.
   - Note: wallet connection is exclusively the **Abstract Global Wallet
     (AGW)** — its built-in modal already covers email, social and external
     wallets (including mobile via WalletConnect under the hood), so no
     separate WalletConnect project ID is needed.

## 5. Verify everything end-to-end (mainnet acceptance test)

```bash
# with the app running and your funded wallet connected in the browser:
1. Connect wallet            → signature prompt appears → session starts
2. Signal card               → shows "Platform access" step (5 PENGU)
3. Pay access                → wallet asks to transfer 5 PENGU to the treasury
4. Confirmation              → dialog advances to "verified on Abstract"
5. Signal card               → shows "Unlock today" step (1 PENGU)
6. Pay day unlock            → full signal renders (verdict, plan, indicators)
7. Explorer                  → both transfers visible on the treasury address:
                               https://explorer.abs.xyz/address/0x60Df4E186364c3a49A550Aee29Da1d5fe3658818
```

## 6. Security reminders for the treasury

- The treasury address is **public by design** (shown in the payment dialog) —
  never use it as a cold-storage vault beyond working capital.
- Move collected funds to your secure storage periodically; the app only needs
  the address to stay unchanged to keep verifying payments.
- Keep `SESSION_SECRET` and any Wrangler secrets out of git.

## 7. Ecosystem alignment audit (docs.abs.xyz / build.abs.xyz — 2026-08)

How this codebase maps to the official Abstract documentation:

| Docs reference | Our implementation | Status |
|---|---|---|
| [AGW — AbstractWalletProvider](https://docs.abs.xyz/abstract-global-wallet/agw-react/AbstractWalletProvider) | `AbstractWalletProvider chain={abstract\|abstractTestnet} transport={http(rpc)} queryClient={…}` — exact official pattern (src/components/providers.tsx) | ✅ aligned |
| [AGW — useLoginWithAbstract](https://docs.abs.xyz/abstract-global-wallet/agw-react/hooks/useLoginWithAbstract) | `login`/`logout` drive the connect button; AGW modal handles email/social/external wallets | ✅ aligned |
| [AGW — Signature Validation / ERC-1271](https://docs.abs.xyz/how-abstract-works/native-account-abstraction/signature-validation) | Auth verifies smart-account signatures via `publicClient.verifyMessage` (ERC-1271 + ERC-6492 counterfactual support) — never raw ECDSA checks | ✅ aligned |
| [Abstract JSON-RPC API](https://docs.abs.xyz/api-reference/overview/abstract-json-rpc-api) | Server uses only standard `eth_*` methods (`eth_getTransactionReceipt`, `eth_getBlockByNumber`, `eth_call`) against the public RPC — no `zks_`/`debug_` dependencies | ✅ aligned |
| [build.abs.xyz — AGW Reusables](https://build.abs.xyz) | shadcn/ui-compatible AGW component registry (Connect Wallet, Sign-in with Ethereum, Session Keys, Onboarding). Our custom components already cover connect + sign-in with the same AGW SDK underneath — no duplication needed | ✅ noted |
| [Session keys](https://docs.abs.xyz/abstract-global-wallet/session-keys/overview) | **Mainnet session keys require a security review + Session Key Policy Registry listing.** We deliberately do NOT use them: "auto-renew" is implemented as prepaid packages + one-click stacking renewal (days extend from current expiry) — user-signed, no background charging, no review dependency | ✅ pragmatic choice |
| [AI-agents resources](https://docs.abs.xyz/ai-agents/resources/overview) | `docs.abs.xyz/llms.txt` is the canonical doc index; any page is fetchable as Markdown by appending `.md` | ✅ used for this audit |

**Why no session keys today:** session keys would let the app charge
1 PENGU/day while the user is offline, but on mainnet they mandate an app
security review and registry whitelisting (per the official docs). That is a
heavy process with real custodial risk for a 1 PENGU/day product. The stacking
renewal UX delivers the same outcome — uninterrupted daily signals — with the
user signing exactly one transaction per renewal period. If the product later
justifies it, the session-key path (createSession/toSessionClient from
`@abstract-foundation/agw-client`) remains open and documented.
