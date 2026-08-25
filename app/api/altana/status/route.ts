import { NextResponse } from 'next/server'
import { altanaReasonCopy, altanaStatus } from '@/lib/altana/config'
import { altanaFor } from '@/lib/altana/client'

export const dynamic = 'force-dynamic'

/**
 * Altana configuration state. Reports honestly when Altana is unavailable rather than
 * pretending otherwise — no secret is read into the response, only the public agent
 * wallet address and network metadata.
 */
export async function GET() {
  const status = altanaStatus()
  const resolved = altanaFor(status.chainId)
  return NextResponse.json({
    available: status.available,
    reason: status.reason ?? null,
    message: status.reason ? altanaReasonCopy(status.reason) : null,
    network: status.network,
    chainId: status.chainId,
    relayUrl: status.relayUrl ?? null,
    explorer: status.explorer,
    agentWallet: resolved.ok ? resolved.walletAddress : null,
  })
}
