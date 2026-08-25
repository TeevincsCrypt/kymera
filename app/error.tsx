'use client'

import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Kymera page error:', error) }, [error])
  return (
    <div className="mx-auto max-w-3xl px-5 py-20 md:px-8">
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <h1 className="text-xl font-semibold">Something went wrong on this page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This is a Kymera error, not a wallet or transaction failure. Nothing was signed or submitted.
        </p>
        {error.digest && <p className="mt-3 font-mono text-[11px] text-muted-foreground">Reference: {error.digest}</p>}
        <button type="button" onClick={reset} className="mt-6 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
          Try again
        </button>
      </div>
    </div>
  )
}
