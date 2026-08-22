'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useKymeraSession } from '@/lib/web3/kymera-session'
import { useGuardExecution } from '@/lib/web3/use-guard-execution'
import { GuardDecisionPanel } from '@/components/guard-decision'
import { KYMERA_CHAIN_ID } from '@/lib/web3/config'

type Session = { id: string; agent?: { name?: string } | null; status: string }

/**
 * ERC-8183 agent job creation on BSC testnet.
 *
 * This flow previously carried its own preflight endpoint and transaction builder.
 * It now uses the same canonical Guard as every other execution surface — one
 * authorization path, one ledger, one audit trail.
 */
export function TestnetWalletGuard() {
  const session = useKymeraSession()
  const guard = useGuardExecution()
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionId, setSessionId] = useState('')
  const [description, setDescription] = useState('Kymera testnet agent job')

  useEffect(() => {
    if (!session.isAuthenticated) { setSessions([]); setSessionId(''); return }
    fetch('/api/sessions')
      .then((response) => response.json())
      .then((payload) => {
        const active = (payload.sessions || []).filter((item: Session) => item.status === 'Active')
        setSessions(active)
        setSessionId((current) => current || active[0]?.id || '')
      })
      .catch(() => setSessions([]))
  }, [session.isAuthenticated])

  const onKymeraChain = session.chainId === KYMERA_CHAIN_ID
  const busy = guard.state === 'authorizing' || guard.state === 'awaiting_signature' || guard.state === 'confirming'

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
            <ShieldCheck size={12} aria-hidden /> Guard-protected execution
          </p>
          <h2 className="mt-2 text-xl font-semibold">ERC-8183 agent job</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Creates a real on-chain agent job on BNB Smart Chain Testnet. Guard authorizes the contract, method, session, and value before your wallet opens.
          </p>
        </div>
        <span className={`font-mono text-[10px] uppercase tracking-widest ${onKymeraChain ? 'text-[#138a61]' : 'text-amber-700'}`}>
          {onKymeraChain ? 'Testnet ready' : 'Wrong network'}
        </span>
      </div>

      {!session.isConnected ? (
        <button type="button" onClick={session.openWalletChooser} className="mt-5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
          Connect wallet
        </button>
      ) : !session.isAuthenticated ? (
        <div className="mt-5">
          <button type="button" onClick={() => void session.signIn()} disabled={session.authPending} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {session.authPending ? 'Waiting for signature…' : 'Sign in with wallet'}
          </button>
          {session.authError && <p className="mt-2 text-xs text-destructive">{session.authError}</p>}
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <span className="rounded-lg border border-border px-3 py-2 font-mono text-xs text-muted-foreground">
              {session.address?.slice(0, 6)}…{session.address?.slice(-4)}
            </span>
            {!onKymeraChain && (
              <button type="button" onClick={session.switchToKymeraChain} disabled={session.switching} className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-medium text-amber-800">
                {session.switching ? 'Switching…' : 'Switch to testnet'}
              </button>
            )}
            <label className="min-w-48 flex-1 text-xs font-medium text-muted-foreground">
              Guard session
              <select value={sessionId} onChange={(event) => setSessionId(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-xs text-foreground">
                <option value="">Most recent active session</option>
                {sessions.map((item) => <option key={item.id} value={item.id}>{item.agent?.name || item.id.slice(0, 8)}</option>)}
              </select>
            </label>
          </div>

          <label className="mt-3 block text-xs font-medium text-muted-foreground">
            Job description
            <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground" />
          </label>

          <button
            type="button"
            disabled={busy || !onKymeraChain}
            onClick={() => guard.authorizeAndSign({ action: 'create_job', chainId: KYMERA_CHAIN_ID, sessionId: sessionId || undefined, description })}
            className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Request Guard authorization'}
          </button>

          {sessions.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              You have no active Guard session. Grant one with the <code className="rounded bg-muted px-1">submit_transactions</code> permission from an agent profile.
            </p>
          )}

          <GuardDecisionPanel decision={guard.decision} state={guard.state} txHash={guard.txHash} error={guard.error} />
        </>
      )}
    </section>
  )
}
