import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { auditLog, productVariants, products } from '../src/db/schema.js'
import { htFromTtc, ttcOf } from '../src/shop.js'
import { buildApp, client, createUser, loginAs, makePng, resetDb, type App, type Client } from './helpers.js'

let app: App
let direction: Client
let visitor: Client

beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => app.close())
beforeEach(async () => {
  await resetDb()
  await createUser({ identifiant: 'chef', role: 'direction' })
  direction = await loginAs(app, 'chef')
  visitor = client(app)
})

const entries = (action: string) => db.select().from(auditLog).where(eq(auditLog.action, action))
async function produit(over: Record<string, unknown> = {}) {
  const res = await direction.post('/api/boutique/produits', { nom: 'Couvertine blanche RAL 9010', categorie: 'Couvertine', description: 'Couvertine en aluminium laqué.', ...over })
  expect(res.statusCode, res.body).toBe(201)
  return res.json().id as string
}
async function variante(id: string, over: Record<string, unknown> = {}) {
  const res = await direction.post(`/api/boutique/produits/${id}/variantes`, { libelle: '320 mm · 1 mm · 3 m', prixTtc: 84, ...over })
  expect(res.statusCode, res.body).toBe(201)
  return res.json().variante as { id: string; prixHt: number; prixTtc: number }
}

describe('Calcul des prix', () => {
  it('trouve le prix HT dont le TTC est exactement celui saisi', () => {
    for (const ttc of [84, 29, 15, 13.5, 87.5, 4.5, 6, 117, 1234.56]) {
      const ht = htFromTtc(ttc, 20)
      expect(ttcOf(ht, 20), `${ttc} → ${ht}`).toBe(ttc)
    }
    expect(htFromTtc(84, 20)).toBe(70)
    // Certains prix TTC n'existent pas en HT au centime (0,99 € : 0,82 € HT donne 0,98 €, 0,83 € donne 1,00 €) : on prend le plus proche
    expect([0.98, 1]).toContain(ttcOf(htFromTtc(0.99, 20), 20))
  })
})

describe('Accès', () => {
  it('réserve la gestion des produits à la direction', async () => {
    const id = await produit()
    await createUser({ identifiant: 'claire', role: 'rh' })
    await createUser({ identifiant: 'paul', role: 'atelier' })
    for (const who of ['claire', 'paul']) {
      const c = await loginAs(app, who)
      for (const [m, url] of [['get', '/api/boutique/produits'], ['post', '/api/boutique/produits'], ['get', `/api/boutique/produits/${id}`], ['patch', `/api/boutique/produits/${id}`], ['delete', `/api/boutique/produits/${id}`], ['put', `/api/boutique/produits/${id}/image`], ['post', `/api/boutique/produits/${id}/variantes`]] as const) {
        const res = m === 'get' || m === 'delete' ? await c[m](url) : await c[m](url, {})
        expect(res.statusCode, `${who} ${m} ${url}`).toBe(403)
      }
    }
    for (const url of ['/api/boutique/produits', `/api/boutique/produits/${id}`]) expect((await visitor.get(url)).statusCode).toBe(401)
  })
})

describe('Produits', () => {
  it('crée un produit caché, avec son journal, et le liste avec son prix le plus bas', async () => {
    const id = await produit()
    const [row] = await db.select().from(products)
    expect(row).toMatchObject({ id, nom: 'Couvertine blanche RAL 9010', categorie: 'Couvertine', actif: false })
    expect((await entries('product.created'))[0]!.details).toMatchObject({ nom: 'Couvertine blanche RAL 9010' })
    await variante(id, { libelle: '270 mm · 1 m', prixTtc: 21 })
    await variante(id, { libelle: '320 mm · 3 m', prixTtc: 84 })
    const list = (await direction.get('/api/boutique/produits')).json()
    expect(list.tva).toBe(20)
    expect(list.produits[0]).toMatchObject({ id, actif: false, hasImage: false, variantes: 2, actives: 2, prixMinTtc: 21 })
  })

  it('valide les champs, avec le champ concerné', async () => {
    const bad = async (b: object) => (await direction.post('/api/boutique/produits', b)).json()
    expect(await bad({ nom: '' })).toMatchObject({ field: 'nom' })
    expect(await bad({ nom: 'x'.repeat(121) })).toMatchObject({ field: 'nom' })
    expect(await bad({ nom: 'Ok', description: 'x'.repeat(4001) })).toMatchObject({ field: 'description' })
    expect(await bad({})).toMatchObject({ field: 'nom' })
    expect(await db.select().from(products)).toHaveLength(0)
    expect((await direction.get('/api/boutique/produits/pas-un-uuid')).statusCode).toBe(404)
    expect((await direction.get('/api/boutique/produits/00000000-0000-4000-8000-000000000000')).statusCode).toBe(404)
  })

  it('modifie la fiche et note au journal les champs changés, jamais leur contenu', async () => {
    const id = await produit()
    expect((await direction.patch(`/api/boutique/produits/${id}`, { nom: 'Couvertine blanche', description: 'Nouvelle description confidentielle' })).statusCode).toBe(200)
    const [row] = await db.select().from(products)
    expect(row).toMatchObject({ nom: 'Couvertine blanche', description: 'Nouvelle description confidentielle' })
    const [e] = await entries('product.updated')
    expect(e!.details).toMatchObject({ champs: ['nom', 'description'] })
    expect(JSON.stringify(e!.details)).not.toContain('confidentielle')
    // Rien n'a changé : pas de ligne de journal
    await direction.patch(`/api/boutique/produits/${id}`, { nom: 'Couvertine blanche' })
    expect(await entries('product.updated')).toHaveLength(1)
  })

  it('ne met en ligne qu’un produit qui a au moins une déclinaison active', async () => {
    const id = await produit()
    const res = await direction.patch(`/api/boutique/produits/${id}`, { actif: true })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ field: 'actif', error: expect.stringMatching(/au moins une déclinaison/) })
    const v = await variante(id)
    expect((await direction.patch(`/api/boutique/produits/${id}`, { actif: true })).statusCode).toBe(200)
    expect((await entries('product.activated')).length).toBe(1)
    // La dernière déclinaison en vente d'un produit en ligne ne se retire ni ne se désactive
    expect((await direction.patch(`/api/boutique/variantes/${v.id}`, { actif: false })).statusCode).toBe(409)
    expect((await direction.delete(`/api/boutique/variantes/${v.id}`)).statusCode).toBe(409)
    expect((await direction.patch(`/api/boutique/produits/${id}`, { actif: false })).statusCode).toBe(200)
    expect((await entries('product.deactivated')).length).toBe(1)
    expect((await direction.delete(`/api/boutique/variantes/${v.id}`)).statusCode).toBe(200)
  })

  it('supprime un produit avec ses déclinaisons', async () => {
    const id = await produit()
    await variante(id)
    expect((await direction.delete(`/api/boutique/produits/${id}`)).statusCode).toBe(200)
    expect(await db.select().from(products)).toHaveLength(0)
    expect(await db.select().from(productVariants)).toHaveLength(0)
    expect((await entries('product.deleted')).length).toBe(1)
  })
})

