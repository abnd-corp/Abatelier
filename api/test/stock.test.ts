import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { auditLog, colors, materials, sheetMovements, sheetStock } from '../src/db/schema.js'
import { adviseSheets, fit } from '../src/cutting.js'
import { buildApp, client, createUser, loginAs, M, resetDb, seedModels, type App, type Client } from './helpers.js'

let app: App
let direction: Client
let atelier: Client
let visitor: Client
let ids: { alu: string; alu2: string; anthracite: string; blanc: string }

beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => app.close())
beforeEach(async () => {
  await resetDb()
  await seedModels()
  await createUser({ identifiant: 'chef', role: 'direction' })
  await createUser({ identifiant: 'plieur', nom: 'Plieur', role: 'atelier' })
  direction = await loginAs(app, 'chef')
  atelier = await loginAs(app, 'plieur')
  visitor = client(app)
  const [alu] = await db.insert(materials).values({ nom: 'Aluminium', epaisseur: 1.5, prixM2: 62, retourMin: 10 }).returning()
  const [alu2] = await db.insert(materials).values({ nom: 'Aluminium', epaisseur: 1, prixM2: 50, retourMin: 8 }).returning()
  const [anthracite] = await db.insert(colors).values({ nom: 'Gris anthracite', reference: 'RAL 7016', hex: '#383e42' }).returning()
  const [blanc] = await db.insert(colors).values({ nom: 'Blanc', reference: 'RAL 9010', hex: '#f4f4f0' }).returning()
  ids = { alu: alu!.id, alu2: alu2!.id, anthracite: anthracite!.id, blanc: blanc!.id }
})

const norm = (t: string) => t.replace(/[\u202f\u00a0]/g, ' ')
const entries = (action: string) => db.select().from(auditLog).where(eq(auditLog.action, action))
const feuille = (over: Record<string, unknown> = {}) => ({ materialId: ids.alu, colorId: ids.anthracite, largeur: 1250, longueur: 3000, quantite: 10, ...over })
async function add(over: Record<string, unknown> = {}, who: Client = atelier) {
  const res = await who.post('/api/stock/feuilles', feuille(over))
  expect(res.statusCode, res.body).toBe(201)
  return res.json().feuille as { id: string; libelle: string; quantite: number; bas: boolean }
}

describe('Accès', () => {
  it('est ouvert à l’atelier et à la direction, fermé aux visiteurs et à la RH', async () => {
    await createUser({ identifiant: 'claire', role: 'rh' })
    const rh = await loginAs(app, 'claire')
    for (const url of ['/api/stock/feuilles', '/api/stock/options', '/api/stock/mouvements']) {
      expect((await visitor.get(url)).statusCode, url).toBe(401)
      expect((await rh.get(url)).statusCode, url).toBe(403)
      expect((await atelier.get(url)).statusCode, url).toBe(200)
      expect((await direction.get(url)).statusCode, url).toBe(200)
    }
    expect((await rh.post('/api/stock/feuilles', feuille())).statusCode).toBe(403)
    expect((await visitor.post('/api/stock/feuilles', feuille())).statusCode).toBe(401)
  })

  it('ne montre aucun prix à l’atelier', async () => {
    await add()
    const res = await atelier.get('/api/stock/feuilles')
    expect(res.body).not.toMatch(/prix|majoration/i)
    expect((await atelier.get('/api/stock/options')).body).not.toMatch(/prix|majoration/i)
  })
})

