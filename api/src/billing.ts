import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from './db/index.js'
import { billingDocuments, clients, orderEvents, orderLines, orders, type BillingLine, type BillingType, type Client, type Order, type OrderLine } from './db/schema.js'
import { allocateNumber, getCompany, getTemplate } from './documents.js'
import { renderDocument, totals, type DocData } from './pdf.js'
import { buildFacturxXml, type FacturxInput } from './facturx.js'
import { clientName } from './routes/clients.js'
import { cents } from './quote.js'
import { todayParis } from './departures.js'

// Devis, factures et avoirs émis depuis une commande. Le contenu est calculé une fois, à l'émission,
// avec la commande, le client et le modèle de document du moment, puis conservé tel quel (PDF compris).

const num = (n: number) => n.toLocaleString('fr-FR')
const plural = (n: number, s: string) => `${num(n)} ${s}${n > 1 ? 's' : ''}`
const day = (d: Date) => d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
const isoDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d)

/**
 * Lignes du document à partir de la commande chiffrée. Leur total HT retombe exactement sur celui de la commande :
 * pièces, remise quantité, accessoires, mise en route, remise pro, complément au minimum, livraison.
 */
export function documentLines(order: Order, lines: OrderLine[]): BillingLine[] {
  const out: BillingLine[] = []
  for (const l of lines) {
    // Article de la boutique : une ligne simple (produit, déclinaison), à son prix
    if (!l.cotes.length) {
      out.push({ designation: l.modeleLabel, detail: l.materialLabel, quantite: l.quantite, prixUnitaire: l.prixUnitaire })
      continue
    }
    const plis = l.cotes.length - 1
    const developpe = l.cotes.reduce((s, v) => s + v, 0)
    out.push({
      designation: [l.modeleLabel, l.repere].filter(Boolean).join(' · '),
      detail: `${l.materialLabel} · ${l.colorLabel} · développé ${num(developpe)} mm · ${plural(plis, 'pli')} · longueur ${num(l.longueur)} mm`,
      quantite: l.quantite,
      prixUnitaire: l.prixUnitaire,
    })
    // Remise quantité : l'écart entre le prix plein et le montant retenu sur la commande
    const ecart = cents(l.montantPieces - cents(l.quantite * l.prixUnitaire))
    if (ecart) out.push({ designation: `Remise quantité −${num(l.remiseQuantite)} %`, detail: l.modeleLabel, quantite: 1, prixUnitaire: ecart })
    for (const a of l.accessoires) {
      if (!a.quantite) continue
      out.push({ designation: a.unite === 'paire' ? `${a.nom} (la paire)` : a.nom, detail: `Pour : ${[l.modeleLabel, l.repere].filter(Boolean).join(' · ')}`, quantite: a.quantite, prixUnitaire: a.prix })
    }
  }
  // Mise en route : une par pièce différente, regroupées
  const miseEnRoute = new Map<number, number>()
  for (const l of lines) if (l.miseEnRoute) miseEnRoute.set(l.miseEnRoute, (miseEnRoute.get(l.miseEnRoute) ?? 0) + 1)
  for (const [prix, n] of miseEnRoute) out.push({ designation: 'Mise en route', detail: 'Réglage de la plieuse, une par pièce différente', quantite: n, prixUnitaire: prix })

  if (order.remisePro) {
    const taux = Math.round((order.remisePro / order.brut) * 10000) / 100
    out.push({ designation: 'Remise professionnelle', detail: `${num(taux)} % sur les pièces et accessoires`, quantite: 1, prixUnitaire: -order.remisePro })
  }
  if (order.complementMinimum) out.push({ designation: 'Complément au minimum de commande', quantite: 1, prixUnitaire: order.complementMinimum })
  if (order.livraisonMode === 'livraison') {
    const lieu = [order.livraisonVille, order.distanceKm !== null ? `${num(order.distanceKm)} km` : null].filter(Boolean).join(' · ')
    out.push({ designation: order.livraisonPrix ? 'Livraison' : 'Livraison offerte', detail: lieu || undefined, quantite: 1, prixUnitaire: order.livraisonPrix })
  }
  return out
}

