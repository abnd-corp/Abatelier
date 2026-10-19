import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { accessories, auditLog, colors, materials, orderLines, orders } from '../src/db/schema.js'
import { yearOf } from '../src/documents.js'
import { addWorkingDays, quantityDiscount } from '../src/quote.js'
import { todayParis } from '../src/departures.js'
import { buildApp, createUser, loginAs, resetDb, type App, type Client } from './helpers.js'

let app: App
let direction: Client
let ids: { alu: string; galva: string; anthracite: string; sable: string; bois: string; bouchon: string; angle: string; dupont: string; toitures: string }
const YEAR = yearOf(new Date())

beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => app.close())
beforeEach(async () => {
  await resetDb()
  await createUser({ identifiant: 'chef', role: 'direction' })
  direction = await loginAs(app, 'chef')
  const [alu, galva] = await db
    .insert(materials)
    .values([
      { nom: 'Aluminium', epaisseur: 1.5, prixM2: 62, retourMin: 10 },
      { nom: 'Acier galvanisé', epaisseur: 0.75, prixM2: 36, retourMin: 8, actif: false },
    ])
    .returning()
  const [anthracite, sable, bois] = await db
    .insert(colors)
    .values([
      { nom: 'Gris anthracite', reference: 'RAL 7016', hex: '#383e42' },
      { nom: 'Noir sablé', reference: '2100 Sablé', hex: '#27282b', majoration: 12 },
      { nom: 'Chêne doré', reference: 'Aspect bois', hex: '#a9733f', majoration: 35, delaiSup: 5 },
    ])
    .returning()
  const [bouchon, angle] = await db
    .insert(accessories)
    .values([
      { nom: 'Bouchon de couvertine', prix: 6.9, modeles: ['couvertine'] },
      { nom: 'Angle de bandeau', prix: 14.5, modeles: ['bandeau'] },
    ])
    .returning()
  const dupont = (await direction.post('/api/clients', { type: 'particulier', prenom: 'Jean', nom: 'Dupont', codePostal: '42490', ville: 'Fraisses' })).json().id
  const toitures = (await direction.post('/api/clients', { type: 'professionnel', raisonSociale: 'Toitures du Forez' })).json().id
  ids = { alu: alu!.id, galva: galva!.id, anthracite: anthracite!.id, sable: sable!.id, bois: bois!.id, bouchon: bouchon!.id, angle: angle!.id, dupont, toitures }
})

// Couvertine de 480 mm de développé, 4 plis, 3 m, 4 pièces, 2 bouchons
const couvertine = () => ({
  repere: 'Mur sud',
  modele: 'couvertine',
  materialId: ids.alu,
  colorId: ids.anthracite,
  cotes: [20, 70, 300, 70, 20],
  angles: [135, 90, 90, 135],
  longueur: 3000,
  quantite: 4,
  accessoires: [{ accessoryId: ids.bouchon, quantite: 2 }],
})
const body = (over: Record<string, unknown> = {}) => ({ clientId: ids.dupont, lignes: [couvertine()], livraison: { mode: 'retrait' }, ...over })
const create = async (over: Record<string, unknown> = {}) => {
  const res = await direction.post('/api/orders', body(over))
  expect(res.statusCode, res.body).toBe(201)
  return res.json() as { id: string; numero: string }
}
const entries = (action: string) => db.select().from(auditLog).where(eq(auditLog.action, action))
const login = async (role: 'rh' | 'atelier') => {
  await createUser({ identifiant: role, role })
  return loginAs(app, role)
}

describe('Accès', () => {
  it('réserve les commandes à la direction, et la fabrication à l’atelier et la direction', async () => {
    const { id } = await create()
    const [rh, atelier] = [await login('rh'), await login('atelier')]
    for (const c of [rh, atelier]) {
      for (const res of await Promise.all([
        c.get('/api/orders'),
        c.post('/api/orders', body()),
        c.post('/api/orders/quote', body()),
        c.get(`/api/orders/${id}`),
        c.patch(`/api/orders/${id}`, body()),
        c.post(`/api/orders/${id}/status`, { statut: 'validee' }),
      ]))
        expect(res.statusCode).toBe(403)
    }
    expect((await rh.get('/api/production')).statusCode).toBe(403)
    expect((await atelier.get('/api/production')).statusCode).toBe(200)
    expect((await direction.get('/api/production')).statusCode).toBe(200)
  })
})

