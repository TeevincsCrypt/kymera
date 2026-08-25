# Kymera — BNB Chain hackathon proof

> **Verification status.** Everything below marked **Verified** was executed and observed.
> Everything marked **Unverified** is implemented and type-checked but has not been run
> against a live network from the development environment, which has no outbound access to
> BNB RPC endpoints or the Altana relay. Nothing in this document reports a transaction,
> benchmark, or measurement that did not happen. The runbook in section E is what turns the
> unverified rows into verified ones, and it must be run by someone with network access.

---

## A. Altana

### What Kymera uses Altana for

An agent does not act from the user's wallet. It acts from a **non-custodial smart agentic
wallet** whose authority is a **session key delegated on-chain**. The delegation carries the
contracts the key may call, a spending cap, and an expiry, and the Altana account contract's
validator enforces them at execution time.

That matters because it makes the boundary independent of Kymera. If Kymera's server were
wrong, or compromised outright, a call outside the granted scope still reverts at validation.
The policy engine and the enforcement layer are not the same system.

### Division of responsibility

| Layer | Decides | Enforces |
|---|---|---|
| **KYMERA Guard** | Whether an action is permitted at all; builds every byte of calldata | Contract allowlist, method allowlist, session ownership/status/expiry, cumulative per-asset spending cap, chain gating, approval spender |
| **Altana account contract** | Nothing — it never sees intent | Which contracts the session key may call, spend cap per rolling period, expiry, revocation |

Guard runs first. If it refuses, no transaction object is produced, so there is nothing for
either signing path to submit. Altana never receives a request Guard denied.

### Implementation

| File | Role |
|---|---|
| `lib/altana/config.ts` | Network selection, server-only credential handling, derived session keys |
| `lib/altana/client.ts` | SDK client construction, counterfactual wallet provisioning |
| `lib/altana/permissions.ts` | On-chain `CallPermission` / `SpendPermission`, derived from Guard's own allowlist |
| `lib/altana/session.ts` | Grant, resume, verify, revoke |
| `lib/altana/execute.ts` | The Guard → Altana → chain path, written to the Guard ledger |
| `app/api/altana/status` | Configuration state, honest when unavailable |
| `app/api/altana/session/[id]` | `POST` grant · `GET` verify · `DELETE` revoke |
| `app/api/altana/execute` | Autonomous execution |

SDK: `@altananetwork/sdk@0.8.0`. Network: `BNB_TESTNET` (chain 97), relay
`https://testnet-relay.altana.network`.

### Key custody

- The admin key lives in `ALTANA_ADMIN_PRIVATE_KEY`, **server-side only**. It is never
  returned by an API, never written to the database, never logged, and never reaches the
  client bundle. `instrumentation.ts` refuses to start the process if it is exposed through a
  `NEXT_PUBLIC_` name.
- **Session keys are never stored.** They are derived deterministically per session:
  `HMAC-SHA256(adminKey, "altana-session:" + sessionId)`. A full database dump contains no
  signing material, and a session granted today can still be resumed tomorrow.
- The user's own wallet is never a signer on the autonomous path. Funds at risk are bounded
  by the agent wallet's own balance, and swap proceeds are sent to the user's wallet.

### Status

| Capability | Status |
|---|---|
| Permission derivation from Guard's allowlist | **Verified** — 23 unit tests |
| Session key derivation, determinism, isolation | **Verified** — unit tests |
| Honest unavailability when unconfigured | **Verified** — unit test |
| Agent wallet creation on BNB testnet | **Unverified** — needs relay access |
| On-chain session grant + KeyStore registration | **Unverified** — needs relay access |
| Autonomous execution through the session key | **Unverified** — needs relay access |
| On-chain revocation | **Unverified** — needs relay access |

---

## B. PancakeSwap

### What Kymera uses PancakeSwap for

Live V3 pool data drives what agents can act on, and `exactInputSingle` on the V3 SmartRouter
is the swap Guard authorizes. Both the user-signed path and the autonomous agent-wallet path
execute the same call.

| File | Role |
|---|---|
| `lib/pancakeswap.ts`, `lib/pancakeswap/provider.ts` | V3 subgraph client and pool ranking |
| `app/api/pancakeswap/{route,opportunities,health}` | Live pools, ranked opportunities, source health |
| `components/pancakeswap-page.tsx` | The Markets page |
| `components/pancake-action-panel.tsx` | Guard-gated swap, with the sign/autonomous switch |
| `lib/guard/policy.ts` | Router addresses per chain, `exactInputSingle` method allowlist |
| `lib/guard/abi.ts` | The only `exactInputSingle` ABI in the codebase |

