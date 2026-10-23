import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { payments } from '../db/schema.js'
import { auditSystem } from '../audit.js'
import { env } from '../env.js'
import { verifyStripeEvent } from '../payments.js'
import { confirmPayment, failPayment } from '../shop.js'

// Notifications du prestataire de paiement (webhooks). Route publique : seule la signature fait foi, vérifiée sur le corps brut.
export async function paiementRoutes(app: FastifyInstance) {
  // Ici le corps JSON reste brut : la signature se calcule dessus
  app.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 256 * 1024 }, (_req, body, done) => done(null, body))

  app.post('/stripe', { config: { webhook: true } }, async (req, reply) => {
    const secret = env.STRIPE_WEBHOOK_SECRET
    if (env.PAYMENT_PROVIDER !== 'stripe' || !secret) return reply.code(404).send({ error: 'Introuvable.' })
    const event = verifyStripeEvent(req.body as Buffer, req.headers['stripe-signature'] as string | undefined, secret)
    if (!event) return reply.code(400).send({ error: 'Signature invalide.' })

    const obj = event.data.object
    const id = String(obj.client_reference_id ?? obj.metadata?.payment_id ?? '')
    if (!z.uuid().safeParse(id).success) return { received: true }
    const [p] = await db.select().from(payments).where(eq(payments.id, id))
    // La notification doit parler de la session que nous avons ouverte pour ce paiement
    if (!p || p.provider !== 'stripe' || p.providerRef !== obj.id) return { received: true }

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      if (obj.payment_status === 'paid') await confirmPayment(p.id, typeof obj.payment_intent === 'string' ? obj.payment_intent : null)
    } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      await failPayment(p.id)
      await auditSystem('boutique.payment_failed', { targetType: 'payment', targetId: p.id, details: { montant: p.montantTtc, evenement: event.type } })
    }
    return { received: true }
  })
}
