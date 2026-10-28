import { and, eq, inArray } from 'drizzle-orm'
import { db } from './db/index.js'
import { clients, orderEvents, orderLines, orders, payments, productVariants, products, type Payment, type PaymentCart } from './db/schema.js'
import { distanceFromAtelier, deliveryQuote } from './delivery.js'
import { allocateNumber } from './documents.js'
import { GeoUnavailable } from './geo.js'
import { auditSystem } from './audit.js'
import { loadCatalog } from './orders.js'
import { alertRecipients, sendMail, withTimeout } from './mail.js'
import { orderConfirmed, orderPaidAlert } from './mail-texts.js'
import { getCompany } from './documents.js'
import { addWorkingDays, cents, lineValues } from './quote.js'
import { todayParis } from './departures.js'
import { clientName } from './routes/clients.js'

// Boutique : prix, panier et création de la commande une fois le paiement confirmé.

export const QUANTITE_MAX = 999
export const LIGNES_MAX = 30

/** Prix TTC d'un prix HT (arrondi au centime). */
export const ttcOf = (ht: number, taux: number) => cents(ht * (1 + taux / 100))

/** Prix HT dont le TTC est exactement celui saisi, quand il existe (sinon le plus proche). */
export function htFromTtc(ttc: number, taux: number) {
  const base = cents(ttc / (1 + taux / 100))
  const near = [base, cents(base - 0.01), cents(base + 0.01)]
  return near.find((ht) => ttcOf(ht, taux) === ttc) ?? base
}

export interface CartItem {
  variantId: string
  quantite: number
}
export type CartDelivery = { mode: 'retrait' } | { mode: 'livraison'; adresse: string; codePostal: string; ville: string }

export interface PricedCartLine {
  variantId: string
  produitId: string
  produit: string
  libelle: string
  quantite: number
  prixHt: number
  prixTtc: number
  totalTtc: number
}
export interface CartError {
  status: number
  error: string
  field?: string
}

/**
 * Chiffre un panier avec les prix actuels. Les déclinaisons retirées de la vente (ou dont le produit est caché) sont
 * écartées et renvoyées à part : le client voit ce qui a changé avant de payer.
 */
export async function priceCart(items: CartItem[], livraison: CartDelivery): Promise<CartError | { lignes: PricedCartLine[]; indisponibles: string[]; cart: PaymentCart }> {
  const ids = [...new Set(items.map((i) => i.variantId))]
  const rows = ids.length
    ? await db
        .select({ v: productVariants, p: { id: products.id, nom: products.nom, actif: products.actif } })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(inArray(productVariants.id, ids))
    : []
  const sellable = new Map(rows.filter((r) => r.v.actif && r.p.actif).map((r) => [r.v.id, r]))
  const catalog = await loadCatalog()
  const taux = catalog.settings.tva

  // Une même déclinaison ajoutée deux fois ne fait qu'une ligne
  const qty = new Map<string, number>()
  for (const i of items) qty.set(i.variantId, (qty.get(i.variantId) ?? 0) + i.quantite)
  const lignes: PricedCartLine[] = []
  const indisponibles: string[] = []
  for (const [variantId, quantite] of qty) {
    const r = sellable.get(variantId)
    if (!r) {
      indisponibles.push(variantId)
      continue
    }
    if (quantite > QUANTITE_MAX) return { status: 400, error: `${QUANTITE_MAX} exemplaires maximum par article : contactez-nous pour une grosse commande.`, field: 'lignes' }
    const prixTtc = ttcOf(r.v.prixHt, taux)
    lignes.push({ variantId, produitId: r.p.id, produit: r.p.nom, libelle: r.v.libelle, quantite, prixHt: r.v.prixHt, prixTtc, totalTtc: cents(prixTtc * quantite) })
  }

  let distanceKm: number | null = null
  if (livraison.mode === 'livraison') {
    try {
      const d = await distanceFromAtelier(catalog.delivery, `${livraison.adresse} ${livraison.codePostal} ${livraison.ville}`)
      if (!d) return { status: 400, error: 'Adresse de livraison introuvable : vérifiez la rue, le code postal et la commune.', field: 'livraison' }
      distanceKm = d.km
    } catch (e) {
      if (e instanceof GeoUnavailable) return { status: 503, error: 'Le service de localisation des adresses ne répond pas. Réessayez dans quelques minutes.', field: 'livraison' }
      throw e
    }
  }
  // Mêmes arrondis que les pièces sur mesure et que les documents émis (somme des lignes arrondies, TVA sur le total HT)
  const brut = cents(lignes.reduce((s, l) => s + cents(l.quantite * l.prixHt), 0))
  let livraisonPrix = 0
  if (distanceKm !== null) {
    const q = deliveryQuote(catalog.delivery, distanceKm, { montant: brut })
    if (q.total === null) {
      const max = Math.max(0, ...catalog.delivery.zones.map((z) => z.distanceMax))
      return { status: 400, error: `Adresse à ${distanceKm.toLocaleString('fr-FR')} km : au-delà de la zone de livraison (${max} km). Choisissez le retrait à l’atelier.`, field: 'livraison' }
    }
    livraisonPrix = q.total
  }
  const ht = cents(brut + livraisonPrix)
  const tva = cents((ht * taux) / 100)
  return {
    lignes,
    indisponibles,
    cart: {
      lignes: lignes.map((l) => ({ variantId: l.variantId, produit: l.produit, libelle: l.libelle, quantite: l.quantite, prixHt: l.prixHt })),
      livraison,
      distanceKm,
      totals: { brut, livraisonPrix, ht, tauxTva: taux, tva, ttc: cents(ht + tva), delaiJours: catalog.settings.delaiStandard },
      origin: '',
    },
  }
}

