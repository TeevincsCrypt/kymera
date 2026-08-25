import { NextResponse } from 'next/server'
import { getIndexerStatus, syncErc8004 } from '@/lib/erc8004/indexer'
import { discoverIdentities } from '@/lib/erc8004/adapter'
import { prisma } from '@/lib/prisma'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
// Registry syncs are network-bound over many pages; give them room on Vercel.
export const maxDuration = 300

let lastSuccessfulSync: string | null = null
let lastAttemptedSync: string | null = null

/**
 * Populates the marketplace from the public ERC-8004 registry index.
 *
 * This is intentionally NOT gated behind a wallet session. It writes only public
 * registry data to a shared catalog, and requiring sign-in created a deadlock: the
 * catalog stayed empty because nobody could populate it, which is exactly the
 * discoverability problem Kymera exists to solve. It is rate limited instead.
 */
export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, 'sync'), 6, 60_000)
  if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds)

  lastAttemptedSync = new Date().toISOString()
  const status = await getIndexerStatus()

  try {
    const body = await request.json().catch(() => ({})) as { pages?: unknown }
    if (body.pages !== undefined) process.env.ERC8004_MAX_PAGES = String(Math.min(Math.max(Number(body.pages) || 1, 1), 500))

    const identities = await discoverIdentities()
    if (identities.length === 0) {
      return NextResponse.json(
        {
          syncStatus: 'empty',
          error: 'The agent index returned no agents for this network.',
          hint: `Check NETWORK (currently ${status.network}) and ERC8004_SCAN_API_URL. A 4xx/5xx from the index will appear in the error field.`,
          config: status,
          agentsDiscovered: 0,
          lastAttemptedSync,
        },
        { status: 502 },
      )
    }

    const stats = await syncErc8004(identities)
    lastSuccessfulSync = new Date().toISOString()
    const total = await prisma.agent.count()

    return NextResponse.json({
      syncStatus: 'success',
      source: '8004scan',
      network: status.network,
      agentsDiscovered: stats.scanned,
      agentsCreated: stats.imported,
      agentsUpdated: stats.updated,
      agentsScored: stats.scored,
      agentsFailed: stats.failed,
      catalogTotal: total,
      errors: stats.errors,
      lastSuccessfulSync,
      lastAttemptedSync,
      config: status,
    })
  } catch (error) {
    return NextResponse.json(
      {
        syncStatus: 'failed',
        // Surfaced verbatim: a silent sync failure is what made the catalog look empty.
        error: error instanceof Error ? error.message : 'Sync failed',
        config: status,
        lastSuccessfulSync,
        lastAttemptedSync,
      },
      { status: 502 },
    )
  }
}

/** Catalog health, so the UI can explain an empty marketplace instead of just showing one. */
export async function GET() {
  const status = await getIndexerStatus()
  let total = 0
  let databaseReachable = true
  try {
    total = await prisma.agent.count()
  } catch {
    databaseReachable = false
  }
  return NextResponse.json({ catalogTotal: total, databaseReachable, lastSuccessfulSync, lastAttemptedSync, config: status })
}
