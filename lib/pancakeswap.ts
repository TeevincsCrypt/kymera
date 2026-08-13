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

type SourceName = 'PancakeSwap V3 BNB' | 'PancakeSwap V3 BSC'
type Source = { name: SourceName; url: string }
type SourceState = { status: 'healthy' | 'unavailable' | 'not_configured'; lastSuccessfulSource: SourceName | null; lastSuccessfulFetch: string | null }

const PRIMARY_URL = process.env.PANCAKESWAP_SUBGRAPH_URL?.trim() || ''
const FALLBACK_URL = process.env.PANCAKESWAP_SUBGRAPH_FALLBACK_URL?.trim() || 'https://gateway.thegraph.com/api/subgraphs/id/A1BC1hzDsK4NTeXBpKQnDBphngpYZAwDUF7dEBfa3jHK'
const CHAIN = process.env.PANCAKESWAP_CHAIN?.trim() || 'bsc'
let state: SourceState = { status: 'not_configured', lastSuccessfulSource: null, lastSuccessfulFetch: null }

function sources(): Source[] {
  return [
    ...(PRIMARY_URL ? [{ name: 'PancakeSwap V3 BNB' as const, url: PRIMARY_URL }] : []),
    ...(FALLBACK_URL ? [{ name: 'PancakeSwap V3 BSC' as const, url: FALLBACK_URL }] : []),
  ]
}

function headers() {
  const value: Record<string, string> = { 'content-type': 'application/json' }
  if (process.env.THEGRAPH_API_KEY?.trim()) value.authorization = `Bearer ${process.env.THEGRAPH_API_KEY.trim()}`
  return value
}

async function queryAt<T>(source: Source, query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(source.url, { method: 'POST', headers: headers(), body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new Error(`${source.name} returned HTTP ${response.status}`)
  const payload = await response.json() as { data?: T; errors?: Array<{ message?: string }> }
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message || 'GraphQL error').join('; '))
  if (!payload.data) throw new Error(`${source.name} returned no data`)
  return payload.data
}

const HEALTH_QUERY = `{ factories(first: 5) { id poolCount txCount totalVolumeUSD } }`

async function healthySource(source: Source) {
  const data = await queryAt<{ factories?: Array<Record<string, unknown>> }>(source, HEALTH_QUERY)
  if (!Array.isArray(data.factories)) throw new Error(`${source.name} health response was incompatible`)
  return data
}

async function selectSource(): Promise<Source> {
  const configured = sources()
  if (!configured.length) throw new Error('Live PancakeSwap data unavailable')
  const failures: string[] = []
  for (const source of configured) {
    try {
      await healthySource(source)
      state = { status: 'healthy', lastSuccessfulSource: source.name, lastSuccessfulFetch: new Date().toISOString() }
      return source
    } catch (error) {
      failures.push(`${source.name}: ${error instanceof Error ? error.message : 'unavailable'}`)
    }
  }
  state = { ...state, status: 'unavailable' }
  throw new Error(`Live PancakeSwap data unavailable (${failures.join(' | ')})`)
}

function numberOrNull(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null }

function normalizePool(row: Record<string, unknown>): PancakePool {
  const token0 = row.token0 as Record<string, unknown> | undefined
  const token1 = row.token1 as Record<string, unknown> | undefined
  const tvlUsd = numberOrNull(row.totalValueLockedUSD ?? row.tvlUSD)
  const volume24hUsd = numberOrNull(row.volumeUSD24H ?? row.volume24hUSD ?? row.volumeUSD)
  const apr = numberOrNull(row.apr ?? row.apr24h)
  const feeApr = numberOrNull(row.feeApr ?? row.feeAPR)
  const risk = tvlUsd === null ? 'Unknown' : tvlUsd >= 10_000_000 ? 'Lower' : tvlUsd >= 1_000_000 ? 'Moderate' : 'Higher'
  return { id: String(row.id), feeTier: numberOrNull(row.feeTier), token0: { address: String(token0?.id || ''), symbol: String(token0?.symbol || 'Unknown'), decimals: Number(token0?.decimals || 18) }, token1: { address: String(token1?.id || ''), symbol: String(token1?.symbol || 'Unknown'), decimals: Number(token1?.decimals || 18) }, tvlUsd, volume24hUsd, apr, feeApr, updatedAt: row.updatedAt ? new Date(Number(row.updatedAt) * 1000).toISOString() : null, risk }
}

export async function getPancakeStatus() {
  const configured = sources().length > 0
  try { await selectSource() } catch { state = { ...state, status: configured ? 'unavailable' : 'not_configured' } }
  return { configured, chain: CHAIN, source: state.lastSuccessfulSource, sourceStatus: state.status, lastSuccessfulSource: state.lastSuccessfulSource, lastSuccessfulFetch: state.lastSuccessfulFetch, primaryConfigured: Boolean(PRIMARY_URL), fallbackConfigured: Boolean(FALLBACK_URL), execution: 'disabled' as const }
}

export async function listPancakePools(search = '', limit = 12): Promise<PancakePool[]> {
  const source = await selectSource()
  const filter = search.trim() ? `, where: { id_contains: $search }` : ''
  const data = await queryAt<{ pools?: Array<Record<string, unknown>> }>(source, `query Pools($first: Int!, $search: String) { pools(first: $first, orderBy: totalValueLockedUSD, orderDirection: desc${filter}) { id feeTier totalValueLockedUSD volumeUSD token0 { id symbol decimals } token1 { id symbol decimals } } }`, { first: Math.min(50, Math.max(1, limit)), search: search.toLowerCase() })
  state = { status: 'healthy', lastSuccessfulSource: source.name, lastSuccessfulFetch: new Date().toISOString() }
  return (data.pools || []).map(normalizePool)
}

export async function getPancakeOpportunities(task: string) { const pools = await listPancakePools(task.match(/[A-Za-z0-9]+-[A-Za-z0-9]+/)?.[0] || '', 12); return pools.map((pool) => ({ pool, score: Math.round((pool.apr ?? 0) * 0.55 + Math.min(100, Math.log10(Math.max(pool.tvlUsd ?? 0, 1)) * 7) * 0.3 + (pool.risk === 'Lower' ? 15 : pool.risk === 'Moderate' ? 8 : 0)), reason: pool.apr === null ? 'APR unavailable; review pool metrics before acting.' : `${pool.token0.symbol}/${pool.token1.symbol} ranked by reported APR, TVL, and risk signal.` })) }

export function buildUnsignedActionPreview(pool: PancakePool, action: 'add_liquidity' | 'remove_liquidity' | 'swap') { return { action, poolId: pool.id, chain: CHAIN, status: 'PREVIEW_ONLY', executable: false, reason: 'Unsigned preview only. Guard authorization and a verified wallet execution provider are required.' } }
