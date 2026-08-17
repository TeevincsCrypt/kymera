export type PancakeToken = { address: string; symbol: string; decimals: number }

export type PancakePool = {
  id: string
  feeTier: number | null
  token0: PancakeToken
  token1: PancakeToken
  tvlUsd: number | null
  volume24hUsd: number | null
  apr: number | null
  feeApr: number | null
  updatedAt: string | null
  risk: 'Lower' | 'Moderate' | 'Higher' | 'Unknown'
}

type SourceName = 'PancakeSwap configured subgraph' | 'PancakeSwap fallback subgraph'
type Entity = 'pools' | 'pairs'
type Source = { name: SourceName; url: string; entity?: Entity }
type SourceState = { status: 'healthy' | 'unavailable' | 'not_configured'; lastSuccessfulSource: SourceName | null; lastSuccessfulFetch: string | null; details?: string }

const PRIMARY_URL = process.env.PANCAKESWAP_SUBGRAPH_URL?.trim() || ''
const FALLBACK_URL = process.env.PANCAKESWAP_SUBGRAPH_FALLBACK_URL?.trim() || ''
const CHAIN = process.env.PANCAKESWAP_CHAIN?.trim() || 'bsc'
let state: SourceState = { status: 'not_configured', lastSuccessfulSource: null, lastSuccessfulFetch: null }

function sources(): Source[] {
  const result: Source[] = []
  if (PRIMARY_URL) result.push({ name: 'PancakeSwap configured subgraph', url: PRIMARY_URL })
  if (FALLBACK_URL && FALLBACK_URL !== PRIMARY_URL) result.push({ name: 'PancakeSwap fallback subgraph', url: FALLBACK_URL })
  return result
}

function headers() {
  const value: Record<string, string> = { 'content-type': 'application/json' }
  const key = process.env.THEGRAPH_API_KEY?.trim()
  if (key) value.authorization = `Bearer ${key}`
  return value
}

async function queryAt<T>(source: Source, query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(source.url, { method: 'POST', headers: headers(), body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(12_000), cache: 'no-store' })
  if (!response.ok) throw new Error(`${source.name} returned HTTP ${response.status}`)
  const payload = await response.json() as { data?: T; errors?: Array<{ message?: string }> }
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message || 'GraphQL error').join('; '))
  if (!payload.data) throw new Error(`${source.name} returned no data`)
  return payload.data
}

const SCHEMA_QUERY = `{ __schema { queryType { fields { name } } } }`

async function inspectSource(source: Source): Promise<Source> {
  const data = await queryAt<{ __schema?: { queryType?: { fields?: Array<{ name?: string }> } } }>(source, SCHEMA_QUERY)
  const fields = new Set((data.__schema?.queryType?.fields || []).map((field) => field.name))
  const entity = fields.has('pools') ? 'pools' : fields.has('pairs') ? 'pairs' : null
  if (!entity) throw new Error('Query schema exposes neither pools nor pairs')
  const inspected = { ...source, entity: entity as Entity }
  const health = await queryAt<Record<string, unknown>>(inspected, `{ ${entity}(first: 1) { id } }`)
  if (!health[entity]) throw new Error(`${entity} entity returned no data`)
  return inspected
}

async function selectSource(): Promise<Source> {
  const configured = sources()
  if (!configured.length) throw new Error('Live PancakeSwap data is not configured')
  const failures: string[] = []
  for (const source of configured) {
    try {
      const inspected = await inspectSource(source)
      state = { status: 'healthy', lastSuccessfulSource: source.name, lastSuccessfulFetch: new Date().toISOString() }
      return inspected
    } catch (error) {
      failures.push(`${source.name}: ${error instanceof Error ? error.message : 'unavailable'}`)
    }
  }
  state = { ...state, status: 'unavailable', details: failures.join(' | ') }
  throw new Error(`Live PancakeSwap data unavailable (${failures.join(' | ')})`)
}

function numberOrNull(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null }

function normalizePool(row: Record<string, unknown>): PancakePool {
  const token0 = row.token0 as Record<string, unknown> | undefined
  const token1 = row.token1 as Record<string, unknown> | undefined
  const tvlUsd = numberOrNull(row.totalValueLockedUSD ?? row.tvlUSD ?? row.liquidityUSD)
  const volume24hUsd = numberOrNull(row.volumeUSD24H ?? row.volume24hUSD ?? row.volumeUSD)
  const apr = numberOrNull(row.apr ?? row.apr24h)
  const feeApr = numberOrNull(row.feeApr ?? row.feeAPR)
  const feeTier = numberOrNull(row.feeTier)
  const risk = tvlUsd === null ? 'Unknown' : tvlUsd >= 10_000_000 ? 'Lower' : tvlUsd >= 1_000_000 ? 'Moderate' : 'Higher'
  return { id: String(row.id || ''), feeTier, token0: { address: String(token0?.id || ''), symbol: String(token0?.symbol || 'Unknown'), decimals: Number(token0?.decimals || 18) }, token1: { address: String(token1?.id || ''), symbol: String(token1?.symbol || 'Unknown'), decimals: Number(token1?.decimals || 18) }, tvlUsd, volume24hUsd, apr, feeApr, updatedAt: row.updatedAt ? new Date(Number(row.updatedAt) * 1000).toISOString() : null, risk }
}

