import type { FastifyInstance } from 'fastify'
import { desc } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { emailLog } from '../db/schema.js'
import { requirePerm } from '../auth/plugin.js'
import { audit } from '../audit.js'
import { env } from '../env.js'
import { alertRecipients, isMailConfigured, sendMail, signature } from '../mail.js'
import { getCompany } from '../documents.js'
import { invalid } from '../validation.js'

// État de la messagerie et message d'essai, pour vérifier qu'un nouveau réglage fonctionne.

const testBody = z.object({ to: z.string().trim().min(1, 'Indiquez une adresse e-mail.').pipe(z.email('Adresse e-mail invalide.')) })

export async function mailRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requirePerm('site.manage'))

  app.get('/status', async () => ({
    configure: isMailConfigured(),
    expediteur: env.MAIL_FROM ?? null,
    alertes: await alertRecipients(),
    journal: await db.select().from(emailLog).orderBy(desc(emailLog.at)).limit(30),
  }))

  app.post('/test', async (req, reply) => {
    const parsed = testBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    if (!isMailConfigured()) return reply.code(503).send({ error: 'L’envoi d’e-mails n’est pas configuré sur ce serveur.' })
    const company = await getCompany()
    const result = await sendMail({
      kind: 'test',
      to: [parsed.data.to],
      subject: `Essai d’envoi — ${company.raisonSociale}`,
      text: `Bonjour,\n\nCe message est un essai : si vous le lisez, l’envoi d’e-mails fonctionne.\n\n${signature(company)}`,
      userId: req.user!.id,
    })
    if (!result.ok) return reply.code(502).send({ error: `Le message d’essai n’est pas parti : ${result.error}.` })
    await audit(req, 'mail.test', { targetType: 'mail' })
    return { ok: true }
  })
}
