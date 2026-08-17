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

type SourceName = 'PancakeSwap V3 BNB primary' | 'PancakeSwap V3 BNB secondary' | 'PancakeSwap configured subgraph' | 'PancakeSwap fallback subgraph'
type Entity = 'pools' | 'pool' | 'pairs' | 'liquidityPools' | 'liquidityPool'
type Source = { name: SourceName; url: string; entity?: Entity; rootFields?: string[]; entityFields?: string[] }
type SourceState = { status: 'healthy' | 'unavailable' | 'not_configured'; lastSuccessfulSource: SourceName | null; lastSuccessfulFetch: string | null; endpoint?: string; rootFields?: string[]; poolEntity?: string; samplePools?: number; details?: string }

const PRIMARY_URL = 'https://gateway.thegraph.com/api/subgraphs/id/GfxzNT93ZkgAQwm6RP83iqJ6pBZj11HvFLUoEoX2PD5H'
const SECONDARY_URL = 'https://gateway.thegraph.com/api/subgraphs/id/A1fvJWQLBeUAggX2WQTMm3FKjXTekNXo77ZySun4YN2m'
const CONFIGURED_URL = process.env.PANCAKESWAP_SUBGRAPH_URL?.trim() || ''
const FALLBACK_URL = process.env.PANCAKESWAP_SUBGRAPH_FALLBACK_URL?.trim() || ''
const CHAIN = 'bsc'
let state: SourceState = { status: 'not_configured', lastSuccessfulSource: null, lastSuccessfulFetch: null }

