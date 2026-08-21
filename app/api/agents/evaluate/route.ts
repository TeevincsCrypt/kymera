import { NextResponse } from 'next/server'
import { runEvaluationBatch } from '@/lib/evaluation/run'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Batch evaluation. This walks the catalog and probes third-party endpoints, so it is
 * gated behind an operator token rather than a user session. Without
 * KYMERA_ADMIN_TOKEN configured the route is closed entirely.
 */
export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, 'evaluate-batch'), 5, 60_000)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds)

  const expected = process.env.KYMERA_ADMIN_TOKEN?.trim()
  if (!expected) return NextResponse.json({ error: 'Batch evaluation is disabled: KYMERA_ADMIN_TOKEN is not configured.' }, { status: 503 })
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!provided || provided !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { limit?: unknown; probe?: unknown; onlyUnevaluated?: unknown }
  const summary = await runEvaluationBatch({
    limit: body.limit === undefined ? undefined : Number(body.limit),
    probe: body.probe === true,
    onlyUnevaluated: body.onlyUnevaluated === true,
  })
  return NextResponse.json({ summary })
}
