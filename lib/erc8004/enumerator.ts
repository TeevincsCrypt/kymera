import type { Erc8004Identity } from './adapter'

const SDK_SCAN_API = 'https://www.8004scan.io/api/v1'
const MAX_PAGE_SIZE = 100

export type EnumerationPage = {
  items: Erc8004Identity[]
  total: number | null
  nextOffset: number | null
  source: '8004scan'
}

function getConfig() {
  const network = process.env.NETWORK?.trim() === 'bsc-testnet' ? 'bsc-testnet' : 'bsc-mainnet'
  const chainId = network === 'bsc-testnet' ? 97 : 56
  const registryAddress = process.env.ERC8004_REGISTRY_ADDRESS?.trim()
  return { network, chainId, registryAddress }
}

function normalizeItem(row: Record<string, unknown>, chainId: number, registryAddress?: string): Erc8004Identity | null {
  const tokenId = row.token_id ?? row.tokenId ?? row.agent_id ?? row.agentId
  if (tokenId === undefined || tokenId === null || String(tokenId).trim() === '') return null
  const address = String(row.registry_address ?? row.registryAddress ?? row.identity_registry ?? row.contract_address ?? registryAddress ?? '').trim()
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return null
  return { chainId: Number(row.chain_id ?? row.chainId ?? chainId), registryAddress: address, tokenId: String(tokenId), scanRecord: row }
}

export async function enumerateAgents(offset = 0, limit = MAX_PAGE_SIZE): Promise<EnumerationPage> {
  const config = getConfig()
  const pageSize = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE)
  const url = new URL(`${process.env.ERC8004_SCAN_API_URL?.trim() || SDK_SCAN_API}/agents`)
  url.searchParams.set('chain_id', String(config.chainId))
  url.searchParams.set('limit', String(pageSize))
  url.searchParams.set('offset', String(Math.max(offset, 0)))

  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`8004scan API returned ${response.status}`)
  const payload = await response.json() as { items?: Array<Record<string, unknown>>; total?: number }
  const items = (payload.items || []).map((row) => normalizeItem(row, config.chainId, config.registryAddress)).filter((item): item is Erc8004Identity => Boolean(item))
  const nextOffset = items.length === pageSize && (payload.total === undefined || offset + items.length < payload.total) ? offset + items.length : null
  return { items, total: typeof payload.total === 'number' ? payload.total : null, nextOffset, source: '8004scan' }
}

export async function enumerateAllAgents(maxPages = Number(process.env.ERC8004_MAX_PAGES || 10)) {
  const identities: Erc8004Identity[] = []
  let offset = 0
  for (let page = 0; page < Math.max(1, Math.min(maxPages, 1000)); page += 1) {
    const result = await enumerateAgents(offset)
    identities.push(...result.items)
    if (result.nextOffset === null) return { identities, total: result.total, source: result.source }
    offset = result.nextOffset
  }
  return { identities, total: null, source: '8004scan' as const }
}
