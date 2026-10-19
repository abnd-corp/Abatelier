import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { auditLog } from '../src/db/schema.js'
import { buildApp, createUser, loginAs, M, resetDb, seedModels, type App, type Client } from './helpers.js'

let app: App
let direction: Client
beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => app.close())
beforeEach(async () => {
  await resetDb()
  await seedModels()
  await createUser({ identifiant: 'chef', role: 'direction' })
  direction = await loginAs(app, 'chef')
})

const ALU15 = { nom: 'Aluminium', epaisseur: 1.5, prixM2: 62, retourMin: 10 }
const BOUCHON = { nom: 'Bouchon de couvertine', prix: 6.9, unite: 'piece', modeles: [M.couvertine], quantiteAuto: 'fixe', quantiteFixe: 2 }
const FAITIERE = { nom: 'Faîtière', cotes: [30, 150, 150, 30], angles: [-120, 100, -120], noms: ['Retour', 'Pan', 'Pan', 'Retour'], cap: 30, longueur: 2000, quantite: 3 }
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
        c.get('/api/catalog/accessories'),
        c.post('/api/catalog/accessories', BOUCHON),
        c.get('/api/catalog/models'),
        c.post('/api/catalog/models', FAITIERE),
        c.patch(`/api/catalog/models/${M.bandeau}`, { nom: 'Bandeau large' }),
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

describe('Accessoires', () => {
  it('ajoute un accessoire avec son unité, ses modèles et sa règle de quantité', async () => {
    const res = await direction.post('/api/catalog/accessories', BOUCHON)
    expect(res.statusCode).toBe(201)
    expect(res.json().accessory).toMatchObject({ ...BOUCHON, actif: true })
    expect(typeof res.json().accessory.prix).toBe('number')
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, 'catalog.accessory_created'))
    expect(entry!.details).toEqual({ nom: 'Bouchon de couvertine', prix: 6.9, unite: 'piece' })
  })

  it('range les modèles dans l’ordre du configurateur et retire les doublons', async () => {
    const res = await direction.post('/api/catalog/accessories', { ...BOUCHON, nom: 'Vis inox', modeles: [M.bandeau, M.couvertine, M.bandeau], quantiteAuto: 'aucune' })
    expect(res.json().accessory.modeles).toEqual([M.bandeau, M.couvertine])
  })

  it('accepte un prix à la française et une quantité fixe absente si la règle ne l’utilise pas', async () => {
    const res = await direction.post('/api/catalog/accessories', { nom: 'Embouts de bavette', prix: '9,60', unite: 'paire', modeles: [M.bavette], quantiteAuto: 'par_piece' })
    expect(res.statusCode).toBe(201)
    expect(res.json().accessory).toMatchObject({ prix: 9.6, unite: 'paire', quantiteFixe: 0 })
  })

  it('refuse un nom en double', async () => {
    await direction.post('/api/catalog/accessories', BOUCHON)
    const res = await direction.post('/api/catalog/accessories', { ...BOUCHON, prix: 8 })
    expect(res.statusCode).toBe(409)
    expect(res.json().field).toBe('nom')
  })

  it.each([
    [{ nom: ' ' }, 'nom', /nom/],
    [{ prix: -1 }, 'prix', /0 € minimum/],
    [{ prix: 'cher' }, 'prix', /nombre attendu/],
    [{ unite: 'metre' }, 'unite', /pièce ou à la paire/],
    [{ modeles: [] }, 'modeles', /au moins un modèle/],
    [{ modeles: ['gouttiere'] }, 'modeles', /Modèle inconnu/],
    [{ modeles: ['00000000-0000-4000-a000-0000000000ff'] }, 'modeles', /Modèle inconnu/],
    [{ quantiteAuto: 'beaucoup' }, 'quantiteAuto', /invalide/],
    [{ quantiteFixe: 0 }, 'quantiteFixe', /1 au minimum/],
    [{ quantiteFixe: 1.5 }, 'quantiteFixe', /entier/],
  ])('refuse %o et désigne le champ', async (override, field, msg) => {
    const res = await direction.post('/api/catalog/accessories', { ...BOUCHON, ...override })
    expect(res.statusCode).toBe(400)
    expect(res.json().field).toBe(field)
    expect(res.json().error).toMatch(msg)
  })

  it('modifie le prix et les modèles, et note l’avant / après au journal', async () => {
    const { accessory } = (await direction.post('/api/catalog/accessories', BOUCHON)).json()
    const res = await direction.patch(`/api/catalog/accessories/${accessory.id}`, { prix: '7,20', modeles: [M.couvertine, M.bandeau] })
    expect(res.json().accessory).toMatchObject({ prix: 7.2, modeles: [M.couvertine, M.bandeau] })
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, 'catalog.accessory_updated'))
    expect(entry!.details).toEqual({
      nom: 'Bouchon de couvertine',
      changements: { prix: { avant: 6.9, apres: 7.2 }, modeles: { avant: ['Couvertine'], apres: ['Couvertine', 'Bandeau'] } },
    })
  })

  it('remet la quantité fixe à zéro quand la règle change', async () => {
    const { accessory } = (await direction.post('/api/catalog/accessories', BOUCHON)).json()
    const res = await direction.patch(`/api/catalog/accessories/${accessory.id}`, { quantiteAuto: 'jonctions' })
    expect(res.json().accessory).toMatchObject({ quantiteAuto: 'jonctions', quantiteFixe: 0 })
    // Revenir à « fixe » sans donner de nombre est refusé
    const back = await direction.patch(`/api/catalog/accessories/${accessory.id}`, { quantiteAuto: 'fixe' })
    expect(back.statusCode).toBe(400)
    expect(back.json().field).toBe('quantiteFixe')
  })

  it('ne note rien si rien ne change (même liste de modèles), désactive, et répond 404 si inconnu', async () => {
    const { accessory } = (await direction.post('/api/catalog/accessories', BOUCHON)).json()
    await direction.patch(`/api/catalog/accessories/${accessory.id}`, { prix: 6.9, modeles: [M.couvertine] })
    expect(await db.select().from(auditLog).where(eq(auditLog.action, 'catalog.accessory_updated'))).toHaveLength(0)
    await direction.patch(`/api/catalog/accessories/${accessory.id}`, { actif: false })
    expect((await direction.get('/api/catalog/accessories')).json().accessories[0].actif).toBe(false)
    expect((await direction.patch('/api/catalog/accessories/00000000-0000-4000-8000-000000000000', { prix: 1 })).statusCode).toBe(404)
    expect((await direction.patch('/api/catalog/accessories/abc', { prix: 1 })).statusCode).toBe(404)
  })
})