export async function getPancakeStatus() {
  const configured = sources().length > 0
  try { await selectSource() } catch { state = { ...state, status: configured ? 'unavailable' : 'not_configured' } }
  return { configured, chain: CHAIN, source: state.lastSuccessfulSource, sourceStatus: state.status, lastSuccessfulSource: state.lastSuccessfulSource, lastSuccessfulFetch: state.lastSuccessfulFetch, details: state.details ?? null, primaryConfigured: Boolean(PRIMARY_URL), fallbackConfigured: Boolean(FALLBACK_URL), execution: 'disabled' as const }
}

export async function listPancakePools(search = '', limit = 12): Promise<PancakePool[]> {
  const source = await selectSource()
  const boundedLimit = Math.min(50, Math.max(1, Math.floor(limit) || 12))
  const hasSearch = Boolean(search.trim())
  const entity = source.entity || 'pools'
  const where = hasSearch ? ', where: { id_contains_nocase: $search }' : ''
  const query = `query Pools($first: Int!${hasSearch ? ', $search: String!' : ''}) { ${entity}(first: $first${entity === 'pools' ? ', orderBy: totalValueLockedUSD, orderDirection: desc' : ''}${where}) { id feeTier totalValueLockedUSD tvlUSD liquidityUSD reserveUSD volumeUSD volumeUSD24H volume24hUSD apr apr24h feeApr feeAPR updatedAt token0 { id symbol decimals } token1 { id symbol decimals } } }`
  const variables: Record<string, unknown> = { first: boundedLimit }
  if (hasSearch) variables.search = search.trim()
  try {
    const data = await queryAt<{ pools?: Array<Record<string, unknown>> }>(source, query, variables)
    state = { status: 'healthy', lastSuccessfulSource: source.name, lastSuccessfulFetch: new Date().toISOString() }
    return ((data as Record<string, unknown[]>)[entity] || []).map(normalizePool).filter((pool) => pool.id)
  } catch (error) {
    const fallbackQuery = `query Pools($first: Int!) { ${entity}(first: $first${entity === 'pools' ? ', orderBy: totalValueLockedUSD, orderDirection: desc' : ''}) { id feeTier totalValueLockedUSD tvlUSD reserveUSD volumeUSD token0 { id symbol decimals } token1 { id symbol decimals } } }`
    const data = await queryAt<Record<string, Array<Record<string, unknown>>>>(source, fallbackQuery, { first: boundedLimit })
    const normalized = ((data as Record<string, Array<Record<string, unknown>>>)[entity] || []).map(normalizePool).filter((pool) => !search.trim() || `${pool.id} ${pool.token0.symbol} ${pool.token1.symbol}`.toLowerCase().includes(search.trim().toLowerCase()))
    state = { status: 'healthy', lastSuccessfulSource: source.name, lastSuccessfulFetch: new Date().toISOString(), details: `Reduced schema fallback: ${error instanceof Error ? error.message : 'query rejected'}` }
    return normalized
  }
}

export async function getPancakeOpportunities(task: string) {
  const pools = await listPancakePools('', 12)
  const query = task.toLowerCase()
  return pools.map((pool) => ({ pool, score: Math.round((pool.apr ?? 0) * 0.55 + Math.min(100, Math.log10(Math.max(pool.tvlUsd ?? 0, 1)) * 7) * 0.3 + (pool.risk === 'Lower' ? 15 : pool.risk === 'Moderate' ? 8 : 0)), reason: pool.apr === null ? 'APR unavailable; review pool metrics before acting.' : query.includes('lower-risk') || query.includes('low risk') ? `${pool.token0.symbol}/${pool.token1.symbol} ranked with liquidity depth and risk signal.` : `${pool.token0.symbol}/${pool.token1.symbol} ranked by reported APR, TVL, and risk signal.` }))
}

export function buildUnsignedActionPreview(pool: PancakePool, action: 'add_liquidity' | 'remove_liquidity' | 'swap') { return { action, poolId: pool.id, chain: CHAIN, status: 'PREVIEW_ONLY', executable: false, reason: 'Unsigned preview only. Guard authorization and a verified wallet execution provider are required.' } }
