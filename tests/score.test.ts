/**
 * Kymera Score tests. The property that matters most is honesty: with too little
 * evidence there must be NO score, not a low one.
 */

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { MIN_COMPONENTS_FOR_SCORE, evaluateAgent, formatScore } from '@/lib/evaluation/score'

const richEvidence = {
  erc8004TokenId: '42',
  erc8004RegistryAddress: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  erc8004MetadataUri: 'https://example.com/agent.json',
  erc8004MetadataHash: 'abc123',
  ownerAddress: '0x1111111111111111111111111111111111111111',
  name: 'Cobalt Yield',
  description: 'Monitors PancakeSwap yield opportunities and flags risk before capital moves anywhere.',
  capabilities: ['yield', 'risk', 'alerts'],
  supportedProtocols: ['A2A', 'MCP'],
  capabilityItemCount: 3,
  endpoint: 'https://example.com',
  executions: { confirmed: 9, failed: 1 },
  endpointReachable: true,
}

describe('Kymera Score', () => {
  test('produces a score when evidence is sufficient', () => {
    const result = evaluateAgent(richEvidence)
    assert.equal(result.sufficientEvidence, true)
    assert.equal(result.label, 'Evaluated')
    assert.ok(result.score !== null && result.score > 0 && result.score <= 100)
  })

  test('is deterministic — identical evidence yields an identical score', () => {
    const a = evaluateAgent(richEvidence)
    const b = evaluateAgent(richEvidence)
    assert.equal(a.score, b.score)
    assert.deepEqual(a.components, b.components)
  })

  test('returns no score at all when evidence is insufficient', () => {
    const result = evaluateAgent({ name: 'Mystery Agent' })
    assert.equal(result.score, null)
    assert.equal(result.sufficientEvidence, false)
    assert.equal(result.label, 'Insufficient evaluation data')
    assert.ok(result.evidenceCount < MIN_COMPONENTS_FOR_SCORE)
  })

  test('components without evidence are null, never zero', () => {
    const result = evaluateAgent({
      name: 'Local Agent',
      description: 'A locally registered agent with a reasonable description and some capabilities.',
      capabilities: ['analysis'],
      capabilityItemCount: 1,
      ownerAddress: '0x1111111111111111111111111111111111111111',
    })
    const reliability = result.components.find((component) => component.id === 'reliability')
    const endpoint = result.components.find((component) => component.id === 'endpoint')
    assert.equal(reliability?.value, null, 'no executions means no reliability measurement')
    assert.equal(endpoint?.value, null, 'no probe means no endpoint measurement')
  })

  test('an agent with an on-chain identity outscores an otherwise identical local one', () => {
    const local = evaluateAgent({ ...richEvidence, erc8004TokenId: null, erc8004RegistryAddress: null, erc8004MetadataUri: null, erc8004MetadataHash: null })
    const registered = evaluateAgent(richEvidence)
    assert.ok((registered.score ?? 0) > (local.score ?? 0), 'registry identity should raise the score')
  })

  test('a failing execution history lowers the score', () => {
    const reliable = evaluateAgent({ ...richEvidence, executions: { confirmed: 10, failed: 0 } })
    const unreliable = evaluateAgent({ ...richEvidence, executions: { confirmed: 1, failed: 9 } })
    assert.ok((reliable.score ?? 0) > (unreliable.score ?? 0))
  })

  test('scores stay within 0-100', () => {
    const maxed = evaluateAgent({
      ...richEvidence,
      capabilities: Array.from({ length: 50 }, (_, index) => `capability-${index}`),
      supportedProtocols: Array.from({ length: 50 }, (_, index) => `protocol-${index}`),
      capabilityItemCount: 500,
      executions: { confirmed: 10_000, failed: 0 },
    })
    assert.ok(maxed.score !== null && maxed.score >= 0 && maxed.score <= 100)
    for (const component of maxed.components) {
      if (component.value !== null) assert.ok(component.value >= 0 && component.value <= 100, `${component.id} out of range`)
    }
  })

  test('every scored component carries an explanation', () => {
    const result = evaluateAgent(richEvidence)
    for (const component of result.components) assert.ok(component.evidence.length > 0)
    assert.ok(result.explanation.length > 1)
  })

  test('formatScore never renders a missing score as a number', () => {
    assert.equal(formatScore(null), 'Insufficient evaluation data')
    assert.equal(formatScore(72), '72')
  })
})
