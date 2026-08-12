import { NextRequest, NextResponse } from 'next/server'
import { getIndexerStatus, syncErc8004 } from '@/lib/erc8004/indexer'
import type { Erc8004Identity } from '@/lib/erc8004/adapter'

let lastSuccessfulSync: string | null = null
let lastAttemptedSync: string | null = null

export async function POST(request: NextRequest) {
  lastAttemptedSync = new Date().toISOString()
  try {
    const body = await request.json().catch(() => ({})) as { identities?: Erc8004Identity[] }
    const identities = Array.isArray(body.identities) ? body.identities.slice(0, 100) : undefined
    const status = await getIndexerStatus()
    const stats = await syncErc8004(identities)
    lastSuccessfulSync = new Date().toISOString()
    return NextResponse.json({
      discovered: stats.scanned,
      created: stats.imported,
      updated: stats.updated,
      failed: stats.failed,
      source: '8004scan',
      ...stats,
      agentsDiscovered: stats.scanned,
      agentsCreated: stats.imported,
      agentsUpdated: stats.updated,
      agentsFailed: stats.failed,
      lastSuccessfulSync,
      lastAttemptedSync,
      syncStatus: 'success',
      network: status.network,
      registryStatus: status.registryStatus,
      config: status,
    })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Sync failed', stage: 'runtime-or-sync', lastSuccessfulSync, lastAttemptedSync, syncStatus: 'failed', source: '8004scan' }, { status: 502 }) }
}