describe('Modèles de pièces', () => {
  const models = async () => (await direction.get('/api/catalog/models')).json().models as { id: string; nom: string }[]

  it('liste les modèles dans l’ordre et en ajoute un, noté au journal', async () => {
    expect((await models()).map((m) => m.nom)).toEqual(['Couvertine', 'Bavette d’appui', 'Bandeau', 'Autre profil'])
    const res = await direction.post('/api/catalog/models', { ...FAITIERE, nom: '  Faîtière  ', quantite: undefined })
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json().model).toMatchObject({ nom: 'Faîtière', cotes: [30, 150, 150, 30], angles: [-120, 100, -120], cap: 30, quantite: 1, actif: true, position: 5 })
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, 'catalog.model_created'))
    expect(entry!.details).toEqual({ nom: 'Faîtière', forme: 'A 30 · -120° · B 150 · 100° · C 150 · -120° · D 30' })
  })

  it('complète les noms de cotes manquants', async () => {
    const res = await direction.post('/api/catalog/models', { ...FAITIERE, noms: ['Retour'] })
    expect(res.json().model.noms).toEqual(['Retour', '', '', ''])
  })

  it.each([
    [{ nom: '' }, 'nom', /nom du modèle est requis/],
    [{ cotes: [] }, 'cotes', /Au moins une cote/],
    [{ cotes: [30, 0, 150, 30] }, 'cotes.1', /1 mm minimum/],
    [{ angles: [-120, 100] }, 'angles', /un angle pour chaque pli/],
    [{ angles: [-120, 0, -120] }, 'angles.1', /0° impossible/],
    [{ noms: ['a', 'b', 'c', 'd', 'e'] }, 'noms', /Un nom par cote/],
    [{ cotes: [100, 100, 100, 100], angles: [90, 90, 90] }, 'angles', /se referme sur lui-même/],
    [{ cap: 270 }, 'cap', /180 ° maximum/],
    [{ longueur: 0 }, 'longueur', /1 mm minimum/],
  ])('refuse %o et désigne le champ', async (body, field, msg) => {
    const res = await direction.post('/api/catalog/models', { ...FAITIERE, ...body })
    expect(res.statusCode).toBe(400)
    expect(res.json().field).toBe(field)
    expect(res.json().error).toMatch(msg)
  })

  it('refuse un nom déjà pris', async () => {
    const res = await direction.post('/api/catalog/models', { ...FAITIERE, nom: 'Bandeau' })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({ error: 'Un modèle porte déjà ce nom.', field: 'nom' })
  })

  it('modifie la forme en vérifiant sa cohérence avec ce qui est enregistré, et désactive', async () => {
    expect((await direction.patch(`/api/catalog/models/${M.bandeau}`, { cotes: [40, 150, 20] })).json()).toEqual({ error: 'Il faut un angle pour chaque pli.', field: 'angles' })
    const res = await direction.patch(`/api/catalog/models/${M.bandeau}`, { cotes: [40, 150, 20], angles: [-90, 90], nom: 'Bandeau à goutte' })
    expect(res.json().model).toMatchObject({ nom: 'Bandeau à goutte', cotes: [40, 150, 20], noms: ['Retour', 'Face', ''] })
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, 'catalog.model_updated'))
    expect(entry!.details).toMatchObject({ nom: 'Bandeau à goutte', changements: { nom: { avant: 'Bandeau', apres: 'Bandeau à goutte' }, cotes: { avant: [40, 150], apres: [40, 150, 20] } } })
    expect((await direction.patch(`/api/catalog/models/${M.bandeau}`, { actif: false })).json().model.actif).toBe(false)
    expect((await direction.patch('/api/catalog/models/pas-un-id', { actif: false })).statusCode).toBe(404)
  })
})

