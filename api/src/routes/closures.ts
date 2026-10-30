import type { FastifyInstance, FastifyReply } from 'fastify'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { closures } from '../db/schema.js'
import { CLOSURE_MAX_DAYS, spanDays } from '../closures.js'
import { todayParis } from '../departures.js'
import { requirePerm } from '../auth/plugin.js'
import { audit } from '../audit.js'
import { invalid } from '../validation.js'

// Fermetures exceptionnelles de l'atelier : réservées à la direction (section Direction, avec le catalogue et les tarifs)

const day = (label: string) =>
  z
    .string({ error: `${label} : date attendue.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} : date attendue (AAAA-MM-JJ).`)
    .refine((d) => !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && new Date(`${d}T12:00:00Z`).toISOString().startsWith(d), `${label} : date invalide.`)
const body = z
  .object({
    debut: day('Premier jour'),
    fin: day('Dernier jour'),
    motif: z.string({ error: 'Indiquez le motif.' }).trim().min(1, 'Indiquez le motif (congés, jour férié, panne…).').max(120, 'Motif : 120 caractères maximum.'),
  })
  .superRefine((b, ctx) => {
    if (b.fin < b.debut) ctx.addIssue({ code: 'custom', path: ['fin'], message: 'Le dernier jour ne peut pas précéder le premier.' })
    else if (spanDays(b.debut, b.fin) > CLOSURE_MAX_DAYS) ctx.addIssue({ code: 'custom', path: ['fin'], message: `Une fermeture dure ${CLOSURE_MAX_DAYS} jours au plus.` })
  })

async function find(id: string, reply: FastifyReply) {
  const [c] = z.uuid().safeParse(id).success ? await db.select().from(closures).where(eq(closures.id, id)) : []
  if (!c) reply.code(404).send({ error: 'Fermeture introuvable.' })
  return c ?? null
}

export async function closureRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requirePerm('catalog.manage'))

  app.get('/closures', async () => ({ closures: await db.select().from(closures).orderBy(asc(closures.debut), asc(closures.fin)), today: todayParis() }))

  app.post('/closures', async (req, reply) => {
    const parsed = body.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    if (parsed.data.fin < todayParis()) return reply.code(400).send({ error: 'Cette fermeture est déjà passée.', field: 'fin' })
    const [c] = await db.insert(closures).values(parsed.data).returning()
    await audit(req, 'closure.created', { targetType: 'closure', targetId: c!.id, details: parsed.data })
    return reply.code(201).send({ closure: c })
  })

  app.patch('/closures/:id', async (req, reply) => {
    const c = await find((req.params as { id: string }).id, reply)
    if (!c) return
    const parsed = body.safeParse({ debut: c.debut, fin: c.fin, motif: c.motif, ...(req.body as object) })
    if (!parsed.success) return invalid(reply, parsed.error)
    if (parsed.data.fin < todayParis()) return reply.code(400).send({ error: 'Cette fermeture est déjà passée.', field: 'fin' })
    const [after] = await db.update(closures).set(parsed.data).where(eq(closures.id, c.id)).returning()
    await audit(req, 'closure.updated', { targetType: 'closure', targetId: c.id, details: { avant: { debut: c.debut, fin: c.fin, motif: c.motif }, apres: parsed.data } })
    return { closure: after }
  })

  app.delete('/closures/:id', async (req, reply) => {
    const c = await find((req.params as { id: string }).id, reply)
    if (!c) return
    await db.delete(closures).where(eq(closures.id, c.id))
    await audit(req, 'closure.deleted', { targetType: 'closure', targetId: c.id, details: { debut: c.debut, fin: c.fin, motif: c.motif } })
    return { ok: true }
  })
}
