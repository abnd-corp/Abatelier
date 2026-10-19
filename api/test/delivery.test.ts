import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { auditLog, deliverySettings } from '../src/db/schema.js'
import { DEFAULT_DELIVERY, deliveryQuote } from '../src/delivery.js'
import { crowKm, geo, GeoUnavailable } from '../src/geo.js'
import { buildApp, createUser, loginAs, resetDb, type App, type Client } from './helpers.js'

let app: App
let direction: Client
beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => {
  vi.restoreAllMocks()
  return app.close()
})
beforeEach(async () => {
  await resetDb()
  await createUser({ identifiant: 'chef', role: 'direction' })
  direction = await loginAs(app, 'chef')
})

const delivery = async () => (await direction.get('/api/catalog/delivery')).json().delivery
const ZONES = [
  { distanceMax: 30, prix: 39, franco: 500 },
  { distanceMax: 80, prix: 69, franco: null },
]

describe('Calcul du prix de livraison', () => {
  const s = { zones: ZONES, longueurSeuil: 2500, longueurPrix: 20 }

  it('choisit la première zone qui couvre la distance, bornes comprises', () => {
    expect(deliveryQuote(s, 12).zone?.distanceMax).toBe(30)
    expect(deliveryQuote(s, 30).zone?.distanceMax).toBe(30)
    expect(deliveryQuote(s, 30.1)).toMatchObject({ zone: { distanceMax: 80 }, total: 69 })
  })

  it('n’en propose aucune au-delà de la dernière zone', () => {
    expect(deliveryQuote(s, 81)).toEqual({ zone: null, offerte: false, supplement: 0, total: null })
  })

  it('offre la livraison dès le montant de la zone, et garde le supplément pièces longues', () => {
    expect(deliveryQuote(s, 10, { montant: 499.99 })).toMatchObject({ offerte: false, total: 39 })
    expect(deliveryQuote(s, 10, { montant: 500 })).toMatchObject({ offerte: true, total: 0 })
    expect(deliveryQuote(s, 10, { montant: 600, longueurMax: 2800 })).toMatchObject({ offerte: true, supplement: 20, total: 20 })
    // Zone sans livraison offerte
    expect(deliveryQuote(s, 50, { montant: 10000 })).toMatchObject({ offerte: false, total: 69 })
  })

  it('n’ajoute le supplément qu’au-delà du seuil, et jamais s’il est désactivé', () => {
    expect(deliveryQuote(s, 10, { longueurMax: 2500 }).supplement).toBe(0)
    expect(deliveryQuote(s, 10, { longueurMax: 2501 })).toMatchObject({ supplement: 20, total: 59 })
    expect(deliveryQuote({ ...s, longueurSeuil: null }, 10, { longueurMax: 9000 }).supplement).toBe(0)
  })

  it('estime une distance à vol d’oiseau cohérente', () => {
    // Fraisses → Saint-Étienne : une dizaine de kilomètres
    expect(crowKm({ lat: 45.3886, lon: 4.2636 }, { lat: 45.4397, lon: 4.3872 })).toBeCloseTo(11.3, 0)
  })
})

describe('Réglages de livraison', () => {
  it('sont réservés à la direction', async () => {
    await createUser({ identifiant: 'rh', role: 'rh' })
    await createUser({ identifiant: 'atelier', role: 'atelier' })
    for (const who of ['rh', 'atelier']) {
      const c = await loginAs(app, who)
      expect((await c.get('/api/catalog/delivery')).statusCode, who).toBe(403)
      expect((await c.patch('/api/catalog/delivery', { retraitActif: false })).statusCode, who).toBe(403)
      expect((await c.post('/api/catalog/delivery/estimate', { adresse: '42000 Saint-Étienne' })).statusCode, who).toBe(403)
    }
  })

  it('renvoient les réglages de départ, même si la ligne avait disparu', async () => {
    expect(await delivery()).toMatchObject(DEFAULT_DELIVERY)
  })

  it('remplacent les zones (nombres à la française, « offerte dès » vide = jamais) et notent l’avant / après', async () => {
    const res = await direction.patch('/api/catalog/delivery', {
      zones: [
        { distanceMax: '25', prix: '35,50', franco: '400' },
        { distanceMax: 60, prix: 59, franco: '' },
      ],
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().delivery.zones).toEqual([
      { distanceMax: 25, prix: 35.5, franco: 400 },
      { distanceMax: 60, prix: 59, franco: null },
    ])
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, 'catalog.delivery_updated'))
    expect(entry!.details).toEqual({ changements: { zones: { avant: DEFAULT_DELIVERY.zones, apres: res.json().delivery.zones } } })
  })

  it('active le supplément pièces longues, puis le désactive avec un seuil vide', async () => {
    const on = await direction.patch('/api/catalog/delivery', { longueurSeuil: '2500', longueurPrix: '20' })
    expect(on.json().delivery).toMatchObject({ longueurSeuil: 2500, longueurPrix: 20 })
    const off = await direction.patch('/api/catalog/delivery', { longueurSeuil: '' })
    expect(off.json().delivery.longueurSeuil).toBeNull()
  })

  it('désactive le retrait à l’atelier, mais pas s’il ne reste aucune zone', async () => {
    expect((await direction.patch('/api/catalog/delivery', { retraitActif: false })).json().delivery.retraitActif).toBe(false)
    const res = await direction.patch('/api/catalog/delivery', { zones: [] })
    expect(res.statusCode).toBe(400)
    expect(res.json().field).toBe('zones')
    // Avec le retrait, on peut n'avoir aucune zone
    await direction.patch('/api/catalog/delivery', { retraitActif: true })
    expect((await direction.patch('/api/catalog/delivery', { zones: [] })).statusCode).toBe(200)
  })

  it.each([
    [{ zones: [{ distanceMax: 50, prix: 10, franco: null }, { distanceMax: 50, prix: 20, franco: null }] }, 'zones', /plus proche à la plus lointaine/],
    [{ zones: [{ distanceMax: 0, prix: 10, franco: null }] }, 'zones', /1 km minimum/],
    [{ zones: [{ distanceMax: 10, prix: -1, franco: null }] }, 'zones', /0 € minimum/],
    [{ zones: Array.from({ length: 9 }, (_, i) => ({ distanceMax: (i + 1) * 10, prix: 10, franco: null })) }, 'zones', /8 zones maximum/],
    [{ longueurSeuil: 50 }, 'longueurSeuil', /100 mm minimum/],
    [{ longueurPrix: 'beaucoup' }, 'longueurPrix', /nombre attendu/],
    [{ retraitInfo: 'x'.repeat(301) }, 'retraitInfo', /300 caractères/],
    [{ atelierAdresse: 'ici' }, 'atelierAdresse', /adresse de l’atelier/],
    [{ retraitActif: 'oui' }, 'retraitActif', /oui ou non/],
  ])('refuse %o et désigne le champ', async (body, field, msg) => {
    const res = await direction.patch('/api/catalog/delivery', body)
    expect(res.statusCode).toBe(400)
    expect(res.json().field).toBe(field)
    expect(res.json().error).toMatch(msg)
  })

  it('localise la nouvelle adresse de l’atelier, et refuse une adresse inconnue', async () => {
    const res = await direction.patch('/api/catalog/delivery', { atelierAdresse: 'Rue de l’Ondaine 42490 Fraisses' })
    expect(res.json().delivery).toMatchObject({ atelierLabel: 'Fraisses 42490', atelierLat: 45.3886, atelierLon: 4.2636 })
    const bad = await direction.patch('/api/catalog/delivery', { atelierAdresse: 'Nulle part sur terre' })
    expect(bad.statusCode).toBe(400)
    expect(bad.json()).toMatchObject({ field: 'atelierAdresse', error: expect.stringMatching(/introuvable/) })
    expect((await delivery()).atelierAdresse).toBe('Rue de l’Ondaine 42490 Fraisses')
  })

  it('ne note rien si rien ne change', async () => {
    await direction.patch('/api/catalog/delivery', { zones: DEFAULT_DELIVERY.zones, retraitActif: true })
    expect(await db.select().from(auditLog).where(eq(auditLog.action, 'catalog.delivery_updated'))).toHaveLength(0)
  })
})

