export type PaymentStatus = 'UNPAID' | 'PENDING' | 'VERIFIED' | 'FAILED'

export type PaymentIntent = {
  id: string
  provider: 'mock' | 'x402'
  amount: number
  currency: string
  status: PaymentStatus
  checkoutUrl?: string
  demo: boolean
}

export interface PaymentProvider {
  createIntent(input: { amount: number; currency: string; reference: string }): Promise<PaymentIntent>
  verifyPayment(paymentId: string): Promise<{ verified: boolean; status: PaymentStatus }>
}

export class MockPaymentProvider implements PaymentProvider {
  async createIntent(input: { amount: number; currency: string; reference: string }): Promise<PaymentIntent> {
    return { id: `demo_${input.reference}`, provider: 'mock', amount: input.amount, currency: input.currency, status: 'PENDING', checkoutUrl: undefined, demo: true }
  }
  async verifyPayment(paymentId: string) {
    return { verified: paymentId.startsWith('demo_'), status: paymentId.startsWith('demo_') ? 'VERIFIED' as const : 'FAILED' as const }
  }
}

export function getPaymentProvider(): PaymentProvider {
  // x402 is intentionally unavailable until a verified provider is configured.
  // The mock provider is explicitly labeled demo-only and never represents a real charge.
  return new MockPaymentProvider()
}
