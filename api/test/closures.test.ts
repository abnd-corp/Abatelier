import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { auditLog, closures } from '../src/db/schema.js'
import { todayParis } from '../src/departures.js'
import { loadClosedDays, spanDays } from '../src/closures.js'
import { addWorkingDays } from '../src/quote.js'
import { buildApp, client, createUser, loginAs, resetDb, type App, type Client } from './helpers.js'

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

const plus = (n: number) => {
  const d = new Date(`${todayParis()}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const entries = (action: string) => db.select().from(auditLog).where(eq(auditLog.action, action))

describe('Accès', () => {
  it('est réservé à la section Direction', async () => {
    await createUser({ identifiant: 'paul', role: 'atelier' })
    await createUser({ identifiant: 'vendeuse', sections: ['ventes'] })
    const id = '00000000-0000-4000-8000-000000000000'
    for (const who of [await loginAs(app, 'paul'), await loginAs(app, 'vendeuse')]) {
      expect((await who.get('/api/catalog/closures')).statusCode).toBe(403)
      expect((await who.post('/api/catalog/closures', { debut: plus(1), fin: plus(2), motif: 'x' })).statusCode).toBe(403)
      expect((await who.patch(`/api/catalog/closures/${id}`, { motif: 'x' })).statusCode).toBe(403)
      expect((await who.delete(`/api/catalog/closures/${id}`)).statusCode).toBe(403)
    }
    expect((await visitor.get('/api/catalog/closures')).statusCode).toBe(401)
    expect((await direction.get('/api/catalog/closures')).statusCode).toBe(200)
  })
})

describe('Fermetures', () => {
  it('ajoute, modifie et supprime une fermeture, et le note au journal', async () => {
    const res = await direction.post('/api/catalog/closures', { debut: plus(10), fin: plus(14), motif: '  Congés d’été  ' })
    expect(res.statusCode, res.body).toBe(201)
    const { id, motif } = res.json().closure
    expect(motif).toBe('Congés d’été')
    expect((await entries('closure.created'))[0]!.details).toMatchObject({ debut: plus(10), fin: plus(14), motif: 'Congés d’été' })

    const maj = await direction.patch(`/api/catalog/closures/${id}`, { fin: plus(16), motif: 'Congés prolongés' })
    expect(maj.statusCode).toBe(200)
    expect(maj.json().closure).toMatchObject({ debut: plus(10), fin: plus(16), motif: 'Congés prolongés' })
    expect((await entries('closure.updated'))[0]!.details).toMatchObject({ avant: { fin: plus(14) }, apres: { fin: plus(16) } })

    const list = (await direction.get('/api/catalog/closures')).json()
    expect(list.closures).toHaveLength(1)
    expect(list.today).toBe(todayParis())

    expect((await direction.delete(`/api/catalog/closures/${id}`)).statusCode).toBe(200)
    expect(await db.select().from(closures)).toHaveLength(0)
    expect((await entries('closure.deleted'))[0]!.details).toMatchObject({ motif: 'Congés prolongés' })
    expect((await direction.delete(`/api/catalog/closures/${id}`)).statusCode).toBe(404)
  })

  it.each([
    [{ debut: 'demain', fin: '2030-01-02', motif: 'x' }, 'debut'],
    [{ debut: '2030-02-30', fin: '2030-03-02', motif: 'x' }, 'debut'],
    [{ debut: '2030-01-05', fin: '2030-01-02', motif: 'x' }, 'fin'],
    [{ debut: '2030-01-01', fin: '2032-01-01', motif: 'x' }, 'fin'],
    [{ debut: '2030-01-01', fin: '2030-01-02', motif: '  ' }, 'motif'],
    [{ debut: '2030-01-01', fin: '2030-01-02', motif: 'x'.repeat(121) }, 'motif'],
    [{ debut: '2020-01-01', fin: '2020-01-05', motif: 'Déjà passée' }, 'fin'],
  ])('refuse %o et désigne le champ %s', async (data, field) => {
    const res = await direction.post('/api/catalog/closures', data)
    expect(res.statusCode).toBe(400)
    expect(res.json().field).toBe(field)
    expect(await db.select().from(closures)).toHaveLength(0)
  })

  it('répond 404 pour une fermeture inconnue', async () => {
    expect((await direction.patch('/api/catalog/closures/pas-un-uuid', { motif: 'x' })).statusCode).toBe(404)
  })
})

describe('Délais', () => {
  it('saute les jours de fermeture en plus des week-ends', () => {
    // Lundi 2 novembre 2026 + 3 jours ouvrés = jeudi 5 ; avec le mardi 3 et le mercredi 4 fermés : lundi 9
    expect(addWorkingDays('2026-11-02', 3)).toBe('2026-11-05')
    expect(addWorkingDays('2026-11-02', 3, new Set(['2026-11-03', '2026-11-04']))).toBe('2026-11-09')
    // Une fermeture un week-end ne change rien
    expect(addWorkingDays('2026-11-02', 3, new Set(['2026-11-07', '2026-11-08']))).toBe('2026-11-05')
  })

  it('charge les jours des fermetures à venir seulement, bornes comprises', async () => {
    await db.insert(closures).values([
      { debut: plus(5), fin: plus(7), motif: 'À venir' },
      { debut: '2020-01-01', fin: '2020-01-10', motif: 'Passée' },
    ])
    const days = await loadClosedDays()
    expect([...days].sort()).toEqual([plus(5), plus(6), plus(7)])
    expect(spanDays('2026-12-24', '2027-01-02')).toBe(10)
  })

  it('la date prévue d’une commande validée saute la fermeture', async () => {
    const { materials, colors } = await import('../src/db/schema.js')
    const { seedModels, M } = await import('./helpers.js')
    await seedModels()
    const [alu] = await db.insert(materials).values({ nom: 'Aluminium', epaisseur: 1.5, prixM2: 62, retourMin: 10 }).returning()
    const [gris] = await db.insert(colors).values({ nom: 'Gris anthracite', reference: 'RAL 7016', hex: '#383e42' }).returning()
    const dupont = (await direction.post('/api/clients', { type: 'particulier', prenom: 'Jean', nom: 'Dupont' })).json().id
    const ligne = { modelId: M.couvertine, materialId: alu!.id, colorId: gris!.id, cotes: [20, 70, 300, 70, 20], angles: [135, 90, 90, 135], longueur: 3000, quantite: 1, accessoires: [] }
    const creer = async () => {
      const o = (await direction.post('/api/orders', { clientId: dupont, lignes: [ligne], livraison: { mode: 'retrait' } })).json()
      await direction.post(`/api/orders/${o.id}/status`, { statut: 'validee' })
      return (await direction.get(`/api/orders/${o.id}`)).json().order as { datePrevue: string; delaiJours: number }
    }
    const sans = await creer()
    await db.insert(closures).values({ debut: plus(1), fin: plus(21), motif: 'Congés' })
    const avec = await creer()
    expect(avec.datePrevue > sans.datePrevue).toBe(true)
    expect(avec.datePrevue).toBe(addWorkingDays(todayParis(), avec.delaiJours, await loadClosedDays()))
  })
})

describe('Site public', () => {
  it('annonce les fermetures en cours ou à venir, pas les passées', async () => {
    await db.insert(closures).values([
      { debut: plus(3), fin: plus(5), motif: 'Pont' },
      { debut: '2020-01-01', fin: '2020-01-10', motif: 'Passée' },
    ])
    const res = await visitor.get('/api/public/site')
    expect(res.json().fermetures).toEqual([{ debut: plus(3), fin: plus(5), motif: 'Pont' }])
    expect(res.body).not.toContain('Passée')
  })
})
