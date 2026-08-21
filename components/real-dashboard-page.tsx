'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { useKymeraSession } from '@/lib/web3/kymera-session'

type Execution = {
  id: string
  agent?: { id: string; name: string } | null
  action: string
  decision: string
  reason: string
  status: string
  chainId: number
  asset: string
  amount: string
  method: string
  txHash: string | null
  createdAt: string
  error: string | null
}

const STATUS_TONE: Record<string, string> = {
  CONFIRMED: 'bg-[#e8f6f0] text-[#138a61]',
  SUBMITTED: 'bg-secondary text-secondary-foreground',
  AUTHORIZED: 'bg-secondary text-secondary-foreground',
  REJECTED: 'bg-destructive/10 text-destructive',
  FAILED: 'bg-destructive/10 text-destructive',
  CANCELLED: 'bg-muted text-muted-foreground',
  EXPIRED: 'bg-muted text-muted-foreground',
  LEGACY: 'bg-muted text-muted-foreground',
}

export function RealDashboardPage() {
  const session = useKymeraSession()
  const [executions, setExecutions] = useState<Execution[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!session.isAuthenticated) { setExecutions([]); return }
    setLoading(true)
    fetch('/api/guard/executions', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => setExecutions(payload.executions || []))
      .catch(() => setExecutions([]))
      .finally(() => setLoading(false))
  }, [session.isAuthenticated])

  return (
    <main className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
      <p className="text-sm font-medium text-primary">My workspace</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">Your agent desk.</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
        Permissions you granted, actions Guard allowed, and actions Guard blocked — the full record for your wallet.
      </p>

      {!session.isConnected ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <h2 className="font-semibold">Connect your wallet</h2>
          <p className="mt-2 text-sm text-muted-foreground">No placeholder data is shown here.</p>
          <button type="button" onClick={session.openWalletChooser} className="mt-5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Connect wallet</button>
        </div>
      ) : !session.isAuthenticated ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <h2 className="font-semibold">Verify you own this wallet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Sign a free message so Kymera can prove this address is yours. Wallet-scoped records are never readable from an address alone.
          </p>
          <button type="button" onClick={() => void session.signIn()} disabled={session.authPending} className="mt-5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {session.authPending ? 'Waiting for signature…' : 'Sign in with wallet'}
          </button>
          {session.authError && <p className="mt-3 text-xs text-destructive">{session.authError}</p>}
        </div>
      ) : (
        <section className="mt-10 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Guard audit trail</h2>
              <p className="mt-1 text-xs text-muted-foreground">Every authorization decision Kymera made for this wallet.</p>
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{executions.length}</span>
          </div>

          {loading ? (
            <p className="mt-5 text-sm text-muted-foreground">Loading…</p>
          ) : executions.length ? (
            <div className="mt-5 flex flex-col gap-2">
              {executions.map((execution) => {
                const blocked = execution.decision === 'REJECTED'
                return (
                  <div key={execution.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border p-4">
                    <div className="flex min-w-0 gap-3">
                      {blocked
                        ? <ShieldAlert size={16} className="mt-0.5 shrink-0 text-destructive" aria-hidden />
                        : <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#138a61]" aria-hidden />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {execution.agent?.name ?? 'Agent'} · <span className="font-mono text-xs">{execution.action}</span>
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">{execution.reason}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {Number(execution.amount) > 0 ? `${execution.amount} ${execution.asset === 'BNB' ? 'BNB' : execution.asset.slice(0, 10) + '…'} · ` : ''}
                          {new Date(execution.createdAt).toLocaleString()}
                        </p>
                        {execution.txHash && (
                          <a href={`https://testnet.bscscan.com/tx/${execution.txHash}`} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-xs text-primary underline underline-offset-2">
                            {execution.txHash.slice(0, 18)}…
                          </a>
                        )}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${STATUS_TONE[execution.status] ?? 'bg-muted text-muted-foreground'}`}>{execution.status}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">No Guard decisions recorded yet.</p>
              <Link href="/discover" className="mt-3 inline-block text-sm font-semibold text-primary">Find an agent to hire</Link>
            </div>
          )}
        </section>
      )}
    </main>
  )
}
