import { eq } from 'drizzle-orm'
import { db } from './db/index.js'
import { pricingSettings, type PricingSettings } from './db/schema.js'

// Valeurs de départ (identiques à la migration 0005). Utilisées si la ligne de réglages a disparu.
export const DEFAULT_SETTINGS: Omit<PricingSettings, 'id' | 'updatedAt'> = {
  prixPliMl: 0.9,
  miseEnRoute: 18,
  minimumCommande: 45,
  remisePro: 10,
  tva: 20,
  delaiStandard: 5,
  remisesQuantite: [
    { seuil: 20, remise: 5 },
    { seuil: 50, remise: 10 },
  ],
  largeurTole: 1250,
  longueurMin: 200,
  longueurMax: 3000,
  plisMax: 8,
  angleMin: 30,
  angleMax: 175,
  pinceAutorisee: false,
}

/** Réglages de chiffrage actuels (recréés avec les valeurs de départ s'ils n'existent pas). */
export async function getPricingSettings(): Promise<PricingSettings> {
  const [row] = await db.select().from(pricingSettings).where(eq(pricingSettings.id, 1))
  if (row) return row
  await db
    .insert(pricingSettings)
    .values({ id: 1, ...DEFAULT_SETTINGS })
    .onConflictDoNothing()
  const [created] = await db.select().from(pricingSettings).where(eq(pricingSettings.id, 1))
  return created!
}
