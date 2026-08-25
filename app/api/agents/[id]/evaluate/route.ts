import { NextResponse } from 'next/server'
import { requireWallet } from '@/lib/auth/require'
import { latestEvaluation, runEvaluation } from '@/lib/evaluation/run'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/** The most recent recorded evaluation, including the full reasoning breakdown. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const evaluation = await latestEvaluation((await params).id)
  if (!evaluation) return NextResponse.json({ evaluation: null, status: 'UNEVALUATED' })
  return NextResponse.json({
    evaluation: {
      score: evaluation.score,
      sufficientEvidence: evaluation.sufficientEvidence,
      evidenceCount: evaluation.evidenceCount,
      method: evaluation.method,
      breakdown: evaluation.breakdown,
      createdAt: evaluation.createdAt,
    },
    status: evaluation.sufficientEvidence ? 'EVALUATED' : 'INSUFFICIENT_EVIDENCE',
  })
}

/** Re-run the evaluation for one agent, optionally probing its published endpoint. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limit = rateLimit(clientKey(request, 'evaluate'), 10, 60_000)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds)

  const auth = await requireWallet()
  if ('response' in auth) return auth.response

  const body = await request.json().catch(() => ({})) as { probe?: unknown }
  const result = await runEvaluation((await params).id, { probe: body.probe === true })
  if (!result) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  return NextResponse.json({
    score: result.score,
    label: result.label,
    sufficientEvidence: result.sufficientEvidence,
    evidenceCount: result.evidenceCount,
    components: result.components,
    explanation: result.explanation,
    method: result.method,
  })
}
