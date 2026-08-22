# Kymera

**AI agents can act on-chain. Kymera decides how far.**

Kymera is a BNB Chain agent marketplace and execution-control layer. You discover agents,
compare them on evidence, grant scoped permissions, and every on-chain action an agent
requests passes through one authorization layer — Kymera Guard — before your wallet is
ever opened.

## The core invariant

> No wallet-signed transaction exists without canonical Guard approval.

This is enforced structurally, not by convention:

1. A client asks `POST /api/guard/authorize` for permission. It never builds calldata.
2. Guard runs every check: authenticated wallet, session ownership, status, expiry,
   chain, contract allowlist, method allowlist, required permission, and the cumulative
   spending cap.
3. **On rejection, no transaction is returned.** The client has nothing to sign, so no
   wallet prompt appears. Every rejection carries a deterministic reason code.
4. On approval, the *server* builds the exact calldata, simulates it on-chain, hashes it,
   and records the authorization. The wallet signs precisely those bytes.
5. Submission and receipt are written back to the Guard ledger.

Guard lives in [`lib/guard/`](lib/guard/) and there is exactly one of it. The
authorization tests in [`tests/guard-evaluate.test.ts`](tests/guard-evaluate.test.ts)
assert each rejection path by reason code.

## What is real

| Area | Status |
|---|---|
| Wallet connection (any EIP-6963 wallet + WalletConnect) | Real |
| Wallet-ownership authentication (SIWE-style, single-use nonces) | Real |
| Guard authorization, allowlists, cumulative spending caps | Real, enforced, tested |
| On-chain simulation before signing | Real — a swap that cannot be simulated is refused |
| ERC-8183 job creation on BSC testnet | Real, Guard-gated, end to end |
| PancakeSwap swaps | Real, Guard-gated, testnet by default |
| PancakeSwap pool data | Real (official subgraph) |
| ERC-8004 agent indexing | Real (8004scan API + BNB RPC) |
| Kymera Score | Real, evidence-based, explainable |
| Agent hiring payments | **Demo only** — labeled in the UI, never charges anything |
| Arena comparison | **Not agent execution** — a transparent metadata comparison, stated as such |

Kymera has no agent runtime: it does not execute agent code, so it does not claim to
measure accuracy, latency, or cost. Where evidence is missing, the product says
"insufficient evaluation data" instead of inventing a number.

## Non-custodial

Kymera holds no private keys and signs nothing on your behalf. Server-side clients are
read/simulate only. `move_funds` is permanently unavailable as a permission.

## Getting started

```bash
pnpm install
cp .env.example .env.local     # set DATABASE_URL and KYMERA_AUTH_SECRET
pnpm db:deploy                 # builds the full schema on a fresh database
pnpm db:seed                   # optional local catalog (no fabricated metrics)
pnpm dev
```

Execution is restricted to BNB Smart Chain Testnet (chain 97) unless
`KYMERA_ENABLE_MAINNET=true` is set explicitly.

## Commands

```bash
pnpm dev         # development server
pnpm build       # production build (TypeScript errors fail the build)
pnpm typecheck   # tsc --noEmit
pnpm test        # Guard, auth, scoring, and policy tests (needs a scratch Postgres)
pnpm db:deploy   # apply migrations
```

See [`docs/OPERATIONS.md`](docs/OPERATIONS.md) for migration procedure, including
baselining an existing database, and for evaluation and test setup.