describe('Estimation pour une adresse', () => {
  const estimate = (body: Record<string, unknown>) => direction.post('/api/catalog/delivery/estimate', body)

  it('localise l’atelier une fois, puis donne la distance et le prix de la zone', async () => {
    const spy = vi.spyOn(geo, 'geocode')
    const res = await estimate({ adresse: '42000 Saint-Étienne' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ adresse: 'Saint-Étienne 42000', methode: 'route', zone: { distanceMax: 30 }, offerte: false, total: 39 })
    expect(res.json().distanceKm).toBeCloseTo(14.7, 0)
    expect(res.json().retrait).toEqual({ actif: true, info: DEFAULT_DELIVERY.retraitInfo })
    const [s] = await db.select().from(deliverySettings)
    expect(s!.atelierLat).toBe(45.3886)
    // Deuxième estimation : l'atelier n'est plus relocalisé
    spy.mockClear()
    await estimate({ adresse: '42700 Firminy' })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('applique la livraison offerte et le supplément pièces longues', async () => {
    await direction.patch('/api/catalog/delivery', { zones: ZONES, longueurSeuil: 2500, longueurPrix: 20 })
    const res = await estimate({ adresse: '42000 Saint-Étienne', montant: '650,00', longueurMax: '2800' })
    expect(res.json()).toMatchObject({ offerte: true, supplement: 20, total: 20 })
  })

  it('répond « hors zone » au-delà de la dernière zone', async () => {
    const res = await estimate({ adresse: '75001 Paris' })
    expect(res.json()).toMatchObject({ adresse: 'Paris 75001', zone: null, total: null })
    expect(res.json().distanceKm).toBeGreaterThan(300)
  })

  it('signale une adresse introuvable ou vide sur le bon champ', async () => {
    expect((await estimate({ adresse: 'Atlantide' })).json()).toMatchObject({ field: 'adresse', error: expect.stringMatching(/introuvable/) })
    expect((await estimate({ adresse: '' })).json().field).toBe('adresse')
    expect((await estimate({ adresse: '42000', montant: -5 })).json().field).toBe('montant')
  })

  it('se rabat sur une estimation quand l’itinéraire ne répond pas', async () => {
    vi.spyOn(geo, 'roadKm').mockResolvedValue({ km: 13.04, methode: 'estimation' })
    const res = await estimate({ adresse: '42000 Saint-Étienne' })
    expect(res.json()).toMatchObject({ methode: 'estimation', distanceKm: 13 })
  })

  it('répond 503 avec un message clair quand le service d’adresses est injoignable', async () => {
    vi.spyOn(geo, 'geocode').mockRejectedValue(new GeoUnavailable('panne'))
    const res = await estimate({ adresse: '42000 Saint-Étienne' })
    expect(res.statusCode).toBe(503)
    expect(res.json().error).toMatch(/ne répond pas/)
    const patch = await direction.patch('/api/catalog/delivery', { atelierAdresse: '42700 Firminy' })
    expect(patch.statusCode).toBe(503)
  })

  it('n’appelle pas l’IGN en mode test', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await estimate({ adresse: '42000 Saint-Étienne' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
