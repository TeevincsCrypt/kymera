export type AltanaMode = 'testnet' | 'passkey'
export type AltanaAction = { action: string; target: string; method: string; value?: number; parameters?: unknown }

export type AltanaStatus = {
  available: boolean
  mode: AltanaMode
  network: string
  walletConfigured: boolean
  reason?: string
  signingEnabled: boolean
}

export type AltanaSession = {
  id: string
  wallet: string
  agentId: string
  allowedContracts: string[]
  allowedMethods: string[]
  spendingCap: number
  expiry: string
  status: 'active' | 'revoked' | 'expired'
  simulated: boolean
}

const mode = (process.env.ALTANA_MODE?.toLowerCase() === 'passkey' ? 'passkey' : 'testnet') as AltanaMode
const testnetKeyConfigured = Boolean(process.env.ALTANA_PRIVATE_KEY?.trim())

export function getAltanaStatus(): AltanaStatus {
  if (mode === 'testnet' && !testnetKeyConfigured) return { available: false, mode, network: process.env.ALTANA_NETWORK || 'BNB Testnet', walletConfigured: false, reason: 'ALTANA_PRIVATE_KEY_NOT_CONFIGURED', signingEnabled: false }
  if (mode === 'passkey') return { available: false, mode, network: process.env.ALTANA_NETWORK || 'BNB Smart Chain', walletConfigured: false, reason: 'PASSKEY_FLOW_NOT_CONFIGURED', signingEnabled: false }
  return { available: false, mode: 'testnet', network: process.env.ALTANA_NETWORK || 'BNB Testnet', walletConfigured: false, reason: 'ALTANA_SIGNING_NOT_CONFIGURED', signingEnabled: false }
}

export function evaluateSession(session: AltanaSession, input: AltanaAction) {
  if (session.status !== 'active') return { approved: false, reason: `SESSION_${session.status.toUpperCase()}` }
  if (new Date(session.expiry).getTime() <= Date.now()) return { approved: false, reason: 'SESSION_EXPIRED' }
  if (!session.allowedContracts.includes(input.target)) return { approved: false, reason: 'CONTRACT_NOT_ALLOWLISTED' }
  if (!session.allowedMethods.includes(input.method)) return { approved: false, reason: 'METHOD_NOT_ALLOWLISTED' }
  if ((input.value || 0) > session.spendingCap) return { approved: false, reason: 'SPENDING_CAP_EXCEEDED' }
  return { approved: true, reason: 'GUARD_POLICY_APPROVED' }
}