function sources(): Source[] {
  const result: Source[] = []
  const urls = [
    { name: 'PancakeSwap V3 BNB primary' as const, url: PRIMARY_URL },
    { name: 'PancakeSwap V3 BNB secondary' as const, url: SECONDARY_URL },
    ...(CONFIGURED_URL ? [{ name: 'PancakeSwap configured subgraph' as const, url: CONFIGURED_URL }] : []),
    ...(FALLBACK_URL ? [{ name: 'PancakeSwap fallback subgraph' as const, url: FALLBACK_URL }] : []),
  ]
  for (const source of urls) if (!result.some((item) => item.url === source.url)) result.push(source)
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

const SCHEMA_QUERY = `{ __schema { queryType { fields { name } } types { name kind fields { name } } } }`

type SchemaResponse = { __schema?: { queryType?: { fields?: Array<{ name?: string }> }; types?: Array<{ name?: string; fields?: Array<{ name?: string }> }> } }

async function inspectSource(source: Source): Promise<Source> {
  const schema = await queryAt<SchemaResponse>(source, SCHEMA_QUERY)
  const rootFields = (schema.__schema?.queryType?.fields || []).map((field) => field.name).filter((name): name is string => Boolean(name))
  const entity = (['pools', 'pool', 'pairs', 'liquidityPools', 'liquidityPool'] as const).find((candidate) => rootFields.includes(candidate))
  if (!entity) throw new Error(`No pool entity found; schema root fields: ${rootFields.join(', ')}`)
  const typeName = entity.startsWith('liquidity') ? 'LiquidityPool' : entity === 'pairs' ? 'Pair' : 'Pool'
  const entityType = schema.__schema?.types?.find((type) => type.name === typeName)
  const entityFields = (entityType?.fields || []).map((field) => field.name).filter((name): name is string => Boolean(name))
  const inspected = { ...source, entity, rootFields, entityFields }
  const factoryProbe = rootFields.includes('factories') ? await queryAt<Record<string, unknown>>(inspected, `{ factories(first: 5) { id poolCount txCount totalVolumeUSD } }`) : null
  if (rootFields.includes('factories') && !factoryProbe?.factories) throw new Error(`Factory probe returned no data; schema root fields: ${rootFields.join(', ')}`)
  const sample = await queryAt<Record<string, unknown[]>>(inspected, `{ ${entity}(first: 10) { ${entityFields.includes('id') ? 'id' : ''} } }`)
  state = { ...state, endpoint: source.url, rootFields, poolEntity: entity, samplePools: Array.isArray(sample[entity]) ? sample[entity].length : 0 }
  return inspected
}

async function selectSource(): Promise<Source> {
  const configured = sources()
  if (!configured.length) throw new Error('Live PancakeSwap data is not configured')
  const failures: string[] = []
  for (const source of configured) {
    try {
      const inspected = await inspectSource(source)
      state = { ...state, status: 'healthy', lastSuccessfulSource: source.name, lastSuccessfulFetch: new Date().toISOString() }
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
  const inputTokens = Array.isArray(row.inputTokens) ? row.inputTokens as Array<Record<string, unknown>> : []
  const token0 = (row.token0 || inputTokens[0]) as Record<string, unknown> | undefined
  const token1 = (row.token1 || inputTokens[1]) as Record<string, unknown> | undefined
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
  try { await selectSource() } catch (error) { state = { ...state, status: configured ? 'unavailable' : 'not_configured', details: error instanceof Error ? error.message : 'Unknown GraphQL provider error' } }
  return { configured, chain: CHAIN, network: 'bsc', provider: 'pancakeswap-v3-bnb', endpoint: state.endpoint ?? null, source: state.lastSuccessfulSource, sourceStatus: state.status, lastSuccessfulSource: state.lastSuccessfulSource, lastSuccessfulFetch: state.lastSuccessfulFetch, details: state.details ?? null, primaryConfigured: true, fallbackConfigured: true, schemaCompatible: state.status === 'healthy', poolEntityAvailable: Boolean(state.poolEntity), poolEntity: state.poolEntity ?? null, rootFields: state.rootFields ?? [], samplePools: state.samplePools ?? 0, execution: 'disabled' as const }
}

export async function listPancakePools(search = '', limit = 12): Promise<PancakePool[]> {
  const source = await selectSource()
  const boundedLimit = Math.min(50, Math.max(1, Math.floor(limit) || 12))
  const hasSearch = Boolean(search.trim())
  const entity = source.entity || 'pools'
  const fields = new Set(source.entityFields || [])
  const scalar = ['id', 'feeTier', 'liquidity', 'sqrtPrice', 'tick', 'volumeUSD', 'volumeUSD24H', 'volume24hUSD', 'tvlUSD', 'totalValueLockedUSD', 'txCount', 'updatedAt'].filter((field) => fields.has(field)).join(' ')
  const token = (name: string) => fields.has(name) ? `${name} { id symbol name decimals }` : ''
  const tokens = fields.has('inputTokens') ? 'inputTokens { id symbol name decimals }' : ''
  const selection = [scalar, token('token0'), token('token1'), tokens].filter(Boolean).join(' ')
  if (!selection) throw new Error(`Pool entity ${entity} has no compatible fields`)
  const where = hasSearch && fields.has('id') ? ', where: { id_contains_nocase: $search }' : ''
  const order = entity === 'pools' && fields.has('totalValueLockedUSD') ? ', orderBy: totalValueLockedUSD, orderDirection: desc' : ''
  const query = `query Pools($first: Int!${hasSearch && fields.has('id') ? ', $search: String!' : ''}) { ${entity}(first: $first${order}${where}) { ${selection} } }`
  const variables: Record<string, unknown> = { first: boundedLimit }
  if (hasSearch && fields.has('id')) variables.search = search.trim()
  try {
    const data = await queryAt<{ pools?: Array<Record<string, unknown>> }>(source, query, variables)
    state = { ...state, status: 'healthy', lastSuccessfulSource: source.name, lastSuccessfulFetch: new Date().toISOString(), details: undefined }
    return ((data as Record<string, unknown[]>)[entity] || []).map(normalizePool).filter((pool) => pool.id)
  } catch (error) {
    const fallbackQuery = `query Pools($first: Int!) { ${entity}(first: $first) { ${selection} } }`
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