/** Adresse de facturation imprimée, avec le SIRET et la TVA d'un professionnel. */
export function clientAddress(c: Client) {
  return [
    c.type === 'professionnel' && [c.prenom, c.nom].some(Boolean) ? `À l’attention de ${[c.prenom, c.nom].filter(Boolean).join(' ')}` : null,
    c.adresse,
    [c.codePostal, c.ville].filter(Boolean).join(' '),
    c.siret ? `SIRET ${c.siret}` : null,
    c.tvaIntra ? `TVA ${c.tvaIntra}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Statut affiché, calculé à partir du suivi (un devis expire, une facture passe en retard). */
export function statutSql(avoir: ReturnType<typeof alias<typeof billingDocuments, 'avoir'>>) {
  const d = billingDocuments
  const today = todayParis()
  return sql<string>`case
    when ${d.type} = 'devis' then case
      when ${d.reponse} is not null then ${d.reponse}
      when ${d.echeance} < ${today} then 'expire'
      when ${d.envoyeLe} is not null then 'envoye'
      else 'emis' end
    when ${d.type} = 'facture' then case
      when ${avoir.id} is not null then 'annulee'
      when ${d.payeLe} is not null then 'payee'
      when ${d.echeance} < ${today} then 'en_retard'
      when ${d.envoyeLe} is not null then 'envoyee'
      else 'emise' end
    else 'emis' end`
}
export const avoirAlias = () => alias(billingDocuments, 'avoir')

/** Facture de la commande qui n'a pas été annulée par un avoir. */
export async function activeInvoice(orderId: string, tx: Tx | typeof db = db) {
  const avoir = avoirAlias()
  const [row] = await tx
    .select({ id: billingDocuments.id, numero: billingDocuments.numero })
    .from(billingDocuments)
    .leftJoin(avoir, eq(avoir.factureId, billingDocuments.id))
    .where(and(eq(billingDocuments.orderId, orderId), eq(billingDocuments.type, 'facture'), isNull(avoir.id)))
  return row ?? null
}

/** Date de livraison ou de retrait de la commande, si elle a eu lieu. */
async function deliveredAt(orderId: string) {
  const [e] = await db
    .select({ at: orderEvents.at })
    .from(orderEvents)
    .where(and(eq(orderEvents.orderId, orderId), eq(orderEvents.statut, 'livree')))
    .orderBy(asc(orderEvents.id))
  return e?.at ?? null
}

/** Refus métier découvert pendant l'émission (message pour l'utilisateur). */
export class BillingConflict extends Error {}

// Étapes où l'on peut émettre un devis, ou une facture
export const DEVIS_STATUTS: Order['statut'][] = ['recue', 'validee', 'fabrication', 'prete', 'livree']
export const FACTURE_STATUTS: Order['statut'][] = ['validee', 'fabrication', 'prete', 'livree']

/** Émet un devis ou une facture pour la commande : numéro, PDF, enregistrement, dans une seule transaction. */
export async function issueFromOrder(type: Extract<BillingType, 'devis' | 'facture'>, order: Order, userId: string | null) {
  const [[client], lines, company, template, livree] = await Promise.all([
    db.select().from(clients).where(eq(clients.id, order.clientId)),
    db.select().from(orderLines).where(eq(orderLines.orderId, order.id)).orderBy(asc(orderLines.position)),
    getCompany(),
    getTemplate(),
    deliveredAt(order.id),
  ])
  const lignes = documentLines(order, lines)
  const t = totals(lignes, order.tauxTva)
  const now = new Date()
  const echeance = addDays(now, type === 'devis' ? template.validiteDevis : template.echeanceFacture)
  const references = [
    `Commande : ${order.numero}`,
    order.livraisonMode === 'retrait' ? 'Retrait à l’atelier' : `Livraison : ${[order.livraisonAdresse, [order.livraisonCodePostal, order.livraisonVille].filter(Boolean).join(' ')].filter(Boolean).join(', ')}`,
    ...(type === 'facture' && livree ? [`${order.livraisonMode === 'retrait' ? 'Retirée' : 'Livrée'} le ${day(livree)}`] : []),
  ]
  const nom = clientName(client!)
  const adresse = clientAddress(client!)
  return db.transaction(async (tx) => {
    // La commande reste verrouillée jusqu'à la fin : pas deux factures en même temps, ni d'annulation pendant l'émission
    const [locked] = await tx.select({ statut: orders.statut }).from(orders).where(eq(orders.id, order.id)).for('update')
    if (!(type === 'devis' ? DEVIS_STATUTS : FACTURE_STATUTS).includes(locked!.statut)) throw new BillingConflict('La commande a changé d’étape : rechargez la page.')
    if (type === 'facture') {
      const active = await activeInvoice(order.id, tx)
      if (active) throw new BillingConflict(`La commande est déjà facturée (${active.numero}). Pour corriger, faites d’abord un avoir.`)
    }
    const { label } = await allocateNumber(tx, type, now)
    const data: DocData = { type, numero: label, date: now, echeance, references, client: { nom, adresse }, lignes, tva: order.tauxTva }
    // Une facture est électronique (Factur-X) ; un devis reste un PDF ordinaire
    const xml =
      type === 'facture'
        ? buildFacturxXml(facturxInput({ type: 'facture', numero: label, date: now, echeance, commande: order.numero, livraison: livree, livraisonAdresse: order.livraisonMode === 'livraison' ? [order.livraisonAdresse, [order.livraisonCodePostal, order.livraisonVille].filter(Boolean).join(' ')].filter(Boolean).join('\n') : undefined, company, template, client: client!, lignes, taux: order.tauxTva, totaux: t }))
        : null
    const pdf = await renderDocument(company, template, company.logo, data, xml ? { xml } : undefined)
    const [doc] = await tx
      .insert(billingDocuments)
      .values({ type, numero: label, orderId: order.id, clientId: client!.id, emisLe: now, echeance: isoDay(echeance), clientNom: nom, clientAdresse: adresse, lignes, ht: t.ht, tauxTva: order.tauxTva, tva: t.tva, ttc: t.ttc, pdf, facturxXml: xml, createdBy: userId })
      .returning({ id: billingDocuments.id, numero: billingDocuments.numero, ttc: billingDocuments.ttc })
    return { ...doc!, client: nom }
  })
}

/** Avoir qui annule entièrement une facture : mêmes lignes, montants opposés. */
export async function issueCreditNote(facture: typeof billingDocuments.$inferSelect, motif: string, userId: string) {
  const [company, template, [order], [client]] = await Promise.all([
    getCompany(),
    getTemplate(),
    db.select({ numero: orders.numero }).from(orders).where(eq(orders.id, facture.orderId)),
    db.select().from(clients).where(eq(clients.id, facture.clientId)),
  ])
  const lignes = facture.lignes.map((l) => ({ ...l, prixUnitaire: -l.prixUnitaire }))
  const totaux = { ht: -facture.ht, tva: -facture.tva, ttc: -facture.ttc }
  const now = new Date()
  return db.transaction(async (tx) => {
    const { label } = await allocateNumber(tx, 'avoir', now)
    // Le XML d'un avoir reprend les lignes de la facture annulée, en positif, et la référence de cette facture
    const xml = buildFacturxXml(
      facturxInput({
        type: 'avoir',
        numero: label,
        date: now,
        echeance: null,
        commande: order!.numero,
        livraison: null,
        company,
        template,
        client: client!,
        lignes: facture.lignes,
        taux: facture.tauxTva,
        totaux: { ht: facture.ht, tva: facture.tva, ttc: facture.ttc },
        facture: { numero: facture.numero, date: facture.emisLe },
      }),
    )
    const pdf = await renderDocument(company, template, company.logo, {
      type: 'avoir',
      numero: label,
      date: now,
      references: [`Commande : ${order!.numero}`],
      client: { nom: facture.clientNom, adresse: facture.clientAdresse },
      lignes,
      tva: facture.tauxTva,
      totaux,
      avoir: { facture: facture.numero, factureDate: facture.emisLe, motif },
    }, { xml })
    const [doc] = await tx
      .insert(billingDocuments)
      .values({ type: 'avoir', numero: label, orderId: facture.orderId, clientId: facture.clientId, factureId: facture.id, emisLe: now, clientNom: facture.clientNom, clientAdresse: facture.clientAdresse, lignes, ...totaux, tauxTva: facture.tauxTva, pdf, facturxXml: xml, motif, createdBy: userId })
      .returning({ id: billingDocuments.id, numero: billingDocuments.numero })
    return doc!
  })
}

/** Rassemble ce qu'il faut au XML Factur-X : l'entreprise, le client et la facture (ou l'avoir). */
function facturxInput(o: {
  type: 'facture' | 'avoir'
  numero: string
  date: Date
  echeance: Date | null
  commande: string
  livraison: Date | null
  livraisonAdresse?: string
  company: Awaited<ReturnType<typeof getCompany>>
  template: Awaited<ReturnType<typeof getTemplate>>
  client: Client
  lignes: BillingLine[]
  taux: number
  totaux: { ht: number; tva: number; ttc: number }
  facture?: { numero: string; date: Date }
}): FacturxInput {
  const { company: c, client } = o
  return {
    type: o.type,
    numero: o.numero,
    date: o.date,
    echeance: o.echeance,
    commande: o.commande,
    livraison: o.livraison,
    livraisonAdresse: o.livraisonAdresse,
    vendeur: { nom: c.raisonSociale, adresse: c.adresse, siret: c.siret, tvaIntra: c.tvaIntra, email: c.email, iban: c.iban, bic: c.bic },
    acheteur: {
      nom: clientName(client),
      adresse: [client.adresse, [client.codePostal, client.ville].filter(Boolean).join(' ')].filter(Boolean).join('\n'),
      // Seul un professionnel a un SIREN à déclarer
      siret: client.type === 'professionnel' ? client.siret : null,
      email: client.email,
    },
    lignes: o.lignes,
    taux: o.taux,
    totaux: o.totaux,
    facture: o.facture,
    conditions: o.template.conditionsPaiement.trim() || undefined,
  }
}
