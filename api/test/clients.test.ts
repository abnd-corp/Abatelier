import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { auditLog, clients } from '../src/db/schema.js'
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

const DUPONT = { type: 'particulier', prenom: 'Jean', nom: 'Dupont', email: 'Jean.Dupont@Exemple.fr', telephone: '06 12 34 56 78', adresse: '3 rue des Lilas', codePostal: '42490', ville: 'Fraisses', origine: 'telephone' }
const TOITURES = { type: 'professionnel', raisonSociale: 'Toitures du Forez', siret: '73282932000074', tvaIntra: 'fr 12 345678901', prenom: 'Luc', nom: 'Morel', ville: 'Firminy' }
const CHANTIER = { libelle: 'Maison Rivière', adresse: '12 chemin du Bois', codePostal: '42700', ville: 'Firminy' }
const UUID = '00000000-0000-4000-8000-000000000000'

const entries = (action: string) => db.select().from(auditLog).where(eq(auditLog.action, action))
const create = async (body: object) => (await direction.post('/api/clients', body)).json().id as string

describe('Accès', () => {
  it('refuse l’atelier, et laisse la RH consulter sans rien modifier', async () => {
    await createUser({ identifiant: 'paul', role: 'atelier' })
    await createUser({ identifiant: 'rh', role: 'rh' })
    const [atelier, rh] = [await loginAs(app, 'paul'), await loginAs(app, 'rh')]
    const id = await create(DUPONT)
    for (const res of await Promise.all([atelier.get('/api/clients'), atelier.get(`/api/clients/${id}`)])) expect(res.statusCode).toBe(403)
    expect((await rh.get('/api/clients')).json().clients).toHaveLength(1)
    expect((await rh.get(`/api/clients/${id}`)).statusCode).toBe(200)
    for (const res of await Promise.all([
      rh.post('/api/clients', DUPONT),
      rh.patch(`/api/clients/${id}`, { nom: 'x' }),
      rh.post(`/api/clients/${id}/archive`),
      rh.post(`/api/clients/${id}/sites`, CHANTIER),
      rh.patch(`/api/clients/${id}/sites/${UUID}`, { ville: 'x' }),
      rh.delete(`/api/clients/${id}/sites/${UUID}`),
    ]))
      expect(res.statusCode).toBe(403)
  })
})

