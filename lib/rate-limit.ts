/**
 * Lightweight in-process rate limiter.
 *
 * LIMITATION, stated plainly: this is per-instance memory. On a serverless platform
 * each concurrent instance keeps its own counters, so this raises the cost of casual
 * abuse but is NOT a substitute for an edge/WAF or a shared store (Redis, Upstash)
 * before a public launch. It is wired in front of the expensive and security-relevant
 * routes: auth, Guard authorization, sync, and the external-data proxies.
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_KEYS = 10_000

function sweep(now: number) {
  if (buckets.size < MAX_KEYS) return
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key)
}

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number }

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweep(now)
  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 }
  }
  existing.count += 1
  if (existing.count > limit) {
    return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) }
  }
  return { ok: true, remaining: limit - existing.count, retryAfterSeconds: 0 }
}

/** Best-effort client identity for rate limiting. */
export function clientKey(request: Request, scope: string) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown'
  return `${scope}:${ip}`
}

export function tooManyRequests(retryAfterSeconds: number) {
  return new Response(JSON.stringify({ error: 'Too many requests. Slow down and try again shortly.', code: 'RATE_LIMITED' }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': String(retryAfterSeconds) },
  })
}
