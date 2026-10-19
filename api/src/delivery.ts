import { eq } from 'drizzle-orm'
import { db } from './db/index.js'
import { deliverySettings, type DeliverySettings, type DeliveryZone } from './db/schema.js'

// Valeurs de départ (identiques à la migration 0007). Utilisées si la ligne de réglages a disparu.
export const DEFAULT_DELIVERY: Omit<DeliverySettings, 'id' | 'updatedAt'> = {
  retraitActif: true,
  retraitInfo: 'Du lundi au jeudi de 7h30 à 12h et de 13h30 à 16h, le vendredi de 7h30 à 12h.',
  atelierAdresse: '42490 Fraisses',
  atelierLabel: null,
  atelierLat: null,
  atelierLon: null,
  zones: [
    { distanceMax: 30, prix: 39, franco: null },
    { distanceMax: 80, prix: 69, franco: null },
  ],
  longueurSeuil: null,
  longueurPrix: 0,
}

/** Réglages de livraison actuels (recréés avec les valeurs de départ s'ils n'existent pas). */
export async function getDeliverySettings(): Promise<DeliverySettings> {
  const [row] = await db.select().from(deliverySettings).where(eq(deliverySettings.id, 1))
  if (row) return row
  await db
    .insert(deliverySettings)
    .values({ id: 1, ...DEFAULT_DELIVERY })
    .onConflictDoNothing()
  const [created] = await db.select().from(deliverySettings).where(eq(deliverySettings.id, 1))
  return created!
}

export interface DeliveryQuote {
  // Zone qui s'applique, ou null au-delà de la dernière (pas de livraison)
  zone: DeliveryZone | null
  // Offerte parce que la commande atteint le montant « franco » de la zone
  offerte: boolean
  // Supplément pièces longues, ajouté même quand la livraison est offerte (camion adapté)
  supplement: number
  // Total HT de la livraison, ou null hors zone
  total: number | null
}

const cents = (n: number) => Math.round(n * 100) / 100

/**
 * Prix de livraison pour une distance donnée.
 * `montant` : total HT de la commande (pour la livraison offerte) ; `longueurMax` : plus longue pièce, en mm.
 */
export function deliveryQuote(
  s: Pick<DeliverySettings, 'zones' | 'longueurSeuil' | 'longueurPrix'>,
  distanceKm: number,
  { montant, longueurMax }: { montant?: number; longueurMax?: number } = {},
): DeliveryQuote {
  const zone = [...s.zones].sort((a, b) => a.distanceMax - b.distanceMax).find((z) => distanceKm <= z.distanceMax) ?? null
  if (!zone) return { zone: null, offerte: false, supplement: 0, total: null }
  const offerte = zone.franco !== null && montant !== undefined && montant >= zone.franco
  const supplement = s.longueurSeuil !== null && longueurMax !== undefined && longueurMax > s.longueurSeuil ? s.longueurPrix : 0
  return { zone, offerte, supplement, total: cents((offerte ? 0 : zone.prix) + supplement) }
}
