/**
 * Evaluation persistence tests. These cover the write path, not just the scoring
 * maths — a scoring function that computes correctly but fails to persist leaves the
 * whole catalog permanently unevaluated, which is exactly the bug this suite guards.
 */

import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { runEvaluation, runEvaluationBatch } from '@/lib/evaluation/run'
import { createAgent, prisma, resetDatabase } from './helpers/db'

describe('Evaluation pipeline persistence', () => {
  after(async () => { await prisma.$disconnect() })

  test('persists a score and promotes the trust tier', async () => {
    await resetDatabase()
    const agent = await createAgent({ erc8004TokenId: '77' })

    const result = await runEvaluation(agent.id, { probe: false })
    assert.ok(result)
    assert.equal(result.sufficientEvidence, true)

    const stored = await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })
    assert.equal(stored.kymeraScore, result.score)
    assert.equal(stored.evaluationStatus, 'EVALUATED')
    assert.equal(stored.trustTier, 'EVALUATED')
    assert.ok(stored.kymeraEvaluatedAt)

    const evaluation = await prisma.agentEvaluation.findFirstOrThrow({ where: { agentId: agent.id } })
    assert.equal(evaluation.score, result.score)
    const breakdown = evaluation.breakdown as { explanation?: string[]; components?: unknown[] }
    assert.ok((breakdown.explanation?.length ?? 0) > 0, 'the reasoning must be persisted')
    assert.ok((breakdown.components?.length ?? 0) > 0)
  })

  test('a batch run reports no failures', async () => {
    await resetDatabase()
    await createAgent({ name: 'A', erc8004TokenId: '1' })
    await createAgent({ name: 'B', erc8004TokenId: '2' })

    const summary = await runEvaluationBatch({ limit: 10, probe: false })
    assert.equal(summary.failed, 0, 'no agent should fail to evaluate')
    assert.equal(summary.requested, 2)
    assert.equal(summary.evaluated, 2)
  })

  test('a manually VETTED agent is never downgraded by a re-evaluation', async () => {
    await resetDatabase()
    const agent = await createAgent({ erc8004TokenId: '88' })
    await prisma.agent.update({ where: { id: agent.id }, data: { trustTier: 'VETTED' } })

    await runEvaluation(agent.id, { probe: false })

    const stored = await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })
    assert.equal(stored.trustTier, 'VETTED')
  })

  test('an agent with an on-chain identity scores above an otherwise identical local one', async () => {
    await resetDatabase()
    const registered = await createAgent({ name: 'Registered', erc8004TokenId: '99' })
    const local = await createAgent({ name: 'Local' })

    const registeredResult = await runEvaluation(registered.id, { probe: false })
    const localResult = await runEvaluation(local.id, { probe: false })

    assert.ok((registeredResult?.score ?? 0) > (localResult?.score ?? 0))
  })

  test('returns null for an unknown agent rather than throwing', async () => {
    await resetDatabase()
    assert.equal(await runEvaluation('does-not-exist', { probe: false }), null)
  })
})
