import { getAltanaStatus as getDomainStatus, type AltanaAction, type AltanaSession } from '@/lib/altana/domain'

export function getAltanaStatus() { const status = getDomainStatus(); return { ...status, configured: status.available && status.mode === 'testnet' } }

export async function createWallet() {
  const status = getAltanaStatus()
  if (!status.available || status.mode !== 'testnet') return { available: false, simulated: !status.signingEnabled, reason: status.reason || 'TESTNET_SIGNING_DISABLED' }
  return { available: false, simulated: false, reason: 'TESTNET_PROVIDER_REQUIRES_DEDICATED_SIGNER_CONFIGURATION' }
}

export async function grantAltanaSession(input: { expiry: Date; spendLimit?: number; permissions: string[] }) { void input; return { available: false, simulated: false, reason: 'ALTANA_SESSION_SIGNING_REQUIRES_CONNECTED_WALLET' } }

export async function grantSession() {
  const status = getAltanaStatus()
  if (status.mode !== 'testnet' || !status.available) return { available: false, simulated: !status.signingEnabled, reason: status.reason || 'ALTANA_SIGNING_UNAVAILABLE' }
  return { available: false, simulated: false, reason: 'ALTANA_TESTNET_SIGNING_NOT_ENABLED' }
}

export async function revokeSession() {
  return { available: false, simulated: true, reason: 'ALTANA_REVOCATION_REQUIRES_PROVIDER_SIGNER' }
}

export async function execute(session: AltanaSession, action: AltanaAction) {
  void session; void action
  return { approved: false, simulated: false, reason: 'ALTANA_EXECUTION_REQUIRES_WALLET_SIGNED_TRANSACTION' }
}

export async function verifySession(session: AltanaSession) {
  return { verified: false, simulated: false, reason: session.simulated ? 'SIMULATION_SESSIONS_NOT_ACCEPTED' : 'ONCHAIN_VERIFICATION_REQUIRES_PROVIDER' }
}
