import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { auditLog, colors, materials, productionChecks, sheetMovements, sheetStock } from '../src/db/schema.js'
import { buildApp, createUser, loginAs, M, resetDb, seedModels, type App, type Client } from './helpers.js'

let app: App
let direction: Client
let alu: string
let anthracite: string
let numero: string
let orderId: string

beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => app.close())
beforeEach(async () => {
  await resetDb()
  await seedModels()
  await createUser({ identifiant: 'chef', role: 'direction' })
  direction = await loginAs(app, 'chef')
  const [a] = await db.insert(materials).values({ nom: 'Aluminium', epaisseur: 1.5, prixM2: 62, retourMin: 10 }).returning()
  const [g] = await db.insert(colors).values({ nom: 'Gris anthracite', reference: 'RAL 7016', hex: '#383e42' }).returning()
  alu = a!.id
  anthracite = g!.id
  const dupont = (await direction.post('/api/clients', { type: 'particulier', prenom: 'Jean', nom: 'Dupont', codePostal: '42490', ville: 'Fraisses' })).json().id
  // 4 couvertines de 480 mm de développé × 3 m : 2 par feuille de 1 250 × 3 000, donc 2 feuilles et 2 chutes de 290 × 3 000
  const res = await direction.post('/api/orders', {
    clientId: dupont,
    lignes: [
      { repere: 'Mur sud', modelId: M.couvertine, materialId: alu, colorId: anthracite, cotes: [20, 70, 300, 70, 20], angles: [135, 90, 90, 135], longueur: 3000, quantite: 4, accessoires: [] },
    ],
    livraison: { mode: 'retrait' },
  })
  expect(res.statusCode, res.body).toBe(201)
  orderId = res.json().id
  numero = res.json().numero
  expect((await direction.post(`/api/orders/${orderId}/status`, { statut: 'validee' })).statusCode).toBe(200)
})

const stockFeuille = () => db.insert(sheetStock).values({ materialId: alu, colorId: anthracite, largeur: 1250, longueur: 3000, quantite: 10 }).returning()
const suivi = async (c: Client = direction) =>
  (await c.get(`/api/production/${orderId}/suivi`)).json() as {
    plan: {
      groupes: {
        id: string
        stockCle: string
        coteCle: string
        recuperer: { cle: string; texte: string }[]
        decoupes: { cle: string; quantite: number; consigne: string }[]
        pliages: { cle: string }[]
        chutes: { garder: { nombre: number; largeur: number; longueur: number }[]; jeter: { nombre: number; largeur: number; longueur: number }[]; minimum: number; pourcent: number } | null
      }[]
    }
    checks: Record<string, { count: number; par: string }>
    modifiable: boolean
  }
const atelier = async () => {
  await createUser({ identifiant: 'atelier', role: 'atelier' })
  return loginAs(app, 'atelier')
}

describe('Suivi de la fabrication : accès', () => {
  it('est réservé à l’atelier et à la direction, et jamais public', async () => {
    const rh = (await createUser({ identifiant: 'rh', role: 'rh' }), await loginAs(app, 'rh'))
    const anonyme = await app.inject({ method: 'GET', url: `/api/production/${orderId}/suivi`, headers: { host: 'atelier.test' } })
    expect(anonyme.statusCode).toBe(401)
    for (const res of await Promise.all([
      rh.get(`/api/production/${orderId}/suivi`),
      rh.put(`/api/production/${orderId}/suivi`, { cle: 'x', count: 1 }),
      rh.post(`/api/production/${orderId}/suivi/stock`, { groupe: orderId }),
    ]))
      expect(res.statusCode).toBe(403)
    expect((await (await atelier()).get(`/api/production/${orderId}/suivi`)).statusCode).toBe(200)
    expect((await direction.get('/api/production/pas-un-uuid/suivi')).statusCode).toBe(404)
  })

  it('ne montre ni client, ni adresse, ni prix', async () => {
    await stockFeuille()
    const txt = (await direction.get(`/api/production/${orderId}/suivi`)).body
    for (const secret of ['Dupont', 'Fraisses', '42490', 'prix', 'ttc', 'tva']) expect(txt.toLowerCase(), secret).not.toContain(secret.toLowerCase())
  })
})