describe('Saisie des feuilles', () => {
  it('propose les matières et coloris du catalogue', async () => {
    const o = (await atelier.get('/api/stock/options')).json()
    expect(o.materials.map((m: { label: string }) => m.label)).toEqual(expect.arrayContaining(['Aluminium 1,5 mm', 'Aluminium 1 mm']))
    expect(o.colors.map((c: { label: string }) => c.label)).toContain('Gris anthracite (RAL 7016)')
  })

  it('enregistre une feuille avec sa matière, son épaisseur, son coloris et son format, trace la première saisie et le journal', async () => {
    const f = await add({ note: 'Palette 2' })
    expect(norm(f.libelle)).toBe('Aluminium 1,5 mm · Gris anthracite (RAL 7016) · 1 250 × 3 000 mm')
    expect(f).toMatchObject({ quantite: 10, bas: false, etat: 'ok' })
    const list = (await atelier.get('/api/stock/feuilles')).json()
    expect(list.feuilles[0]).toMatchObject({ matiere: 'Aluminium', epaisseur: 1.5, coloris: 'Gris anthracite', largeur: 1250, longueur: 3000, chute: false, note: 'Palette 2' })
    expect(list.totaux).toEqual({ references: 1, feuillesEntieres: 10, chutes: 0, m2Entieres: 37.5, m2Chutes: 0, bas: 0 })
    const [mv] = await db.select().from(sheetMovements)
    expect(mv).toMatchObject({ delta: 10, apres: 10, motif: 'reception', note: 'Première saisie' })
    expect((await entries('stock.sheet_created'))[0]!.details).toMatchObject({ quantite: 10 })
  })

  it('ne mélange jamais les chutes et les feuilles entières dans les totaux (une chute n’est pas une feuille)', async () => {
    await add({ quantite: 10 }) // entière : 1 250 × 3 000, 10 feuilles
    await add({ chute: true, largeur: 300, longueur: 400, quantite: 3 }) // chute : 300 × 400, 3 morceaux
    const { totaux } = (await atelier.get('/api/stock/feuilles')).json()
    expect(totaux).toEqual({ references: 2, feuillesEntieres: 10, chutes: 3, m2Entieres: 37.5, m2Chutes: 0.4, bas: 0 })
  })

  it('refuse une alerte de stock bas sur une chute : elle n’est pas réapprovisionnée', async () => {
    const bad = await atelier.post('/api/stock/feuilles', feuille({ chute: true, largeur: 300, longueur: 400, seuil: 2 }))
    expect(bad.statusCode).toBe(400)
    expect(bad.json()).toMatchObject({ field: 'seuil', error: expect.stringMatching(/alerte.*chute/) })

    const f = await add({ chute: true, largeur: 300, longueur: 400 })
    expect((await atelier.patch(`/api/stock/feuilles/${f.id}`, { seuil: 2 })).statusCode).toBe(400)
    // Rendre une feuille entière chute alors qu'elle a déjà une alerte est refusé aussi
    const g = await add({ largeur: 500, longueur: 600, seuil: 5 })
    expect((await atelier.patch(`/api/stock/feuilles/${g.id}`, { chute: true })).statusCode).toBe(400)
    // Mais retirer l'alerte en même temps passe
    expect((await atelier.patch(`/api/stock/feuilles/${g.id}`, { chute: true, seuil: 0 })).statusCode).toBe(200)
  })

  it('accepte une tôle brute (sans coloris), remet la largeur et la longueur dans l’ordre, et marque une chute', async () => {
    const f = await add({ colorId: null, largeur: 3000, longueur: 1250, chute: true, quantite: 2 })
    expect(norm(f.libelle)).toBe('Aluminium 1,5 mm · brut · 1 250 × 3 000 mm (chute)')
  })

  it('valide la saisie avec le champ concerné', async () => {
    const bad = async (over: Record<string, unknown>) => (await atelier.post('/api/stock/feuilles', feuille(over))).json()
    expect(await bad({ largeur: 10 })).toMatchObject({ field: 'largeur', error: expect.stringContaining('50 mm minimum') })
    expect(await bad({ longueur: 99999 })).toMatchObject({ field: 'longueur' })
    expect(await bad({ quantite: -1 })).toMatchObject({ field: 'quantite' })
    expect(await bad({ materialId: 'pas-un-uuid' })).toMatchObject({ field: 'materialId' })
    expect(await bad({ materialId: '00000000-0000-4000-8000-000000000000' })).toMatchObject({ field: 'materialId', error: 'Matière inconnue.' })
    expect(await bad({ colorId: '00000000-0000-4000-8000-000000000000' })).toMatchObject({ field: 'colorId' })
    expect(await db.select().from(sheetStock)).toHaveLength(0)
  })

  it('refuse deux fois le même format (même sans coloris), et le propose en ajustement', async () => {
    await add()
    const dup = await atelier.post('/api/stock/feuilles', feuille())
    expect(dup.statusCode).toBe(409)
    expect(dup.json().error).toContain('existe déjà')
    await add({ colorId: null })
    expect((await atelier.post('/api/stock/feuilles', feuille({ colorId: null }))).statusCode).toBe(409)
    // Même format dans un autre coloris, une autre épaisseur ou en chute : autant de références
    await add({ colorId: ids.blanc })
    await add({ materialId: ids.alu2 })
    await add({ chute: true })
    expect(await db.select().from(sheetStock)).toHaveLength(5)
  })

  it('modifie le format, le seuil et la note, et note au journal', async () => {
    const f = await add()
    const res = await atelier.patch(`/api/stock/feuilles/${f.id}`, { seuil: 5, note: 'Rack B', longueur: 2500 })
    expect(res.statusCode, res.body).toBe(200)
    const [row] = await db.select().from(sheetStock)
    expect(row).toMatchObject({ seuil: 5, note: 'Rack B', longueur: 2500 })
    expect((await entries('stock.sheet_updated'))[0]!.details).toMatchObject({ champs: expect.arrayContaining(['seuil', 'note', 'longueur']) })
    expect((await atelier.patch(`/api/stock/feuilles/${f.id}`, { largeur: 3000 })).json().field).toBe('longueur')
    expect((await atelier.patch('/api/stock/feuilles/pas-un-uuid', {})).statusCode).toBe(404)
  })
})

