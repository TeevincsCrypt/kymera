export type PerformanceInput = {
  kymeraScore?: number | null
  successRate?: number | null
  tasksCompleted?: number | null
  avgExecutionTime?: number | null
}

export type ScoreBreakdown = {
  score: number | null
  evaluated: boolean
  label: 'Evaluated' | 'Not yet evaluated'
  components: { reliability: number | null; volume: number | null; speed: number | null; metadata: number }
}

export function metadataQuality(agent: { name?: string | null; description?: string | null; capabilities?: unknown; supportedProtocols?: unknown }) {
  const fields = [agent.name, agent.description].filter((value) => typeof value === 'string' && value.trim().length > 10).length
  const lists = [agent.capabilities, agent.supportedProtocols].filter((value) => Array.isArray(value) && value.length > 0).length
  return Math.min(100, fields * 25 + lists * 25)
}

export function scoreAgent(agent: { performance?: PerformanceInput | null; name?: string | null; description?: string | null; capabilities?: unknown; supportedProtocols?: unknown }): ScoreBreakdown {
  const performance = agent.performance
  const metadata = metadataQuality(agent)
  if (!performance) return { score: null, evaluated: false, label: 'Not yet evaluated', components: { reliability: null, volume: null, speed: null, metadata } }
  const reliability = Math.max(0, Math.min(100, Number(performance.successRate ?? 0)))
  const volume = Math.min(100, Math.log10(Math.max(1, Number(performance.tasksCompleted ?? 0))) * 25)
  const speed = Math.max(0, Math.min(100, 100 - Number(performance.avgExecutionTime ?? 100)))
  const score = Math.round(reliability * 0.45 + volume * 0.2 + speed * 0.15 + metadata * 0.2)
  return { score, evaluated: true, label: 'Evaluated', components: { reliability, volume, speed, metadata } }
}

export function formatScore(score: number | null) { return score == null ? 'Not yet evaluated' : String(score) }
