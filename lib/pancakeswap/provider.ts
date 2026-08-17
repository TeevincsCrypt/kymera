import { listPancakePools, getPancakeStatus, type PancakePool } from '@/lib/pancakeswap'

export type NormalizedPancakePool = {
  address: string
  token0: string
  token1: string
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
  getOpportunities(task: string): Promise<NormalizedPancakePool[]>
  health(): Promise<PancakeProviderHealth>
}

function normalize(pool: PancakePool, chain: string, source: string): NormalizedPancakePool {
  const volume = pool.volume24hUsd
  const feeRate = pool.feeTier === null ? null : pool.feeTier / 1_000_000
  return {
    address: pool.id,
    token0: pool.token0.symbol,
    token1: pool.token1.symbol,
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
  async getOpportunities(task: string) { return this.getPools('', 12) }
  async health() {
    const status = await getPancakeStatus()
    return { status: status.sourceStatus, source: status.source, chain: status.chain, checkedAt: new Date().toISOString() }
  }
}

export function getPancakeProvider(): PancakeProvider { return new OfficialSubgraphProvider() }
export async function getPools(search = '', limit = 12) { return getPancakeProvider().getPools(search, limit) }
export async function getPool(address: string) { return getPancakeProvider().getPool(address) }
export async function getOpportunities(task: string) { return getPancakeProvider().getOpportunities(task) }