Routers: `0x13f4EA83D0bd40E75C8222255bc855a974568Dd4` (56),
`0x1b81D678ffb9C0263b24A97847620C99d213eB14` (97).

### Guard checks before a swap can be built

Wallet → action → chain → session → session owner → session status → session expiry → agent →
permission → contract allowlist → method allowlist → token deployed on the target chain →
amount → cumulative spending cap. Any failure returns a named reason and builds nothing.

The token-deployed check exists because of a real bug: pool metrics come from the BNB
**mainnet** subgraph, and those token addresses are not contracts on testnet, so
`exactInputSingle` reverted on simulation. Guard now checks bytecode with `getBytecode` and
refuses with `TOKEN_NOT_ON_CHAIN` before the wallet opens.

### Status

| Capability | Status |
|---|---|
| Router and method allowlisting | **Verified** — unit tests |
| Cross-chain swap refusal | **Verified** — unit tests |
| Reachable from product navigation | **Verified** — `/pancakeswap` in `NAV` |
| Live pool data from the V3 subgraph | **Unverified** — needs `THEGRAPH_API_KEY` and gateway access |
| User-signed swap on BNB **mainnet** | **Unverified** — needs RPC access, real funds, and `KYMERA_ENABLE_MAINNET=true` |
| Swap on BNB **testnet** | **Not available** — indexed pools are mainnet-only, so their tokens are not contracts on chain 97. Guard refuses with `TOKEN_NOT_ON_CHAIN` rather than letting the call revert. Closing this needs testnet pool data. |
| Autonomous execution through an agent wallet | **Unverified** — exercised on testnet via ERC-8183, not via a swap (see §E step 5) |

---

## C. KYMERA

### The product

Discover → Deploy → Operate → Control. A marketplace of ERC-8004 agents, a permission model
that bounds what any of them may do, and an audit trail that records refusals as prominently
as approvals.

**The rejection is the feature.** A blocked action is not an error state; it is the product
demonstrating that a malicious or malfunctioning agent cannot reach the chain.

### Guard as the single authorization path

One decision function, `evaluateGuard`, is the only thing that authorizes anything. The client
never supplies calldata — it names an intent, and the server decides and constructs. This is
verifiable rather than asserted:

```
$ grep -rn "encodeFunctionData" --include=*.ts --include=*.tsx app lib components | grep -v "lib/guard/"
(no matches)
```

There is exactly one client-side signing path, `lib/web3/use-guard-execution.ts`, and one
autonomous path, `lib/web3/use-altana-execution.ts`. Both call Guard first.

### Honest state, everywhere

- **Scores.** An unevaluated agent shows nothing, not a placeholder number.
- **Activity.** Every row is exactly one of `BLOCKED`, `AWAITING_SIGNATURE`, `ON_CHAIN`,
  `NOT_SETTLED`, with who submitted it. There is no simulated state, because the Guard dry-run
  records nothing at all — the page says so.
- **Permissions.** Reduce-only. A live delegation is already signed on-chain; letting a web
  form widen it would make the grant a lie about what the key can do.
- **Unavailability.** Altana unconfigured, subgraph unreachable, mainnet disabled — each is
  reported with its specific reason, never hidden behind an empty state.

### Categories

`Rebalancing`, `Grid Trading`, `Yield Optimisation`, `Health Factor Monitoring` are
first-class, matched before the broad categories that would otherwise swallow them —
"yield optimisation" into Trading, "health factor" into Monitoring.

---

## D. Technical

### Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · Prisma 6.19 → Neon
Postgres · wagmi 3.7 / viem 2.55 · `@altananetwork/sdk` 0.8.0

### Security properties

| Property | How it is achieved |
|---|---|
| No custody of user funds | Kymera never holds a user key. The user signs, or an agent wallet the user funded signs within its grant. |
| Calldata cannot be forged by a client | The server builds it and records `sha256(chainId\|to\|data\|value)`. A tampered signature is detectable against the ledger. |
| No cross-wallet access | Wallet identity comes from a signature-verified session cookie, never from a request body. Every session and execution lookup filters by it. |
| Concurrent spend races closed | The cap re-check and the ledger insert happen in one `Serializable` transaction, with a reservation window that expires abandoned authorizations. |
| Blast radius bounded | Autonomous execution risks only the agent wallet's balance; the user's wallet is not a signer. |
| `move_funds` unreachable | Permanently in `BLOCKED_PERMISSIONS`; rejected at session creation and again at evaluation. |
| Server-only secrets stay server-side | `instrumentation.ts` refuses to boot if signing material appears under a `NEXT_PUBLIC_` name. |