describe('Fiches clients', () => {
  it('crée un particulier, met l’e-mail en minuscules et note la création au journal', async () => {
    const res = await direction.post('/api/clients', DUPONT)
    expect(res.statusCode).toBe(201)
    const { client } = (await direction.get(`/api/clients/${res.json().id}`)).json()
    expect(client).toMatchObject({ type: 'particulier', prenom: 'Jean', nom: 'Dupont', email: 'jean.dupont@exemple.fr', origine: 'telephone', archivedAt: null })
    const [entry] = await entries('client.created')
    expect(entry).toMatchObject({ targetType: 'client', targetId: res.json().id, details: { nom: 'Jean Dupont', type: 'particulier', origine: 'telephone' } })
  })

  it('crée un professionnel, vérifie et met en forme SIRET et TVA', async () => {
    const id = await create(TOITURES)
    const { client } = (await direction.get(`/api/clients/${id}`)).json()
    expect(client).toMatchObject({ raisonSociale: 'Toitures du Forez', siret: '732 829 320 00074', tvaIntra: 'FR12345678901', origine: 'atelier' })
  })

  it('efface raison sociale, SIRET et TVA d’un particulier', async () => {
    const id = await create({ ...DUPONT, email: null, raisonSociale: 'Ignorée', siret: '73282932000074' })
    const { client } = (await direction.get(`/api/clients/${id}`)).json()
    expect(client).toMatchObject({ raisonSociale: null, siret: null, tvaIntra: null })
  })

  it.each([
    [{ type: 'particulier', prenom: 'Jean' }, 'nom', /nom est requis/],
    [{ type: 'professionnel', nom: 'Morel' }, 'raisonSociale', /raison sociale est requise/],
    [{ nom: 'Dupont' }, 'type', /Type de client/],
    [{ ...TOITURES, siret: '73282932000075' }, 'siret', /SIRET invalide/],
    [{ ...TOITURES, siret: '123' }, 'siret', /14 chiffres/],
    [{ ...TOITURES, tvaIntra: 'BE123' }, 'tvaIntra', /format FR/],
    [{ ...DUPONT, email: 'jean@' }, 'email', /e-mail invalide/],
    [{ ...DUPONT, telephone: 'abc' }, 'telephone', /téléphone invalide/],
    [{ ...DUPONT, codePostal: '4249' }, 'codePostal', /5 chiffres/],
    [{ ...DUPONT, origine: 'site' }, 'origine', /Origine inconnue/],
    [{ ...DUPONT, notes: 'x'.repeat(5001) }, 'notes', /5000 caractères/],
  ])('refuse %o et désigne le champ', async (body, field, msg) => {
    const res = await direction.post('/api/clients', body)
    expect(res.statusCode).toBe(400)
    expect(res.json().field).toBe(field)
    expect(res.json().error).toMatch(msg)
  })

  it('refuse une adresse e-mail déjà utilisée, quelle que soit la casse, et indique la fiche existante', async () => {
    const id = await create(DUPONT)
    const res = await direction.post('/api/clients', { ...TOITURES, email: 'JEAN.DUPONT@exemple.fr' })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({ error: 'Un client existe déjà avec cette adresse e-mail.', field: 'email', clientId: id })
    // Plusieurs clients sans e-mail : aucun conflit
    await create({ ...DUPONT, email: null })
    await create({ ...DUPONT, email: '' })
    expect(await db.select().from(clients)).toHaveLength(3)
  })

  it('modifie une fiche et note les champs changés, sans recopier les notes', async () => {
    const id = await create(DUPONT)
    const res = await direction.patch(`/api/clients/${id}`, { ville: 'Firminy', codePostal: '42700', notes: 'Code portail 1234', nom: 'Dupont' })
    expect(res.statusCode).toBe(200)
    const [entry] = await entries('client.updated')
    expect(entry!.details).toEqual({ nom: 'Jean Dupont', champs: ['code postal', 'ville', 'notes'] })
    expect(JSON.stringify(entry!.details)).not.toContain('1234')
    // Rien de changé : rien au journal
    await direction.patch(`/api/clients/${id}`, { ville: 'Firminy' })
    expect(await entries('client.updated')).toHaveLength(1)
  })

  it('passe un particulier en professionnel seulement avec une raison sociale', async () => {
    const id = await create(DUPONT)
    expect((await direction.patch(`/api/clients/${id}`, { type: 'professionnel' })).json()).toMatchObject({ field: 'raisonSociale' })
    expect((await direction.patch(`/api/clients/${id}`, { type: 'professionnel', raisonSociale: 'Dupont Couverture' })).statusCode).toBe(200)
    expect((await direction.patch(`/api/clients/${id}`, { nom: '' })).statusCode).toBe(200)
    expect((await direction.patch(`/api/clients/${id}`, { type: 'particulier' })).json()).toMatchObject({ field: 'nom' })
  })

  it('refuse de prendre l’e-mail d’un autre client en modification', async () => {
    const a = await create(DUPONT)
    const b = await create(TOITURES)
    const res = await direction.patch(`/api/clients/${b}`, { email: DUPONT.email })
    expect(res.statusCode).toBe(409)
    expect(res.json().clientId).toBe(a)
  })

  it('répond 404 pour un client inconnu ou un identifiant mal formé', async () => {
    expect((await direction.get(`/api/clients/${UUID}`)).statusCode).toBe(404)
    expect((await direction.get('/api/clients/abc')).json().error).toBe('Client introuvable.')
    expect((await direction.patch(`/api/clients/${UUID}`, { nom: 'x' })).statusCode).toBe(404)
  })
})

