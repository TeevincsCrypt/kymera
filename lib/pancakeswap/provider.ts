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
  getOpportunities(task: string): Promise<Array<NormalizedPancakePool & { opportunityScore: number; opportunityReason: string; matchedCriteria: string[] }>>
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
    // Pull a wider set than we return, so filtering has real headroom to work with.
    const pools = await this.getPools('', 50)
    const { filtered, criteria } = applyTaskCriteria(pools, String(task || ''))

    return filtered
      .map((pool) => {
        const { score, reason } = scoreForCriteria(pool, criteria)
        return { ...pool, opportunityScore: score, opportunityReason: reason, matchedCriteria: criteria.labels }
      })
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .slice(0, 24)
  }
  async health() {
    const status = await getPancakeStatus()
    return { status: status.sourceStatus, source: status.source, chain: status.chain, checkedAt: new Date().toISOString(), details: status.details ?? undefined }
  }
}

/* ------------------------------------------------- task-aware pool selection */

type Criteria = {
  labels: string[]
  riskAppetite: 'low' | 'high' | null
  wantsYield: boolean
  wantsVolume: boolean
  wantsMissingData: boolean
  wantsLowLiquidity: boolean
  tokens: string[]
}

const KNOWN_TOKENS = ['bnb', 'wbnb', 'usdt', 'usdc', 'busd', 'cake', 'eth', 'btcb', 'btc', 'dai', 'doge', 'xrp', 'sol', 'ada', 'link', 'matic', 'floki', 'twt']

/** Reads the user's request and turns it into concrete, inspectable selection rules. */
export function parseTaskCriteria(task: string): Criteria {
  const lower = task.toLowerCase()
  const labels: string[] = []

  const riskAppetite = /lower[- ]?risk|low[- ]?risk|safe|conservative|stable|blue ?chip/.test(lower) ? 'low'
    : /high[- ]?risk|aggressive|volatile|degen|risky/.test(lower) ? 'high'
    : null
  if (riskAppetite === 'low') labels.push('Lower risk: deep liquidity preferred')
  if (riskAppetite === 'high') labels.push('Higher risk: volatility preferred')

  const wantsYield = /yield|apr|apy|return|earn|farm|income|reward/.test(lower)
  if (wantsYield) labels.push('Ranked by reported APR')

  const wantsVolume = /volume|active|busy|traded|liquid|turnover|momentum/.test(lower)
  if (wantsVolume) labels.push('Ranked by 24h volume')

  const wantsMissingData = /missing|incomplete|unavailable|no apr|without apr|unknown|needs review|review/.test(lower)
  if (wantsMissingData) labels.push('Filtered to pools with incomplete metrics')

  const wantsLowLiquidity = /low liquidity|thin|shallow|small pool|illiquid/.test(lower)
  if (wantsLowLiquidity) labels.push('Filtered to shallow liquidity')

  const tokens = KNOWN_TOKENS.filter((token) => new RegExp(`\\b${token}\\b`).test(lower))
  if (tokens.length) labels.push(`Filtered to pools containing ${tokens.map((t) => t.toUpperCase()).join(', ')}`)

  if (!labels.length) labels.push('No specific criteria detected — ranked by liquidity depth')

  return { labels, riskAppetite, wantsYield, wantsVolume, wantsMissingData, wantsLowLiquidity, tokens }
}

function applyTaskCriteria(pools: NormalizedPancakePool[], task: string) {
  const criteria = parseTaskCriteria(task)
  let filtered = pools

  if (criteria.tokens.length) {
    filtered = filtered.filter((pool) => {
      const symbols = `${pool.token0.symbol} ${pool.token1.symbol}`.toLowerCase()
      return criteria.tokens.some((token) => symbols.includes(token))
    })
  }
  if (criteria.wantsMissingData) filtered = filtered.filter((pool) => pool.apr === null || pool.tvl === null || pool.volume24h === null)
  if (criteria.wantsLowLiquidity) filtered = filtered.filter((pool) => (pool.tvl ?? 0) < 1_000_000)
  if (criteria.riskAppetite === 'low') filtered = filtered.filter((pool) => (pool.tvl ?? 0) >= 1_000_000)
  if (criteria.riskAppetite === 'high') filtered = filtered.filter((pool) => (pool.tvl ?? 0) < 50_000_000)

  // A filter that eliminates everything is less useful than the unfiltered set.
  return { filtered: filtered.length ? filtered : pools, criteria }
}

function scoreForCriteria(pool: NormalizedPancakePool, criteria: Criteria) {
  const depth = Math.min(100, Math.log10(Math.max(pool.tvl ?? 0, 1)) * 12)
  const volume = Math.min(100, Math.log10(Math.max(pool.volume24h ?? 0, 1)) * 12)
  const apr = Math.min(100, pool.apr ?? 0)
  const parts: Array<{ weight: number; value: number }> = []
  const notes: string[] = []

  if (criteria.wantsYield) { parts.push({ weight: 0.5, value: apr }); notes.push(pool.apr === null ? 'APR unavailable' : `APR ${pool.apr.toFixed(2)}%`) }
  if (criteria.wantsVolume) { parts.push({ weight: 0.4, value: volume }); notes.push(pool.volume24h === null ? '24h volume unavailable' : `24h volume $${Math.round(pool.volume24h).toLocaleString()}`) }
  if (criteria.riskAppetite === 'low') { parts.push({ weight: 0.5, value: depth }); notes.push(`TVL $${Math.round(pool.tvl ?? 0).toLocaleString()}`) }
  if (criteria.riskAppetite === 'high') { parts.push({ weight: 0.4, value: 100 - depth }); notes.push('Shallower pool, higher volatility') }
  if (criteria.wantsMissingData) { parts.push({ weight: 0.6, value: pool.apr === null ? 100 : 20 }); notes.push('Flagged for incomplete metrics') }

  // Liquidity depth is always a baseline signal.
  parts.push({ weight: criteria.labels.length === 1 ? 1 : 0.3, value: depth })

  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0)
  const score = Math.round(parts.reduce((sum, part) => sum + part.value * part.weight, 0) / totalWeight)

  return {
    score,
    reason: `${pool.token0.symbol}/${pool.token1.symbol} — ${notes.length ? notes.join(' · ') : `TVL $${Math.round(pool.tvl ?? 0).toLocaleString()}`}`,
  }
}

export function getPancakeProvider(): PancakeProvider { return new OfficialSubgraphProvider() }
export async function getPools(search = '', limit = 12) { return getPancakeProvider().getPools(search, limit) }
export async function getPool(address: string) { return getPancakeProvider().getPool(address) }
export async function getOpportunities(task: string) { return getPancakeProvider().getOpportunities(task) }
