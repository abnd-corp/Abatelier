import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { auditLog } from '../src/db/schema.js'
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

const ALU15 = { nom: 'Aluminium', epaisseur: 1.5, prixM2: 62, retourMin: 10 }
const RAL7016 = { nom: 'Gris anthracite', reference: 'RAL 7016', hex: '#383E42', majoration: 0, delaiSup: 0 }

describe('Accès', () => {
  it('est réservé à la direction', async () => {
    await createUser({ identifiant: 'rh', role: 'rh' })
    await createUser({ identifiant: 'atelier', role: 'atelier' })
    for (const who of ['rh', 'atelier']) {
      const c = await loginAs(app, who)
      for (const res of await Promise.all([
        c.get('/api/catalog/materials'),
        c.post('/api/catalog/materials', ALU15),
        c.get('/api/catalog/colors'),
        c.post('/api/catalog/colors', RAL7016),
      ]))
        expect(res.statusCode, who).toBe(403)
    }
  })
})

describe('Matières', () => {
  it('ajoute une matière et renvoie de vrais nombres', async () => {
    const res = await direction.post('/api/catalog/materials', ALU15)
    expect(res.statusCode).toBe(201)
    expect(res.json().material).toMatchObject({ ...ALU15, actif: true })
    expect(typeof res.json().material.prixM2).toBe('number')
    const list = (await direction.get('/api/catalog/materials')).json().materials
    expect(list).toHaveLength(1)
  })

  it('accepte les nombres à la française et arrondit au centime', async () => {
    const res = await direction.post('/api/catalog/materials', { nom: 'Aluminium', epaisseur: '1,5', prixM2: '62,456', retourMin: '10' })
    expect(res.json().material).toMatchObject({ epaisseur: 1.5, prixM2: 62.46, retourMin: 10 })
  })

  it('range les nouvelles matières à la suite des autres', async () => {
    await direction.post('/api/catalog/materials', ALU15)
    await direction.post('/api/catalog/materials', { ...ALU15, epaisseur: 2 })
    const list = (await direction.get('/api/catalog/materials')).json().materials
    expect(list.map((m: { epaisseur: number }) => m.epaisseur)).toEqual([1.5, 2])
    expect(list[1].position).toBeGreaterThan(list[0].position)
  })

  it('refuse un doublon nom + épaisseur', async () => {
    await direction.post('/api/catalog/materials', ALU15)
    const res = await direction.post('/api/catalog/materials', { ...ALU15, prixM2: 70 })
    expect(res.statusCode).toBe(409)
    expect(res.json().field).toBe('epaisseur')
  })

  it.each([
    [{ nom: '' }, 'nom', /nom/],
    [{ epaisseur: 0.1 }, 'epaisseur', /0.3 mm minimum/],
    [{ epaisseur: 'épais' }, 'epaisseur', /nombre attendu/],
    [{ prixM2: -5 }, 'prixM2', /0 € minimum/],
    [{ retourMin: 12.5 }, 'retourMin', /entier/],
  ])('refuse %o et désigne le champ', async (override, field, msg) => {
    const res = await direction.post('/api/catalog/materials', { ...ALU15, ...override })
    expect(res.statusCode).toBe(400)
    expect(res.json().field).toBe(field)
    expect(res.json().error).toMatch(msg)
  })

  it('modifie le prix et garde l’ancien et le nouveau dans le journal', async () => {
    const { material } = (await direction.post('/api/catalog/materials', ALU15)).json()
    const res = await direction.patch(`/api/catalog/materials/${material.id}`, { prixM2: '64,90' })
    expect(res.json().material.prixM2).toBe(64.9)
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, 'catalog.material_updated'))
    expect(entry!.details).toEqual({ nom: 'Aluminium 1,50 mm', changements: { prixM2: { avant: 62, apres: 64.9 } } })
  })

  it('désactive une matière sans la supprimer', async () => {
    const { material } = (await direction.post('/api/catalog/materials', ALU15)).json()
    await direction.patch(`/api/catalog/materials/${material.id}`, { actif: false })
    const list = (await direction.get('/api/catalog/materials')).json().materials
    expect(list).toHaveLength(1)
    expect(list[0].actif).toBe(false)
  })

  it('ne note rien si rien ne change, et répond 404 pour une matière inconnue', async () => {
    const { material } = (await direction.post('/api/catalog/materials', ALU15)).json()
    await direction.patch(`/api/catalog/materials/${material.id}`, { prixM2: 62 })
    expect(await db.select().from(auditLog).where(eq(auditLog.action, 'catalog.material_updated'))).toHaveLength(0)
    expect((await direction.patch('/api/catalog/materials/00000000-0000-4000-8000-000000000000', { prixM2: 1 })).statusCode).toBe(404)
    expect((await direction.patch('/api/catalog/materials/abc', { prixM2: 1 })).statusCode).toBe(404)
  })
})