describe('Chiffrage', () => {
  it('donne le catalogue actif et les limites des machines au formulaire', async () => {
    const c = (await direction.get('/api/orders/catalog')).json()
    expect(c.materials).toEqual([{ id: ids.alu, label: 'Aluminium 1,5 mm', retourMin: 10 }])
    expect(c.colors.map((x: { label: string }) => x.label)).toEqual(['Chêne doré (Aspect bois)', 'Gris anthracite (RAL 7016)', 'Noir sablé (2100 Sablé)'])
    expect(c.accessories[1]).toMatchObject({ nom: 'Bouchon de couvertine', modeles: ['couvertine'] })
    expect(c.limits).toEqual({ largeurTole: 1250, longueurMin: 200, longueurMax: 3000, plisMax: 8 })
  })

  it('accepte un pli dans l’autre sens (angle négatif), sans changer le prix', async () => {
    const res = await direction.post('/api/orders/quote', body({ lignes: [{ ...couvertine(), angles: [-135, 90, 90, -135] }] }))
    expect(res.json().lignes[0]).toMatchObject({ angles: [-135, 90, 90, -135], prixUnitaire: 100.08 })
    expect((await direction.post('/api/orders/quote', body({ lignes: [{ ...couvertine(), angles: [0, 90, 90, 135] }] }))).json()).toMatchObject({ field: 'lignes.0.angles.0', error: 'Angle : 0° impossible.' })
  })

  it('calcule pièces, accessoires, mise en route et TVA pour un particulier qui retire', async () => {
    const res = await direction.post('/api/orders/quote', body())
    expect(res.statusCode, res.body).toBe(200)
    const { lignes, totals } = res.json()
    // 0,48 m × 3 m × 62 €/m² + 4 plis × 0,90 € × 3 m = 100,08 € la pièce
    expect(lignes[0]).toMatchObject({ developpe: 480, prixUnitaire: 100.08, remiseQuantite: 0, montantPieces: 400.32, montantAccessoires: 13.8, miseEnRoute: 18, total: 432.12 })
    expect(lignes[0]).toMatchObject({ materialLabel: 'Aluminium 1,5 mm', colorLabel: 'Gris anthracite (RAL 7016)', repere: 'Mur sud' })
    expect(totals).toMatchObject({ brut: 432.12, remisePro: 0, complementMinimum: 0, livraisonPrix: 0, ht: 432.12, tva: 86.42, ttc: 518.54, delaiJours: 5 })
  })

  it('applique la remise pro et la livraison selon la distance', async () => {
    const res = await direction.post('/api/orders/quote', body({ clientId: ids.toitures, livraison: { mode: 'livraison', adresse: '12 chemin du Bois', codePostal: '42700', ville: 'Firminy' } }))
    const { totals, distanceKm } = res.json()
    expect(distanceKm).toBeLessThan(30)
    expect(totals).toMatchObject({ brut: 432.12, tauxRemisePro: 10, remisePro: 43.21, livraisonPrix: 39, ht: 427.91, tva: 85.58, ttc: 513.49 })
    // Plus loin : deuxième zone
    const lyon = await direction.post('/api/orders/quote', body({ livraison: { mode: 'livraison', adresse: '1 place Bellecour', codePostal: '69001', ville: 'Lyon' } }))
    expect(lyon.json().totals.livraisonPrix).toBe(69)
  })

  it('complète jusqu’au minimum de commande, majore le coloris et allonge le délai', async () => {
    const petite = { ...couvertine(), modele: 'bandeau', colorId: ids.sable, cotes: [40, 150], angles: [90], longueur: 1000, quantite: 1, accessoires: [] }
    const { lignes, totals } = (await direction.post('/api/orders/quote', body({ lignes: [petite] }))).json()
    // 0,19 × 1 × 62 × 1,12 + 0,90 = 14,09 €, + 18 € de mise en route
    expect(lignes[0].total).toBe(32.09)
    expect(totals).toMatchObject({ complementMinimum: 12.91, ht: 45 })
    const bois = (await direction.post('/api/orders/quote', body({ lignes: [{ ...couvertine(), colorId: ids.bois }] }))).json()
    expect(bois.totals.delaiJours).toBe(10)
  })

  it('applique la remise quantité du palier atteint', async () => {
    expect(quantityDiscount({ remisesQuantite: [{ seuil: 20, remise: 5 }, { seuil: 50, remise: 10 }] }, 19)).toBe(0)
    expect(quantityDiscount({ remisesQuantite: [{ seuil: 50, remise: 10 }, { seuil: 20, remise: 5 }] }, 60)).toBe(10)
    const { lignes } = (await direction.post('/api/orders/quote', body({ lignes: [{ ...couvertine(), quantite: 20 }] }))).json()
    expect(lignes[0]).toMatchObject({ remiseQuantite: 5, montantPieces: 1901.52 })
  })

  it('compte les jours ouvrés sans les week-ends', () => {
    expect(addWorkingDays('2026-10-16', 1)).toBe('2026-10-19')
    expect(addWorkingDays('2026-10-19', 5)).toBe('2026-10-26')
  })

  it.each([
    [{ cotes: [5, 70, 300, 70, 20] }, 'lignes.0.cotes.0', /Cote A : 10 mm minimum en Aluminium 1,5 mm/],
    [{ cotes: [20, 700, 700], angles: [90, 90] }, 'lignes.0.cotes', /Développé de 1\s420 mm/],
    [{ longueur: 3500 }, 'lignes.0.longueur', /entre 200 et 3\s000 mm/],
    [{ angles: [90] }, 'lignes.0.angles', /un angle pour chaque pli/],
    [{ cotes: Array(10).fill(20), angles: Array(9).fill(90) }, 'lignes.0.cotes', /8 plis maximum/],
    [{ materialId: 'galva' }, 'lignes.0.materialId', /inconnue ou désactivée/],
    [{ quantite: 0 }, 'lignes.0.quantite', /1 minimum/],
    [{ accessoires: [{ accessoryId: 'angle', quantite: 2 }] }, 'lignes.0.accessoires.0', /ne s’utilise pas avec ce modèle/],
  ])('refuse une pièce %o et désigne le champ', async (over, field, msg) => {
    const l = { ...couvertine(), ...over } as Record<string, unknown>
    if (l.materialId === 'galva') l.materialId = ids.galva
    if (Array.isArray(l.accessoires) && (l.accessoires as { accessoryId: string }[])[0]?.accessoryId === 'angle') l.accessoires = [{ accessoryId: ids.angle, quantite: 2 }]
    const res = await direction.post('/api/orders/quote', body({ lignes: [l] }))
    expect(res.statusCode).toBe(400)
    expect(res.json().field).toBe(field)
    expect(res.json().error).toMatch(msg)
  })

  it('refuse une matière désactivée, une adresse hors zone ou introuvable, et un client archivé', async () => {
    expect((await direction.post('/api/orders/quote', body({ lignes: [{ ...couvertine(), materialId: ids.galva }] }))).json().error).toMatch(/désactivée/)
    const paris = await direction.post('/api/orders/quote', body({ livraison: { mode: 'livraison', adresse: '1 rue de Rivoli', codePostal: '75001', ville: 'Paris' } }))
    expect(paris.json()).toMatchObject({ field: 'livraison', error: expect.stringMatching(/au-delà de la zone de livraison \(80 km\)/) })
    const nulle = await direction.post('/api/orders/quote', body({ livraison: { mode: 'livraison', adresse: 'Nulle part', codePostal: '99999', ville: 'X' } }))
    expect(nulle.json()).toMatchObject({ field: 'livraison', error: expect.stringMatching(/introuvable/) })
    expect((await direction.post('/api/orders/quote', body({ livraison: { mode: 'livraison' } }))).json().field).toBe('livraison.adresse')
    expect((await direction.post('/api/orders/quote', body({ lignes: [] }))).json()).toMatchObject({ field: 'lignes', error: 'Ajoutez au moins une pièce.' })
    await direction.post(`/api/clients/${ids.dupont}/archive`)
    expect((await direction.post('/api/orders/quote', body())).json()).toMatchObject({ field: 'clientId', error: expect.stringMatching(/archivé/) })
  })
})

