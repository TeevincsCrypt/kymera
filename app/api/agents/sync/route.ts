import { NextRequest, NextResponse } from 'next/server'
import { getIndexerStatus, syncErc8004 } from '@/lib/erc8004/indexer'
import type { Erc8004Identity } from '@/lib/erc8004/adapter'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { identities?: Erc8004Identity[] }
    const identities = Array.isArray(body.identities) ? body.identities.slice(0, 100) : undefined
    const status = await getIndexerStatus()
    const stats = await syncErc8004(identities)
    return NextResponse.json({
      ...stats,
      agentsDiscovered: stats.scanned,
      agentsCreated: stats.imported,
      agentsUpdated: stats.updated,
      agentsFailed: stats.failed,
      lastSuccessfulSync: new Date().toISOString(),
      network: status.network,
      registryStatus: status.registryStatus,
      config: status,
    })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Sync failed', stage: 'runtime-or-sync' }, { status: 500 }) }
}
