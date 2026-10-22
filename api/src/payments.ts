import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from './env.js'

// Paiement en ligne de la boutique. Un seul interlocuteur, deux réalisations :
//   - stripe : Stripe Checkout (page de paiement hébergée par Stripe : aucune donnée de carte ne passe par nous) ;
//   - simulation : faux paiement pour le développement et les tests, avec sa propre page (jamais en production).
// Les notifications de Stripe (webhooks) sont la seule preuve qu'un paiement a eu lieu : le retour du navigateur ne compte pas.

export class PaymentError extends Error {}

export interface CheckoutRequest {
  paymentId: string
  montantCents: number
  description: string
  email: string | null
  successUrl: string
  cancelUrl: string
}
export interface RefundRequest {
  paymentId: string
  ref: string
  providerPayment: string | null
  montantCents: number
}
export interface PaymentProvider {
  name: 'stripe' | 'simulation'
  createCheckout(r: CheckoutRequest): Promise<{ url: string; ref: string }>
  refund(r: RefundRequest): Promise<{ ref: string }>
}

const STRIPE = 'https://api.stripe.com/v1'

/** Appel Stripe : corps encodé en formulaire, clé secrète en en-tête. Les erreurs sont reformulées sans détail technique. */
async function stripe(path: string, params: Record<string, string>, idempotencyKey?: string): Promise<Record<string, any>> {
  let res: Response
  try {
    res = await fetch(`${STRIPE}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new PaymentError('Le service de paiement ne répond pas. Réessayez dans quelques instants.')
  }
  const data = (await res.json().catch(() => null)) as Record<string, any> | null
  if (!res.ok || !data) {
    console.error(`Stripe ${path} : ${res.status} ${data?.error?.message ?? ''}`)
    throw new PaymentError(
      path.startsWith('/refunds')
        ? 'Le remboursement a été refusé par le service de paiement. Vérifiez-le dans votre tableau de bord Stripe.'
        : 'Le service de paiement a refusé la demande. Réessayez ou contactez-nous.',
    )
  }
  return data
}

const stripeProvider: PaymentProvider = {
  name: 'stripe',
  async createCheckout(r) {
    const s = await stripe(
      '/checkout/sessions',
      {
        mode: 'payment',
        success_url: r.successUrl,
        cancel_url: r.cancelUrl,
        client_reference_id: r.paymentId,
        'metadata[payment_id]': r.paymentId,
        'payment_intent_data[metadata][payment_id]': r.paymentId,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'eur',
        'line_items[0][price_data][unit_amount]': String(r.montantCents),
        'line_items[0][price_data][product_data][name]': r.description,
        ...(r.email ? { customer_email: r.email } : {}),
      },
      `checkout-${r.paymentId}`,
    )
    if (typeof s.id !== 'string' || typeof s.url !== 'string') throw new PaymentError('Le service de paiement a répondu de façon inattendue.')
    return { url: s.url, ref: s.id }
  },
  async refund(r) {
    if (!r.providerPayment) throw new PaymentError('Ce paiement n’a pas d’identifiant chez Stripe : remboursez-le depuis le tableau de bord Stripe.')
    const x = await stripe('/refunds', { payment_intent: r.providerPayment, amount: String(r.montantCents), 'metadata[payment_id]': r.paymentId }, `refund-${r.paymentId}`)
    return { ref: String(x.id) }
  },
}

// Faux prestataire : la page « paiement-simulation » du site remplace la page de Stripe
const simulationProvider: PaymentProvider = {
  name: 'simulation',
  async createCheckout(r) {
    return { url: `/paiement-simulation/${r.paymentId}`, ref: `sim_${r.paymentId}` }
  },
  async refund(r) {
    return { ref: `sim_refund_${r.paymentId}` }
  },
}

/** Le prestataire configuré, ou null quand le paiement en ligne est désactivé. */
export function paymentProvider(): PaymentProvider | null {
  if (env.PAYMENT_PROVIDER === 'stripe') return stripeProvider
  if (env.PAYMENT_PROVIDER === 'simulation') return simulationProvider
  return null
}

/** Un paiement reçu par le prestataire de cette référence ? (un paiement ne se rembourse que chez celui qui l'a encaissé) */
export const providerOf = (name: string): PaymentProvider | null => (name === 'stripe' ? stripeProvider : name === 'simulation' ? simulationProvider : null)

const TOLERANCE_S = 300

/** Vérifie la signature d'une notification Stripe (en-tête Stripe-Signature) sur le corps brut, et renvoie l'événement. */
export function verifyStripeEvent(raw: Buffer, header: string | undefined, secret: string, now = Date.now()): { type: string; data: { object: Record<string, any> } } | null {
  if (!header) return null
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]))
  const t = Number(parts.t)
  const sigs = header
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .map((p) => p.slice(3))
  if (!Number.isFinite(t) || !sigs.length || Math.abs(now / 1000 - t) > TOLERANCE_S) return null
  const expected = createHmac('sha256', secret)
    .update(`${t}.${raw.toString('utf8')}`)
    .digest()
  const ok = sigs.some((s) => {
    const got = Buffer.from(s, 'hex')
    return got.length === expected.length && timingSafeEqual(got, expected)
  })
  if (!ok) return null
  try {
    const event = JSON.parse(raw.toString('utf8'))
    return typeof event?.type === 'string' && event.data?.object ? event : null
  } catch {
    return null
  }
}