describe('Déclinaisons', () => {
  it('enregistre le prix HT et rend le TTC saisi, avec la TVA des réglages', async () => {
    const id = await produit()
    const v = await variante(id, { prixTtc: '29,00' })
    expect(v).toMatchObject({ prixTtc: 29 })
    expect(v.prixHt).toBe(htFromTtc(29, 20))
    const detail = (await direction.get(`/api/boutique/produits/${id}`)).json()
    expect(detail.variantes[0]).toMatchObject({ libelle: '320 mm · 1 mm · 3 m', prixTtc: 29, actif: true })
    expect((await entries('product.variant_added'))[0]!.details).toMatchObject({ libelle: '320 mm · 1 mm · 3 m', prixTtc: 29 })
  })

  it('modifie le prix (journal avant → après), refuse un libellé en double et un prix invalide', async () => {
    const id = await produit()
    const v = await variante(id)
    await variante(id, { libelle: 'autre' })
    expect((await direction.patch(`/api/boutique/variantes/${v.id}`, { prixTtc: 90 })).statusCode).toBe(200)
    expect((await entries('product.variant_updated'))[0]!.details).toMatchObject({ prixTtc: { avant: 84, apres: 90 } })
    const dup = await direction.patch(`/api/boutique/variantes/${v.id}`, { libelle: 'autre' })
    expect(dup.statusCode).toBe(409)
    expect(dup.json()).toMatchObject({ field: 'libelle' })
    const bad = async (b: object) => (await direction.post(`/api/boutique/produits/${id}/variantes`, { libelle: 'x', ...b })).json()
    expect(await bad({ prixTtc: 0 })).toMatchObject({ field: 'prixTtc' })
    expect(await bad({ prixTtc: 'abc' })).toMatchObject({ field: 'prixTtc' })
    expect(await bad({ prixTtc: 1e9 })).toMatchObject({ field: 'prixTtc' })
    expect((await direction.post(`/api/boutique/produits/${id}/variantes`, { libelle: '', prixTtc: 5 })).json()).toMatchObject({ field: 'libelle' })
    expect((await direction.patch('/api/boutique/variantes/pas-un-uuid', { actif: false })).statusCode).toBe(404)
  })
})

describe('Photo du produit', () => {
  it('envoie, sert et supprime la photo, avec une description', async () => {
    const id = await produit()
    const png = makePng(400, 300)
    const put = await direction.put(`/api/boutique/produits/${id}/image?alt=Couvertine%20blanche`, png, { 'content-type': 'image/png' })
    expect(put.statusCode, put.body).toBe(200)
    const [row] = await db.select().from(products)
    expect(row).toMatchObject({ imageType: 'image/png', imageLargeur: 400, imageHauteur: 300, imageAlt: 'Couvertine blanche' })
    const img = await direction.get(`/api/boutique/produits/${id}/image`)
    expect(img.statusCode).toBe(200)
    expect(img.headers['content-type']).toBe('image/png')
    expect(img.headers['x-content-type-options']).toBe('nosniff')
    expect((await direction.get('/api/boutique/produits')).json().produits[0].hasImage).toBe(true)
    expect((await entries('product.image_updated'))[0]!.details).toMatchObject({ largeur: 400, hauteur: 300 })
    expect((await direction.delete(`/api/boutique/produits/${id}/image`)).statusCode).toBe(200)
    expect((await direction.get(`/api/boutique/produits/${id}/image`)).statusCode).toBe(404)
  })

  it('refuse ce qui n’est pas une vraie image, une image trop petite ou trop lourde', async () => {
    const id = await produit()
    const put = (body: Buffer, type = 'image/png') => direction.put(`/api/boutique/produits/${id}/image`, body, { 'content-type': type })
    expect((await put(Buffer.from('pas une image'))).statusCode).toBe(400)
    expect((await put(makePng(400, 300), 'image/jpeg')).statusCode).toBe(400)
    expect((await put(makePng(100, 100))).json()).toMatchObject({ field: 'image', error: expect.stringMatching(/trop petite/) })
    expect((await put(Buffer.alloc(3 * 1024 * 1024 + 10, 1))).statusCode).toBe(413)
    expect((await db.select().from(products))[0]!.image).toBeNull()
  })
})
