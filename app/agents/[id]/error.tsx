'use client'

import Link from 'next/link'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-20 md:px-8">
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold">Couldn&apos;t load this agent</h1>
        <p className="mt-2 text-sm text-muted-foreground">The agent record could not be read from the Kymera index.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={reset} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Retry</button>
          <Link href="/discover" className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold">Back to Discover</Link>
        </div>
      </div>
    </div>
  )
}
