'use client'

import { useEffect, useState } from 'react'
import { Bot, ShieldCheck, Wallet } from 'lucide-react'
import { useKymeraSession } from '@/lib/web3/kymera-session'
import { useGuardExecution } from '@/lib/web3/use-guard-execution'
import { useAltanaExecution } from '@/lib/web3/use-altana-execution'
import { GuardDecisionPanel } from '@/components/guard-decision'
import { KYMERA_CHAIN_ID } from '@/lib/web3/config'
import { BSC_MAINNET_CHAIN_ID } from '@/lib/guard/policy'
import { useSwitchChain } from 'wagmi'

type Session = {
  id: string
  agent?: { name?: string } | null
  status: string
  spendingLimit: string | number | null
  provider?: string
  providerSessionId?: string | null
}

/**
 * PancakeSwap swap execution.
 *
 * Every step here runs through the canonical Guard. This component holds no ABI, no
 * router address, and no calldata builder — it asks Guard to authorize, and only
 * signs bytes Guard returned. A rejected request never reaches the wallet.
 */
export function PancakeActionPanel({ tokenIn, tokenOut, feeTier }: { tokenIn: string; tokenOut: string; feeTier?: number | null }) {
  const session = useKymeraSession()
  const { switchChain } = useSwitchChain()
  const approve = useGuardExecution()
  const swap = useGuardExecution()
  const agentApprove = useAltanaExecution()
  const agentSwap = useAltanaExecution()
  const [amount, setAmount] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionId, setSessionId] = useState('')
  const [autonomous, setAutonomous] = useState(false)

  useEffect(() => {
    if (!session.isAuthenticated) { setSessions([]); return }
    fetch('/api/sessions')
      .then((response) => response.json())
      .then((payload) => {
        const active = (payload.sessions || []).filter((item: Session) => item.status === 'Active')
        setSessions(active)
        if (active[0] && !sessionId) setSessionId(active[0].id)
      })
      .catch(() => setSessions([]))
  }, [session.isAuthenticated, sessionId])

  const valid = /^\d+(\.\d+)?$/.test(amount) && Number(amount) > 0
  const inFlight = (state: string) => state === 'authorizing' || state === 'awaiting_signature' || state === 'confirming'
  const busy = [approve.state, swap.state, agentApprove.state, agentSwap.state].some(inFlight)
  const chainId = session.chainId ?? KYMERA_CHAIN_ID

  const selected = sessions.find((item) => item.id === sessionId)
  const delegated = selected?.provider === 'ALTANA' && Boolean(selected.providerSessionId)
  // An undelegated session has no agent wallet to submit from, so the choice is not
  // offered rather than presented and then failing.
  const agentExecutes = autonomous && delegated

  const request = {
    chainId,
    sessionId: sessionId || undefined,
    token: tokenIn,
    tokenOut,
    decimals: 18,
    amount,
    feeTier: feeTier ?? undefined,
  }

  if (!session.isAuthenticated) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        Sign in with your wallet to request a Guard-authorized swap.
      </div>
    )
  }

  // These pools are indexed from BNB mainnet, so they are only swappable while the
  // wallet is on mainnet. On testnet the same symbols live at different addresses and
  // Guard would (correctly) reject the swap, so offer the network switch instead of a
  // button that cannot work.
  const onPoolChain = chainId === BSC_MAINNET_CHAIN_ID
  if (!onPoolChain) {
    return (
      <div className="mt-4 rounded-xl border border-[#f1d5c8] bg-[#fff7f2] p-4">
        <p className="text-xs font-semibold text-[#9d4925]">Switch to BNB mainnet to swap this pool</p>
        <p className="mt-1.5 text-[11px] leading-5 text-[#9d4925]/90">
          These metrics are live from BNB <strong>mainnet</strong>. This pair exists at these addresses only there, so the swap must run on mainnet — with real funds.
        </p>
        <button
          type="button"
          onClick={() => switchChain({ chainId: BSC_MAINNET_CHAIN_ID })}
          className="mt-3 rounded-lg bg-[#9d4925] px-3 py-2 text-xs font-semibold text-white"
        >
          Switch wallet to BNB mainnet
        </button>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          Guard still enforces the router allowlist, method allowlist and your session spending limit before anything is signed. Mainnet execution also requires{' '}
          <code className="rounded bg-background px-1">KYMERA_ENABLE_MAINNET=true</code> on the server.
        </p>
      </div>
    )
  }

  const explorerBase = chainId === BSC_MAINNET_CHAIN_ID ? 'https://bscscan.com' : 'https://testnet.bscscan.com'

  return (
    <div className="mt-4 rounded-xl border border-border bg-background p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <ShieldCheck size={12} className="text-primary" aria-hidden /> Guard-protected swap
      </p>

      {sessions.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          No active Guard session. Grant one from an agent profile with the <code className="rounded bg-muted px-1">execute_trades</code> permission and a spending limit before swapping.
        </p>
      ) : (
        <label className="mt-3 block text-xs font-medium text-muted-foreground">
          Guard session
          <select value={sessionId} onChange={(event) => setSessionId(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-xs font-normal text-foreground">
            {sessions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.agent?.name || item.id.slice(0, 8)} · limit {item.spendingLimit ?? 'none'}
              </option>
            ))}
          </select>
        </label>
      )}

      {delegated && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Who submits the transaction">
          <ModeButton active={!agentExecutes} onClick={() => setAutonomous(false)} icon={<Wallet size={12} aria-hidden />} label="I sign it" />
          <ModeButton active={agentExecutes} onClick={() => setAutonomous(true)} icon={<Bot size={12} aria-hidden />} label="Agent executes" />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          placeholder="Amount of token in"
          aria-label="Amount of token in"
          className="h-10 min-w-40 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
        />
        <button
          type="button"
          disabled={!valid || busy || !sessionId}
          onClick={() => agentExecutes ? agentApprove.execute({ action: 'approve_token', ...request }) : approve.authorizeAndSign({ action: 'approve_token', ...request })}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          1. Approve
        </button>
        <button
          type="button"
          disabled={!valid || busy || !sessionId}
          onClick={() => agentExecutes ? agentSwap.execute({ action: 'swap', ...request }) : swap.authorizeAndSign({ action: 'swap', ...request })}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          2. Request swap
        </button>
      </div>

      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
        {agentExecutes
          ? 'Guard authorizes first, then the agent wallet submits it with its session key. Your wallet is not a signer here — the agent\u2019s allowlist and spend cap are enforced by its account contract on-chain.'
          : 'Guard checks the contract, method, session, and spending limit before your wallet is ever opened. A blocked request produces no wallet prompt.'}
      </p>

      {agentExecutes ? (
        <>
          <GuardDecisionPanel decision={agentApprove.decision} state={agentApprove.state} txHash={agentApprove.txHash} error={agentApprove.error} explorerBase={explorerBase} />
          <GuardDecisionPanel decision={agentSwap.decision} state={agentSwap.state} txHash={agentSwap.txHash} error={agentSwap.error} explorerBase={explorerBase} />
        </>
      ) : (
        <>
          <GuardDecisionPanel decision={approve.decision} state={approve.state} txHash={approve.txHash} error={approve.error} explorerBase={explorerBase} />
          <GuardDecisionPanel decision={swap.decision} state={swap.state} txHash={swap.txHash} error={swap.error} explorerBase={explorerBase} />
        </>
      )}
    </div>
  )
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
        active ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted'
      }`}
    >
      {icon}{label}
    </button>
  )
}
