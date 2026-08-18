import { listPancakePools, getPancakeStatus, type PancakePool } from '@/lib/pancakeswap'

export type NormalizedPancakePool = {
  address: string
  token0: { address: string; symbol: string; decimals: number }
  token1: { address: string; symbol: string; decimals: number }
  tvl: number | null
  volume24h: number | null
  fees24h: number | null
  apr: number | null
  liquidity: number | null
  chain: string
  updatedAt: string | null
  source: string
  feeTier: number | null
}

export type PancakeProviderHealth = {
  status: 'healthy' | 'unavailable' | 'not_configured'
  source: string | null
  chain: string
  checkedAt: string
  details?: string
}

export interface PancakeProvider {
  getPools(search?: string, limit?: number): Promise<NormalizedPancakePool[]>
  getPool(address: string): Promise<NormalizedPancakePool | null>
  getOpportunities(task: string): Promise<Array<NormalizedPancakePool & { opportunityScore: number; opportunityReason: string }>>
  health(): Promise<PancakeProviderHealth>
}

function normalize(pool: PancakePool, chain: string, source: string): NormalizedPancakePool {
  const volume = pool.volume24hUsd
  const feeRate = pool.feeTier === null ? null : pool.feeTier / 1_000_000
  return {
    address: pool.id,
    token0: pool.token0,
    token1: pool.token1,
    tvl: pool.tvlUsd,
    volume24h: volume,
    fees24h: volume === null || feeRate === null ? null : volume * feeRate,
    apr: pool.apr,
    liquidity: pool.tvlUsd,
    chain,
    updatedAt: pool.updatedAt,
    source,
    feeTier: pool.feeTier,
  }
}

class OfficialSubgraphProvider implements PancakeProvider {
  async getPools(search = '', limit = 12) {
    const status = await getPancakeStatus()
    if (status.sourceStatus !== 'healthy') throw new Error(status.details || 'PancakeSwap provider health check failed')
    const pools = await listPancakePools(search, limit)
    return pools.map((pool) => normalize(pool, status.chain, status.source || 'PancakeSwap official subgraph'))
  }
  async getPool(address: string) {
    const pools = await this.getPools(address, 1)
    return pools[0] ?? null
  }
  async getOpportunities(task: string) {
    const pools = await this.getPools('', 24)
    const lower = String(task || '').toLowerCase()
    return pools
      .map((pool) => ({ ...pool, opportunityScore: Math.round((pool.apr ?? 0) * 0.55 + Math.min(100, Math.log10(Math.max(pool.tvl ?? 0, 1)) * 7) * 0.3 + (lower.includes('low') && (pool.tvl ?? 0) >= 1_000_000 ? 15 : 0)), opportunityReason: pool.apr == null ? 'APR unavailable; review TVL and volume before acting.' : `${pool.token0.symbol}/${pool.token1.symbol} ranked from live TVL, volume, APR, and fee-tier data.` }))
      .sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0))
      .slice(0, 12)
  }
  async health() {
    const status = await getPancakeStatus()
    return { status: status.sourceStatus, source: status.source, chain: status.chain, checkedAt: new Date().toISOString(), details: status.details ?? undefined }
  }
}

export function getPancakeProvider(): PancakeProvider { return new OfficialSubgraphProvider() }
export async function getPools(search = '', limit = 12) { return getPancakeProvider().getPools(search, limit) }
export async function getPool(address: string) { return getPancakeProvider().getPool(address) }
export async function getOpportunities(task: string) { return getPancakeProvider().getOpportunities(task) }