describe('Entrées, sorties et inventaire', () => {
  it('ajoute et retire des feuilles, trace chaque mouvement avec son auteur, et signale le stock bas', async () => {
    const f = await add({ seuil: 4 })
    const out = await atelier.post(`/api/stock/feuilles/${f.id}/mouvement`, { delta: -7, motif: 'fabrication', note: 'C-2026-0001' })
    expect(out.json()).toEqual({ quantite: 3, bas: true, etat: 'bas' })
    const inn = await atelier.post(`/api/stock/feuilles/${f.id}/mouvement`, { delta: 20, motif: 'reception' })
    expect(inn.json()).toEqual({ quantite: 23, bas: false, etat: 'ok' })
    const list = (await atelier.get('/api/stock/feuilles')).json()
    expect(list.feuilles[0].quantite).toBe(23)
    const h = (await atelier.get(`/api/stock/mouvements?feuille=${f.id}`)).json().mouvements
    expect(h.map((m: { delta: number; apres: number; motif: string; par: string }) => [m.delta, m.apres, m.motif, m.par])).toEqual([
      [20, 23, 'reception', 'Plieur'],
      [-7, 3, 'fabrication', 'Plieur'],
      [10, 10, 'reception', 'Plieur'],
    ])
    expect(h[1].note).toBe('C-2026-0001')
    expect(await entries('stock.moved')).toHaveLength(2)
  })

  it('calcule l’état à 4 niveaux (vide, critique, bas, ok) à partir du seuil (R7)', async () => {
    const f = await add({ seuil: 10, quantite: 0 })
    const etatApres = async (delta: number) => (await atelier.post(`/api/stock/feuilles/${f.id}/mouvement`, { delta, motif: 'reception' })).json().etat
    expect((await atelier.get('/api/stock/feuilles')).json().feuilles[0].etat).toBe('vide')
    expect(await etatApres(4)).toBe('critique') // 4 ≤ 10/2
    expect(await etatApres(2)).toBe('bas') // 6 ≤ 10, mais > 5
    expect(await etatApres(5)).toBe('ok') // 11 > 10
    // Sans seuil réglé, seul le vide est détecté
    const g = await add({ colorId: null, seuil: 0, quantite: 1 })
    expect((await atelier.post(`/api/stock/feuilles/${g.id}/mouvement`, { delta: -1, motif: 'perte' })).json().etat).toBe('vide')
  })

  it('refuse de sortir plus de feuilles qu’il n’y en a, sans rien changer', async () => {
    const f = await add({ quantite: 2 })
    const res = await atelier.post(`/api/stock/feuilles/${f.id}/mouvement`, { delta: -3, motif: 'perte' })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toContain('Il n’y a que 2 feuilles')
    expect((await db.select().from(sheetStock))[0]!.quantite).toBe(2)
    expect(await db.select().from(sheetMovements)).toHaveLength(1)
  })

  it('corrige par inventaire : la quantité comptée remplace celle du stock, l’écart est tracé', async () => {
    const f = await add({ quantite: 10 })
    expect((await atelier.post(`/api/stock/feuilles/${f.id}/mouvement`, { quantite: 8, motif: 'inventaire' })).json().quantite).toBe(8)
    const [last] = await db.select().from(sheetMovements).where(eq(sheetMovements.motif, 'inventaire'))
    expect(last).toMatchObject({ delta: -2, apres: 8 })
    // Même quantité : rien à tracer
    await atelier.post(`/api/stock/feuilles/${f.id}/mouvement`, { quantite: 8, motif: 'inventaire' })
    expect(await db.select().from(sheetMovements)).toHaveLength(2)
  })

  it('valide le mouvement', async () => {
    const f = await add()
    const post = async (body: object) => (await atelier.post(`/api/stock/feuilles/${f.id}/mouvement`, body)).json()
    expect(await post({ motif: 'perte' })).toMatchObject({ field: 'delta' })
    expect(await post({ delta: 0, motif: 'perte' })).toMatchObject({ field: 'delta' })
    expect(await post({ delta: 1, quantite: 5, motif: 'perte' })).toMatchObject({ field: 'delta' })
    expect(await post({ delta: 1, motif: 'vol' })).toMatchObject({ field: 'motif' })
    expect(await post({ delta: 1.5, motif: 'perte' })).toMatchObject({ field: 'delta' })
    expect((await atelier.post('/api/stock/feuilles/pas-un-uuid/mouvement', { delta: 1, motif: 'perte' })).statusCode).toBe(404)
  })

  it('ne supprime une référence que vide, et garde l’historique', async () => {
    const f = await add({ quantite: 2 })
    expect((await atelier.delete(`/api/stock/feuilles/${f.id}`)).statusCode).toBe(409)
    await atelier.post(`/api/stock/feuilles/${f.id}/mouvement`, { quantite: 0, motif: 'inventaire' })
    expect((await atelier.delete(`/api/stock/feuilles/${f.id}`)).statusCode).toBe(200)
    expect(await db.select().from(sheetStock)).toHaveLength(0)
    const mv = await db.select().from(sheetMovements)
    expect(mv).toHaveLength(2)
    expect(mv.every((m) => m.sheetId === null && m.libelle.includes('Aluminium'))).toBe(true)
    expect(await entries('stock.sheet_deleted')).toHaveLength(1)
  })

  it('deux sorties simultanées ne passent pas sous zéro', async () => {
    const f = await add({ quantite: 1 })
    const res = await Promise.all([1, 2, 3].map(() => atelier.post(`/api/stock/feuilles/${f.id}/mouvement`, { delta: -1, motif: 'fabrication' })))
    expect(res.filter((r) => r.statusCode === 200)).toHaveLength(1)
    expect((await db.select().from(sheetStock))[0]!.quantite).toBe(0)
  })
})

