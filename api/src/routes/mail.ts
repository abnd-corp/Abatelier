import type { FastifyInstance } from 'fastify'
import { desc } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { emailLog } from '../db/schema.js'
import { requirePerm } from '../auth/plugin.js'
import { audit } from '../audit.js'
import { env } from '../env.js'
import { alertRecipients, buildHtml, isMailConfigured, sendMail, signature } from '../mail.js'
import { LOGO_CID } from '../mail-layout.js'
import { mailExamples } from '../mail-texts.js'
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

  // Aperçu : chaque message avec des données fictives, tel qu'il partirait (et de quoi se l'envoyer pour le voir dans sa messagerie)
  const origin = (req: { headers: Record<string, string | string[] | undefined>; protocol: string }) => `${req.headers['x-forwarded-proto'] ?? req.protocol}://${req.headers.host}`
  const find = async (req: Parameters<typeof origin>[0], id: string) => mailExamples(await getCompany(), origin(req)).find((m) => m.id === id) ?? null

  app.get('/apercu', async (req) => ({ modeles: mailExamples(await getCompany(), origin(req)).map((m) => ({ id: m.id, titre: m.titre, audience: m.audience })) }))

  app.get('/apercu/:id', async (req, reply) => {
    const m = await find(req, (req.params as { id: string }).id)
    if (!m) return reply.code(404).send({ error: 'Modèle de message inconnu.' })
    const { html, logo } = await buildHtml({ subject: m.subject, text: m.text, htmlText: m.htmlText, titre: m.titreMail, action: m.action, audience: m.audience })
    // Le logo, joint au vrai message, est ici intégré à la page
    const apercu = logo ? html.replace(`cid:${LOGO_CID}`, `data:${logo.contentType};base64,${logo.content.toString('base64')}`) : html
    return { id: m.id, titre: m.titre, sujet: m.subject, texte: m.text, html: apercu }
  })

  app.post('/apercu/:id/envoyer', async (req, reply) => {
    const m = await find(req, (req.params as { id: string }).id)
    if (!m) return reply.code(404).send({ error: 'Modèle de message inconnu.' })
    const parsed = testBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    if (!isMailConfigured()) return reply.code(503).send({ error: 'L’envoi d’e-mails n’est pas configuré sur ce serveur.' })
    const result = await sendMail({
      kind: 'test',
      to: [parsed.data.to],
      subject: `[Exemple] ${m.subject}`,
      text: m.text,
      htmlText: m.htmlText,
      titre: m.titreMail,
      action: m.action,
      audience: m.audience,
      userId: req.user!.id,
    })
    if (!result.ok) return reply.code(502).send({ error: `L’exemple n’est pas parti : ${result.error}.` })
    await audit(req, 'mail.test', { targetType: 'mail', details: { modele: m.id } })
    return { ok: true }
  })

  app.post('/test', async (req, reply) => {
    const parsed = testBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    if (!isMailConfigured()) return reply.code(503).send({ error: 'L’envoi d’e-mails n’est pas configuré sur ce serveur.' })
    const company = await getCompany()
    const result = await sendMail({
      kind: 'test',
      audience: 'equipe',
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
