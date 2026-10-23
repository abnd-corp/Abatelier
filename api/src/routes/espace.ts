import type { FastifyInstance, FastifyReply } from 'fastify'
import { and, count, desc, eq, gt, inArray, notInArray, sql } from 'drizzle-orm'
import { setTimeout as sleep } from 'node:timers/promises'
import { z } from 'zod'
import { db } from '../db/index.js'
import { auditLog, billingDocuments, clientAccounts, clientSites, clients, contactRequests, DEVIS_REPONSES, orderLines, orders, payments } from '../db/schema.js'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { checkPasswordPolicy } from '../auth/password-policy.js'
import { clearClientCookieOptions, CLIENT_COOKIE, clientCookieOptions, createClientSession, deleteClientSession, requireAccount, type ClientAccount } from '../auth/client-session.js'
import { clearFailures, failureDelayMs, getLock, lockedMessage, MAX_FAILURES, recordFailure } from '../auth/throttle.js'
import { audit, userAgentOf } from '../audit.js'
import { avoirAlias, BillingConflict, issueFromOrder, statutSql } from '../billing.js'
import { todayParis } from '../departures.js'
import { env } from '../env.js'
import { alertRecipients, sendMail, withTimeout } from '../mail.js'
import { espaceAnswerAlert, espaceQuoteAlert } from '../mail-texts.js'
import { eventsOf, STATUT_LABELS } from '../orders.js'
import { invalid, isUniqueViolation } from '../validation.js'
import { clientFields, clientName, identityError, normalize } from './clients.js'
import { orderBody, placeOrder, priceBody } from './orders.js'
import { cartBody } from './public.js'
import { PaymentError, paymentProvider } from '../payments.js'
import { confirmPayment, failPayment, priceCart } from '../shop.js'

// Espace client : les clients du site créent un compte, récupèrent leurs devis, suivent leurs commandes.
// Tout ici est limité à la fiche du client connecté (cookie propre à l'espace client, jamais celui de l'atelier).
// Les notes internes, les noms des salariés et les autres clients ne sortent jamais d'ici.

const EMAIL_TAKEN = 'Cette adresse e-mail est déjà enregistrée. Connectez-vous ; si vous n’avez jamais créé d’espace client, contactez l’atelier pour l’activer.'
const MAX_DEVIS_PAR_JOUR = 10

const optText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} : ${max} caractères maximum.`)
    .nullish()
    .transform((v) => v || null)

const emailField = z.string().trim().toLowerCase().min(1, 'Indiquez votre adresse e-mail.').max(120, 'Adresse e-mail : 120 caractères maximum.').pipe(z.email('Adresse e-mail invalide.'))

const clientType = z.enum(['particulier', 'professionnel'], { error: 'Indiquez si vous êtes un particulier ou un professionnel.' })

const registerBody = z
  .object({
    type: clientType.default('particulier'),
    raisonSociale: optText(120, 'Raison sociale'),
    prenom: optText(60, 'Prénom'),
    nom: z.string().trim().min(1, 'Indiquez votre nom.').max(80, 'Nom : 80 caractères maximum.'),
    email: emailField,
    telephone: optText(30, 'Téléphone').refine((v) => v === null || /^\+?[0-9 .()-]{6,25}$/.test(v), 'Numéro de téléphone invalide.'),
    password: z.string().max(200, 'Mot de passe : 200 caractères maximum.'),
    consentement: z.literal(true, { error: 'Cochez la case pour accepter l’utilisation de vos données pour gérer votre espace client.' }),
    // Champ caché que seuls les robots remplissent
    site: z.string().optional(),
  })
  .superRefine((b, ctx) => {
    if (b.type === 'professionnel' && !b.raisonSociale) ctx.addIssue({ code: 'custom', path: ['raisonSociale'], message: 'Indiquez la raison sociale de votre entreprise.' })
  })
const loginBody = z.object({ email: z.string().trim().toLowerCase().min(1).max(120), password: z.string().min(1).max(200), remember: z.boolean().default(false) })
const devisBody = orderBody.omit({ clientId: true })
const fermetureBody = z.object({ password: z.string().min(1, 'Saisissez votre mot de passe pour confirmer.').max(200) })
const reponseBody = z.object({ reponse: z.enum(DEVIS_REPONSES, { error: 'Indiquez si vous acceptez ou refusez le devis.' }) })

const publicAccount = (a: ClientAccount) => ({ prenom: a.prenom, nom: a.nom, email: a.email, telephone: a.telephone, type: a.type, proVerifie: a.proVerifie })
const isUuid = (id: string) => z.uuid().safeParse(id).success
/** Pour le journal : le client n'est pas un utilisateur de l'atelier, on le désigne par sa fiche. */
const who = (a: Pick<ClientAccount, 'clientId'>) => ({ actor: null, identifiant: `espace:${a.clientId}` })

const baseUrl = (req: { headers: Record<string, string | string[] | undefined>; protocol: string }) => `${req.headers['x-forwarded-proto'] ?? req.protocol}://${req.headers.host}`