describe('Suivi de la fabrication : le plan', () => {
  it('range le travail par feuille avec la chute à garder', async () => {
    await stockFeuille()
    const { plan, modifiable } = await suivi()
    expect(modifiable).toBe(true)
    expect(plan.groupes).toHaveLength(1)
    const [g] = plan.groupes
    expect(g!.recuperer).toHaveLength(1)
    expect(g!.decoupes[0]).toMatchObject({ quantite: 4 })
    expect(g!.decoupes[0]!.consigne.replace(/[\u202f\u00a0]/g, ' ')).toBe('4 bandes de 480 mm de large × 3 000 mm de long')
    expect(g!.pliages).toHaveLength(1)
    expect(g!.chutes!.garder).toEqual([{ nombre: 2, largeur: 290, longueur: 3000 }])
  })

  it('dit « feuille à choisir » quand aucune feuille du stock ne convient, sans chute calculée', async () => {
    const { plan } = await suivi()
    expect(plan.groupes[0]!.recuperer[0]!.texte).toContain('aucune feuille conseillée en stock')
    expect(plan.groupes[0]!.chutes).toBeNull()
  })
})

describe('Suivi de la fabrication : cocher', () => {
  it('enregistre le nombre de pièces faites, avec qui et quand', async () => {
    await stockFeuille()
    const ouvrier = await atelier()
    const [g] = (await suivi()).plan.groupes
    const cle = g!.decoupes[0]!.cle
    const res = await ouvrier.put(`/api/production/${orderId}/suivi`, { cle, count: 3 })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({ cle, count: 3, par: expect.any(String) })
    expect((await suivi()).checks[cle]).toMatchObject({ count: 3 })
    // Décocher, puis cocher une case simple
    expect((await ouvrier.put(`/api/production/${orderId}/suivi`, { cle, count: 0 })).statusCode).toBe(200)
    expect((await suivi()).checks[cle]!.count).toBe(0)
    expect((await ouvrier.put(`/api/production/${orderId}/suivi`, { cle: g!.recuperer[0]!.cle, count: 1 })).statusCode).toBe(200)
    expect(await db.select().from(productionChecks).where(eq(productionChecks.orderId, orderId))).toHaveLength(2)
  })

  it('refuse une étape inconnue, un nombre trop grand ou négatif, et les cases réservées au stock', async () => {
    await stockFeuille()
    const [g] = (await suivi()).plan.groupes
    const put = (body: unknown) => direction.put(`/api/production/${orderId}/suivi`, body)
    expect((await put({ cle: 'decoupe:00000000-0000-0000-0000-000000000000', count: 1 })).json()).toMatchObject({ field: 'cle' })
    expect((await put({ cle: g!.decoupes[0]!.cle, count: 5 })).json()).toEqual({ error: 'Pas plus de 4 ici.', field: 'count' })
    expect((await put({ cle: g!.recuperer[0]!.cle, count: 2 })).statusCode).toBe(400)
    expect((await put({ cle: g!.decoupes[0]!.cle, count: -1 })).statusCode).toBe(400)
    expect((await put({ cle: g!.decoupes[0]!.cle, count: 1.5 })).statusCode).toBe(400)
    expect((await put({ count: 1 })).statusCode).toBe(400)
    expect((await put({ cle: g!.stockCle, count: 1 })).json()).toMatchObject({ field: 'cle' })
    expect(await db.select().from(productionChecks)).toHaveLength(0)
  })

  it('ne se modifie plus une fois la commande prête', async () => {
    const [g] = (await suivi()).plan.groupes
    expect((await direction.post(`/api/orders/${orderId}/status`, { statut: 'fabrication' })).statusCode).toBe(200)
    expect((await direction.put(`/api/production/${orderId}/suivi`, { cle: g!.recuperer[0]!.cle, count: 1 })).statusCode).toBe(200)
    expect((await direction.post(`/api/orders/${orderId}/status`, { statut: 'prete' })).statusCode).toBe(200)
    const res = await direction.put(`/api/production/${orderId}/suivi`, { cle: g!.recuperer[0]!.cle, count: 0 })
    expect(res.statusCode).toBe(409)
    expect((await suivi()).modifiable).toBe(false)
  })
})

