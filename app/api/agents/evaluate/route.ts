import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runEvaluationBatch } from '@/lib/evaluation/run'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Batch-evaluates indexed agents.
 *
 * Scoring without `probe` is pure computation over data Kymera already stores — no
 * outbound requests, no user data — so it is open and rate limited. `probe: true`
 * makes the server fetch third-party agent endpoints, which is a real SSRF-shaped
 * capability, so that mode still requires KYMERA_ADMIN_TOKEN.
 *
 * Without this, agents imported before scoring existed stay "Not evaluated" forever,
 * which also makes Arena exclude them from its evaluation measure.
 */
export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, 'evaluate-batch'), 10, 60_000)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds)

  const body = await request.json().catch(() => ({})) as { limit?: unknown; probe?: unknown; onlyUnevaluated?: unknown }
  const probe = body.probe === true

  if (probe) {
    const expected = process.env.KYMERA_ADMIN_TOKEN?.trim()
    if (!expected) return NextResponse.json({ error: 'Endpoint probing is disabled: KYMERA_ADMIN_TOKEN is not configured.' }, { status: 503 })
    const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    if (!provided || provided !== expected) return NextResponse.json({ error: 'Endpoint probing requires an operator token.' }, { status: 401 })
  }

  try {
    const summary = await runEvaluationBatch({
      limit: body.limit === undefined ? 200 : Number(body.limit),
      probe,
      // Default to only-unevaluated so repeated clicks make forward progress
      // instead of re-scoring the same agents.
      onlyUnevaluated: body.onlyUnevaluated !== false,
    })
    const remaining = await prisma.agent.count({ where: { evaluationStatus: 'UNEVALUATED' } })
    return NextResponse.json({ summary, remaining })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message.slice(0, 300) : 'Evaluation failed' }, { status: 500 })
  }
}

/** How much of the catalog still needs scoring. */
export async function GET() {
  try {
    const [total, unevaluated, evaluated] = await Promise.all([
      prisma.agent.count(),
      prisma.agent.count({ where: { evaluationStatus: 'UNEVALUATED' } }),
      prisma.agent.count({ where: { evaluationStatus: 'EVALUATED' } }),
    ])
    return NextResponse.json({ total, unevaluated, evaluated })
  } catch {
    return NextResponse.json({ total: 0, unevaluated: 0, evaluated: 0, error: 'Database unavailable' }, { status: 503 })
  }
}
