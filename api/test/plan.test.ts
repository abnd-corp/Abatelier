import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { colors, materials, sheetMovements, sheetStock } from '../src/db/schema.js'
import { buildApp, client, createUser, loginAs, M, resetDb, seedModels, type App, type Client } from './helpers.js'

let app: App
let direction: Client
let ids: { alu: string; anthracite: string; dupont: string; sheet: string }

beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => app.close())
beforeEach(async () => {
  await resetDb()
  await seedModels()
  await createUser({ identifiant: 'chef', role: 'direction' })
  direction = await loginAs(app, 'chef')
  const [alu] = await db.insert(materials).values({ nom: 'Aluminium', epaisseur: 1.5, prixM2: 62, retourMin: 10 }).returning()
  const [anthracite] = await db.insert(colors).values({ nom: 'Gris anthracite', reference: 'RAL 7016', hex: '#383e42' }).returning()
  const dupont = (
    await direction.post('/api/clients', { type: 'particulier', prenom: 'Jean', nom: 'Dupont', email: 'jean@exemple.fr', telephone: '0477000000', codePostal: '42490', ville: 'Fraisses' })
  ).json().id
  const [sheet] = await db.insert(sheetStock).values({ materialId: alu!.id, colorId: anthracite!.id, largeur: 1250, longueur: 3000, quantite: 3, seuil: 8 }).returning()
  ids = { alu: alu!.id, anthracite: anthracite!.id, dupont, sheet: sheet!.id }
})

const order = async () => {
  const res = await direction.post('/api/orders', {
    clientId: ids.dupont,
    lignes: [
      {
        repere: 'Mur sud',
        modelId: M.couvertine,
        materialId: ids.alu,
        colorId: ids.anthracite,
        cotes: [20, 70, 300, 70, 20],
        angles: [-135, 90, 90, -135],
        longueur: 3000,
        quantite: 4,
        accessoires: [],
      },
    ],
    livraison: { mode: 'retrait' },
  })
  expect(res.statusCode, res.body).toBe(201)
  return res.json() as { id: string; numero: string }
}
const login = async (o: NonNullable<Parameters<typeof createUser>[0]>) => {
  await createUser(o)
  return loginAs(app, o.identifiant!)
}

describe('Plan de l’atelier : accès', () => {
  it('refuse sans session (401) et à tout compte sans la section Direction (403)', async () => {
    expect((await client(app).get('/api/plan')).statusCode).toBe(401)
    for (const c of [
      await login({ identifiant: 'paul', role: 'atelier' }),
      await login({ identifiant: 'rh', role: 'rh' }),
      await login({ identifiant: 'vente', sections: ['ventes'], admin: false }),
    ]) {
      expect((await c.get('/api/plan')).statusCode).toBe(403)
    }
  })

  it('l’ouvre à la section Direction, même sans la section Atelier', async () => {
    const seule = await login({ identifiant: 'dir', sections: ['direction'], admin: false })
    expect((await seule.get('/api/plan')).statusCode).toBe(200)
    expect((await direction.get('/api/plan')).statusCode).toBe(200)
  })

  it('refuse tant que le mot de passe est temporaire', async () => {
    await createUser({ identifiant: 'neuf', sections: ['direction'], admin: false, mustChangePassword: true })
    const c = await loginAs(app, 'neuf')
    expect((await c.get('/api/plan')).statusCode).toBe(403)
  })
})

describe('Plan de l’atelier : contenu', () => {
  it('donne les commandes à fabriquer avec le nom du client, sans prix ni coordonnées', async () => {
    const { id, numero } = await order()
    // Reçue : pas encore pour l'atelier
    expect((await direction.get('/api/plan')).json().orders).toEqual([])
    expect((await direction.post(`/api/orders/${id}/status`, { statut: 'validee' })).statusCode).toBe(200)
    const res = await direction.get('/api/plan')
    const o = res.json().orders[0]
    expect(o).toMatchObject({ id, numero, statut: 'validee', client: 'Jean Dupont', livraisonMode: 'retrait', pieces: 4, modeles: 'Couvertine', prisPar: null })
    expect(res.body).not.toMatch(/jean@exemple|0477000000|Fraisses|42490/)
    for (const cle of ['ht', 'ttc', 'tva', 'brut', 'prix', 'total', 'lignes']) expect(Object.keys(o)).not.toContain(cle)
    // Une commande livrée ou annulée quitte le plan
    for (const statut of ['fabrication', 'prete', 'livree']) expect((await direction.post(`/api/orders/${id}/status`, { statut })).statusCode).toBe(200)
    expect((await direction.get('/api/plan')).json().orders).toEqual([])
  })

  it('donne le stock avec son état, sans les références archivées', async () => {
    const [vide] = await db.insert(sheetStock).values({ materialId: ids.alu, largeur: 1000, longueur: 2000, quantite: 0, seuil: 5 }).returning()
    await db.insert(sheetStock).values({ materialId: ids.alu, largeur: 900, longueur: 1800, quantite: 7, chute: true })
    const [archivee] = await db.insert(sheetStock).values({ materialId: ids.alu, largeur: 800, longueur: 1600, quantite: 9 }).returning()
    await db.update(sheetStock).set({ archivedAt: new Date() }).where(eq(sheetStock.id, archivee!.id))
    const { feuilles } = (await direction.get('/api/plan')).json()
    expect(feuilles).toHaveLength(3)
    const parId = (id: string) => feuilles.find((f: { id: string }) => f.id === id)
    expect(parId(ids.sheet)).toMatchObject({ quantite: 3, seuil: 8, etat: 'critique', chute: false })
    expect(parId(ids.sheet).libelle).toContain('Gris anthracite')
    expect(parId(vide!.id).etat).toBe('vide')
    expect(feuilles.find((f: { chute: boolean }) => f.chute)).toMatchObject({ quantite: 7 })
    expect(feuilles.map((f: { id: string }) => f.id)).not.toContain(archivee!.id)
  })

  it('signale une réception de moins de vingt minutes, pas une plus ancienne', async () => {
    expect((await direction.get('/api/plan')).json().reception).toBeNull()
    const base = { sheetId: ids.sheet, libelle: 'x', delta: 6, apres: 9, motif: 'reception' as const }
    await db.insert(sheetMovements).values({ ...base, createdAt: new Date(Date.now() - 60 * 60_000) })
    expect((await direction.get('/api/plan')).json().reception).toBeNull()
    await db.insert(sheetMovements).values({ ...base, createdAt: new Date(Date.now() - 5 * 60_000) })
    expect((await direction.get('/api/plan')).json().reception).toEqual({ feuilles: 6 })
  })

  it('ne modifie rien : le plan n’a que de la lecture', async () => {
    for (const res of await Promise.all([direction.post('/api/plan', {}), direction.patch('/api/plan', {}), direction.delete('/api/plan')])) expect(res.statusCode).toBe(404)
  })
})