describe('Journal', () => {
  it('le filtre « catalogue » ne montre que les changements du catalogue', async () => {
    const { material } = (await direction.post('/api/catalog/materials', ALU15)).json()
    await direction.patch(`/api/catalog/materials/${material.id}`, { prixM2: 70 })
    const entries = (await direction.get('/api/audit?type=catalog')).json().entries
    expect(entries.map((e: { action: string }) => e.action)).toEqual(['catalog.material_updated', 'catalog.material_created'])
  })
})

describe('Coloris', () => {
  it('ajoute un coloris et met la teinte en minuscules', async () => {
    const res = await direction.post('/api/catalog/colors', RAL7016)
    expect(res.statusCode).toBe(201)
    expect(res.json().color).toMatchObject({ reference: 'RAL 7016', hex: '#383e42', majoration: 0, actif: true })
  })

  it('accepte une majoration négative (brut moins cher) et un délai supplémentaire', async () => {
    const res = await direction.post('/api/catalog/colors', { nom: 'Brut', reference: 'Non laqué', hex: '#cdd1d4', majoration: '-15', delaiSup: 0 })
    expect(res.json().color.majoration).toBe(-15)
    const bois = await direction.post('/api/catalog/colors', { nom: 'Chêne doré', reference: 'Aspect bois', hex: '#a9733f', majoration: 35, delaiSup: 5 })
    expect(bois.json().color).toMatchObject({ majoration: 35, delaiSup: 5 })
  })

  it('refuse une référence en double', async () => {
    await direction.post('/api/catalog/colors', RAL7016)
    const res = await direction.post('/api/catalog/colors', { ...RAL7016, nom: 'Autre' })
    expect(res.statusCode).toBe(409)
    expect(res.json().field).toBe('reference')
  })

  it.each([
    [{ hex: 'gris' }, 'hex', /#rrggbb/],
    [{ hex: '#fff' }, 'hex', /#rrggbb/],
    [{ majoration: 900 }, 'majoration', /500 % maximum/],
    [{ delaiSup: 90 }, 'delaiSup', /60 jours maximum/],
    [{ reference: '' }, 'reference', /référence/],
  ])('refuse %o et désigne le champ', async (override, field, msg) => {
    const res = await direction.post('/api/catalog/colors', { ...RAL7016, ...override })
    expect(res.statusCode).toBe(400)
    expect(res.json().field).toBe(field)
    expect(res.json().error).toMatch(msg)
  })

  it('modifie la majoration et la note au journal', async () => {
    const { color } = (await direction.post('/api/catalog/colors', RAL7016)).json()
    await direction.patch(`/api/catalog/colors/${color.id}`, { majoration: 8 })
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, 'catalog.color_updated'))
    expect(entry!.details).toEqual({ nom: 'RAL 7016 Gris anthracite', changements: { majoration: { avant: 0, apres: 8 } } })
  })
})