### Verification performed

```
pnpm test    94 pass, 0 fail  (13 suites)
tsc --noEmit 0 errors
pnpm build   succeeds
```

Note: `pnpm lint` currently fails because the repository has no ESLint flat config. This
predates the Altana work and does not affect the build.

### Known limitations, stated plainly

1. **Altana runtime behaviour is unverified from the development environment.** Wallet
   creation, session grants, autonomous execution, and revocation are implemented against the
   SDK's published types and have not been run against the live relay.
2. **`approve` is scoped by function signature, not by argument.** An Altana `CallPermission`
   constrains a selector, not its parameters, so on-chain the session key may approve any
   spender. Guard restricts the spender to an allowlisted router when it builds the call;
   nothing below Guard does. A test pins this so the surface cannot widen silently.
3. **Pool metrics come from BNB mainnet, so there is no testnet swap path.** Those pairs do
   not exist at the same addresses on chain 97, and Guard refuses with `TOKEN_NOT_ON_CHAIN`
   rather than letting a swap revert. Autonomous execution is therefore demonstrated on
   testnet through ERC-8183, and the PancakeSwap swap path is exercised on mainnet only.
   Closing this properly means sourcing testnet pool data.
4. **Mainnet execution is off** unless `KYMERA_ENABLE_MAINNET=true`.

---

## E. Runbook — turning "unverified" into "verified"

Requires outbound network access, a dedicated BSC testnet wallet, and testnet BNB.

### 1. Configure

```bash
# A dedicated testnet key. Never a personal wallet.
echo "0x$(openssl rand -hex 32)"
```

Set on the server (not `NEXT_PUBLIC_`):

```
ALTANA_ADMIN_PRIVATE_KEY=0x…
ALTANA_NETWORK=bnb-testnet
THEGRAPH_API_KEY=…
```

### 2. Fund

```bash
curl -s https://<deployment>/api/altana/status | jq
```

Expect `available: true` and an `agentWallet` address. Fund it from
https://testnet.bnbchain.org/faucet-smart.

### 3. Verify, in order

| # | Step | Expected |
|---|---|---|
| 1 | Sign in with wallet | Authenticated; Dashboard loads |
| 2 | Grant a session with **Request swaps**, a small cap, and *Let this agent act on its own* checked | "Guard session active and delegated on-chain to an agent wallet" |
| 3 | Permissions → **Verify on-chain** | "Confirmed registered in the Altana KeyStore" |
| 4 | Permissions | Agent wallet address, allowed protocols, methods, spend cap, expiry, grant tx link |
| 5 | My Agents → the agent → **Autonomous execution** → *Let the agent run it* | A real transaction hash, **with no wallet prompt** |
| 6 | Activity | One `ON_CHAIN` row, "Submitted by the agent wallet via its Altana session key", explorer link resolves |
| 7 | Guard dry-run, or a swap, with an amount **above** the spend cap | Blocked, reason `SPENDING_CAP_EXCEEDED`, **no wallet prompt and no transaction** |
| 8 | Activity | A `BLOCKED` row, visually distinct from step 6 |
| 9 | Permissions → **Pause**, then retry step 5 | Blocked, reason `SESSION_INACTIVE` |
| 10 | Resume, then **Edit permissions** → uncheck Submit agent jobs → Apply | Reduction applies; on-chain grant re-issued |
| 11 | Retry step 5 | Blocked, reason `PERMISSION_NOT_GRANTED` |
| 12 | **Revoke session** | Revoked on-chain; every subsequent request refused |

**Why step 5 is an ERC-8183 job and not a swap.** The pools Kymera indexes are BNB
**mainnet** pools. Those token addresses are not contracts on chain 97, so Guard refuses to
build a swap against them on testnet — correctly, with `TOKEN_NOT_ON_CHAIN`. The ERC-8183
Agentic Commerce contract *is* deployed on testnet, so it is the action that genuinely
completes end to end there. A testnet swap would require testnet pool data, and a mainnet
swap would require `KYMERA_ENABLE_MAINNET=true` and real funds.

Steps 7, 9, and 11 are the ones that matter most. A system that executes correctly is
ordinary; one that refuses correctly, and shows you exactly which rule refused, is the point.

### 4. Report failures verbatim

Capture the exact reason code and any `detail` field. Every failure path in the Altana layer
returns a named reason — `ALTANA_RELAY_UNREACHABLE`, `ALTANA_SESSION_NOT_GRANTED`,
`ALTANA_CHAIN_NOT_SUPPORTED` — rather than a generic error, so a failure identifies itself.
