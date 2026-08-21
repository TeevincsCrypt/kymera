import { NextResponse } from 'next/server'
import { requireWallet } from '@/lib/auth/require'
import { getIndexerStatus, syncErc8004 } from '@/lib/erc8004/indexer'
import type { Erc8004Identity } from '@/lib/erc8004/adapter'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

let lastSuccessfulSync: string | null = null
let lastAttemptedSync: string | null = null

/**
 * Pulls agent identities from the ERC-8004 index and evaluates what it imports.
 * Authentication is required because this writes to the shared catalog and calls
 * third-party services.
 */
export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, 'sync'), 5, 60_000)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds)

  const auth = await requireWallet()
  if ('response' in auth) return auth.response

  lastAttemptedSync = new Date().toISOString()
  try {
    const body = await request.json().catch(() => ({})) as { identities?: Erc8004Identity[] }
    const identities = Array.isArray(body.identities) ? body.identities.slice(0, 100) : undefined
    const status = await getIndexerStatus()
    const stats = await syncErc8004(identities)
    lastSuccessfulSync = new Date().toISOString()

    return NextResponse.json({
      source: '8004scan',
      agentsDiscovered: stats.scanned,
      agentsCreated: stats.imported,
      agentsUpdated: stats.updated,
      agentsEvaluated: stats.evaluated,
      agentsFailed: stats.failed,
      errors: stats.errors.slice(0, 10),
      lastSuccessfulSync,
      lastAttemptedSync,
      syncStatus: 'success',
      network: status.network,
      registryStatus: status.registryStatus,
      config: status,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Sync failed',
        stage: 'runtime-or-sync',
        lastSuccessfulSync,
        lastAttemptedSync,
        syncStatus: 'failed',
        source: '8004scan',
      },
      { status: 502 },
    )
  }
}
