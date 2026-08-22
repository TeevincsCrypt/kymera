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
  const tokenId = row.token_id ?? row.tokenId ?? row.agent_id ?? row.agentId ?? row.id
  if (tokenId === undefined || tokenId === null || String(tokenId).trim() === '') return null
  const address = String(
    row.registry_address ?? row.registryAddress ?? row.identity_registry ?? row.contract_address ?? row.contract ?? registryAddress ?? '',
  ).trim()
  // A row without a resolvable registry address is still a real agent; keep it and let
  // the identity score reflect the missing field rather than discarding the record.
  if (address && !/^0x[a-fA-F0-9]{40}$/.test(address)) return null
  return {
    chainId: Number(row.chain_id ?? row.chainId ?? chainId),
    registryAddress: address,
    tokenId: String(tokenId),
    scanRecord: row,
  }
}

/** The index has returned several envelope shapes; accept all of them. */
function extractRows(payload: unknown): { rows: Array<Record<string, unknown>>; total: number | null } {
  if (Array.isArray(payload)) return { rows: payload as Array<Record<string, unknown>>, total: null }
  const body = (payload ?? {}) as Record<string, unknown>
  const candidates = [body.items, body.data, body.agents, body.results, body.records]
  const rows = candidates.find((value) => Array.isArray(value)) as Array<Record<string, unknown>> | undefined
  const totalRaw = body.total ?? body.count ?? body.total_count ?? (body.pagination as Record<string, unknown> | undefined)?.total
  return { rows: rows ?? [], total: typeof totalRaw === 'number' ? totalRaw : null }
}

export async function enumerateAgents(offset = 0, limit = MAX_PAGE_SIZE): Promise<EnumerationPage> {
  const config = getConfig()
  const pageSize = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE)
  const url = new URL(`${process.env.ERC8004_SCAN_API_URL?.trim() || SDK_SCAN_API}/agents`)
  url.searchParams.set('chain_id', String(config.chainId))
  url.searchParams.set('limit', String(pageSize))
  url.searchParams.set('offset', String(Math.max(offset, 0)))

  const headers: Record<string, string> = { accept: 'application/json' }
  const apiKey = process.env.ERC8004_SCAN_API_KEY?.trim()
  if (apiKey) headers.authorization = `Bearer ${apiKey}`

  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers, cache: 'no-store' })
  if (!response.ok) throw new Error(`Agent index returned HTTP ${response.status} for ${url.origin}`)

  const { rows, total } = extractRows(await response.json())
  const items = rows
    .map((row) => normalizeItem(row, config.chainId, config.registryAddress))
    .filter((item): item is Erc8004Identity => Boolean(item))

  const nextOffset = rows.length === pageSize && (total === null || offset + rows.length < total) ? offset + rows.length : null
  return { items, total, nextOffset, source: '8004scan' }
}

/**
 * Walks the index. Defaults are sized for a real catalog rather than a demo: BNB Chain
 * hosts on the order of hundreds of thousands of ERC-8004 agents, so the caller
 * controls how deep to go and Kymera paginates until the index says it is done.
 */
export async function enumerateAllAgents(
  maxPages = Number(process.env.ERC8004_MAX_PAGES || 50),
  onPage?: (page: EnumerationPage, pageIndex: number) => void,
) {
  const identities: Erc8004Identity[] = []
  const bounded = Math.max(1, Math.min(maxPages, 5000))
  let offset = 0
  let total: number | null = null

  for (let page = 0; page < bounded; page += 1) {
    const result = await enumerateAgents(offset)
    identities.push(...result.items)
    total = result.total ?? total
    onPage?.(result, page)
    if (result.nextOffset === null) break
    offset = result.nextOffset
  }

  return { identities, total, source: '8004scan' as const, reachedPageLimit: identities.length > 0 && total !== null && identities.length < total }
}