describe('Commandes', () => {
  it('numérote, fige les prix, date l’étape « reçue » et note la création au journal', async () => {
    const a = await create()
    const b = await create({ clientId: ids.toitures })
    expect(a.numero).toBe(`C-${YEAR}-0001`)
    expect(b.numero).toBe(`C-${YEAR}-0002`)
    const [entry] = await entries('order.created')
    expect(entry).toMatchObject({ targetType: 'order', targetId: a.id, details: { numero: a.numero, client: 'Jean Dupont', clientId: ids.dupont, ht: 432.12, pieces: 4 } })

    // Un changement de tarif ne touche pas la commande passée
    await db.update(materials).set({ prixM2: 99 }).where(eq(materials.id, ids.alu))
    const detail = (await direction.get(`/api/orders/${a.id}`)).json()
    expect(detail.order).toMatchObject({ statut: 'recue', statutLabel: 'Reçue', next: ['validee', 'annulee'], ht: 432.12, ttc: 518.54, livraisonMode: 'retrait' })
    expect(detail.client).toMatchObject({ id: ids.dupont, nom: 'Jean Dupont', type: 'particulier' })
    expect(detail.lignes[0]).toMatchObject({ position: 0, cotes: [20, 70, 300, 70, 20], angles: [135, 90, 90, 135], prixUnitaire: 100.08, accessoires: [{ nom: 'Bouchon de couvertine', prix: 6.9, quantite: 2 }] })
    expect(detail.events).toEqual([expect.objectContaining({ statut: 'recue', note: null })])
  })

  it('liste les commandes en cours, filtre par étape et cherche par numéro ou client', async () => {
    const a = await create()
    await create({ clientId: ids.toitures })
    await direction.post(`/api/orders/${a.id}/status`, { statut: 'annulee', note: 'Client injoignable' })
    const list = async (q = '') => (await direction.get(`/api/orders${q}`)).json()
    const courantes = await list()
    expect(courantes.orders.map((o: { client: string }) => o.client)).toEqual(['Toitures du Forez'])
    expect(courantes.orders[0]).toMatchObject({ statut: 'recue', pieces: 4, ht: 388.91 })
    expect(courantes.totals).toMatchObject({ recue: 1, annulee: 1, validee: 0 })
    expect((await list('?filtre=annulee')).orders[0].id).toBe(a.id)
    expect((await list('?filtre=toutes')).orders).toHaveLength(2)
    expect((await list('?filtre=toutes&q=dupont')).orders).toHaveLength(1)
    expect((await list(`?filtre=toutes&q=${YEAR}-0002`)).orders[0].client).toBe('Toitures du Forez')
    expect((await list(`?filtre=toutes&clientId=${ids.toitures}`)).orders).toHaveLength(1)
    expect((await direction.get('/api/orders?filtre=x')).statusCode).toBe(400)
  })

  it('modifie les pièces tant que la commande n’est pas validée', async () => {
    const { id } = await create()
    const res = await direction.patch(`/api/orders/${id}`, { lignes: [{ ...couvertine(), quantite: 2 }], livraison: { mode: 'retrait' }, notes: 'Rappeler avant' })
    expect(res.statusCode, res.body).toBe(200)
    const detail = (await direction.get(`/api/orders/${id}`)).json()
    expect(detail.order).toMatchObject({ notes: 'Rappeler avant', ht: 231.96 })
    expect(detail.lignes).toHaveLength(1)
    expect((await entries('order.updated'))[0]!.details).toEqual({ numero: `C-${YEAR}-0001`, avant: 432.12, apres: 231.96 })
    expect((await direction.patch(`/api/orders/${id}`, { clientId: ids.toitures, lignes: [couvertine()], livraison: { mode: 'retrait' } })).json().field).toBe('clientId')
    await direction.post(`/api/orders/${id}/status`, { statut: 'validee' })
    const locked = await direction.patch(`/api/orders/${id}`, { lignes: [couvertine()], livraison: { mode: 'retrait' } })
    expect(locked.statusCode).toBe(409)
  })

  it('suit les étapes dans l’ordre, fixe la date prévue à la validation, et exige la raison d’une annulation', async () => {
    const { id } = await create({ lignes: [{ ...couvertine(), colorId: ids.bois }] })
    const step = (statut: string, note?: string) => direction.post(`/api/orders/${id}/status`, { statut, note })
    expect((await step('fabrication')).statusCode).toBe(409)
    const v = await step('validee')
    expect(v.json()).toEqual({ statut: 'validee', datePrevue: addWorkingDays(todayParis(), 10) })
    expect((await step('validee')).json().error).toMatch(/« Validée » ne peut pas passer à « Validée »/)
    for (const s of ['fabrication', 'prete', 'livree']) expect((await step(s)).statusCode).toBe(200)
    expect((await step('annulee', 'Trop tard')).statusCode).toBe(409)
    const detail = (await direction.get(`/api/orders/${id}`)).json()
    expect(detail.events.map((e: { statut: string }) => e.statut)).toEqual(['recue', 'validee', 'fabrication', 'prete', 'livree'])
    expect(detail.order.next).toEqual([])
    const logged = await entries('order.status_changed')
    expect(logged.map((e) => (e.details as { apres: string }).apres)).toEqual(['validee', 'fabrication', 'prete', 'livree'])

    const other = await create()
    expect((await direction.post(`/api/orders/${other.id}/status`, { statut: 'annulee' })).json()).toMatchObject({ field: 'note', error: 'Indiquez la raison de l’annulation.' })
    expect((await direction.post(`/api/orders/${other.id}/status`, { statut: 'annulee', note: 'Doublon' })).statusCode).toBe(200)
    expect((await direction.get(`/api/orders/${other.id}`)).json().events.at(-1)).toMatchObject({ statut: 'annulee', note: 'Doublon' })
    expect((await direction.post(`/api/orders/${other.id}/status`, { statut: 'x' })).json().field).toBe('statut')
  })

  it('répond 404 pour une commande inconnue', async () => {
    expect((await direction.get('/api/orders/00000000-0000-4000-8000-000000000000')).statusCode).toBe(404)
    expect((await direction.get('/api/orders/abc')).json().error).toBe('Commande introuvable.')
  })

  it('montre les commandes et le total dépensé sur la fiche client, pas à la RH', async () => {
    const a = await create()
    const b = await create()
    await direction.post(`/api/orders/${b.id}/status`, { statut: 'annulee', note: 'Doublon' })
    const fiche = (await direction.get(`/api/clients/${ids.dupont}`)).json()
    expect(fiche.commandes.list.map((o: { id: string }) => o.id).sort()).toEqual([a.id, b.id].sort())
    // Les commandes annulées ne comptent pas
    expect(fiche.commandes.totalTtc).toBe(518.54)
    const rh = await login('rh')
    expect((await rh.get(`/api/clients/${ids.dupont}`)).json().commandes).toBeNull()
  })

  it('filtre les commandes dans le journal', async () => {
    await create()
    const res = (await direction.get('/api/audit?type=orders')).json()
    expect(res.entries.map((e: { action: string }) => e.action)).toEqual(['order.created'])
  })
})

