import { getAltanaStatus as getDomainStatus, simulateExecution, type AltanaAction, type AltanaSession } from '@/lib/altana/domain'

export function getAltanaStatus() { const status = getDomainStatus(); return { ...status, configured: status.available && status.mode === 'testnet' } }

export async function createWallet() {
  const status = getAltanaStatus()
  if (!status.available || status.mode !== 'testnet') return { available: false, simulated: status.mode === 'simulation', reason: status.reason || 'TESTNET_SIGNING_DISABLED' }
  return { available: false, simulated: false, reason: 'TESTNET_PROVIDER_REQUIRES_DEDICATED_SIGNER_CONFIGURATION' }
}

export async function grantAltanaSession(input: { expiry: Date; spendLimit?: number; permissions: string[] }) { void input; return { walletAddress: '0xSIMULATED', publicKey: '0xSIMULATED', expiry: Math.floor(Date.now() / 1000), providerSessionId: `sim_${Date.now()}`, network: getDomainStatus().network, transactionHash: undefined, verificationUrl: undefined } }

export async function grantSession() {
  const status = getAltanaStatus()
  if (status.mode !== 'testnet' || !status.available) return { available: false, simulated: status.mode === 'simulation', reason: status.reason || 'ALTANA_SIGNING_UNAVAILABLE' }
  return { available: false, simulated: false, reason: 'ALTANA_TESTNET_SIGNING_NOT_ENABLED' }
}

export async function revokeSession() {
  return { available: false, simulated: true, reason: 'ALTANA_REVOCATION_REQUIRES_PROVIDER_SIGNER' }
}

export async function execute(session: AltanaSession, action: AltanaAction) {
  return session.simulated ? simulateExecution(session, action) : { approved: false, simulated: false, reason: 'ALTANA_EXECUTION_NOT_ENABLED' }
}

export async function verifySession(session: AltanaSession) {
  return { verified: session.simulated, simulated: session.simulated, reason: session.simulated ? 'SIMULATION_SESSION' : 'ONCHAIN_VERIFICATION_NOT_ENABLED' }
}
