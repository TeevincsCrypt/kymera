/**
 * Kymera Score — evidence-based agent evaluation.
 *
 * Rules this module is built to obey:
 *   - Never invent a number. A component with no evidence contributes nothing and is
 *     reported as unavailable, not as a zero or a guess.
 *   - If too few components have evidence, there is no score at all — the result is
 *     `Insufficient evaluation data`, which is a legitimate answer.
 *   - Every score is explainable: each component states what evidence produced it.
 *   - Scoring is deterministic. The same inputs always produce the same score.
 */

export const SCORE_METHOD = 'kymera-score-v1'

/** At least this many components must have real evidence before a score is produced. */
export const MIN_COMPONENTS_FOR_SCORE = 3

export type ScoreComponentId = 'identity' | 'metadata' | 'capability' | 'reliability' | 'endpoint'

export type ScoreComponent = {
  id: ScoreComponentId
  label: string
  weight: number
  /** 0-100, or null when there is no evidence to judge this component. */
  value: number | null
  evidence: string
}

export type EvaluationResult = {
  score: number | null
  sufficientEvidence: boolean
  label: 'Evaluated' | 'Insufficient evaluation data'
  components: ScoreComponent[]
  evidenceCount: number
  method: string
  /** Plain-language summary of why the agent received this score. */
  explanation: string[]
}

export type EvaluationEvidence = {
  erc8004TokenId?: string | null
  erc8004RegistryAddress?: string | null
  erc8004MetadataUri?: string | null
  erc8004MetadataHash?: string | null
  ownerAddress?: string | null
  name?: string | null
  description?: string | null
  capabilities?: unknown
  supportedProtocols?: unknown
  capabilityItemCount?: number
  endpoint?: string | null
  /** Real Guard execution history. Undefined when the agent has never executed. */
  executions?: { confirmed: number; failed: number }
  /** Reachability probe result. Undefined when no probe was performed. */
  endpointReachable?: boolean | null
}

const WEIGHTS: Record<ScoreComponentId, number> = {
  identity: 0.25,
  metadata: 0.2,
  capability: 0.15,
  reliability: 0.25,
  endpoint: 0.15,
}

function listLength(value: unknown) {
  return Array.isArray(value) ? value.filter(Boolean).length : 0
}

function scoreIdentity(evidence: EvaluationEvidence): ScoreComponent {
  const signals: string[] = []
  let value = 0
  if (evidence.erc8004TokenId) { value += 40; signals.push('registry token id') }
  if (evidence.erc8004RegistryAddress) { value += 20; signals.push('registry address') }
  if (evidence.erc8004MetadataUri) { value += 20; signals.push('metadata URI') }
  if (evidence.erc8004MetadataHash) { value += 10; signals.push('metadata hash') }
  if (evidence.ownerAddress && /^0x[a-fA-F0-9]{40}$/.test(evidence.ownerAddress)) { value += 10; signals.push('resolvable owner address') }

  return {
    id: 'identity',
    label: 'On-chain identity',
    weight: WEIGHTS.identity,
    value: signals.length ? Math.min(100, value) : null,
    evidence: signals.length ? `ERC-8004 identity confirmed by ${signals.join(', ')}` : 'No ERC-8004 identity record found',
  }
}

function scoreMetadata(evidence: EvaluationEvidence): ScoreComponent {
  const description = typeof evidence.description === 'string' ? evidence.description.trim() : ''
  const name = typeof evidence.name === 'string' ? evidence.name.trim() : ''
  const capabilities = listLength(evidence.capabilities)
  const protocols = listLength(evidence.supportedProtocols)
  const present = Boolean(name || description || capabilities || protocols)
  if (!present) {
    return { id: 'metadata', label: 'Published metadata', weight: WEIGHTS.metadata, value: null, evidence: 'Registry published no usable metadata' }
  }
  let value = 0
  const signals: string[] = []
  if (name.length >= 3) { value += 20; signals.push('name') }
  if (description.length >= 40) { value += 35; signals.push(`description (${description.length} chars)`) }
  else if (description.length >= 10) { value += 15; signals.push('short description') }
  if (capabilities > 0) { value += Math.min(25, capabilities * 8); signals.push(`${capabilities} declared capabilities`) }
  if (protocols > 0) { value += Math.min(20, protocols * 10); signals.push(`${protocols} declared protocols`) }

  return {
    id: 'metadata',
    label: 'Published metadata',
    weight: WEIGHTS.metadata,
    value: Math.min(100, value),
    evidence: `Metadata includes ${signals.join(', ')}`,
  }
}

