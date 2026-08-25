export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-14 md:px-8">
      <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="mt-4 h-5 w-96 animate-pulse rounded bg-muted" />
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="h-48 animate-pulse rounded-2xl bg-muted" />
        <div className="h-48 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  )
}
