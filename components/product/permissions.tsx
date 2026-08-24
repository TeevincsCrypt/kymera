'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Ban, Bot, CheckCircle2, ExternalLink, Loader2, Pause, Play, ScanSearch, ShieldCheck, SlidersHorizontal, Wallet } from 'lucide-react'
import { Empty, PageHeader, RequireWallet, explorerFor, type SessionRow, type Summary } from '@/components/product/shared'

const PERMISSION_COPY: Record<string, string> = {
  read_market_data: 'Read market data',
  analyze_positions: 'Analyze positions',
  execute_trades: 'Request swaps',
  submit_transactions: 'Submit agent jobs',
  move_funds: 'Move funds (never granted)',
}

type AltanaStatus = { available: boolean; reason: string | null; message: string | null; network: string; chainId: number; agentWallet: string | null }
type Verification = { delegated: boolean; registeredOnChain?: boolean; message?: string | null; grantTxHash?: string; explorerUrl?: string; publicKey?: string }

/** Where boundaries are reviewed, narrowed, paused and revoked. */
export function PermissionsPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-14">
      <PageHeader
        eyebrow="Permissions"
        title="What each agent is allowed to do."
        description="A session is an agent's entire authority. Revoke it and every future request is refused immediately, including any already authorized but unsigned."
      />
      <div className="mt-10"><RequireWallet title="Permissions"><Body /></RequireWallet></div>
    </div>
  )
}

function Body() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [altana, setAltana] = useState<AltanaStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(() => {
    Promise.all([
      fetch('/api/dashboard/summary', { cache: 'no-store' }).then(async (response) => {
        const payload = await response.json() as Summary & { error?: string }
        if (!response.ok) throw new Error(payload.error || 'Could not load permissions')
        return payload.sessions
      }),
      fetch('/api/altana/status', { cache: 'no-store' }).then((response) => response.json() as Promise<AltanaStatus>).catch(() => null),
    ])
      .then(([rows, status]) => { setSessions(rows); setAltana(status) })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load permissions'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" aria-hidden /> Loading permissions…</p>

  const now = Date.now()
  const live = sessions.filter((session) => (session.status === 'Active' || session.status === 'Paused') && new Date(session.expiresAt).getTime() > now)
  const past = sessions.filter((session) => !live.includes(session))

  return (
    <div className="flex flex-col gap-10">
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}
      {notice && <div className="rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">{notice}</div>}

      <AltanaBanner status={altana} />

      <section>
        <h2 className="text-lg font-semibold">Active grants</h2>
        <p className="mt-1 text-sm text-muted-foreground">These agents can request actions right now, within these limits.</p>
        <div className="mt-4">
          {live.length ? (
            <div className="flex flex-col gap-3">
              {live.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  altana={altana}
                  editable
                  onChanged={load}
                  onNotice={setNotice}
                  onError={setError}
                />
              ))}
            </div>
          ) : (
            <Empty
              title="No active permissions"
              body="No agent can request anything on-chain right now. Grant a session from an agent's profile to let one act within limits you set."
              action={<Link href="/agents" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Go to my agents</Link>}
            />
          )}
        </div>
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">Ended</h2>
          <p className="mt-1 text-sm text-muted-foreground">Expired or revoked. These agents can no longer request anything.</p>
          <div className="mt-4 flex flex-col gap-3">
            {past.map((session) => <SessionCard key={session.id} session={session} altana={altana} />)}
          </div>
        </section>
      )}
    </div>
  )
}

