import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { companySettings, DOCUMENT_TYPES, documentTemplate } from '../db/schema.js'
import { getCompany, getTemplate, nextNumbers, publicCompany, setNextNumber, formatNumber, yearOf } from '../documents.js'
import { inspectImage, renderDocument, sampleDocument } from '../pdf.js'
import { getPricingSettings } from '../pricing.js'
import { requirePerm } from '../auth/plugin.js'
import { audit } from '../audit.js'
import { diff, integer, invalid } from '../validation.js'

const LOGO_MAX = 1024 * 1024

const digits = (s: string) => s.replace(/\D/g, '')
/** Clé de Luhn, utilisée par les numéros SIREN et SIRET. */
const luhn = (n: string) =>
  n
    .split('')
    .reverse()
    .reduce((sum, c, i) => {
      let d = Number(c)
      if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2
      return sum + d
    }, 0) %
    10 ===
  0
/** Contrôle modulo 97 d'un IBAN. */
const ibanOk = (iban: string) => {
  const r = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
  let mod = 0
  for (const ch of r) mod = (mod * 10 + Number(ch)) % 97
  return mod === 1
}

const line = (max: number, label: string) => z.string().trim().max(max, `${label} : ${max} caractères maximum.`)
const block = (max: number, label: string) =>
  z
    .string()
    .max(max, `${label} : ${max} caractères maximum.`)
    // Lignes nettoyées, sans lignes vides en trop au début et à la fin
    .transform((s) => s.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim())
const orEmpty = <T extends z.ZodType>(schema: T) => z.union([z.literal(''), schema])

const companyFields = {
  raisonSociale: z.string().trim().min(1, 'La raison sociale est requise.').max(120),
  formeJuridique: line(60, 'Forme juridique'),
  capital: line(40, 'Capital'),
  adresse: block(300, 'Adresse'),
  telephone: line(40, 'Téléphone'),
  email: z.string().trim().pipe(orEmpty(z.email('Adresse e-mail invalide.').max(120))),
  siteWeb: line(120, 'Site web'),
  siret: z
    .string()
    .trim()
    .transform((s) => (s ? digits(s) : ''))
    .pipe(orEmpty(z.string().length(14, 'SIRET : 14 chiffres attendus.').refine(luhn, 'SIRET invalide : vérifiez les chiffres.')))
    .transform((s) => (s ? `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9)}` : '')),
  rcs: line(80, 'RCS'),
  tvaIntra: z
    .string()
    .transform((s) => s.replace(/\s/g, '').toUpperCase())
    .pipe(orEmpty(z.string().regex(/^FR[0-9A-Z]{2}\d{9}$/, 'TVA intracommunautaire : format FR suivi de 11 caractères (ex. FR12345678901).'))),
  iban: z
    .string()
    .transform((s) => s.replace(/\s/g, '').toUpperCase())
    .pipe(orEmpty(z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/, 'IBAN invalide.').refine(ibanOk, 'IBAN invalide : vérifiez les caractères.')))
    .transform((s) => s.replace(/(.{4})/g, '$1 ').trim()),
  bic: z
    .string()
    .transform((s) => s.replace(/\s/g, '').toUpperCase())
    .pipe(orEmpty(z.string().regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, 'BIC invalide : 8 ou 11 caractères.'))),
}

const prefixe = (label: string) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,4}$/, `${label} : 1 à 4 lettres.`)
const templateFields = {
  couleur: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^#[0-9a-f]{6}$/, 'Couleur invalide : format #rrggbb attendu.'),
  entete: block(1000, 'Introduction'),
  conditionsPaiement: block(1000, 'Conditions de paiement'),
  validiteDevis: integer(1, 365, 'Validité du devis', 'jours'),
  // La loi limite le délai de paiement entre professionnels à 60 jours
  echeanceFacture: integer(0, 60, 'Délai de paiement', 'jours'),
  noteDevis: block(1000, 'Note du devis'),
  noteFacture: block(1000, 'Note de la facture'),
  mentionsLegales: block(2000, 'Mentions légales'),
  piedDePage: block(300, 'Pied de page'),
  prefixeDevis: prefixe('Préfixe des devis'),
  prefixeFacture: prefixe('Préfixe des factures'),
}
const samePrefix = (t: { prefixeDevis: string; prefixeFacture: string }) => t.prefixeDevis === t.prefixeFacture

const nextNumber = (label: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? Number(v.trim()) : v),
    z.number({ error: `${label} : nombre attendu.` }).int(`${label} : nombre entier attendu.`).min(1, `${label} : 1 au minimum.`).max(999999, `${label} : 999 999 au maximum.`),
  )
const numberingBody = z.object({
  devis: nextNumber('Prochain numéro de devis').optional(),
  facture: nextNumber('Prochain numéro de facture').optional(),
})

const previewBody = z.object({
  type: z.enum(DOCUMENT_TYPES, { error: 'Type de document inconnu.' }),
  company: z.object(companyFields).partial().optional(),
  template: z.object(templateFields).partial().optional(),
})

