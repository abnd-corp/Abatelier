import type { FastifyInstance, FastifyReply } from 'fastify'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { deliverySettings, type DeliverySettings } from '../db/schema.js'
import { deliveryQuote, getDeliverySettings } from '../delivery.js'
import { geo, GeoUnavailable } from '../geo.js'
import { requirePerm } from '../auth/plugin.js'
import { audit } from '../audit.js'
import { decimal, diff, integer, invalid } from '../validation.js'

// Champ laissé vide dans le formulaire : null (« jamais offerte », « pas de supplément »)
const orNull = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' || v === undefined ? null : v), z.union([z.null(), schema]))

const zone = z.object({
  distanceMax: integer(1, 1000, 'Distance de la zone', 'km'),
  prix: decimal(0, 10000, 'Prix de la livraison', '€'),
  franco: orNull(decimal(0, 1000000, 'Livraison offerte dès', '€')),
})

const deliveryFields = {
  retraitActif: z.boolean({ error: 'Retrait à l’atelier : oui ou non attendu.' }),
  retraitInfo: z.string().trim().max(300, 'Informations de retrait : 300 caractères maximum.'),
  atelierAdresse: z.string().trim().min(5, 'Indiquez l’adresse de l’atelier.').max(200),
  zones: z
    .array(zone)
    .max(8, '8 zones maximum.')
    .refine((t) => t.every((p, i) => i === 0 || p.distanceMax > t[i - 1]!.distanceMax), 'Les zones doivent aller de la plus proche à la plus lointaine, sans doublon.'),
  longueurSeuil: orNull(integer(100, 20000, 'Seuil des pièces longues', 'mm')),
  longueurPrix: decimal(0, 10000, 'Supplément pièces longues', '€'),
}

const estimateBody = z.object({
  adresse: z.string().trim().min(3, 'Indiquez une adresse ou une commune.').max(200),
  montant: orNull(decimal(0, 10000000, 'Montant de la commande', '€')).optional(),
  longueurMax: orNull(integer(1, 100000, 'Longueur de la plus grande pièce', 'mm')).optional(),
})

const unavailable = (reply: FastifyReply) => reply.code(503).send({ error: 'Le service de localisation des adresses ne répond pas. Réessayez dans quelques minutes.' })
const notFound = (reply: FastifyReply, field: string) =>
  reply.code(400).send({ error: 'Adresse introuvable : précisez la rue, le code postal et la commune.', field })

/** Coordonnées de l'atelier : localisées une fois, puis gardées en base. */
async function atelier(s: DeliverySettings) {
  if (s.atelierLat !== null && s.atelierLon !== null) return { lat: s.atelierLat, lon: s.atelierLon }
  const place = await geo.geocode(s.atelierAdresse)
  if (!place) return null
  await db.update(deliverySettings).set({ atelierLabel: place.label, atelierLat: place.lat, atelierLon: place.lon }).where(eq(deliverySettings.id, 1))
  return place
}

export async function deliveryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requirePerm('catalog.manage'))

  app.get('/delivery', async () => ({ delivery: await getDeliverySettings() }))

  app.patch('/delivery', async (req, reply) => {
    const parsed = z.object(deliveryFields).partial().safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const before = await getDeliverySettings()
    const data: Partial<DeliverySettings> = { ...parsed.data }
    const merged = { ...before, ...data }
    if (!merged.retraitActif && !merged.zones.length) {
      return reply.code(400).send({ error: 'Gardez au moins le retrait à l’atelier ou une zone de livraison.', field: 'zones' })
    }
    const changes = diff(before as Record<string, unknown>, parsed.data as Record<string, unknown>)
    if (!Object.keys(changes).length) return { delivery: before }

    // Nouvelle adresse de départ : on la localise tout de suite, pour signaler une faute de frappe
    if (changes.atelierAdresse) {
      try {
        const place = await geo.geocode(merged.atelierAdresse)
        if (!place) return notFound(reply, 'atelierAdresse')
        Object.assign(data, { atelierLabel: place.label, atelierLat: place.lat, atelierLon: place.lon })
      } catch (e) {
        if (e instanceof GeoUnavailable) return unavailable(reply)
        throw e
      }
    }

    const [delivery] = await db
      .update(deliverySettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(deliverySettings.id, 1))
      .returning()
    await audit(req, 'catalog.delivery_updated', { targetType: 'delivery', details: { changements: changes } })
    return { delivery }
  })

  // Simulateur : prix de livraison pour une adresse de chantier
  app.post('/delivery/estimate', async (req, reply) => {
    const parsed = estimateBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const { adresse, montant, longueurMax } = parsed.data
    const s = await getDeliverySettings()
    try {
      const from = await atelier(s)
      if (!from) return reply.code(400).send({ error: 'L’adresse de l’atelier est introuvable : corrigez-la dans les réglages de livraison.', field: 'atelierAdresse' })
      const to = await geo.geocode(adresse)
      if (!to) return notFound(reply, 'adresse')
      const distance = await geo.roadKm(from, to)
      const km = Math.round(distance.km * 10) / 10
      return {
        adresse: to.label,
        distanceKm: km,
        methode: distance.methode,
        retrait: { actif: s.retraitActif, info: s.retraitInfo },
        ...deliveryQuote(s, km, { montant: montant ?? undefined, longueurMax: longueurMax ?? undefined }),
      }
    } catch (e) {
      if (e instanceof GeoUnavailable) return unavailable(reply)
      throw e
    }
  })
}