describe('Fabrication (atelier)', () => {
  it('ne montre que les commandes validées à prêtes, sans client ni prix', async () => {
    const recue = await create()
    const validee = await create({ clientId: ids.toitures, livraison: { mode: 'livraison', adresse: '12 chemin du Bois', codePostal: '42700', ville: 'Firminy' } })
    await direction.post(`/api/orders/${validee.id}/status`, { statut: 'validee' })
    const atelier = await login('atelier')
    const list = await atelier.get('/api/production')
    expect(list.json().orders).toEqual([expect.objectContaining({ id: validee.id, numero: validee.numero, statut: 'validee', livraisonMode: 'livraison', pieces: 4, lignes: 1, next: 'fabrication' })])
    const detail = await atelier.get(`/api/production/${validee.id}`)
    expect(detail.json().lignes[0]).toMatchObject({ cotes: [20, 70, 300, 70, 20], angles: [135, 90, 90, 135], colorLabel: 'Gris anthracite (RAL 7016)', accessoires: [{ nom: 'Bouchon de couvertine', unite: 'piece', quantite: 2 }] })
    for (const res of [list, detail]) {
      for (const secret of ['Toitures', 'Forez', 'Firminy', 'chemin', '"clientId"', '"ttc"', '"prix"', '"ht"', '"total"', '"prixUnitaire"']) expect(res.body, secret).not.toContain(secret)
    }
    expect((await atelier.get(`/api/production/${recue.id}`)).statusCode).toBe(404)
  })

  it('fait avancer la commande d’une étape à la fois, sans pouvoir l’annuler', async () => {
    const { id } = await create()
    await direction.post(`/api/orders/${id}/status`, { statut: 'validee' })
    const atelier = await login('atelier')
    const step = (statut: string) => atelier.post(`/api/production/${id}/status`, { statut })
    expect((await step('annulee')).statusCode).toBe(409)
    expect((await step('prete')).statusCode).toBe(409)
    expect((await step('fabrication')).statusCode).toBe(200)
    expect((await step('prete')).statusCode).toBe(200)
    expect((await atelier.get(`/api/production/${id}`)).json().order.next).toBe('livree')
    expect((await step('livree')).statusCode).toBe(200)
    // Livrée : elle sort de la vue atelier
    expect((await atelier.get(`/api/production/${id}`)).statusCode).toBe(404)
    const events = (await direction.get(`/api/orders/${id}`)).json().events
    expect(events.at(-1)).toMatchObject({ statut: 'livree', nom: 'Utilisateur ' + events.at(-1).nom.split(' ')[1] })
    const [last] = (await entries('order.status_changed')).slice(-1)
    expect(last!.details).toMatchObject({ apres: 'livree' })
    expect(await db.select().from(orderLines)).toHaveLength(1)
    expect((await db.select().from(orders))[0]!.statut).toBe('livree')
  })
})
