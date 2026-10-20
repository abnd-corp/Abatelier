import type { FastifyInstance } from 'fastify'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { contactRequests, sitePhotos } from '../db/schema.js'
import { getCompany } from '../documents.js'
import { fillCompany, getContent } from '../site.js'
import { getReviews } from '../google-reviews.js'
import { audit } from '../audit.js'
import { env } from '../env.js'
import { alertRecipients, sendMail, withTimeout } from '../mail.js'
import { contactAlert } from '../mail-texts.js'
import { invalid } from '../validation.js'
import { line, livraison, orderCatalog, priceBody } from './orders.js'

// Routes ouvertes à tous les visiteurs du site vitrine : aucune donnée privée, jamais de session.

export const ATTACHMENT_MAX = 5 * 1024 * 1024
export const ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const

/** Vérifie le contenu réel du fichier (et pas seulement son nom ou le type annoncé par le navigateur). */
export function sniffAttachment(buf: Buffer): (typeof ATTACHMENT_TYPES)[number] | null {
  if (buf.length > 4 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf'
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  return null
}

const opt = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} : ${max} caractères maximum.`)
    .nullish()
    .transform((v) => v || null)

const contactFields = {
  nom: z.string().trim().min(1, 'Indiquez votre nom.').max(100, 'Nom : 100 caractères maximum.'),
  email: z.string().trim().toLowerCase().min(1, 'Indiquez votre adresse e-mail.').max(120).pipe(z.email('Adresse e-mail invalide.')),
  telephone: opt(30, 'Téléphone').refine((v) => v === null || /^\+?[0-9 .()-]{6,25}$/.test(v), 'Numéro de téléphone invalide.'),
  adresse: opt(200, 'Adresse'),
  codePostal: opt(10, 'Code postal').refine((v) => v === null || /^\d{5}$/.test(v), 'Code postal : 5 chiffres.'),
  ville: opt(80, 'Ville'),
}
const consentement = z.literal(true, { error: 'Cochez la case pour accepter l’utilisation de vos données pour traiter votre demande.' })

// Pièces et livraison du configurateur : mêmes règles que la saisie de l'atelier, avec moins de pièces
const configBody = z.object({ lignes: z.array(line).min(1, 'Ajoutez au moins une pièce.').max(20, '20 pièces maximum : pour plus, contactez-nous.'), livraison })
const devisBody = z.object({
  ...contactFields,
  message: opt(5000, 'Message'),
  consentement,
  // Champ caché que seuls les robots remplissent
  site: z.string().optional(),
  ...configBody.shape,
})

const contactBody = z.object({
  ...contactFields,
  objet: z.string().trim().min(1, 'Indiquez l’objet de votre demande.').max(150, 'Objet : 150 caractères maximum.'),
  message: z.string().trim().min(1, 'Écrivez votre message.').max(5000, 'Message : 5000 caractères maximum.'),
  consentement,
  // Champ caché que seuls les robots remplissent
  site: z.string().optional(),
  fichier: z
    .object({
      nom: z.string().trim().min(1).max(150),
      // Contenu en base64
      contenu: z.string().max(Math.ceil((ATTACHMENT_MAX * 4) / 3) + 64 * 1024),
    })
    .nullish(),
})

// Pages du site, pour le plan du site
const PUBLIC_PAGES = ['/', '/pliage-aluminium', '/configurateur', '/contact', '/mentions-legales', '/politique-de-confidentialite', '/conditions-generales-de-vente', '/cookies']

const safeName = (n: string) => n.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 100) || 'plan'

export async function publicRoutes(app: FastifyInstance) {
  // Textes, coordonnées et photos de toutes les pages
  app.get('/site', async (_req, reply) => {
    const [company, content, photos] = await Promise.all([
      getCompany(),
      getContent(),
      db.select({ id: sitePhotos.id, emplacement: sitePhotos.emplacement, alt: sitePhotos.alt, largeur: sitePhotos.largeur, hauteur: sitePhotos.hauteur }).from(sitePhotos).orderBy(asc(sitePhotos.position), asc(sitePhotos.createdAt)),
    ])
    const contenu = await fillCompany(content)
    const placeId = env.GOOGLE_PLACE_ID
    // Toujours revérifié : une modification de la direction doit se voir tout de suite (les photos, elles, ont un identifiant par version)
    reply.header('Cache-Control', 'no-cache')
    return {
      entreprise: {
        nom: company.raisonSociale,
        adresse: company.adresse,
        telephone: company.telephone,
        email: company.email,
        siret: company.siret,
        logo: company.logo !== null,
        // Itinéraire : lien simple vers Google Maps, rien n'est chargé chez Google tant que le visiteur ne clique pas
        itineraire: placeId
          ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(company.adresse.replace(/\n+/g, ', '))}`,
      },
      contenu,
      photos,
    }
  })

  app.get('/photos/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [p] = z.uuid().safeParse(id).success ? await db.select().from(sitePhotos).where(eq(sitePhotos.id, id)) : []
    if (!p) return reply.code(404).send({ error: 'Photo introuvable.' })
    // L'identifiant change à chaque nouvelle photo : le navigateur peut la garder longtemps
    return reply.header('Content-Type', p.type).header('Cache-Control', 'public, max-age=31536000, immutable').header('X-Content-Type-Options', 'nosniff').send(p.data)
  })

  // Référencement. Adresse du site déduite de la requête (nginx transmet Host et le protocole).
  const origin = (req: { headers: Record<string, string | string[] | undefined>; protocol: string }) => `${req.headers['x-forwarded-proto'] ?? req.protocol}://${req.headers.host}`
  app.get('/robots.txt', async (req, reply) => {
    // L'atelier (pages privées) et l'API ne doivent pas apparaître dans Google
    const privatePaths = ['/api/', '/connexion', '/tableau-de-bord', '/mon-compte', '/salaries', '/clients', '/commandes', '/factures', '/fabrication', '/catalogue', '/modeles-documents', '/site-vitrine', '/utilisateurs', '/journal']
    return reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header('Cache-Control', 'public, max-age=3600')
      .send(['User-agent: *', ...privatePaths.map((p) => `Disallow: ${p}`), `Sitemap: ${origin(req)}/sitemap.xml`, ''].join('\n'))
  })
  app.get('/sitemap.xml', async (req, reply) => {
    const base = origin(req)
    const urls = PUBLIC_PAGES.map((p) => `  <url><loc>${base}${p}</loc></url>`).join('\n')
    return reply
      .header('Content-Type', 'application/xml; charset=utf-8')
      .header('Cache-Control', 'public, max-age=3600')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)
  })

  // --- Configurateur : les pièces et le prix en direct, sans compte ---

  app.get('/configurateur', async (_req, reply) => {
    reply.header('Cache-Control', 'no-cache')
    return orderCatalog()
  })

  const pathField = (e: z.ZodError) => (e.issues[0]?.path.length ? e.issues[0].path.join('.') : undefined)

  // Chiffrage d'un visiteur : particulier (pas de remise pro), 60 chiffrages par minute et par adresse
  app.post('/configurateur/chiffrage', { config: { rateLimit: { max: env.QUOTE_RATE_LIMIT, timeWindow: '1 minute' } } }, async (req, reply) => {
    const parsed = configBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Données invalides.', field: pathField(parsed.error) })
    const p = await priceBody(parsed.data, false)
    if ('error' in p) return reply.code(p.status).send({ error: p.error, field: p.field })
    return { lignes: p.lines, totals: p.totals, distanceKm: p.distanceKm }
  })

  // Demande de devis : le visiteur laisse ses coordonnées avec ses pièces. Le prix est recalculé ici, jamais repris du navigateur.
  app.post('/devis', { config: { rateLimit: { max: env.CONTACT_RATE_LIMIT, timeWindow: '1 hour' } } }, async (req, reply) => {
    const parsed = devisBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Données invalides.', field: pathField(parsed.error) })
    const { site, consentement: _c, lignes, livraison: liv, message, ...contact } = parsed.data
    if (site) return reply.code(201).send({ ok: true })
    const p = await priceBody({ lignes, livraison: liv }, false)
    if ('error' in p) return reply.code(p.status).send({ error: p.error, field: p.field })
    const pieces = p.lines.reduce((s, l) => s + l.quantite, 0)
    const euros = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }).replace(/[  ]/g, ' ')
    const resume = p.lines.map((l) => `${l.quantite} × ${l.modeleLabel}${l.repere ? ` (${l.repere})` : ''} · ${l.materialLabel} · ${l.colorLabel} · longueur ${l.longueur.toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} mm`)
    const configuration = { lignes, livraison: liv, resume, ht: p.totals.ht, ttc: p.totals.ttc }
    const objet = `Demande de devis : ${pieces} pièce${pieces > 1 ? 's' : ''}, ${euros(p.totals.ttc)} TTC`
    const [row] = await db
      .insert(contactRequests)
      .values({ ...contact, objet, message: message ?? '', configuration })
      .returning({ id: contactRequests.id })
    const to = await alertRecipients()
    if (to.length) {
      const proto = req.headers['x-forwarded-proto'] ?? req.protocol
      const mail = contactAlert({ ...contact, objet, message: message ?? '', fichierNom: null, configuration }, `${proto}://${req.headers.host}/site-vitrine`)
      await withTimeout(sendMail({ kind: 'contact', to, subject: mail.subject, text: mail.text, replyTo: contact.email, targetType: 'contact', targetId: row!.id }), 6000, { ok: false, notConfigured: false, error: 'délai dépassé' })
    }
    await audit(req, 'contact.received', { actor: null, targetType: 'contact', targetId: row!.id, details: { objet, fichier: false, configurateur: true } })
    return reply.code(201).send({ ok: true })
  })

  app.get('/avis', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=300')
    return getReviews()
  })

  // Formulaire de contact : 20 envois par heure et par adresse IP (les essais refusés comptent aussi), plan joint en base64 (5 Mo maximum)
  app.post(
    '/contact',
    { bodyLimit: Math.ceil((ATTACHMENT_MAX * 4) / 3) + 256 * 1024, config: { rateLimit: { max: env.CONTACT_RATE_LIMIT, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const parsed = contactBody.safeParse(req.body)
      if (!parsed.success) return invalid(reply, parsed.error)
      const { site, fichier, consentement: _c, ...data } = parsed.data
      // Robot : on répond comme si tout allait bien, sans rien enregistrer
      if (site) return reply.code(201).send({ ok: true })

      let file: { fichierNom: string; fichierType: string; fichier: Buffer } | null = null
      if (fichier) {
        const buf = Buffer.from(fichier.contenu, 'base64')
        if (buf.length === 0) return reply.code(400).send({ error: 'Le fichier joint est vide.', field: 'fichier' })
        if (buf.length > ATTACHMENT_MAX) return reply.code(413).send({ error: 'Fichier trop lourd : 5 Mo maximum.', field: 'fichier' })
        const type = sniffAttachment(buf)
        if (!type) return reply.code(400).send({ error: 'Format non accepté : joignez un PDF, une photo JPEG ou une image PNG.', field: 'fichier' })
        file = { fichierNom: safeName(fichier.nom), fichierType: type, fichier: buf }
      }

      const [row] = await db
        .insert(contactRequests)
        .values({ ...data, ...file })
        .returning({ id: contactRequests.id })
      // Pas d'identité d'utilisateur ici : c'est un visiteur. On ne recopie ni l'e-mail ni le message dans le journal.
      // Alerte à la direction. Si la messagerie est absente ou lente, la demande est quand même enregistrée.
      const to = await alertRecipients()
      if (to.length) {
        const proto = req.headers['x-forwarded-proto'] ?? req.protocol
        const mail = contactAlert({ ...data, fichierNom: file?.fichierNom ?? null, configuration: null }, `${proto}://${req.headers.host}/site-vitrine`)
        await withTimeout(sendMail({ kind: 'contact', to, subject: mail.subject, text: mail.text, replyTo: data.email, targetType: 'contact', targetId: row!.id }), 6000, { ok: false, notConfigured: false, error: 'délai dépassé' })
      }
      await audit(req, 'contact.received', { actor: null, targetType: 'contact', targetId: row!.id, details: { objet: data.objet, fichier: Boolean(file) } })
      return reply.code(201).send({ ok: true })
    },
  )
}