describe('Choix de la feuille', () => {
  it('calcule combien de pièces entrent dans une feuille, dans le bon sens', () => {
    // Bande de 420 mm × 3 000 mm dans 1 250 × 3 000 : 2 en largeur, 1 en longueur
    expect(fit({ largeur: 1250, longueur: 3000 }, { developpe: 420, longueur: 3000 })).toMatchObject({ n: 2, sensLongueur: true })
    // Pièce courte : 400 × 1 000 → 3 × 3 en grille
    expect(fit({ largeur: 1250, longueur: 3000 }, { developpe: 400, longueur: 1000 }).n).toBe(9)
    // Pièce trop large pour la feuille dans les deux sens
    expect(fit({ largeur: 1250, longueur: 3000 }, { developpe: 1300, longueur: 3500 }).n).toBe(0)
    // Tournée d'un quart de tour : la longueur de la pièce suit la largeur de la feuille
    expect(fit({ largeur: 1250, longueur: 3000 }, { developpe: 1000, longueur: 1200 })).toMatchObject({ n: 3, sensLongueur: false })
  })

  const s = (id: string, largeur: number, longueur: number, quantite: number, chute = false) => ({ id, largeur, longueur, quantite, chute, libelle: id })
  it('préfère les chutes, puis la feuille qui perd le moins, et écarte ce qui ne convient pas ou manque', () => {
    const piece = { developpe: 420, longueur: 3000, quantite: 4 }
    const r = adviseSheets(piece, [s('grande', 1250, 3000, 10), s('chute', 450, 3000, 5, true), s('petite', 400, 3000, 9), s('vide', 1250, 3000, 0)])
    expect(r.map((x) => x.sheetId)).toEqual(['chute', 'grande'])
    expect(r[0]).toMatchObject({ parFeuille: 1, feuilles: 4, perte: 6.7 })
    expect(r[1]).toMatchObject({ parFeuille: 2, feuilles: 2, perte: 32.8 })
    // Pas assez de chutes : la feuille entière passe devant
    const peu = adviseSheets({ ...piece, quantite: 6 }, [s('grande', 1250, 3000, 10), s('chute', 450, 3000, 2, true)])
    expect(peu.map((x) => x.sheetId)).toEqual(['grande', 'chute'])
  })

  it('conseille la feuille du stock pour chaque pièce d’une commande, sans prix ni client', async () => {
    const f = await add({ largeur: 1250, longueur: 3000, quantite: 6 })
    const chute = await add({ largeur: 450, longueur: 3000, quantite: 5, chute: true })
    await add({ colorId: ids.blanc, quantite: 9 })
    const piece = {
      repere: 'Mur sud',
      modelId: M.couvertine,
      materialId: ids.alu,
      colorId: ids.anthracite,
      cotes: [20, 70, 300, 70, 20],
      angles: [135, 90, 90, 135],
      longueur: 3000,
      quantite: 4,
      accessoires: [],
    }
    const cmd = (await direction.post('/api/clients', { type: 'particulier', prenom: 'Jean', nom: 'Dupont' })).json().id
    const order = (await direction.post('/api/orders', { clientId: cmd, lignes: [piece], livraison: { mode: 'retrait' } })).json()
    await direction.post(`/api/orders/${order.id}/status`, { statut: 'validee' })
    const res = await atelier.get(`/api/production/${order.id}/feuilles`)
    expect(res.statusCode, res.body).toBe(200)
    const l = res.json().lignes[0]
    expect(l.besoin).toEqual({ developpe: 480, longueur: 3000, quantite: 4 })
    // 480 mm de développé : 2 bandes dans 1 250 mm de large, aucune dans 450 mm
    expect(l.conseils).toHaveLength(1)
    expect(l.conseils[0]).toMatchObject({ sheetId: f.id, parFeuille: 2, feuilles: 2, enStock: 6 })
    expect(chute.id).toBeTruthy()
    expect(res.body).not.toMatch(/Dupont|prix|ttc/i)
    // Sans stock pour cette matière : on le dit
    await db.delete(sheetStock)
    const vide = (await atelier.get(`/api/production/${order.id}/feuilles`)).json().lignes[0]
    expect(vide.conseils).toEqual([])
    expect(vide.raison).toContain('Aucune feuille en stock')
    expect((await visitor.get(`/api/production/${order.id}/feuilles`)).statusCode).toBe(401)
  })
})
