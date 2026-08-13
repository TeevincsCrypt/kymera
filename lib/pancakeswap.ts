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

const ENDPOINT = process.env.PANCAKESWAP_SUBGRAPH_URL?.trim()
const CHAIN = process.env.PANCAKESWAP_CHAIN?.trim() || 'bsc'

async function query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (!ENDPOINT) throw new Error('PancakeSwap live data is not configured. Set PANCAKESWAP_SUBGRAPH_URL.')
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (process.env.THEGRAPH_API_KEY?.trim()) headers.authorization = `Bearer ${process.env.THEGRAPH_API_KEY.trim()}`
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`PancakeSwap API returned ${response.status}`)
  const payload = await response.json() as { data?: T; errors?: Array<{ message: string }> }
  if (payload.errors?.length) throw new Error(payload.errors[0].message)
  if (!payload.data) throw new Error('PancakeSwap returned no data')
  return payload.data
}

function numberOrNull(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizePool(row: Record<string, unknown>): PancakePool {
  const token0 = row.token0 as Record<string, unknown> | undefined
  const token1 = row.token1 as Record<string, unknown> | undefined
  const tvlUsd = numberOrNull(row.totalValueLockedUSD ?? row.tvlUSD)
  const volume24hUsd = numberOrNull(row.volumeUSD24H ?? row.volume24hUSD ?? row.volumeUSD)
  const apr = numberOrNull(row.apr ?? row.apr24h)
  const feeApr = numberOrNull(row.feeApr ?? row.feeAPR)
  const risk = tvlUsd === null ? 'Unknown' : tvlUsd >= 10_000_000 ? 'Lower' : tvlUsd >= 1_000_000 ? 'Moderate' : 'Higher'
  return {
    id: String(row.id),
    feeTier: numberOrNull(row.feeTier),
    token0: { address: String(token0?.id || ''), symbol: String(token0?.symbol || 'Unknown'), decimals: Number(token0?.decimals || 18) },
    token1: { address: String(token1?.id || ''), symbol: String(token1?.symbol || 'Unknown'), decimals: Number(token1?.decimals || 18) },
    tvlUsd, volume24hUsd, apr, feeApr,
    updatedAt: row.updatedAt ? new Date(Number(row.updatedAt) * 1000).toISOString() : null,
    risk,
  }
}

export async function getPancakeStatus() {
  return { configured: Boolean(ENDPOINT), chain: CHAIN, source: 'PancakeSwap official subgraph', execution: 'disabled' as const }
}

export async function listPancakePools(search = '', limit = 12): Promise<PancakePool[]> {
  const filter = search.trim() ? `, where: { id_contains: $search }` : ''
  const data = await query<{ pools?: Array<Record<string, unknown>> }>(`query Pools($first: Int!, $search: String) { pools(first: $first, orderBy: totalValueLockedUSD, orderDirection: desc${filter}) { id feeTier totalValueLockedUSD volumeUSD token0 { id symbol decimals } token1 { id symbol decimals } } }`, { first: Math.min(50, Math.max(1, limit)), search: search.toLowerCase() })
  return (data.pools || []).map(normalizePool)
}

export async function getPancakeOpportunities(task: string) {
  const pools = await listPancakePools(task.match(/[A-Za-z0-9]+-[A-Za-z0-9]+/)?.[0] || '', 12)
  return pools.map((pool) => ({ pool, score: Math.round((pool.apr ?? 0) * 0.55 + Math.min(100, Math.log10(Math.max(pool.tvlUsd ?? 0, 1)) * 7) * 0.3 + (pool.risk === 'Lower' ? 15 : pool.risk === 'Moderate' ? 8 : 0)), reason: pool.apr === null ? 'APR unavailable; review pool metrics before acting.' : `${pool.token0.symbol}/${pool.token1.symbol} ranked by reported APR, TVL, and risk signal.` }))
}

export function buildUnsignedActionPreview(pool: PancakePool, action: 'add_liquidity' | 'remove_liquidity' | 'swap') {
  return { action, poolId: pool.id, chain: CHAIN, status: 'PREVIEW_ONLY', executable: false, reason: 'Unsigned preview only. Guard authorization and a verified wallet execution provider are required.' }
}