/**
 * Le paiement est confirmé par le prestataire : la commande est créée, au prix payé, et le paiement y est rattaché.
 * Elle passe seule à « Validée » (le contrat se forme au paiement) : l'atelier la voit tout de suite dans Fabrication.
 * La direction garde « Refuser et rembourser » si la pièce n'est finalement pas réalisable.
 * Peut être appelée plusieurs fois pour le même paiement (les notifications sont renvoyées) : seule la première crée la commande.
 */
export async function confirmPayment(paymentId: string, providerPayment: string | null): Promise<{ created: boolean; payment: Payment; order: { id: string; numero: string } | null }> {
  const done = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for('update')
    if (!p) return null
    if (p.statut !== 'attente') return { created: false, payment: p, order: p.orderId ? await orderRef(p.orderId) : null }
    const c = p.panier
    const { label } = await allocateNumber(tx, 'commande')
    const livraison = c.livraison
    const [o] = await tx
      .insert(orders)
      .values({
        numero: label,
        kind: c.surMesure ? 'sur_mesure' : 'boutique',
        statut: 'validee',
        clientId: p.clientId,
        livraisonMode: livraison.mode,
        livraisonAdresse: livraison.mode === 'livraison' ? livraison.adresse : null,
        livraisonCodePostal: livraison.mode === 'livraison' ? livraison.codePostal : null,
        livraisonVille: livraison.mode === 'livraison' ? livraison.ville : null,
        distanceKm: c.distanceKm,
        brut: c.totals.brut,
        remisePro: c.surMesure?.remisePro ?? 0,
        complementMinimum: c.surMesure?.complementMinimum ?? 0,
        notes: c.surMesure?.notes ?? null,
        livraisonPrix: c.totals.livraisonPrix,
        ht: c.totals.ht,
        tauxTva: c.totals.tauxTva,
        tva: c.totals.tva,
        ttc: c.totals.ttc,
        delaiJours: c.totals.delaiJours,
        datePrevue: addWorkingDays(todayParis(), c.totals.delaiJours),
        createdBy: null,
      })
      .returning()
    await tx.insert(orderLines).values(
      c.surMesure
        ? lineValues(o!.id, c.surMesure.lignes)
        : c.lignes.map((l, position) => {
            const total = cents(l.quantite * l.prixHt)
            return {
              orderId: o!.id,
              position,
              repere: null,
              variantId: l.variantId,
              modeleLabel: l.produit,
              cap: 0,
              materialLabel: l.libelle,
              colorLabel: '',
              colorHex: '#cdd1d4',
              cotes: [],
              angles: [],
              longueur: 0,
              quantite: l.quantite,
              accessoires: [],
              prixUnitaire: l.prixHt,
              remiseQuantite: 0,
              montantPieces: total,
              montantAccessoires: 0,
              miseEnRoute: 0,
              total,
            }
          }),
    )
    await tx.insert(orderEvents).values([
      { orderId: o!.id, statut: 'recue', userId: null, note: 'Commande payée en ligne' },
      { orderId: o!.id, statut: 'validee', userId: null, note: 'Validée automatiquement au paiement' },
    ])
    const [paid] = await tx
      .update(payments)
      .set({ statut: 'paye', paidAt: new Date(), orderId: o!.id, providerPayment: providerPayment ?? p.providerPayment })
      .where(eq(payments.id, p.id))
      .returning()
    return { created: true, payment: paid!, order: { id: o!.id, numero: o!.numero } }
  })
  if (!done) throw new Error('Paiement inconnu')
  if (done.created && done.order) await afterPayment(done.payment, done.order)
  return done
}

