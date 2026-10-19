import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { auditLog } from '../src/db/schema.js'
import { DEFAULT_SETTINGS } from '../src/pricing.js'
import { buildApp, createUser, loginAs, resetDb, type App, type Client } from './helpers.js'

let app: App
let direction: Client
beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => app.close())
beforeEach(async () => {
  await resetDb()
  await createUser({ identifiant: 'chef', role: 'direction' })
  direction = await loginAs(app, 'chef')
})

const settings = async () => (await direction.get('/api/catalog/settings')).json().settings

describe('Façonnage et conditions', () => {
  it('est réservé à la direction', async () => {
    await createUser({ identifiant: 'rh', role: 'rh' })
    const rh = await loginAs(app, 'rh')
    expect((await rh.get('/api/catalog/settings')).statusCode).toBe(403)
    expect((await rh.patch('/api/catalog/settings', { tva: 5.5 })).statusCode).toBe(403)
  })

  it('renvoie les réglages de départ, même si la ligne avait disparu', async () => {
    expect(await settings()).toMatchObject(DEFAULT_SETTINGS)
  })

  it('modifie un réglage à la française et note l’ancien et le nouveau', async () => {
    const res = await direction.patch('/api/catalog/settings', { prixPliMl: '1,10', tva: '20' })
    expect(res.statusCode).toBe(200)
    expect(res.json().settings).toMatchObject({ prixPliMl: 1.1, tva: 20 })
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, 'catalog.settings_updated'))
    expect(entry!.details).toEqual({ changements: { prixPliMl: { avant: 0.9, apres: 1.1 } } })
  })

  it('remplace les paliers de remise quantité', async () => {
    const paliers = [
      { seuil: 10, remise: 3 },
      { seuil: '30', remise: '7,5' },
      { seuil: 100, remise: 12 },
    ]
    const res = await direction.patch('/api/catalog/settings', { remisesQuantite: paliers })
    expect(res.json().settings.remisesQuantite).toEqual([
      { seuil: 10, remise: 3 },
      { seuil: 30, remise: 7.5 },
      { seuil: 100, remise: 12 },
    ])
  })

  it('accepte de supprimer toutes les remises quantité', async () => {
    const res = await direction.patch('/api/catalog/settings', { remisesQuantite: [] })
    expect(res.json().settings.remisesQuantite).toEqual([])
  })

  it('ne note rien si rien ne change, y compris les paliers identiques', async () => {
    await direction.patch('/api/catalog/settings', { tva: 20, remisesQuantite: DEFAULT_SETTINGS.remisesQuantite })
    expect(await db.select().from(auditLog).where(eq(auditLog.action, 'catalog.settings_updated'))).toHaveLength(0)
  })

  it.each([
    [{ tva: 80 }, 'tva', /50 % maximum/],
    [{ prixPliMl: 'cher' }, 'prixPliMl', /nombre attendu/],
    [{ delaiStandard: 0 }, 'delaiStandard', /1 jours minimum/],
    [{ plisMax: 2.5 }, 'plisMax', /entier/],
    [{ angleMin: 10 }, 'angleMin', /15 ° minimum/],
    [{ angleMax: 180 }, 'angleMax', /179 ° maximum/],
    [{ pinceAutorisee: 'oui' }, 'pinceAutorisee', /oui ou non/],
    [{ remisesQuantite: [{ seuil: 50, remise: 10 }, { seuil: 20, remise: 15 }] }, 'remisesQuantite', /du plus petit au plus grand/],
    [{ remisesQuantite: [{ seuil: 20, remise: 10 }, { seuil: 50, remise: 5 }] }, 'remisesQuantite', /plus forte que le précédent/],
    [{ remisesQuantite: [{ seuil: 1, remise: 5 }] }, 'remisesQuantite', /2 pièces minimum/],
    [{ remisesQuantite: Array.from({ length: 7 }, (_, i) => ({ seuil: (i + 1) * 10, remise: i + 1 })) }, 'remisesQuantite', /6 paliers/],
  ])('refuse %o et désigne le champ', async (body, field, msg) => {
    const res = await direction.patch('/api/catalog/settings', body)
    expect(res.statusCode).toBe(400)
    expect(res.json().field).toBe(field)
    expect(res.json().error).toMatch(msg)
  })

  it('vérifie que la longueur minimum reste sous la maximum, avec les valeurs déjà enregistrées', async () => {
    const res = await direction.patch('/api/catalog/settings', { longueurMin: 3500 })
    expect(res.statusCode).toBe(400)
    expect(res.json().field).toBe('longueurMin')
    expect((await settings()).longueurMin).toBe(200)
  })

  it('enregistre les angles possibles et la pince, en gardant le minimum sous le maximum', async () => {
    expect(await settings()).toMatchObject({ angleMin: 30, angleMax: 175, pinceAutorisee: false })
    const bad = await direction.patch('/api/catalog/settings', { angleMin: 120, angleMax: 100 })
    expect(bad.json()).toEqual({ error: 'L’angle minimum ne peut pas dépasser l’angle maximum.', field: 'angleMin' })
    const res = await direction.patch('/api/catalog/settings', { angleMin: '45', angleMax: 170, pinceAutorisee: true })
    expect(res.json().settings).toMatchObject({ angleMin: 45, angleMax: 170, pinceAutorisee: true })
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, 'catalog.settings_updated'))
    expect(entry!.details).toEqual({ changements: { angleMin: { avant: 30, apres: 45 }, angleMax: { avant: 175, apres: 170 }, pinceAutorisee: { avant: false, apres: true } } })
  })
})
