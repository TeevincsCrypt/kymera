/**
 * Payment provider abstraction.
 *
 * Kymera does not currently process real money. The only provider implemented is
 * `demo`, and it is honest about that: it never claims a charge occurred, it never
 * fabricates a blockchain payment confirmation, and everything it returns carries
 * `mode: 'demo'` so the UI can label it. A real provider (x402, card, on-chain
 * escrow) can be added by implementing `PaymentProvider` and registering it below —
 * no other part of the hiring flow needs to change.
 */

export type PaymentMode = 'demo' | 'live'
export type PaymentStatus = 'UNPAID' | 'PENDING' | 'SETTLED' | 'FAILED' | 'NOT_REQUIRED'

export type PaymentIntent = {
  id: string
  provider: string
  mode: PaymentMode
  amount: number
  currency: string
  status: PaymentStatus
  checkoutUrl?: string
  /** Shown verbatim in the UI so a demo can never be mistaken for a real charge. */
  disclosure: string
}

export type SettlementResult = {
  settled: boolean
  status: PaymentStatus
  mode: PaymentMode
  disclosure: string
}

export interface PaymentProvider {
  readonly id: string
  readonly mode: PaymentMode
  readonly label: string
  createIntent(input: { amount: number; currency: string; reference: string }): Promise<PaymentIntent>
  settle(input: { paymentId: string; reference: string }): Promise<SettlementResult>
}

const DEMO_DISCLOSURE = 'Demo billing: no payment was requested, charged, or settled on-chain. This records intent only.'

class DemoPaymentProvider implements PaymentProvider {
  readonly id = 'demo'
  readonly mode: PaymentMode = 'demo'
  readonly label = 'Demo billing (no real charge)'

  async createIntent(input: { amount: number; currency: string; reference: string }): Promise<PaymentIntent> {
    return {
      id: `demo_${input.reference}`,
      provider: this.id,
      mode: this.mode,
      amount: input.amount,
      currency: input.currency,
      status: input.amount > 0 ? 'PENDING' : 'NOT_REQUIRED',
      disclosure: DEMO_DISCLOSURE,
    }
  }

  /**
   * Settles the demo intent. This confirms only that the intent belongs to this
   * hire — it deliberately does not represent money changing hands.
   */
  async settle(input: { paymentId: string; reference: string }): Promise<SettlementResult> {
    const matches = input.paymentId === `demo_${input.reference}`
    return {
      settled: matches,
      status: matches ? 'SETTLED' : 'FAILED',
      mode: this.mode,
      disclosure: matches ? DEMO_DISCLOSURE : 'Demo intent did not match this hire.',
    }
  }
}

const providers = new Map<string, PaymentProvider>([['demo', new DemoPaymentProvider()]])

export function getPaymentProvider(): PaymentProvider {
  const requested = process.env.KYMERA_PAYMENT_PROVIDER?.trim() || 'demo'
  const provider = providers.get(requested)
  if (!provider) {
    // Fail closed rather than silently falling back to demo billing when an
    // operator believes a real provider is configured.
    throw new Error(`Payment provider '${requested}' is not registered`)
  }
  return provider
}

export function paymentsAreDemo() {
  try { return getPaymentProvider().mode === 'demo' } catch { return true }
}