async function orderRef(id: string) {
  const [o] = await db.select({ id: orders.id, numero: orders.numero }).from(orders).where(eq(orders.id, id))
  return o ?? null
}

/** Journal et e-mails : la direction est prévenue, le client reçoit la confirmation de sa commande. Un échec d'envoi n'annule rien. */
async function afterPayment(p: Payment, order: { id: string; numero: string }) {
  await auditSystem('boutique.payment_confirmed', { targetType: 'order', targetId: order.id, details: { numero: order.numero, montant: p.montantTtc, prestataire: p.provider } })
  try {
    const [c] = await db.select().from(clients).where(eq(clients.id, p.clientId))
    if (!c) return
    const origin = p.panier.origin
    const nom = clientName(c)
    const sm = p.panier.surMesure
    const articles = sm
      ? sm.lignes.map((l) => `  - ${l.quantite} × ${l.modeleLabel}${l.repere ? ` « ${l.repere} »` : ''} (${l.materialLabel}, ${l.colorLabel})`).join('\n')
      : p.panier.lignes.map((l) => `  - ${l.quantite} × ${l.produit} (${l.libelle})`).join('\n')
    const to = await alertRecipients()
    if (to.length) {
      const alerte = orderPaidAlert({ nom, email: c.email ?? '', numero: order.numero, ttc: p.montantTtc, surMesure: Boolean(sm), articles, link: `${origin}/commandes/${order.id}` })
      await withTimeout(
        sendMail({
          kind: 'contact',
          to,
          subject: alerte.subject,
          text: alerte.text,
          htmlText: alerte.htmlText,
          titre: alerte.titre,
          faits: alerte.faits,
          action: alerte.action,
          audience: 'equipe',
          replyTo: c.email ?? undefined,
          targetType: 'order',
          targetId: order.id,
        }),
        6000,
        { ok: false, notConfigured: false, error: 'délai dépassé' },
      )
    }
    if (c.email) {
      const entreprise = (await getCompany()).raisonSociale
      const [o] = await db.select({ datePrevue: orders.datePrevue, livraisonMode: orders.livraisonMode }).from(orders).where(eq(orders.id, order.id))
      const dateEstimee = o?.datePrevue ? new Date(`${o.datePrevue}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : null
      const mail = orderConfirmed({
        nom,
        numero: order.numero,
        ttc: p.montantTtc,
        articles,
        link: `${origin}/espace/commandes/${order.id}`,
        espace: `${origin}/espace`,
        entreprise,
        remise: o?.livraisonMode ?? 'retrait',
        dateEstimee,
      })
      await withTimeout(
        sendMail({
          kind: 'contact',
          to: [c.email],
          subject: mail.subject,
          text: mail.text,
          htmlText: mail.htmlText,
          titre: mail.titre,
          faits: mail.faits,
          action: mail.action,
          espace: mail.espace,
          targetType: 'order',
          targetId: order.id,
        }),
        6000,
        { ok: false, notConfigured: false, error: 'délai dépassé' },
      )
    }
  } catch (e) {
    console.error('E-mails de confirmation de commande : envoi impossible', e instanceof Error ? e.message : e)
  }
}

/** Le paiement a échoué ou a été abandonné : la commande n'est jamais créée. */
export async function failPayment(paymentId: string) {
  await db
    .update(payments)
    .set({ statut: 'echec' })
    .where(and(eq(payments.id, paymentId), eq(payments.statut, 'attente')))
}
