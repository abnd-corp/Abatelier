import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db/index.js'
import { colors, materials } from '../src/db/schema.js'
import { buildApp, client, createUser, loginAs, M, resetDb, seedModels, type App, type Client } from './helpers.js'

let app: App
let direction: Client
let numero: string

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
  const dupont = (await direction.post('/api/clients', { type: 'particulier', prenom: 'Jean', nom: 'Dupont', email: 'jean@exemple.fr', codePostal: '42490', ville: 'Fraisses' })).json().id
  const res = await direction.post('/api/orders', {
    clientId: dupont,
    lignes: [
      {
        repere: 'Mur sud',
        modelId: M.couvertine,
        materialId: alu!.id,
        colorId: anthracite!.id,
        cotes: [20, 70, 300, 70, 20],
        angles: [-135, 90, 90, -135],
        longueur: 3000,
        quantite: 4,
        accessoires: [],
      },
    ],
    livraison: { mode: 'livraison', adresse: '1 rue des Forges', codePostal: '42490', ville: 'Fraisses' },
  })
  expect(res.statusCode, res.body).toBe(201)
  numero = res.json().numero
  expect((await direction.post(`/api/orders/${res.json().id}/status`, { statut: 'validee' })).statusCode).toBe(200)
})

describe('Écran de l’atelier', () => {
  it('refuse sans session', async () => {
    expect((await client(app).get('/api/ecran')).statusCode).toBe(401)
  })

  it('refuse tant que le mot de passe est temporaire', async () => {
    await createUser({ identifiant: 'neuf', role: 'atelier', mustChangePassword: true })
    expect((await (await loginAs(app, 'neuf')).get('/api/ecran')).statusCode).toBe(403)
  })

  it('est ouvert à tout compte connecté, quelle que soit sa section', async () => {
    for (const o of [
      { identifiant: 'atelier', role: 'atelier' as const },
      { identifiant: 'rh', role: 'rh' as const },
      { identifiant: 'vente', sections: ['ventes' as const], admin: false },
      { identifiant: 'rien', sections: [], admin: false },
    ]) {
      await createUser(o)
      const res = await (await loginAs(app, o.identifiant)).get('/api/ecran')
      expect(res.statusCode, o.identifiant).toBe(200)
      expect(res.json().orders.map((x: { numero: string }) => x.numero)).toEqual([numero])
    }
  })

  it('ne donne ni client, ni adresse, ni prix', async () => {
    const res = await direction.get('/api/ecran')
    expect(res.json().orders[0]).toMatchObject({ numero, statut: 'validee', livraisonMode: 'livraison', pieces: 4, modeles: 'Couvertine' })
    expect(Object.keys(res.json().orders[0]).sort()).toEqual(['datePrevue', 'id', 'livraisonMode', 'modeles', 'numero', 'pieces', 'statut'])
    expect(res.body).not.toMatch(/Dupont|Jean|jean@exemple|Forges|Fraisses|42490/)
    expect(res.body).not.toMatch(/ttc|"ht"|tva|prix/i)
  })

  it('ne se modifie pas', async () => {
    for (const res of await Promise.all([direction.post('/api/ecran', {}), direction.delete('/api/ecran')])) expect(res.statusCode).toBe(404)
  })
})
