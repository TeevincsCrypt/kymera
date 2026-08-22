'use client'

import Link from 'next/link'
import { AlertTriangle, Info, ShieldAlert, ShieldCheck, Wallet } from 'lucide-react'
import { useKymeraSession } from '@/lib/web3/kymera-session'

export type RiskAlert = {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
  agentName?: string
  sessionId?: string
  at: string
}

export type ActivityRow = {
  id: string
  agentId: string | null
  agentName: string | null
  action: string
  decision: string
  reason: string
  status: string
  chainId: number
  asset: string
  amount: string
  txHash: string | null
  createdAt: string
  confirmedAt: string | null
  error: string | null
}

export type SessionRow = {
  id: string
  agentId: string
  agentName: string
  status: string
  chainId: number
  spendingLimit: string | null
  expiresAt: string
  createdAt: string
  permissions: string[]
}

export type HiredAgent = {
  hireId: string
  agentId: string
  name: string
  category: string
  score: number | null
  status: string
  task: string
  sessionId: string | null
  paymentTxHash: string | null
  paymentChainId: number | null
  createdAt: string
}

export type Summary = {
  wallet: string
  stats: { agents: number; sessions: number; approved: number; blocked: number; confirmed: number }
  agents: HiredAgent[]
  sessions: SessionRow[]
  activity: ActivityRow[]
  alerts: RiskAlert[]
  posture: { network: string; allowedChains: number[]; custody: string }
}

export function explorerFor(chainId: number | null | undefined) {
  return chainId === 56 ? 'https://bscscan.com' : 'https://testnet.bscscan.com'
}

/** One consistent gate so every wallet-scoped page asks for the same two things. */
export function RequireWallet({ title, children }: { title: string; children: React.ReactNode }) {
  const session = useKymeraSession()

  if (!session.isConnected) {
    return (
      <Empty
        icon={<Wallet size={22} className="text-primary" aria-hidden />}
        title="Connect your wallet"
        body={`${title} is scoped to your wallet. Nothing is shown until you connect.`}
        action={<button type="button" onClick={session.openWalletChooser} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Connect wallet</button>}
      />
    )
  }

  if (!session.isAuthenticated) {
    return (
      <Empty
        icon={<ShieldCheck size={22} className="text-primary" aria-hidden />}
        title="Verify you own this wallet"
        body="Sign a free message so Kymera can confirm this address is yours. It creates no transaction and moves nothing."
        action={
          <div>
            <button type="button" onClick={() => void session.signIn()} disabled={session.authPending} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {session.authPending ? 'Waiting for signature…' : 'Sign in with wallet'}
            </button>
            {session.authError && <p className="mt-3 text-xs text-destructive">{session.authError}</p>}
          </div>
        }
      />
    )
  }

  return <>{children}</>
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div>
        <p className="text-sm font-medium text-primary">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] md:text-4xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}

export function Empty({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
      {icon && <div className="mb-3 flex justify-center">{icon}</div>}
      <h2 className="font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{body}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  )
}

export function StatTile({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4" title={hint}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${tone === 'bad' ? 'text-destructive' : tone === 'good' ? 'text-[#138a61]' : ''}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{hint}</p>}
    </div>
  )
}

const ALERT_STYLE = {
  critical: { wrap: 'border-destructive/30 bg-destructive/5', text: 'text-destructive', Icon: ShieldAlert },
  warning: { wrap: 'border-[#f1d5c8] bg-[#fff7f2]', text: 'text-[#9d4925]', Icon: AlertTriangle },
  info: { wrap: 'border-border bg-muted/40', text: 'text-muted-foreground', Icon: Info },
} as const

export function AlertList({ alerts }: { alerts: RiskAlert[] }) {
  if (!alerts.length) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-4">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#138a61]" aria-hidden />
        <p className="text-sm text-muted-foreground">Nothing needs your attention. No blocks, expiries, or limits approaching.</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      {alerts.map((alert) => {
        const style = ALERT_STYLE[alert.severity]
        return (
          <div key={alert.id} className={`flex items-start gap-2.5 rounded-xl border p-4 ${style.wrap}`}>
            <style.Icon size={16} className={`mt-0.5 shrink-0 ${style.text}`} aria-hidden />
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${style.text}`}>{alert.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{alert.detail}</p>
              {alert.sessionId && (
                <Link href="/permissions" className="mt-1.5 inline-block text-xs font-semibold text-primary underline underline-offset-2">
                  Manage permissions
                </Link>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
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

/** One row of the audit trail — the same shape everywhere it appears. */
export function ActivityItem({ row }: { row: ActivityRow }) {
  const blocked = row.decision === 'REJECTED'
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex min-w-0 gap-3">
        {blocked
          ? <ShieldAlert size={16} className="mt-0.5 shrink-0 text-destructive" aria-hidden />
          : <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#138a61]" aria-hidden />}
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {row.agentName ?? 'Agent'} · <span className="font-mono text-xs">{row.action.replaceAll('_', ' ')}</span>
          </p>
          <p className={`mt-1 font-mono text-[11px] ${blocked ? 'text-destructive' : 'text-muted-foreground'}`}>{row.reason}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {Number(row.amount) > 0 ? `${row.amount} ${row.asset === 'BNB' ? 'BNB' : `${row.asset.slice(0, 8)}…`} · ` : ''}
            {new Date(row.createdAt).toLocaleString()}
          </p>
          {row.txHash && (
            <a href={`${explorerFor(row.chainId)}/tx/${row.txHash}`} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-xs text-primary underline underline-offset-2">
              {row.txHash.slice(0, 20)}…
            </a>
          )}
          {row.error && <p className="mt-1 text-xs text-destructive">{row.error}</p>}
        </div>
      </div>
      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${STATUS_TONE[row.status] ?? 'bg-muted text-muted-foreground'}`}>{row.status}</span>
    </div>
  )
}

export function useSummary() {
  return { explorerFor }
}