describe('Suivi de la fabrication : fin de feuille et stock', () => {
  const faireLesDecoupes = async (c: Client) => {
    const [g] = (await suivi()).plan.groupes
    expect((await c.put(`/api/production/${orderId}/suivi`, { cle: g!.decoupes[0]!.cle, count: 4 })).statusCode).toBe(200)
    return g!
  }

  it('sort les feuilles du stock et y entre les chutes gardées, une seule fois, avec le journal', async () => {
    const [feuille] = await stockFeuille()
    const ouvrier = await atelier()
    const [g] = (await suivi()).plan.groupes
    // Les découpes d'abord
    const trop = await ouvrier.post(`/api/production/${orderId}/suivi/stock`, { groupe: g!.id })
    expect(trop.statusCode).toBe(409)
    expect(trop.json().error).toContain('Terminez d’abord les découpes')
    await faireLesDecoupes(ouvrier)

    const res = await ouvrier.post(`/api/production/${orderId}/suivi/stock`, { groupe: g!.id })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().sorties).toHaveLength(1)
    expect(res.json().chutes).toHaveLength(1)
    expect((await db.select().from(sheetStock).where(eq(sheetStock.id, feuille!.id)))[0]!.quantite).toBe(8)
    const [chute] = await db
      .select()
      .from(sheetStock)
      .where(and(eq(sheetStock.chute, true)))
    expect(chute).toMatchObject({ largeur: 290, longueur: 3000, quantite: 2, materialId: alu, colorId: anthracite })
    const mouvements = await db.select().from(sheetMovements)
    expect(mouvements.map((m) => [m.motif, m.delta, m.note]).sort()).toEqual([
      ['chute', 2, `Commande ${numero}`],
      ['fabrication', -2, `Commande ${numero}`],
    ])
    const [entree] = await db.select().from(auditLog).where(eq(auditLog.action, 'order.sheet_stock_confirmed'))
    expect(entree).toMatchObject({ targetType: 'order', targetId: orderId, details: { numero } })
    // La case est cochée par l'application, et le stock ne se décompte pas deux fois
    expect((await suivi()).checks[g!.stockCle]!.count).toBe(1)
    expect((await ouvrier.post(`/api/production/${orderId}/suivi/stock`, { groupe: g!.id })).statusCode).toBe(409)
    expect((await db.select().from(sheetStock).where(eq(sheetStock.id, feuille!.id)))[0]!.quantite).toBe(8)
  })

  it('ajoute aux chutes déjà en stock au lieu d’en créer une deuxième', async () => {
    await stockFeuille()
    await db.insert(sheetStock).values({ materialId: alu, colorId: anthracite, largeur: 290, longueur: 3000, chute: true, quantite: 1 })
    const g = await faireLesDecoupes(direction)
    expect((await direction.post(`/api/production/${orderId}/suivi/stock`, { groupe: g.id })).statusCode).toBe(200)
    const chutes = await db.select().from(sheetStock).where(eq(sheetStock.chute, true))
    expect(chutes).toHaveLength(1)
    expect(chutes[0]!.quantite).toBe(3)
  })

  it('refuse sans rien toucher quand le stock ne suffit plus', async () => {
    const [feuille] = await stockFeuille()
    const g = await faireLesDecoupes(direction)
    await db.update(sheetStock).set({ quantite: 1 }).where(eq(sheetStock.id, feuille!.id))
    const res = await direction.post(`/api/production/${orderId}/suivi/stock`, { groupe: g.id })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toContain('plus assez de feuilles')
    expect((await db.select().from(sheetStock).where(eq(sheetStock.id, feuille!.id)))[0]!.quantite).toBe(1)
    expect(await db.select().from(sheetMovements)).toHaveLength(0)
    expect((await suivi()).checks[g.stockCle]).toBeUndefined()
  })

  it('refuse sans feuille conseillée en stock, une feuille inconnue ou une entrée invalide', async () => {
    const [g] = (await suivi()).plan.groupes
    await direction.put(`/api/production/${orderId}/suivi`, { cle: g!.decoupes[0]!.cle, count: 4 })
    expect((await direction.post(`/api/production/${orderId}/suivi/stock`, { groupe: g!.id })).json().error).toContain('Aucune feuille du stock')
    expect((await direction.post(`/api/production/${orderId}/suivi/stock`, { groupe: '00000000-0000-0000-0000-000000000000' })).statusCode).toBe(404)
    expect((await direction.post(`/api/production/${orderId}/suivi/stock`, { groupe: 'oups' })).statusCode).toBe(400)
  })
})

