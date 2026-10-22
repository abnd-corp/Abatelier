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
      for (const [m, url] of [['get', '/api/boutique/produits'], ['post', '/api/boutique/produits'], ['get', `/api/boutique/produits/${id}`], ['patch', `/api/boutique/produits/${id}`], ['delete', `/api/boutique/produits/${id}`], ['put', `/api/boutique/produits/${id}/image`], ['post', `/api/boutique/produits/${id}/variantes`], ['post', '/api/boutique/import'], ['post', '/api/boutique/produits/lot'], ['post', `/api/boutique/produits/${id}/dupliquer`], ['post', `/api/boutique/produits/${id}/prix`]] as const) {
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

describe('Import d’un catalogue', () => {
  const catalogue = () => ({
    produits: [
      {
        nom: 'BANDEAUX  EN « L » BLANC  RAL 9010',
        categorie: ['BANDEAU'],
        variations: [
          { attrs: { 'Épaisseur Alu': '1 mm', 'HAUTEUR DE BANDEAU': '225', Longueur: '1,50' }, prix: 29.5, achetable: true },
          { attrs: { 'Épaisseur Alu': '1 mm', 'HAUTEUR DE BANDEAU': '200', Longueur: '3 Mètres' }, prix: 50.5, achetable: true },
          { attrs: { 'Épaisseur Alu': '1 mm', 'HAUTEUR DE BANDEAU': '350', Longueur: '3 Mètres' }, prix: 0, achetable: true },
          { attrs: { 'Épaisseur Alu': '1 mm', 'HAUTEUR DE BANDEAU': '300', Longueur: '3 Mètres' }, prix: 60, achetable: false },
        ],
      },
      { nom: 'SUPPORT DE FIXATION', categorie: ['ACCESSOIRE COUVERTINE'], variations: [{ attrs: { Quantité: 'Par 10' }, prix: 12 }] },
    ],
  })

  it('crée les produits cachés, avec des noms lisibles et des déclinaisons au prix TTC exact, en écartant les prix à 0 € et les indisponibles', async () => {
    const res = await direction.post('/api/boutique/import', catalogue())
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toEqual({ produitsCrees: 2, produitsExistants: 0, variantesCreees: 3, variantesMisesAJour: 0, ignorees: 2 })
    const list = (await direction.get('/api/boutique/produits')).json().produits
    expect(list.map((p: { nom: string }) => p.nom)).toEqual(['Bandeaux en « L » blanc RAL 9010', 'Support de fixation'])
    expect(list.every((p: { actif: boolean }) => !p.actif)).toBe(true)
    expect(list[0]).toMatchObject({ categorie: 'Bandeau', variantes: 2, prixMinTtc: 29.5 })
    const detail = (await direction.get(`/api/boutique/produits/${list[0].id}`)).json()
    expect(detail.variantes.map((v: { libelle: string; prixTtc: number }) => [v.libelle, v.prixTtc])).toEqual([
      ['1 mm · hauteur de bandeau 225 · longueur 1,50', 29.5],
      ['1 mm · hauteur de bandeau 200 · 3 Mètres', 50.5],
    ])
    // Rien n'est visible du public tant que la direction n'a pas mis en ligne
    expect((await visitor.get('/api/public/boutique')).json().produits).toEqual([])
    expect((await entries('product.imported'))[0]!.details).toMatchObject({ produitsCrees: 2, variantesCreees: 3 })
  })

  it('rejoué : ne duplique rien, met à jour les prix changés et garde la fiche et la mise en ligne', async () => {
    await direction.post('/api/boutique/import', catalogue())
    const id = (await direction.get('/api/boutique/produits')).json().produits[0].id
    await direction.patch(`/api/boutique/produits/${id}`, { actif: true, description: 'Ma description' })
    const c = catalogue()
    c.produits[0]!.variations[0]!.prix = 31
    const res = await direction.post('/api/boutique/import', c)
    expect(res.json()).toEqual({ produitsCrees: 0, produitsExistants: 2, variantesCreees: 0, variantesMisesAJour: 1, ignorees: 2 })
    expect(await db.select().from(products)).toHaveLength(2)
    const detail = (await direction.get(`/api/boutique/produits/${id}`)).json()
    expect(detail.produit).toMatchObject({ actif: true, description: 'Ma description' })
    expect(detail.variantes.find((v: { libelle: string }) => v.libelle.includes('225')).prixTtc).toBe(31)
  })

  it('accepte un fichier à plusieurs centaines de déclinaisons, refuse un fichier invalide, et exige la direction', async () => {
    const big = { produits: [{ nom: 'Bavette simple', variations: Array.from({ length: 90 }, (_, i) => ({ attrs: { Profondeur: String(150 + i) }, prix: 10 + i })) }] }
    expect((await direction.post('/api/boutique/import', big)).json().variantesCreees).toBe(90)
    expect((await direction.post('/api/boutique/import', { produits: [] })).statusCode).toBe(400)
    expect((await direction.post('/api/boutique/import', { produits: [{ nom: '', variations: [] }] })).statusCode).toBe(400)
    expect((await direction.post('/api/boutique/import', { produits: [{ nom: 'X', variations: [{ attrs: {}, prix: -1 }] }] })).statusCode).toBe(400)
    expect((await visitor.post('/api/boutique/import', catalogue())).statusCode).toBe(401)
    await createUser({ identifiant: 'claire', role: 'rh' })
    expect((await (await loginAs(app, 'claire')).post('/api/boutique/import', catalogue())).statusCode).toBe(403)
  })
})

describe('Copie, prix en lot et actions en lot', () => {
  it('copie un produit avec ses déclinaisons et ses prix, cachée, sous un autre nom', async () => {
    const id = await produit()
    await variante(id)
    await variante(id, { libelle: '270 mm · 1 m', prixTtc: 21 })
    await direction.put(`/api/boutique/produits/${id}/image?alt=Couvertine`, makePng(400, 300), { 'content-type': 'image/png' })
    await direction.patch(`/api/boutique/produits/${id}`, { actif: true })
    const res = await direction.post(`/api/boutique/produits/${id}/dupliquer`, { nom: 'Couvertine gris RAL 7016' })
    expect(res.statusCode, res.body).toBe(201)
    const copie = (await direction.get(`/api/boutique/produits/${res.json().id}`)).json()
    expect(copie.produit).toMatchObject({ nom: 'Couvertine gris RAL 7016', actif: false, hasImage: true, categorie: 'Couvertine' })
    expect(copie.variantes.map((v: { prixTtc: number }) => v.prixTtc).sort((a: number, b: number) => a - b)).toEqual([21, 84])
    expect((await direction.post(`/api/boutique/produits/${id}/dupliquer`, { nom: '' })).statusCode).toBe(400)
    expect((await direction.post(`/api/boutique/produits/${crypto.randomUUID()}/dupliquer`, { nom: 'X' })).statusCode).toBe(404)
    expect((await entries('product.duplicated'))[0]!.details).toMatchObject({ nom: 'Couvertine gris RAL 7016', source: 'Couvertine blanche RAL 9010' })
  })

  it('applique une hausse ou une baisse en pour cent à tous les prix, au centime TTC, et note au journal', async () => {
    const id = await produit()
    await variante(id, { libelle: 'a', prixTtc: 84 })
    await variante(id, { libelle: 'b', prixTtc: 21 })
    const up = await direction.post(`/api/boutique/produits/${id}/prix`, { pourcent: 10 })
    expect(up.json()).toEqual({ variantes: 2 })
    let prix = (await direction.get(`/api/boutique/produits/${id}`)).json().variantes.map((v: { libelle: string; prixTtc: number }) => [v.libelle, v.prixTtc])
    expect(prix).toEqual([['a', 92.4], ['b', 23.1]])
    await direction.post(`/api/boutique/produits/${id}/prix`, { pourcent: -50 })
    prix = (await direction.get(`/api/boutique/produits/${id}`)).json().variantes.map((v: { prixTtc: number }) => v.prixTtc)
    // 11,55 € TTC n’existe pas en HT au centime : on prend le plus proche
    expect(prix).toEqual([46.2, 11.56])
    expect((await direction.post(`/api/boutique/produits/${id}/prix`, { pourcent: -95 })).statusCode).toBe(400)
    expect((await direction.post(`/api/boutique/produits/${id}/prix`, {})).statusCode).toBe(400)
    expect((await entries('product.prices_adjusted'))).toHaveLength(2)
  })

  it('met en ligne, retire ou supprime plusieurs produits à la fois, sans mettre en ligne un produit vide', async () => {
    const a = await produit({ nom: 'A' })
    const b = await produit({ nom: 'B' })
    await variante(a)
    await variante(b)
    const vide = await produit({ nom: 'Vide' })
    const refus = await direction.post('/api/boutique/produits/lot', { ids: [a, vide], action: 'mettre_en_ligne' })
    expect(refus.statusCode).toBe(409)
    expect(refus.json().error).toContain('Vide')
    expect((await db.select().from(products).where(eq(products.id, a)))[0]!.actif).toBe(false)
    expect((await direction.post('/api/boutique/produits/lot', { ids: [a, b], action: 'mettre_en_ligne' })).json()).toEqual({ produits: 2 })
    expect((await visitor.get('/api/public/boutique')).json().produits).toHaveLength(2)
    await direction.post('/api/boutique/produits/lot', { ids: [a], action: 'retirer' })
    expect((await visitor.get('/api/public/boutique')).json().produits).toHaveLength(1)
    expect((await direction.post('/api/boutique/produits/lot', { ids: [a, vide], action: 'supprimer' })).json()).toEqual({ produits: 2 })
    expect((await db.select().from(products)).map((p) => p.nom)).toEqual(['B'])
    expect((await direction.post('/api/boutique/produits/lot', { ids: [], action: 'retirer' })).statusCode).toBe(400)
    expect((await direction.post('/api/boutique/produits/lot', { ids: [b], action: 'autre' })).statusCode).toBe(400)
    expect((await visitor.post('/api/boutique/produits/lot', { ids: [b], action: 'retirer' })).statusCode).toBe(401)
    expect((await entries('product.bulk')).length).toBeGreaterThan(0)
  })
})
