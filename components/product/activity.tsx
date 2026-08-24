'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { ActivityItem, Empty, PageHeader, RequireWallet, type ActivityRow, type Summary } from '@/components/product/shared'

/**
 * Filters map one-to-one onto settlement states. A row belongs to exactly one of them,
 * so a real transaction can never be counted as an authorization that never happened.
 */
const FILTERS = [
  { id: 'all', label: 'Everything', settlement: null },
  { id: 'onchain', label: 'On chain', settlement: 'ON_CHAIN' },
  { id: 'blocked', label: 'Blocked', settlement: 'BLOCKED' },
  { id: 'awaiting', label: 'Awaiting signature', settlement: 'AWAITING_SIGNATURE' },
  { id: 'unsettled', label: 'Not settled', settlement: 'NOT_SETTLED' },
] as const

/** The audit trail: every Guard decision made for this wallet, blocks included. */
export function ActivityPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-14">
      <PageHeader
        eyebrow="Activity"
        title="Everything your agents have done."
        description="Approved and blocked alike, with the exact rule that decided each one. This is the record — nothing an agent requests is hidden from it."
      />
      <p className="mt-6 rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs leading-5 text-muted-foreground">
        Every row here is a real request against real limits. Guard dry-runs are simulations and are deliberately
        never recorded — they reserve nothing and decide nothing, so they cannot appear in an audit trail.
      </p>
      <div className="mt-10"><RequireWallet title="Your activity"><Body /></RequireWallet></div>
    </div>
  )
}

function Body() {
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/dashboard/summary', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as Summary & { error?: string }
        if (!response.ok) throw new Error(payload.error || 'Could not load activity')
        setRows(payload.activity)
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load activity'))
      .finally(() => setLoading(false))
  }, [])

  const visible = useMemo(() => {
    const target = FILTERS.find((item) => item.id === filter)?.settlement
    return target ? rows.filter((row) => row.settlement === target) : rows
  }, [rows, filter])

  // Grouping by day makes an audit trail scannable rather than an undifferentiated list.
  const grouped = useMemo(() => {
    const map = new Map<string, ActivityRow[]>()
    for (const row of visible) {
      const key = new Date(row.createdAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
      map.set(key, [...(map.get(key) ?? []), row])
    }
    return [...map.entries()]
  }, [visible])

  if (loading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" aria-hidden /> Loading activity…</p>
  if (error) return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => {
          const count = item.settlement ? rows.filter((row) => row.settlement === item.settlement).length : rows.length
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              aria-pressed={filter === item.id}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition ${filter === item.id ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {item.label} <span className="ml-1 tabular-nums opacity-60">{count}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-6">
        {grouped.length ? (
          <div className="flex flex-col gap-8">
            {grouped.map(([day, items]) => (
              <section key={day}>
                <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{day}</h2>
                <div className="mt-3 flex flex-col gap-2.5">
                  {items.map((row) => <ActivityItem key={row.id} row={row} />)}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <Empty
            title={rows.length ? `Nothing in ${FILTERS.find((item) => item.id === filter)?.label.toLowerCase()}` : 'No activity yet'}
            body={rows.length ? 'Try another filter.' : 'Once an agent requests an action, every Guard decision is recorded here — including the ones it refuses.'}
          />
        )}
      </div>
    </div>
  )
}
