export type Eip6963Provider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
}

export type Eip6963Wallet = {
  info: {
    uuid: string
    name: string
    icon: string
    rdns: string
  }
  provider: Eip6963Provider
}

let selectedProvider: Eip6963Provider | undefined

export function selectEip6963Provider(provider: Eip6963Provider) {
  selectedProvider = provider
}

export function getSelectedEip6963Provider() {
  return selectedProvider
}

export function clearSelectedEip6963Provider() {
  selectedProvider = undefined
}

export function discoverEip6963Wallets(onWallet: (wallet: Eip6963Wallet) => void) {
  if (typeof window === 'undefined') return () => undefined
  const handler = (event: Event) => onWallet((event as CustomEvent<Eip6963Wallet>).detail)
  window.addEventListener('eip6963:announceProvider', handler)
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  return () => window.removeEventListener('eip6963:announceProvider', handler)
}