/** States the Altana integration honestly, including when it is switched off. */
function AltanaBanner({ status }: { status: AltanaStatus | null }) {
  if (!status) return null
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border p-4 ${status.available ? 'border-border bg-muted/40' : 'border-[#f1d5c8] bg-[#fff7f2]'}`}>
      <Bot size={16} className={`mt-0.5 shrink-0 ${status.available ? 'text-primary' : 'text-[#9d4925]'}`} aria-hidden />
      <div className="min-w-0 text-sm">
        {status.available ? (
          <>
            <p className="font-semibold">Agent wallets are available on {status.network}.</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              An activated agent acts from its own Altana smart wallet, not yours. Which contracts it may call, and how much it
              may spend, are enforced by that wallet&rsquo;s account contract on-chain — those hold even if Kymera is wrong. Finer
              limits, like which spender a token approval may name, are enforced by Guard when it builds the call.
              {status.agentWallet && <> Agent wallet <span className="break-all font-mono text-[11px]">{status.agentWallet}</span>.</>}
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold text-[#9d4925]">Agent wallets are unavailable on this deployment.</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{status.message ?? status.reason}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Sessions still work — Guard authorizes and you sign each transaction yourself. Only autonomous execution is off.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function SessionCard({ session, altana, editable, onChanged, onNotice, onError }: {
  session: SessionRow
  altana: AltanaStatus | null
  editable?: boolean
  onChanged?: () => void
  onNotice?: (message: string) => void
  onError?: (message: string) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [verification, setVerification] = useState<Verification | null>(null)
  const [editing, setEditing] = useState(false)

  const paused = session.status === 'Paused'
  const delegated = session.provider === 'ALTANA' && Boolean(session.sessionKey)

  async function call(label: string, request: () => Promise<Response>, success: (payload: Record<string, unknown>) => string | void) {
    setBusy(label)
    try {
      const response = await request()
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>
      if (!response.ok) {
        onError?.(typeof payload.error === 'string' ? payload.error : `Could not ${label}.`)
        return
      }
      const message = success(payload)
      if (message) onNotice?.(message)
      onChanged?.()
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className={`rounded-2xl border p-5 ${editable ? 'border-border bg-card' : 'border-border bg-muted/30'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{session.agentName}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {editable ? `Expires ${new Date(session.expiresAt).toLocaleString()}` : `Ended ${new Date(session.expiresAt).toLocaleDateString()}`}
            {' · '}chain {session.chainId}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
          paused ? 'bg-[#fff7f2] text-[#9d4925]' : editable ? 'bg-[#e8f6f0] text-[#138a61]' : 'bg-muted text-muted-foreground'
        }`}>
          {session.status}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Acts from">
          {delegated && session.agentWallet ? (
            <span className="flex items-center gap-1.5"><Bot size={13} aria-hidden /><span className="break-all font-mono text-[11px]">{session.agentWallet}</span></span>
          ) : (
            <span className="flex items-center gap-1.5"><Wallet size={13} aria-hidden />Your wallet, per signature</span>
          )}
        </Field>
        <Field label="Spend cap">{session.spendingLimit ? `${session.spendingLimit} BNB` : 'None — value-bearing actions refused'}</Field>
        <Field label="Granted">{new Date(session.createdAt).toLocaleDateString()}</Field>
      </dl>

      <Scope label="Allowed protocols" values={session.protocols} empty="None — this session cannot call any contract" />
      <Scope label="Allowed actions" values={session.permissions.map((permission) => PERMISSION_COPY[permission] ?? permission)} empty="None" />
      <Scope label="Allowed methods" values={session.methods} empty="None" muted />

      <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">On-chain delegation</p>
        {delegated ? (
          <div className="mt-1.5 text-xs leading-5 text-muted-foreground">
            <p className="flex items-center gap-1.5 font-medium text-[#138a61]"><CheckCircle2 size={13} aria-hidden /> Delegated to an Altana session key</p>
            <p className="mt-1 break-all font-mono text-[10px]">{session.sessionKey}</p>
            {session.grantTxHash && (
              <a href={session.verificationUrl ?? `${explorerFor(session.chainId)}/tx/${session.grantTxHash}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary underline underline-offset-2">
                Grant transaction <ExternalLink size={11} aria-hidden />
              </a>
            )}
            {verification && (
              <p className="mt-1.5">
                {verification.registeredOnChain === true ? 'Confirmed registered in the Altana KeyStore.'
                  : verification.registeredOnChain === false ? 'Not registered in the KeyStore.'
                  : verification.message ?? 'On-chain registration could not be read.'}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            Not delegated. Guard still authorizes every request, and you sign each transaction yourself.
            {altana?.available ? ' Activate an agent wallet to let this agent execute within these limits on its own.' : ''}
          </p>
        )}
      </div>

      <p className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-muted-foreground">
        <ShieldCheck size={13} className="mt-0.5 shrink-0" aria-hidden />
        Moving funds out of your wallet can never be granted. Permissions here can be reduced but never widened — to grant more, revoke and grant a new session.
      </p>

      {editable && (
        <>
          {editing && (
            <NarrowEditor
              session={session}
              busy={busy === 'update permissions'}
              onCancel={() => setEditing(false)}
              onSubmit={(body) => call('update permissions',
                () => fetch(`/api/sessions/${session.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
                (payload) => {
                  setEditing(false)
                  const delegation = payload.delegation as { onChainUpdated?: boolean; message?: string } | null
                  return delegation && delegation.onChainUpdated === false ? delegation.message : 'Permissions reduced.'
                })}
            />
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {!delegated && altana?.available && (
              <Action
                icon={<Bot size={14} aria-hidden />}
                label="Activate agent wallet"
                busy={busy === 'activate the agent wallet'}
                primary
                onClick={() => call('activate the agent wallet',
                  () => fetch(`/api/altana/session/${session.id}`, { method: 'POST' }),
                  () => 'Agent wallet activated. The allowlist and spend cap are now enforced on-chain.')}
              />
            )}
            {delegated && (
              <Action
                icon={<ScanSearch size={14} aria-hidden />}
                label="Verify on-chain"
                busy={busy === 'verify this session'}
                onClick={async () => {
                  setBusy('verify this session')
                  try {
                    const response = await fetch(`/api/altana/session/${session.id}`, { cache: 'no-store' })
                    setVerification(await response.json() as Verification)
                  } finally { setBusy(null) }
                }}
              />
            )}
            <Action
              icon={<SlidersHorizontal size={14} aria-hidden />}
              label={editing ? 'Close editor' : 'Edit permissions'}
              onClick={() => setEditing((current) => !current)}
            />
            <Action
              icon={paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
              label={paused ? 'Resume' : 'Pause'}
              busy={busy === (paused ? 'resume this session' : 'pause this session')}
              onClick={() => call(paused ? 'resume this session' : 'pause this session',
                () => fetch(`/api/sessions/${session.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paused: !paused }) }),
                () => paused ? 'Session resumed.' : 'Session paused. Every request is refused and pending authorizations were cancelled.')}
            />
            <Action
              icon={<Ban size={14} aria-hidden />}
              label="Revoke session"
              destructive
              busy={busy === 'revoke this session'}
              onClick={() => call('revoke this session',
                () => fetch(`/api/sessions/${session.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
                (payload) => {
                  const delegation = payload.delegation as { onChainRevoked?: boolean; message?: string } | null
                  return delegation && delegation.onChainRevoked === false ? delegation.message : 'Session revoked.'
                })}
            />
          </div>
        </>
      )}
    </article>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xs font-medium leading-5">{children}</dd>
    </div>
  )
}

function Scope({ label, values, empty, muted }: { label: string; values: string[]; empty: string; muted?: boolean }) {
  return (
    <div className="mt-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.length
          ? values.map((value) => (
            <span key={value} className={`rounded-md px-2 py-1 text-[11px] font-medium ${muted ? 'bg-muted font-mono text-muted-foreground' : 'bg-secondary text-secondary-foreground'}`}>
              {value}
            </span>
          ))
          : <span className="text-xs text-muted-foreground">{empty}</span>}
      </div>
    </div>
  )
}

/** Reduce-only editor. The form cannot express a widening, so it cannot request one. */
function NarrowEditor({ session, busy, onCancel, onSubmit }: {
  session: SessionRow
  busy: boolean
  onCancel: () => void
  onSubmit: (body: { permissions: string[]; spendingLimit?: number | null }) => void
}) {
  const [kept, setKept] = useState<string[]>(session.permissions)
  const currentLimit = session.spendingLimit ? Number(session.spendingLimit) : null
  const [limit, setLimit] = useState(currentLimit === null ? '' : String(currentLimit))

  const parsed = limit.trim() === '' ? null : Number(limit)
  const invalid = parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || (currentLimit !== null && parsed > currentLimit) || currentLimit === null)

  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
      <p className="text-sm font-semibold">Reduce this session</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Uncheck an action to remove it, or lower the spend cap. Adding an action or raising the cap is not possible here —
        the on-chain grant already fixes what this key can do, so widening requires a new session.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {session.permissions.map((permission) => (
          <label key={permission} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={kept.includes(permission)}
              onChange={(event) => setKept((current) => event.target.checked ? [...current, permission] : current.filter((item) => item !== permission))}
            />
            {PERMISSION_COPY[permission] ?? permission}
          </label>
        ))}
      </div>

      <label className="mt-3 block text-xs font-semibold">
        Spend cap (BNB){currentLimit !== null && <span className="font-normal text-muted-foreground"> — currently {currentLimit}, can only be lowered</span>}
        <input
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          inputMode="decimal"
          placeholder={currentLimit === null ? 'No cap set — cannot be added here' : String(currentLimit)}
          disabled={currentLimit === null}
          className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal disabled:opacity-50"
        />
      </label>
      {invalid && <p className="mt-2 text-xs text-destructive">A spend cap can only be lowered. Revoke and grant a new session to raise it.</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={busy || invalid}
          onClick={() => onSubmit({ permissions: kept, spendingLimit: currentLimit === null ? undefined : parsed })}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}Apply reduction
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold">Cancel</button>
      </div>
    </div>
  )
}

function Action({ icon, label, onClick, busy, destructive, primary }: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  busy?: boolean
  destructive?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${
        destructive ? 'border border-destructive/40 text-destructive'
          : primary ? 'bg-primary text-primary-foreground'
          : 'border border-border'
      }`}
    >
      {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : icon}{label}
    </button>
  )
}
