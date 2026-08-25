'use client'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-20 md:px-8">
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold">Couldn&apos;t load this page</h1>
        <p className="mt-2 text-sm text-muted-foreground">Kymera could not reach its database. No transaction was affected.</p>
        <button type="button" onClick={reset} className="mt-6 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Retry</button>
      </div>
    </div>
  )
}