function scoreCapability(evidence: EvaluationEvidence): ScoreComponent {
  const items = evidence.capabilityItemCount ?? 0
  const declared = listLength(evidence.capabilities)
  const total = items + declared
  if (total === 0) {
    return { id: 'capability', label: 'Capability detail', weight: WEIGHTS.capability, value: null, evidence: 'No capabilities were indexed for this agent' }
  }
  return {
    id: 'capability',
    label: 'Capability detail',
    weight: WEIGHTS.capability,
    value: Math.min(100, total * 20),
    evidence: `${total} indexed capability entr${total === 1 ? 'y' : 'ies'}`,
  }
}

function scoreReliability(evidence: EvaluationEvidence): ScoreComponent {
  const executions = evidence.executions
  const total = executions ? executions.confirmed + executions.failed : 0
  if (!executions || total === 0) {
    return {
      id: 'reliability',
      label: 'Execution reliability',
      weight: WEIGHTS.reliability,
      value: null,
      evidence: 'No Guard-executed transactions recorded yet',
    }
  }
  return {
    id: 'reliability',
    label: 'Execution reliability',
    weight: WEIGHTS.reliability,
    value: Math.round((executions.confirmed / total) * 100),
    evidence: `${executions.confirmed} of ${total} Guard-authorized transactions confirmed on-chain`,
  }
}

function scoreEndpoint(evidence: EvaluationEvidence): ScoreComponent {
  if (evidence.endpointReachable === undefined || evidence.endpointReachable === null) {
    return {
      id: 'endpoint',
      label: 'Endpoint availability',
      weight: WEIGHTS.endpoint,
      value: null,
      evidence: evidence.endpoint ? 'Endpoint published but not probed' : 'No endpoint published',
    }
  }
  return {
    id: 'endpoint',
    label: 'Endpoint availability',
    weight: WEIGHTS.endpoint,
    value: evidence.endpointReachable ? 100 : 0,
    evidence: evidence.endpointReachable ? 'Published endpoint responded to a reachability probe' : 'Published endpoint did not respond',
  }
}

export function evaluateAgent(evidence: EvaluationEvidence): EvaluationResult {
  const components = [
    scoreIdentity(evidence),
    scoreMetadata(evidence),
    scoreCapability(evidence),
    scoreReliability(evidence),
    scoreEndpoint(evidence),
  ]

  const scored = components.filter((component) => component.value !== null)
  const evidenceCount = scored.length

  if (evidenceCount < MIN_COMPONENTS_FOR_SCORE) {
    return {
      score: null,
      sufficientEvidence: false,
      label: 'Insufficient evaluation data',
      components,
      evidenceCount,
      method: SCORE_METHOD,
      explanation: [
        `Only ${evidenceCount} of ${components.length} evaluation signals had evidence; Kymera requires at least ${MIN_COMPONENTS_FOR_SCORE}.`,
        ...components.filter((component) => component.value === null).map((component) => `${component.label}: ${component.evidence}`),
      ],
    }
  }

  // Renormalise across only the components that had evidence, so a missing signal
  // neither penalises nor flatters the agent.
  const totalWeight = scored.reduce((sum, component) => sum + component.weight, 0)
  const score = Math.round(scored.reduce((sum, component) => sum + (component.value as number) * component.weight, 0) / totalWeight)

  return {
    score,
    sufficientEvidence: true,
    label: 'Evaluated',
    components,
    evidenceCount,
    method: SCORE_METHOD,
    explanation: [
      `Scored ${score}/100 from ${evidenceCount} evidence signals, weighted and renormalised.`,
      ...scored.map((component) => `${component.label} ${component.value}/100 (weight ${Math.round((component.weight / totalWeight) * 100)}%) — ${component.evidence}`),
      ...components.filter((component) => component.value === null).map((component) => `${component.label}: not counted — ${component.evidence}`),
    ],
  }
}

export function formatScore(score: number | null) {
  return score === null ? 'Insufficient evaluation data' : String(score)
}
