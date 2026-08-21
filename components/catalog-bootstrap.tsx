'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Database, Loader2, RefreshCw } from 'lucide-react'

type Health = {
  catalogTotal: number
  databaseReachable: boolean
  lastSuccessfulSync: string | null
  config?: { network?: string; scanApiUrl?: string; rpcReachable?: boolean; rpcError?: string }
}

type SyncResult = {
  syncStatus?: string
  agentsDiscovered?: number
  agentsCreated?: number
  agentsUpdated?: number
  agentsScored?: number
  agentsFailed?: number
  catalogTotal?: number
  error?: string
  hint?: string
  errors?: string[]
}

/**
 * Populates the marketplace from the live ERC-8004 registry index.
 *
 * Shown whenever the catalog is empty, because "no agents" is almost never the truth —
 * it means the database is unreachable or the registry has not been indexed yet, and
 * the user needs to be told which.
 */
export function CatalogBootstrap({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const [health, setHealth] = useState<Health | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [running, setRunning] = useState(false)

  const loadHealth = useCallback(() => {
    fetch('/api/agents/sync', { cache: 'no-store' })
      .then((response) => response.json())
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])

  useEffect(() => { loadHealth() }, [loadHealth])

  async function sync(pages: number) {
    setRunning(true); setResult(null)
    try {
      const response = await fetch('/api/agents/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pages }),
      })
      const payload = await response.json() as SyncResult
      setResult(payload)
      loadHealth()
      if (payload.syncStatus === 'success') router.refresh()
    } catch {
      setResult({ syncStatus: 'failed', error: 'Could not reach the sync endpoint.' })
    } finally {
      setRunning(false)
    }
  }

  const dbDown = health && !health.databaseReachable

  return (
    <div className={`rounded-2xl border ${dbDown ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card'} ${compact ? 'p-5' : 'p-6'}`}>
      <div className="flex items-start gap-3">
        {dbDown
          ? <AlertTriangle size={18} className="mt-0.5 shrink-0 text-destructive" aria-hidden />
          : <Database size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />}
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">
            {dbDown ? 'The Kymera database is unreachable' : 'Index the ERC-8004 registry'}
          </h3>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            {dbDown
              ? 'Agents cannot be listed because the database connection failed. Check DATABASE_URL and that migrations have been applied.'
              : 'BNB Chain hosts the largest population of ERC-8004 registered agents. Pull them into the marketplace — identity, capabilities, and category are indexed and scored on import.'}
          </p>

          {health && !dbDown && (
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-muted-foreground">
              <div className="flex gap-1.5"><dt>Catalog:</dt><dd className="text-foreground">{health.catalogTotal.toLocaleString()} agents</dd></div>
              {health.config?.network && <div className="flex gap-1.5"><dt>Network:</dt><dd className="text-foreground">{health.config.network}</dd></div>}
              {health.lastSuccessfulSync && <div className="flex gap-1.5"><dt>Last sync:</dt><dd className="text-foreground">{new Date(health.lastSuccessfulSync).toLocaleString()}</dd></div>}
            </dl>
          )}

          {!dbDown && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => sync(5)} disabled={running} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {running ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />}
                {running ? 'Indexing…' : 'Index agents'}
              </button>
              <button type="button" onClick={() => sync(50)} disabled={running} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium disabled:opacity-50">
                Deep index (up to 5,000)
              </button>
            </div>
          )}

          {result && (
            <div className={`mt-4 rounded-xl p-3 text-xs leading-6 ${result.syncStatus === 'success' ? 'bg-[#e8f6f0] text-[#0f6b4a]' : 'bg-destructive/10 text-destructive'}`}>
              {result.syncStatus === 'success' ? (
                <>
                  Indexed <strong>{result.agentsDiscovered?.toLocaleString()}</strong> agents —{' '}
                  {result.agentsCreated?.toLocaleString()} new, {result.agentsUpdated?.toLocaleString()} updated,{' '}
                  {result.agentsScored?.toLocaleString()} scored
                  {result.agentsFailed ? `, ${result.agentsFailed} failed` : ''}. Catalog now holds {result.catalogTotal?.toLocaleString()}.
                </>
              ) : (
                <>
                  <strong>Sync failed.</strong> {result.error}
                  {result.hint && <span className="mt-1 block opacity-80">{result.hint}</span>}
                  {result.errors?.length ? <span className="mt-1 block font-mono opacity-80">{result.errors[0]}</span> : null}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