describe('Liste', () => {
  beforeEach(async () => {
    await create(DUPONT)
    await create(TOITURES)
    await create({ type: 'particulier', nom: 'Bernard', ville: 'Saint-Étienne', codePostal: '42000', telephone: '04 77 00 11 22' })
  })
  const list = async (query = '') => (await direction.get(`/api/clients${query}`)).json()

  it('trie par nom, filtre par type et compte les fiches', async () => {
    const all = await list()
    expect(all.clients.map((c: { nom: string }) => c.nom)).toEqual(['Bernard', 'Dupont', 'Morel'])
    expect(all.totals).toEqual({ particulier: 2, professionnel: 1, archives: 0 })
    expect((await list('?filtre=professionnel')).clients).toHaveLength(1)
    expect((await list('?filtre=particulier')).clients).toHaveLength(2)
    expect((await direction.get('/api/clients?filtre=x')).statusCode).toBe(400)
  })

  it('cherche par nom, raison sociale, ville, e-mail ou téléphone sans espaces', async () => {
    expect((await list('?q=toitures')).clients[0].raisonSociale).toBe('Toitures du Forez')
    expect((await list('?q=jean%20dup')).clients[0].nom).toBe('Dupont')
    expect((await list('?q=saint-%C3%A9')).clients[0].nom).toBe('Bernard')
    expect((await list('?q=exemple.fr')).clients).toHaveLength(1)
    expect((await list('?q=0477001122')).clients[0].nom).toBe('Bernard')
    expect((await list('?q=%25')).clients).toHaveLength(0)
  })

  it('archive une fiche : elle sort de la liste, reste consultable, et peut revenir', async () => {
    const id = (await list('?q=dupont')).clients[0].id
    expect((await direction.post(`/api/clients/${id}/archive`)).statusCode).toBe(200)
    expect((await list()).clients).toHaveLength(2)
    expect((await list('?filtre=archives')).clients[0].id).toBe(id)
    expect((await list()).totals.archives).toBe(1)
    expect((await direction.get(`/api/clients/${id}`)).json().client.archivedAt).not.toBeNull()
    await direction.post(`/api/clients/${id}/archive`)
    expect(await entries('client.archived')).toHaveLength(1)
    await direction.post(`/api/clients/${id}/unarchive`)
    expect(await entries('client.unarchived')).toHaveLength(1)
    expect((await list()).clients).toHaveLength(3)
  })
})

describe('Adresses de chantier', () => {
  it('ajoute, modifie et retire une adresse, chaque fois au journal de la fiche', async () => {
    const id = await create(TOITURES)
    const res = await direction.post(`/api/clients/${id}/sites`, CHANTIER)
    expect(res.statusCode).toBe(201)
    const siteId = res.json().id
    expect((await direction.patch(`/api/clients/${id}/sites/${siteId}`, { ville: 'Unieux', codePostal: '42240' })).statusCode).toBe(200)
    const detail = (await direction.get(`/api/clients/${id}`)).json()
    expect(detail.sites).toEqual([expect.objectContaining({ id: siteId, libelle: 'Maison Rivière', ville: 'Unieux', codePostal: '42240' })])
    expect(detail.sites[0].clientId).toBeUndefined()
    expect((await direction.delete(`/api/clients/${id}/sites/${siteId}`)).statusCode).toBe(200)
    expect((await direction.get(`/api/clients/${id}`)).json().sites).toEqual([])
    const activity = (await direction.get(`/api/clients/${id}`)).json().activity.map((a: { action: string }) => a.action)
    expect(activity).toEqual(['client.site_removed', 'client.site_updated', 'client.site_added', 'client.created'])
    const [added] = await entries('client.site_added')
    expect(added!.details).toEqual({ nom: 'Toitures du Forez', chantier: 'Maison Rivière', ville: 'Firminy' })
  })

  it.each([
    [{ ...CHANTIER, libelle: ' ' }, 'libelle', /nom au chantier/],
    [{ ...CHANTIER, adresse: '' }, 'adresse', /adresse est requise/],
    [{ ...CHANTIER, codePostal: 'abcde' }, 'codePostal', /5 chiffres/],
    [{ ...CHANTIER, ville: '' }, 'ville', /ville est requise/],
  ])('refuse %o', async (body, field, msg) => {
    const id = await create(TOITURES)
    const res = await direction.post(`/api/clients/${id}/sites`, body)
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ field, error: expect.stringMatching(msg) })
  })

  it('ne touche pas à l’adresse d’un autre client', async () => {
    const a = await create(TOITURES)
    const b = await create(DUPONT)
    const siteId = (await direction.post(`/api/clients/${a}/sites`, CHANTIER)).json().id
    expect((await direction.patch(`/api/clients/${b}/sites/${siteId}`, { ville: 'x' })).statusCode).toBe(404)
    expect((await direction.delete(`/api/clients/${b}/sites/${siteId}`)).statusCode).toBe(404)
    expect((await direction.delete(`/api/clients/${a}/sites/abc`)).json().error).toBe('Adresse de chantier introuvable.')
    expect((await direction.get(`/api/clients/${a}`)).json().sites).toHaveLength(1)
  })
})

describe('Journal', () => {
  it('filtre les actions sur les clients', async () => {
    await create(DUPONT)
    const res = (await direction.get('/api/audit?type=clients')).json()
    expect(res.entries.map((e: { action: string }) => e.action)).toEqual(['client.created'])
  })
})
