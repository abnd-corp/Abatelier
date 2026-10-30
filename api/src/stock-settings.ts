import { eq } from 'drizzle-orm'
import { db } from './db/index.js'
import { stockSettings } from './db/schema.js'
import { CHUTE_MIN } from './production-sheet.js'

/** Plus petit côté (mm) d'une chute à garder ; la valeur de départ (200 mm) s'ajuste avec l'atelier, au fil de l'usage. */
export async function getChuteMin(): Promise<number> {
  const [row] = await db.select({ chuteMin: stockSettings.chuteMin }).from(stockSettings).where(eq(stockSettings.id, 1))
  return row?.chuteMin ?? CHUTE_MIN
}

export async function setChuteMin(chuteMin: number) {
  await db
    .insert(stockSettings)
    .values({ id: 1, chuteMin })
    .onConflictDoUpdate({ target: stockSettings.id, set: { chuteMin, updatedAt: new Date() } })
}
