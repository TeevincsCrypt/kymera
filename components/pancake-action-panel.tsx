'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useKymeraSession } from '@/lib/web3/kymera-session'
import { useGuardExecution } from '@/lib/web3/use-guard-execution'
import { GuardDecisionPanel } from '@/components/guard-decision'
import { KYMERA_CHAIN_ID } from '@/lib/web3/config'

type Session = { id: string; agent?: { name?: string } | null; status: string; spendingLimit: string | number | null }

/**
 * PancakeSwap swap execution.
 *
 * Every step here runs through the canonical Guard. This component holds no ABI, no
 * router address, and no calldata builder — it asks Guard to authorize, and only
 * signs bytes Guard returned. A rejected request never reaches the wallet.
 */
export function PancakeActionPanel({ tokenIn, tokenOut, feeTier }: { tokenIn: string; tokenOut: string; feeTier?: number | null }) {
  const session = useKymeraSession()
  const approve = useGuardExecution()
  const swap = useGuardExecution()
  const [amount, setAmount] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionId, setSessionId] = useState('')

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
  const busy = approve.state === 'authorizing' || approve.state === 'awaiting_signature' || approve.state === 'confirming' || swap.state === 'authorizing' || swap.state === 'awaiting_signature' || swap.state === 'confirming'
  const chainId = session.chainId ?? KYMERA_CHAIN_ID

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
          onClick={() => approve.authorizeAndSign({ action: 'approve_token', ...request })}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          1. Approve
        </button>
        <button
          type="button"
          disabled={!valid || busy || !sessionId}
          onClick={() => swap.authorizeAndSign({ action: 'swap', ...request })}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          2. Request swap
        </button>
      </div>

      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
        Guard checks the contract, method, session, and spending limit before your wallet is ever opened. A blocked request produces no wallet prompt.
      </p>

      <GuardDecisionPanel decision={approve.decision} state={approve.state} txHash={approve.txHash} error={approve.error} />
      <GuardDecisionPanel decision={swap.decision} state={swap.state} txHash={swap.txHash} error={swap.error} />
    </div>
  )
}
