import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db/index.js'
import { colors, materials } from '../src/db/schema.js'
import { buildApp, client, HOST, createUser, loginAs, M, resetDb, seedModels, type App, type Client } from './helpers.js'

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
  it('s’ouvre sans connexion depuis le réseau interne', async () => {
    const res = await client(app).get('/api/public/ecran')
    expect(res.statusCode).toBe(200)
    expect(res.json().orders.map((x: { numero: string }) => x.numero)).toEqual([numero])
  })

  it('répond 404 à une adresse publique, même derrière le relais', async () => {
    for (const ip of ['8.8.8.8', '203.0.113.7', '2001:db8::1']) {
      const res = await app.inject({ method: 'GET', url: '/api/public/ecran', headers: { host: HOST, 'x-forwarded-for': ip } })
      expect(res.statusCode, ip).toBe(404)
      expect(res.body).not.toMatch(/Dupont|C-\d/)
    }
    const interne = await app.inject({ method: 'GET', url: '/api/public/ecran', headers: { host: HOST, 'x-forwarded-for': '192.168.1.20' } })
    expect(interne.statusCode).toBe(200)
  })

  it('donne le nom du client, mais ni coordonnées ni prix', async () => {
    const res = await direction.get('/api/public/ecran')
    expect(res.json().orders[0]).toMatchObject({ numero, client: 'Jean Dupont', statut: 'validee', livraisonMode: 'livraison', pieces: 4, modeles: 'Couvertine' })
    expect(Object.keys(res.json().orders[0]).sort()).toEqual(['client', 'datePrevue', 'id', 'livraisonMode', 'modeles', 'numero', 'pieces', 'statut'])
    expect(res.body).not.toMatch(/jean@exemple|Forges|Fraisses|42490/)
    expect(res.body).not.toMatch(/ttc|"ht"|tva|prix/i)
  })

  it('ne se modifie pas', async () => {
    for (const res of await Promise.all([direction.post('/api/public/ecran', {}), direction.delete('/api/public/ecran')])) expect(res.statusCode).toBe(404)
  })
})

describe('Adresses du réseau interne', () => {
  it('reconnaît les adresses privées et refuse les publiques', async () => {
    const { isPrivateIp } = await import('../src/network.js')
    for (const ip of ['127.0.0.1', '::1', '10.0.0.4', '172.16.0.1', '172.31.255.1', '192.168.96.1', '::ffff:192.168.1.5', 'fd12:3456::1']) expect(isPrivateIp(ip), ip).toBe(true)
    for (const ip of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '192.169.0.1', '2001:db8::1', 'abc', '', undefined]) expect(isPrivateIp(ip), String(ip)).toBe(false)
  })
})
