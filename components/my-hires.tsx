'use client'

import { useEffect, useState } from 'react'

type Hire = {
  id: string
  status: string
  paymentStatus: string
  paymentProvider: string
  amount: string | number
  currency: string
  task: string
  agent?: { name?: string } | null
}

export function MyHires() {
  const [hires, setHires] = useState<Hire[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/hires', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Could not load hires')
        setHires(payload.hires || [])
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load hires'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Hires</p>
          <p className="mt-1 text-xs text-muted-foreground">Agent engagements recorded for your wallet.</p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{hires.length}</span>
      </div>

      {loading ? (
        <p className="mt-5 text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="mt-5 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      ) : hires.length ? (
        <>
          <div className="mt-5 flex flex-col gap-3">
            {hires.map((hire) => (
              <div key={hire.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{hire.agent?.name || 'Agent hire'}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{hire.task}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{String(hire.amount)} {hire.currency}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{hire.status} · {hire.paymentStatus}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
            Billing runs through the <strong>{hires[0]?.paymentProvider ?? 'demo'}</strong> provider. No payment is charged or settled on-chain — hires record intent only.
          </p>
        </>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No hires yet.</p>
      )}
    </section>
  )
}