async function startSession(req: Parameters<typeof userAgentOf>[0], reply: FastifyReply, accountId: string, remember: boolean) {
  const { token, expiresAt } = await createClientSession(accountId, { remember, ip: req.ip, userAgent: userAgentOf(req) })
  reply.setCookie(CLIENT_COOKIE, token, clientCookieOptions(remember, expiresAt))
}

export async function espaceRoutes(app: FastifyInstance) {
  // --- Compte ---

  app.post('/inscription', { config: { rateLimit: { max: env.CONTACT_RATE_LIMIT, timeWindow: '1 hour' } } }, async (req, reply) => {
    const parsed = registerBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const { site, consentement: _c, password, ...data } = parsed.data
    if (site) return reply.code(201).send({ compte: null })
    const policyError = checkPasswordPolicy(password, { identifiant: data.email, nom: data.nom })
    if (policyError) return reply.code(400).send({ error: policyError, field: 'password' })
    const passwordHash = await hashPassword(password)
    try {
      const created = await db.transaction(async (tx) => {
        // Un professionnel déclaré sur le site n'a la remise pro qu'une fois validé par l'atelier (proVerifie)
        const [c] = await tx
          .insert(clients)
          .values({ origine: 'site', ...data, raisonSociale: data.type === 'professionnel' ? data.raisonSociale : null, proVerifie: false })
          .returning()
        const [a] = await tx.insert(clientAccounts).values({ clientId: c!.id, passwordHash, lastLoginAt: new Date() }).returning()
        return { client: c!, account: a! }
      })
      await startSession(req, reply, created.account.id, false)
      await audit(req, 'espace.registered', {
        ...who({ clientId: created.client.id }),
        targetType: 'client',
        targetId: created.client.id,
        details: { nom: clientName(created.client), type: created.client.type },
      })
      return reply.code(201).send({ compte: publicAccount({ ...created.client, clientId: created.client.id, id: created.account.id } as ClientAccount) })
    } catch (e) {
      // Une adresse e-mail désigne une seule fiche client : on ne dit pas si elle a déjà un compte
      if (isUniqueViolation(e)) return reply.code(409).send({ error: EMAIL_TAKEN, field: 'email' })
      throw e
    }
  })

  app.post('/connexion', { config: { rateLimit: { max: env.LOGIN_RATE_LIMIT, timeWindow: '1 minute' } } }, async (req, reply) => {
    const parsed = loginBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Adresse e-mail et mot de passe requis.' })
    const { email, password, remember } = parsed.data
    const key = `espace:${email}`
    const lockedUntil = await getLock(key)
    if (lockedUntil) return reply.code(429).send({ error: lockedMessage(lockedUntil) })

    const [row] = await db
      .select({ account: clientAccounts, client: clients })
      .from(clientAccounts)
      .innerJoin(clients, eq(clients.id, clientAccounts.clientId))
      .where(sql`lower(${clients.email}) = ${email}`)
    const ok = await verifyPassword(row?.account.passwordHash, password)
    if (!ok || !row) {
      const { failures, lockedUntil } = await recordFailure(key)
      await audit(req, 'espace.login_failed', { actor: null, identifiant: row ? `espace:${row.client.id}` : undefined })
      await sleep(failureDelayMs(failures))
      if (lockedUntil) return reply.code(429).send({ error: lockedMessage(lockedUntil) })
      const left = MAX_FAILURES - failures
      const warning = left <= 2 ? ` Encore ${left} essai${left > 1 ? 's' : ''} avant un blocage de 15 minutes.` : ''
      return reply.code(401).send({ error: `Adresse e-mail ou mot de passe incorrect.${warning}` })
    }
    if (row.account.disabledAt || row.client.archivedAt) return reply.code(403).send({ error: 'Cet espace client est désactivé. Contactez l’atelier.' })

    await clearFailures(key)
    await db.update(clientAccounts).set({ lastLoginAt: new Date() }).where(eq(clientAccounts.id, row.account.id))
    await startSession(req, reply, row.account.id, remember)
    await audit(req, 'espace.login', { ...who({ clientId: row.client.id }) })
    return { compte: publicAccount({ ...row.client, clientId: row.client.id, id: row.account.id } as ClientAccount) }
  })

  app.post('/deconnexion', async (req, reply) => {
    const token = req.cookies[CLIENT_COOKIE]
    if (token) await deleteClientSession(token)
    if (req.account) await audit(req, 'espace.logout', who(req.account))
    reply.clearCookie(CLIENT_COOKIE, clearClientCookieOptions)
    return reply.code(204).send()
  })

  // Fermeture du compte (droit à l'effacement) : la fiche est anonymisée, pas supprimée. Les factures et avoirs
  // sont gardés 10 ans (obligation légale) et ne sont plus rattachés à une personne identifiable côté fiche.
  app.post('/compte/fermeture', { preHandler: requireAccount, config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const me = req.account!
    const parsed = fermetureBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const [acc] = await db.select({ passwordHash: clientAccounts.passwordHash }).from(clientAccounts).where(eq(clientAccounts.id, me.id))
    if (!(await verifyPassword(acc?.passwordHash, parsed.data.password))) return reply.code(403).send({ error: 'Mot de passe incorrect.', field: 'password' })

    const [{ ouvertes }] = (await db
      .select({ ouvertes: count() })
      .from(orders)
      .where(and(eq(orders.clientId, me.clientId), notInArray(orders.statut, ['livree', 'annulee'])))) as [{ ouvertes: number }]
    const [{ attente }] = (await db
      .select({ attente: count() })
      .from(payments)
      .where(and(eq(payments.clientId, me.clientId), eq(payments.statut, 'attente')))) as [{ attente: number }]
    if (ouvertes || attente)
      return reply.code(409).send({ error: 'Vous avez encore une commande ou un paiement en cours. Fermez votre espace une fois la commande livrée ou annulée, ou contactez l’atelier.' })

    const email = me.email.toLowerCase()
    await db.transaction(async (tx) => {
      const [c] = await tx.select({ type: clients.type }).from(clients).where(eq(clients.id, me.clientId))
      await tx
        .update(clients)
        .set({
          raisonSociale: c!.type === 'professionnel' ? 'Client supprimé' : null,
          nom: c!.type === 'particulier' ? 'Client supprimé' : null,
          prenom: null,
          email: null,
          telephone: null,
          adresse: null,
          codePostal: null,
          ville: null,
          siret: null,
          tvaIntra: null,
          notes: null,
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(clients.id, me.clientId))
      // Les sessions partent avec le compte (suppression en cascade)
      await tx.delete(clientAccounts).where(eq(clientAccounts.id, me.id))
      await tx.delete(clientSites).where(eq(clientSites.clientId, me.clientId))
      await tx.update(orders).set({ livraisonAdresse: null, livraisonCodePostal: null, livraisonVille: null, notes: null }).where(eq(orders.clientId, me.clientId))
      await tx
        .update(contactRequests)
        .set({
          nom: 'Client supprimé',
          email: 'supprime@invalid',
          telephone: null,
          adresse: null,
          codePostal: null,
          ville: null,
          message: '[supprimé]',
          fichierNom: null,
          fichierType: null,
          fichier: null,
          configuration: null,
        })
        .where(sql`lower(${contactRequests.email}) = ${email}`)
      // Le nom n'a plus à rester dans le journal : actions du client, de sa fiche, de ses commandes et de ses documents
      const id = me.clientId
      await tx
        .update(auditLog)
        .set({ details: sql`${auditLog.details} - 'nom' - 'client'` })
        .where(
          sql`${auditLog.details} is not null and (${auditLog.identifiant} = ${`espace:${id}`} or ${auditLog.details}->>'clientId' = ${id} or (${auditLog.targetType} = 'client' and ${auditLog.targetId} = ${id})
            or (${auditLog.targetType} = 'order' and ${auditLog.targetId} in (select id::text from orders where client_id = ${id}))
            or (${auditLog.targetType} = 'billing' and ${auditLog.targetId} in (select id::text from billing_documents where client_id = ${id})))`,
        )
    })
    await audit(req, 'espace.account_closed', { ...who(me), targetType: 'client', targetId: me.clientId })
    reply.clearCookie(CLIENT_COOKIE, clearClientCookieOptions)
    return reply.code(204).send()
  })

  // --- Mes informations : type, coordonnées et adresse de facturation ---
  // L'adresse e-mail est l'identifiant de connexion : elle ne se change pas ici.

  const profilFields = ['type', 'raisonSociale', 'siret', 'tvaIntra', 'prenom', 'nom', 'telephone', 'adresse', 'codePostal', 'ville'] as const
  const profilBody = z
    .object({ type: clientType, ...clientFields })
    .pick({ type: true, raisonSociale: true, siret: true, tvaIntra: true, prenom: true, nom: true, telephone: true, adresse: true, codePostal: true, ville: true })
    .partial()
  const PROFIL_LABELS: Record<(typeof profilFields)[number], string> = {
    type: 'type',
    raisonSociale: 'raison sociale',
    siret: 'SIRET',
    tvaIntra: 'TVA intracommunautaire',
    prenom: 'prénom',
    nom: 'nom',
    telephone: 'téléphone',
    adresse: 'adresse',
    codePostal: 'code postal',
    ville: 'ville',
  }
  const profilOf = (c: typeof clients.$inferSelect) => ({
    type: c.type,
    proVerifie: c.proVerifie,
    raisonSociale: c.raisonSociale,
    siret: c.siret,
    tvaIntra: c.tvaIntra,
    prenom: c.prenom,
    nom: c.nom,
    email: c.email,
    telephone: c.telephone,
    adresse: c.adresse,
    codePostal: c.codePostal,
    ville: c.ville,
  })

  app.get('/profil', { preHandler: requireAccount }, async (req) => {
    const [c] = await db.select().from(clients).where(eq(clients.id, req.account!.clientId))
    return { profil: profilOf(c!) }
  })

  app.patch('/profil', { preHandler: requireAccount, config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (req, reply) => {
    const me = req.account!
    const parsed = profilBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const [c] = await db.select().from(clients).where(eq(clients.id, me.clientId))
    const given = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined))
    const merged = normalize({ ...c!, ...given }) as typeof c & {}
    const bad = identityError(merged)
    if (bad) return reply.code(400).send(bad)
    if (!merged.nom) return reply.code(400).send({ error: 'Indiquez votre nom.', field: 'nom' })
    // Devenir professionnel (ou le rester) sur simple déclaration ne donne pas droit à la remise : l'atelier valide
    merged.proVerifie = merged.type === 'professionnel' && c!.type === 'professionnel' ? c!.proVerifie : false
    const changed = profilFields.filter((k) => merged[k] !== c![k])
    if (!changed.length) return { profil: profilOf(c!) }
    const [saved] = await db
      .update(clients)
      .set({ ...Object.fromEntries(changed.map((k) => [k, merged[k]])), proVerifie: merged.proVerifie, updatedAt: new Date() })
      .where(eq(clients.id, c!.id))
      .returning()
    await audit(req, 'espace.profile_updated', {
      ...who(me),
      targetType: 'client',
      targetId: c!.id,
      details: { champs: changed.map((k) => PROFIL_LABELS[k]), ...(changed.includes('type') ? { type: merged.type } : {}) },
    })
    return { profil: profilOf(saved!) }
  })

  // Toujours 200, avec compte à null sans session : pas d'erreur 401 dans la console du navigateur
  app.get('/session', async (req) => ({ compte: req.account ? publicAccount(req.account) : null }))

  // --- Devis : on compose dans le configurateur, le devis est tout de suite dans l'espace du client ---

  app.post('/devis', { preHandler: requireAccount, config: { rateLimit: { max: env.CONTACT_RATE_LIMIT, timeWindow: '1 hour' } } }, async (req, reply) => {
    const me = req.account!
    const parsed = devisBody.safeParse(req.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return reply.code(400).send({ error: issue?.message ?? 'Données invalides.', field: issue?.path.length ? issue.path.join('.') : undefined })
    }
    const [{ n }] = (await db
      .select({ n: count() })
      .from(orders)
      .where(and(eq(orders.clientId, me.clientId), gt(orders.createdAt, new Date(Date.now() - 24 * 3600 * 1000))))) as [{ n: number }]
    if (n >= MAX_DEVIS_PAR_JOUR) return reply.code(429).send({ error: `Vous avez déjà demandé ${MAX_DEVIS_PAR_JOUR} devis aujourd’hui. Contactez l’atelier pour la suite.` })

    const placed = await placeOrder(req, { ...parsed.data, clientId: me.clientId }, { userId: null, origine: 'espace' })
    if ('error' in placed) return reply.code(placed.status).send({ error: placed.error, field: placed.field })

    // Le devis (PDF numéroté) est édité tout de suite. Si l'édition échoue, la commande existe quand même et la direction l'émettra.
    const [order] = await db.select().from(orders).where(eq(orders.id, placed.id))
    let devis: { id: string; numero: string } | null = null
    try {
      const d = await issueFromOrder('devis', order!, null)
      devis = { id: d.id, numero: d.numero }
      await audit(req, 'billing.devis_created', {
        ...who(me),
        targetType: 'billing',
        targetId: d.id,
        details: { numero: d.numero, commande: placed.numero, client: d.client, ttc: d.ttc, origine: 'espace' },
      })
    } catch (e) {
      if (!(e instanceof BillingConflict)) req.log.error(e, 'Devis automatique impossible')
    }

    const to = await alertRecipients()
    if (to.length) {
      const mail = espaceQuoteAlert(
        {
          client: clientName({ ...me, raisonSociale: null }),
          email: me.email,
          commande: placed.numero,
          devis: devis?.numero ?? null,
          pieces: parsed.data.lignes.reduce((s, l) => s + l.quantite, 0),
          ht: order!.ht,
          ttc: order!.ttc,
        },
        `${baseUrl(req)}/commandes/${placed.id}`,
      )
      await withTimeout(sendMail({ kind: 'contact', to, subject: mail.subject, text: mail.text, replyTo: me.email, targetType: 'order', targetId: placed.id }), 6000, {
        ok: false,
        notConfigured: false,
        error: 'délai dépassé',
      })
    }
    return reply.code(201).send({ id: placed.id, numero: placed.numero, devis })
  })

  // --- Commande sur mesure payée en ligne depuis le configurateur ---
  // Comme la boutique : la commande n'existe qu'une fois le paiement confirmé, au prix chiffré ici, et naît déjà « Validée ».

  app.post('/commande', { preHandler: requireAccount, config: { rateLimit: { max: env.CONTACT_RATE_LIMIT, timeWindow: '1 hour' } } }, async (req, reply) => {
    const me = req.account!
    const parsed = devisBody.safeParse(req.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return reply.code(400).send({ error: issue?.message ?? 'Données invalides.', field: issue?.path.length ? issue.path.join('.') : undefined })
    }
    const provider = paymentProvider()
    if (!provider) return reply.code(503).send({ error: 'Le paiement en ligne n’est pas encore ouvert. Enregistrez votre devis : l’atelier vous confirmera la suite.' })
    const priced = await priceBody(parsed.data, me.type === 'professionnel' && me.proVerifie)
    if ('error' in priced) return reply.code(priced.status).send({ error: priced.error, field: priced.field })
    const { lines, totals, distanceKm } = priced
    const origin = baseUrl(req)
    const pieces = lines.reduce((s, l) => s + l.quantite, 0)
    const [p] = await db
      .insert(payments)
      .values({
        clientId: me.clientId,
        provider: provider.name,
        montantTtc: totals.ttc,
        panier: {
          lignes: [],
          livraison: parsed.data.livraison,
          distanceKm,
          totals: { brut: totals.brut, livraisonPrix: totals.livraisonPrix, ht: totals.ht, tauxTva: totals.tauxTva, tva: totals.tva, ttc: totals.ttc, delaiJours: totals.delaiJours },
          origin,
          surMesure: { lignes: lines, notes: parsed.data.notes, remisePro: totals.remisePro, complementMinimum: totals.complementMinimum },
        },
      })
      .returning()
    try {
      const checkout = await provider.createCheckout({
        paymentId: p!.id,
        montantCents: Math.round(totals.ttc * 100),
        description: `Alu Pliage Service : ${pieces} pièce${pieces > 1 ? 's' : ''} sur mesure`,
        email: me.email,
        successUrl: `${origin}/boutique/commande/${p!.id}`,
        cancelUrl: `${origin}/configurateur`,
      })
      await db.update(payments).set({ providerRef: checkout.ref }).where(eq(payments.id, p!.id))
      await audit(req, 'boutique.checkout_started', {
        ...who(me),
        targetType: 'payment',
        targetId: p!.id,
        details: { montant: p!.montantTtc, articles: pieces, prestataire: provider.name, surMesure: true },
      })
      return reply.code(201).send({ id: p!.id, url: checkout.url })
    } catch (e) {
      await failPayment(p!.id)
      if (e instanceof PaymentError) return reply.code(502).send({ error: e.message })
      throw e
    }
  })

  // --- Boutique : payer son panier ---
  // La commande n'existe qu'une fois le paiement confirmé par le prestataire : le prix payé est celui du panier figé ici.

  app.post('/boutique/paiement', { preHandler: requireAccount, config: { rateLimit: { max: env.CONTACT_RATE_LIMIT, timeWindow: '1 hour' } } }, async (req, reply) => {
    const me = req.account!
    const parsed = cartBody.safeParse(req.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return reply.code(400).send({ error: issue?.message ?? 'Données invalides.', field: issue?.path.length ? issue.path.join('.') : undefined })
    }
    const provider = paymentProvider()
    if (!provider) return reply.code(503).send({ error: 'Le paiement en ligne n’est pas encore ouvert. Contactez-nous pour passer commande.' })
    const priced = await priceCart(parsed.data.lignes, parsed.data.livraison)
    if ('error' in priced) return reply.code(priced.status).send({ error: priced.error, field: priced.field })
    if (priced.indisponibles.length)
      return reply.code(409).send({ error: 'Certains articles ne sont plus en vente : retirez-les de votre panier.', field: 'lignes', indisponibles: priced.indisponibles })
    const origin = baseUrl(req)
    const [p] = await db
      .insert(payments)
      .values({ clientId: me.clientId, provider: provider.name, montantTtc: priced.cart.totals.ttc, panier: { ...priced.cart, origin } })
      .returning()
    try {
      const nbArticles = priced.lignes.reduce((s, l) => s + l.quantite, 0)
      const checkout = await provider.createCheckout({
        paymentId: p!.id,
        montantCents: Math.round(priced.cart.totals.ttc * 100),
        description: `Alu Pliage Service : ${nbArticles} article${nbArticles > 1 ? 's' : ''}`,
        email: me.email,
        successUrl: `${origin}/boutique/commande/${p!.id}`,
        cancelUrl: `${origin}/panier`,
      })
      await db.update(payments).set({ providerRef: checkout.ref }).where(eq(payments.id, p!.id))
      await audit(req, 'boutique.checkout_started', { ...who(me), targetType: 'payment', targetId: p!.id, details: { montant: p!.montantTtc, articles: nbArticles, prestataire: provider.name } })
      return reply.code(201).send({ id: p!.id, url: checkout.url })
    } catch (e) {
      await failPayment(p!.id)
      if (e instanceof PaymentError) return reply.code(502).send({ error: e.message })
      throw e
    }
  })

  async function ownPayment(id: string, clientId: string, reply: FastifyReply) {
    const [p] = isUuid(id)
      ? await db
          .select()
          .from(payments)
          .where(and(eq(payments.id, id), eq(payments.clientId, clientId)))
      : []
    if (!p) reply.code(404).send({ error: 'Paiement introuvable.' })
    return p ?? null
  }

  // Le navigateur revient de la page de paiement : on dit où en est le paiement (la commande apparaît dès la confirmation)
  app.get('/boutique/paiements/:id', { preHandler: requireAccount }, async (req, reply) => {
    const p = await ownPayment((req.params as { id: string }).id, req.account!.clientId, reply)
    if (!p) return
    const [o] = p.orderId ? await db.select({ id: orders.id, numero: orders.numero }).from(orders).where(eq(orders.id, p.orderId)) : []
    return { id: p.id, statut: p.statut, montantTtc: p.montantTtc, commande: o ?? null, simulation: p.provider === 'simulation', surMesure: !!p.panier.surMesure }
  })

  // Faux paiement, pour le développement et les tests : jamais disponible avec un vrai prestataire
  app.post('/boutique/paiements/:id/simulation', { preHandler: requireAccount }, async (req, reply) => {
    const p = await ownPayment((req.params as { id: string }).id, req.account!.clientId, reply)
    if (!p) return
    if (p.provider !== 'simulation' || paymentProvider()?.name !== 'simulation') return reply.code(404).send({ error: 'Paiement introuvable.' })
    const parsed = z.object({ issue: z.enum(['paye', 'echec'], { error: 'Choisissez l’issue du paiement.' }) }).safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    if (p.statut !== 'attente') return reply.code(409).send({ error: 'Ce paiement est déjà réglé.' })
    if (parsed.data.issue === 'paye') await confirmPayment(p.id, `sim_pi_${p.id}`)
    else await failPayment(p.id)
    return { statut: parsed.data.issue === 'paye' ? 'paye' : 'echec' }
  })

  // --- Commandes et documents du client ---

  app.get('/commandes', { preHandler: requireAccount }, async (req) => {
    const me = req.account!
    const rows = await db
      .select({ id: orders.id, numero: orders.numero, kind: orders.kind, statut: orders.statut, ttc: orders.ttc, createdAt: orders.createdAt, datePrevue: orders.datePrevue })
      .from(orders)
      .where(eq(orders.clientId, me.clientId))
      .orderBy(desc(orders.createdAt))
      .limit(200)
    const ids = rows.map((r) => r.id)
    const avoir = avoirAlias()
    const docs = ids.length
      ? await db
          .select({ id: billingDocuments.id, orderId: billingDocuments.orderId, type: billingDocuments.type, numero: billingDocuments.numero, statut: statutSql(avoir) })
          .from(billingDocuments)
          .leftJoin(avoir, eq(avoir.factureId, billingDocuments.id))
          .where(and(inArray(billingDocuments.orderId, ids), eq(billingDocuments.clientId, me.clientId)))
          .orderBy(desc(billingDocuments.emisLe))
      : []
    return {
      commandes: rows.map((o) => ({
        ...o,
        statutLabel: STATUT_LABELS[o.statut],
        devis: docs.find((d) => d.orderId === o.id && d.type === 'devis') ?? null,
        facture: docs.find((d) => d.orderId === o.id && d.type === 'facture') ?? null,
      })),
    }
  })

  app.get('/commandes/:id', { preHandler: requireAccount }, async (req, reply) => {
    const me = req.account!
    const id = (req.params as { id: string }).id
    const [o] = isUuid(id)
      ? await db
          .select()
          .from(orders)
          .where(and(eq(orders.id, id), eq(orders.clientId, me.clientId)))
      : []
    if (!o) return reply.code(404).send({ error: 'Commande introuvable.' })
    const avoir = avoirAlias()
    const [lignes, events, documents, [pay]] = await Promise.all([
      db.select().from(orderLines).where(eq(orderLines.orderId, o.id)).orderBy(orderLines.position),
      eventsOf(o.id),
      db
        .select({
          id: billingDocuments.id,
          type: billingDocuments.type,
          numero: billingDocuments.numero,
          emisLe: billingDocuments.emisLe,
          echeance: billingDocuments.echeance,
          ttc: billingDocuments.ttc,
          reponse: billingDocuments.reponse,
          payeLe: billingDocuments.payeLe,
          statut: statutSql(avoir),
        })
        .from(billingDocuments)
        .leftJoin(avoir, eq(avoir.factureId, billingDocuments.id))
        .where(and(eq(billingDocuments.orderId, o.id), eq(billingDocuments.clientId, me.clientId)))
        .orderBy(desc(billingDocuments.emisLe)),
      db.select().from(payments).where(eq(payments.orderId, o.id)),
    ])
    return {
      // Paiement en ligne (boutique) : jamais d'identifiant du prestataire de paiement
      paiement: pay ? { statut: pay.statut, montantTtc: pay.montantTtc, paidAt: pay.paidAt, refundedAt: pay.refundedAt, refundMotif: pay.refundMotif } : null,
      commande: {
        id: o.id,
        numero: o.numero,
        kind: o.kind,
        statut: o.statut,
        statutLabel: STATUT_LABELS[o.statut],
        createdAt: o.createdAt,
        datePrevue: o.datePrevue,
        delaiJours: o.delaiJours,
        livraison: { mode: o.livraisonMode, adresse: o.livraisonAdresse, codePostal: o.livraisonCodePostal, ville: o.livraisonVille },
        totaux: { brut: o.brut, remisePro: o.remisePro, complementMinimum: o.complementMinimum, livraisonPrix: o.livraisonPrix, ht: o.ht, tauxTva: o.tauxTva, tva: o.tva, ttc: o.ttc },
      },
      // Pas de notes internes ni de nom de salarié : seulement l'étape et sa date
      etapes: events.map((e) => ({ statut: e.statut, label: STATUT_LABELS[e.statut], at: e.at })),
      lignes: lignes.map((l) => ({
        repere: l.repere,
        modeleLabel: l.modeleLabel,
        cap: l.cap,
        materialLabel: l.materialLabel,
        colorLabel: l.colorLabel,
        colorHex: l.colorHex,
        cotes: l.cotes,
        angles: l.angles,
        longueur: l.longueur,
        quantite: l.quantite,
        accessoires: l.accessoires.map((a) => ({ nom: a.nom, unite: a.unite, prix: a.prix, quantite: a.quantite })),
        prixUnitaire: l.prixUnitaire,
        total: l.total,
      })),
      documents,
    }
  })

  async function ownDocument(id: string, accountClientId: string, reply: FastifyReply) {
    const [d] = isUuid(id)
      ? await db
          .select()
          .from(billingDocuments)
          .where(and(eq(billingDocuments.id, id), eq(billingDocuments.clientId, accountClientId)))
      : []
    if (!d) reply.code(404).send({ error: 'Document introuvable.' })
    return d ?? null
  }

  app.get('/documents/:id/pdf', { preHandler: requireAccount }, async (req, reply) => {
    const me = req.account!
    const doc = await ownDocument((req.params as { id: string }).id, me.clientId, reply)
    if (!doc) return
    await audit(req, 'espace.document_downloaded', { ...who(me), targetType: 'billing', targetId: doc.id, details: { type: doc.type, numero: doc.numero } })
    return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `inline; filename="${doc.numero}.pdf"`).header('X-Content-Type-Options', 'nosniff').send(doc.pdf)
  })

  // Le client accepte ou refuse son devis. L'acceptation ne lance pas la fabrication : l'atelier valide ensuite la commande.
  app.post('/documents/:id/reponse', { preHandler: requireAccount }, async (req, reply) => {
    const me = req.account!
    const doc = await ownDocument((req.params as { id: string }).id, me.clientId, reply)
    if (!doc) return
    if (doc.type !== 'devis') return reply.code(409).send({ error: 'Seul un devis peut être accepté ou refusé.' })
    const parsed = reponseBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const [order] = await db.select().from(orders).where(eq(orders.id, doc.orderId))
    if (doc.reponse) return reply.code(409).send({ error: `Ce devis est déjà ${doc.reponse === 'accepte' ? 'accepté' : 'refusé'}.` })
    if (order!.statut === 'annulee') return reply.code(409).send({ error: 'Cette commande a été annulée.' })
    if (parsed.data.reponse === 'accepte' && doc.echeance! < todayParis())
      return reply.code(409).send({ error: 'Ce devis a expiré. Demandez-en un nouveau depuis le configurateur, aux tarifs actuels.' })
    await db.update(billingDocuments).set({ reponse: parsed.data.reponse, reponseLe: new Date(), updatedAt: new Date() }).where(eq(billingDocuments.id, doc.id))
    await audit(req, 'espace.devis_answered', { ...who(me), targetType: 'billing', targetId: doc.id, details: { numero: doc.numero, commande: order!.numero, reponse: parsed.data.reponse } })
    const to = await alertRecipients()
    if (to.length) {
      const mail = espaceAnswerAlert({ client: doc.clientNom, devis: doc.numero, commande: order!.numero, reponse: parsed.data.reponse, ttc: doc.ttc }, `${baseUrl(req)}/commandes/${order!.id}`)
      await withTimeout(sendMail({ kind: 'contact', to, subject: mail.subject, text: mail.text, replyTo: me.email, targetType: 'billing', targetId: doc.id }), 6000, {
        ok: false,
        notConfigured: false,
        error: 'délai dépassé',
      })
    }
    return { statut: parsed.data.reponse }
  })
}
