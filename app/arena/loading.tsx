export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-14 md:px-8">
      <div className="h-12 w-72 animate-pulse rounded-lg bg-muted" />
      <div className="mt-6 h-5 w-96 animate-pulse rounded bg-muted" />
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <div className="h-80 animate-pulse rounded-2xl bg-muted" />
        <div className="h-80 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  )
}