describe('Taille minimale d’une chute à garder', () => {
  const reglage = (c: Client, chuteMin: unknown) => c.put('/api/stock/reglages', { chuteMin })

  it('démarre à 200 mm, se règle, et le dit au journal', async () => {
    expect((await direction.get('/api/stock/reglages')).json()).toEqual({ chuteMin: 200 })
    const res = await reglage(direction, 350)
    expect(res.statusCode, res.body).toBe(200)
    expect((await direction.get('/api/stock/reglages')).json()).toEqual({ chuteMin: 350 })
    const [entree] = await db.select().from(auditLog).where(eq(auditLog.action, 'stock.settings_updated'))
    expect(entree).toMatchObject({ details: { chuteMin: 350, avant: 200 } })
    // Rien de changé : rien au journal
    await reglage(direction, 350)
    expect(await db.select().from(auditLog).where(eq(auditLog.action, 'stock.settings_updated'))).toHaveLength(1)
  })

  it('refuse une valeur absurde', async () => {
    for (const v of [5, 2000, 12.5, 'grand', null]) expect((await reglage(direction, v)).statusCode, String(v)).toBe(400)
    expect((await direction.get('/api/stock/reglages')).json()).toEqual({ chuteMin: 200 })
  })

  it('est réservé à ceux qui gèrent le stock', async () => {
    await createUser({ identifiant: 'rh', role: 'rh' })
    const rh = await loginAs(app, 'rh')
    expect((await rh.get('/api/stock/reglages')).statusCode).toBe(403)
    expect((await reglage(rh, 300)).statusCode).toBe(403)
    expect((await app.inject({ method: 'GET', url: '/api/stock/reglages', headers: { host: 'atelier.test' } })).statusCode).toBe(401)
    expect((await reglage(await atelier(), 300)).statusCode).toBe(200)
  })

  it('change ce qui est à garder sur la fiche : à 400 mm, les 290 mm partent au rebut', async () => {
    await stockFeuille()
    expect((await suivi()).plan.groupes[0]!.chutes!.garder).toEqual([{ nombre: 2, largeur: 290, longueur: 3000 }])
    await reglage(direction, 400)
    const { plan } = await suivi()
    expect(plan.groupes[0]!.chutes!.garder).toEqual([])
    expect(plan.groupes[0]!.chutes).toMatchObject({ minimum: 400, jeter: [{ nombre: 2, largeur: 290, longueur: 3000 }] })
    // Et le stock n'accueille alors aucune chute
    const g = plan.groupes[0]!
    await direction.put(`/api/production/${orderId}/suivi`, { cle: g.decoupes[0]!.cle, count: 4 })
    const fin = await direction.post(`/api/production/${orderId}/suivi/stock`, { groupe: g.id })
    expect(fin.json().chutes).toEqual([])
    expect(await db.select().from(sheetStock).where(eq(sheetStock.chute, true))).toHaveLength(0)
  })
})
