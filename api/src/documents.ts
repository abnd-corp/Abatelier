import { and, eq, sql } from 'drizzle-orm'
import { db } from './db/index.js'
import { companySettings, documentCounters, documentTemplate, type CompanySettings, type DocumentTemplate, type DocumentType } from './db/schema.js'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// Valeurs de départ (identiques à la migration 0008). Utilisées si une ligne de réglages a disparu.
export const DEFAULT_COMPANY = { raisonSociale: 'Alu Pliage Service', adresse: '42490 Fraisses' }

export async function getCompany(): Promise<CompanySettings> {
  const [row] = await db.select().from(companySettings).where(eq(companySettings.id, 1))
  if (row) return row
  await db
    .insert(companySettings)
    .values({ id: 1, ...DEFAULT_COMPANY })
    .onConflictDoNothing()
  return (await db.select().from(companySettings).where(eq(companySettings.id, 1)))[0]!
}

export async function getTemplate(): Promise<DocumentTemplate> {
  const [row] = await db.select().from(documentTemplate).where(eq(documentTemplate.id, 1))
  if (row) return row
  await db.insert(documentTemplate).values({ id: 1 }).onConflictDoNothing()
  return (await db.select().from(documentTemplate).where(eq(documentTemplate.id, 1)))[0]!
}

/** Identité de l'entreprise sans le contenu du logo (trop lourd et inutile dans les réponses JSON). */
export function publicCompany(c: CompanySettings) {
  const { logo, logoType: _t, ...rest } = c
  return { ...rest, logo: logo !== null }
}

// --- Numérotation ---

/** Année du document, à l'heure de Paris (un devis du 31 décembre à 23 h 30 reste sur l'année en cours). */
export const yearOf = (d: Date) => Number(new Intl.DateTimeFormat('fr-FR', { year: 'numeric', timeZone: 'Europe/Paris' }).format(d))

/** D, 2026, 1 → « D-2026-0001 » */
export const formatNumber = (prefixe: string, annee: number, n: number) => `${prefixe}-${annee}-${String(n).padStart(4, '0')}`

/** Dernier numéro attribué cette année pour ce type (0 si aucun). */
export async function lastNumber(type: DocumentType, annee: number, tx: Tx | typeof db = db) {
  const [row] = await tx
    .select({ dernier: documentCounters.dernier })
    .from(documentCounters)
    .where(and(eq(documentCounters.type, type), eq(documentCounters.annee, annee)))
  return row?.dernier ?? 0
}

/**
 * Attribue le numéro suivant. À appeler dans la même transaction que l'enregistrement du document :
 * la ligne du compteur reste verrouillée jusqu'à la fin, et si la transaction est annulée,
 * le numéro n'est pas consommé. Les numéros se suivent donc sans trou ni doublon.
 */
export async function allocateNumber(tx: Tx, type: DocumentType, at = new Date()) {
  const annee = yearOf(at)
  const [row] = await tx
    .insert(documentCounters)
    .values({ type, annee, dernier: 1 })
    .onConflictDoUpdate({ target: [documentCounters.type, documentCounters.annee], set: { dernier: sql`${documentCounters.dernier} + 1` } })
    .returning({ dernier: documentCounters.dernier })
  const template = (await tx.select().from(documentTemplate).where(eq(documentTemplate.id, 1)))[0]
  const prefixe = (type === 'devis' ? template?.prefixeDevis : template?.prefixeFacture) ?? (type === 'devis' ? 'D' : 'F')
  return { annee, numero: row!.dernier, label: formatNumber(prefixe, annee, row!.dernier) }
}

/**
 * Fixe le prochain numéro de l'année (reprise d'une numérotation existante).
 * On ne peut qu'avancer : revenir en arrière créerait des doublons.
 */
export async function setNextNumber(type: DocumentType, next: number, at = new Date()) {
  const annee = yearOf(at)
  return db.transaction(async (tx) => {
    // Verrouille le compteur pendant la vérification
    await tx.execute(sql`select 1 from ${documentCounters} where ${documentCounters.type} = ${type} and ${documentCounters.annee} = ${annee} for update`)
    const last = await lastNumber(type, annee, tx)
    if (next <= last) return { ok: false as const, last }
    await tx
      .insert(documentCounters)
      .values({ type, annee, dernier: next - 1 })
      .onConflictDoUpdate({ target: [documentCounters.type, documentCounters.annee], set: { dernier: next - 1 } })
    return { ok: true as const, last }
  })
}

/** Prochains numéros de l'année, pour l'affichage (rien n'est attribué). */
export async function nextNumbers(template: Pick<DocumentTemplate, 'prefixeDevis' | 'prefixeFacture'>, at = new Date()) {
  const annee = yearOf(at)
  const [devis, facture] = await Promise.all([lastNumber('devis', annee), lastNumber('facture', annee)])
  return {
    annee,
    devis: { numero: devis + 1, label: formatNumber(template.prefixeDevis, annee, devis + 1) },
    facture: { numero: facture + 1, label: formatNumber(template.prefixeFacture, annee, facture + 1) },
  }
}