export async function documentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requirePerm('documents.manage'))

  // Le logo arrive tel quel (corps de la requête = le fichier)
  app.addContentTypeParser(['image/png', 'image/jpeg'], { parseAs: 'buffer', bodyLimit: LOGO_MAX + 1024 }, (_req, body, done) => done(null, body))

  app.get('/settings', async () => {
    const [company, template] = await Promise.all([getCompany(), getTemplate()])
    return { company: publicCompany(company), template, numbering: await nextNumbers(template) }
  })

  app.patch('/company', async (req, reply) => {
    const parsed = z.object(companyFields).partial().safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const before = await getCompany()
    const changes = diff(before as Record<string, unknown>, parsed.data as Record<string, unknown>)
    if (!Object.keys(changes).length) return { company: publicCompany(before) }
    const [company] = await db
      .update(companySettings)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(companySettings.id, 1))
      .returning()
    await audit(req, 'documents.company_updated', { targetType: 'company', details: { changements: changes } })
    return { company: publicCompany(company!) }
  })

  app.patch('/template', async (req, reply) => {
    const parsed = z.object(templateFields).partial().safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const before = await getTemplate()
    if (samePrefix({ ...before, ...parsed.data })) {
      return reply.code(400).send({ error: 'Les devis et les factures doivent avoir des préfixes différents.', field: 'prefixeFacture' })
    }
    const changes = diff(before as Record<string, unknown>, parsed.data as Record<string, unknown>)
    if (!Object.keys(changes).length) return { template: before, numbering: await nextNumbers(before) }
    const [template] = await db
      .update(documentTemplate)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(documentTemplate.id, 1))
      .returning()
    await audit(req, 'documents.template_updated', { targetType: 'template', details: { changements: changes } })
    return { template, numbering: await nextNumbers(template!) }
  })

  // Reprise d'une numérotation existante : prochain numéro de l'année, seulement vers l'avant
  app.patch('/numbering', async (req, reply) => {
    const parsed = numberingBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const template = await getTemplate()
    const annee = yearOf(new Date())
    for (const type of DOCUMENT_TYPES) {
      const next = parsed.data[type]
      if (next === undefined) continue
      const current = (await nextNumbers(template))[type].numero
      if (next === current) continue
      const res = await setNextNumber(type, next)
      if (!res.ok) {
        const p = type === 'devis' ? template.prefixeDevis : template.prefixeFacture
        return reply.code(400).send({
          error: `Le numéro ${formatNumber(p, annee, res.last)} est déjà attribué : le prochain ne peut pas être inférieur à ${res.last + 1}.`,
          field: type,
        })
      }
      await audit(req, 'documents.numbering_updated', { targetType: 'numbering', details: { type, annee, avant: current, apres: next } })
    }
    return { numbering: await nextNumbers(template) }
  })

  // Aperçu du modèle avec des données d'exemple, y compris les réglages pas encore enregistrés
  app.post('/preview', async (req, reply) => {
    const parsed = previewBody.safeParse(req.body)
    if (!parsed.success) {
      // Désigne le champ fautif (« couleur ») plutôt que son groupe (« template »)
      const issue = parsed.error.issues[0]
      const field = issue?.path.at(-1)
      return reply.code(400).send({ error: issue?.message ?? 'Données invalides.', field: field !== undefined ? String(field) : undefined })
    }
    const [company, template, pricing] = await Promise.all([getCompany(), getTemplate(), getPricingSettings()])
    const t = { ...template, ...parsed.data.template }
    const numbering = await nextNumbers(t)
    const pdf = await renderDocument({ ...company, ...parsed.data.company }, t, company.logo, sampleDocument(parsed.data.type, numbering[parsed.data.type].label, pricing.tva))
    return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `inline; filename="apercu-${parsed.data.type}.pdf"`).send(pdf)
  })

  app.get('/logo', async (_req, reply) => {
    const c = await getCompany()
    if (!c.logo || !c.logoType) return reply.code(404).send({ error: 'Aucun logo envoyé : le logo de l’appli est utilisé.' })
    return reply.header('Content-Type', c.logoType).header('X-Content-Type-Options', 'nosniff').header('Content-Disposition', 'inline').send(c.logo)
  })

  app.put('/logo', async (req, reply) => {
    const body = req.body
    if (!Buffer.isBuffer(body) || !body.length) return reply.code(415).send({ error: 'Envoyez une image PNG ou JPEG.', field: 'logo' })
    if (body.length > LOGO_MAX) return reply.code(413).send({ error: 'Image trop lourde : 1 Mo maximum.', field: 'logo' })
    const img = await inspectImage(body)
    if (!img || img.type !== req.headers['content-type']) return reply.code(400).send({ error: 'Image illisible : envoyez un fichier PNG ou JPEG valide.', field: 'logo' })
    if (img.width < 64 || img.height < 32) return reply.code(400).send({ error: 'Image trop petite : 64 × 32 pixels minimum pour rester net à l’impression.', field: 'logo' })
    await getCompany()
    await db.update(companySettings).set({ logo: body, logoType: img.type, logoUpdatedAt: new Date() }).where(eq(companySettings.id, 1))
    await audit(req, 'documents.logo_updated', { targetType: 'company', details: { type: img.type, largeur: img.width, hauteur: img.height, octets: body.length } })
    return { company: publicCompany(await getCompany()) }
  })

  app.delete('/logo', async (req) => {
    const before = await getCompany()
    if (before.logo) {
      await db.update(companySettings).set({ logo: null, logoType: null, logoUpdatedAt: new Date() }).where(eq(companySettings.id, 1))
      await audit(req, 'documents.logo_removed', { targetType: 'company' })
    }
    return { company: publicCompany(await getCompany()) }
  })
}
