import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { auditLog, employees, users } from '../src/db/schema.js'
import { applyDepartures, todayParis } from '../src/departures.js'
import { auditActions, buildApp, client, createUser, loginAs, PASSWORD, resetDb, type App, type Client } from './helpers.js'

let app: App
let admin: Client
let adminId: string
// Application neuve à chaque test : la limite d'essais par IP repart de zéro
beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => app.close())
beforeEach(async () => {
  await resetDb()
  adminId = (await createUser({ identifiant: 'chef', nom: 'Le Chef', role: 'direction' })).id
  admin = await loginAs(app, 'chef')
})

const PAUL = {
  prenom: 'Paul',
  nom: 'Martin',
  poste: 'Plieur',
  contrat: 'cdi',
  dateEntree: '2024-03-01',
  telephone: '06 12 34 56 78',
  email: 'paul.martin@exemple.fr',
  notes: 'Permis cariste',
}

const shift = (days: number) => {
  const d = new Date(`${todayParis()}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

describe('Accès', () => {
  it('est refusé à un compte atelier', async () => {
    await createUser({ identifiant: 'paul' })
    const paul = await loginAs(app, 'paul')
    const id = '00000000-0000-4000-8000-000000000000'
    for (const res of await Promise.all([
      paul.get('/api/employees'),
      paul.post('/api/employees', PAUL),
      paul.get(`/api/employees/${id}`),
      paul.patch(`/api/employees/${id}`, { poste: 'x' }),
      paul.post(`/api/employees/${id}/account`, { identifiant: 'x', sections: ['atelier'] }),
    ]))
      expect(res.statusCode).toBe(403)
  })
})

describe('Compte sans la case administration', () => {
  let ventes: Client
  beforeEach(async () => {
    await createUser({ identifiant: 'vendeuse', sections: ['ventes', 'atelier', 'direction'] })
    ventes = await loginAs(app, 'vendeuse')
  })

  it('n’a accès ni au journal, ni aux comptes', async () => {
    for (const url of ['/api/audit', '/api/users']) expect((await ventes.get(url)).statusCode, url).toBe(403)
    expect((await ventes.post('/api/users', { identifiant: 'x', nom: 'X', sections: ['direction'], admin: true })).statusCode).toBe(403)
  })

  it('avec la section direction, gère les fiches salariés mais ne crée pas de compte de connexion', async () => {
    expect((await ventes.get('/api/employees')).statusCode).toBe(200)
    expect((await ventes.post('/api/employees', { ...PAUL, compte: { identifiant: 'paul', sections: ['atelier'] } })).statusCode).toBe(403)
    const res = await ventes.post('/api/employees', PAUL)
    expect(res.statusCode).toBe(201)
    expect((await ventes.post(`/api/employees/${res.json().id}/account`, { identifiant: 'paul', sections: ['atelier'] })).statusCode).toBe(403)
  })

  it('sans la section direction ni la case administration, n’a pas accès aux fiches salariés', async () => {
    await createUser({ identifiant: 'commercial', sections: ['ventes', 'atelier'] })
    const c = await loginAs(app, 'commercial')
    expect((await c.get('/api/employees')).statusCode).toBe(403)
    expect((await c.post('/api/employees', PAUL)).statusCode).toBe(403)
  })

  it('avec la case administration seule, gère les fiches, les comptes et lit le journal', async () => {
    await createUser({ identifiant: 'rh', sections: [], admin: true })
    const rh = await loginAs(app, 'rh')
    const res = await rh.post('/api/employees', { ...PAUL, compte: { identifiant: 'paul', sections: ['atelier'] } })
    expect(res.statusCode).toBe(201)
    expect((await rh.get('/api/employees')).statusCode).toBe(200)
    expect((await rh.get('/api/audit')).statusCode).toBe(200)
    // ... mais pas les clients, ni les commandes
    expect((await rh.get('/api/clients')).statusCode).toBe(403)
  })
})

describe('Ajout d’un salarié', () => {
  it('crée une fiche sans compte de connexion', async () => {
    const res = await admin.post('/api/employees', PAUL)
    expect(res.statusCode).toBe(201)
    expect(res.json().tempPassword).toBeNull()
    const fiche = (await admin.get(`/api/employees/${res.json().id}`)).json().employee
    expect(fiche).toMatchObject({ ...PAUL, dateSortie: null, hasAccount: false, account: null })
    expect(await auditActions(adminId)).toContain('employee.created')
  })

  it('crée la fiche et le compte en une fois, le compte porte le nom complet', async () => {
    const res = await admin.post('/api/employees', { ...PAUL, compte: { identifiant: 'Paul', sections: ['atelier'] } })
    expect(res.statusCode).toBe(201)
    const { id, tempPassword } = res.json()
    expect(tempPassword).toMatch(/^[A-Za-z0-9]{4}(-[A-Za-z0-9]{4}){3}$/)
    const login = await client(app).post('/api/auth/login', { identifiant: 'paul', password: tempPassword })
    expect(login.json().user).toMatchObject({ nom: 'Paul Martin', sections: ['atelier'], admin: false, mustChangePassword: true })
    const fiche = (await admin.get(`/api/employees/${id}`)).json().employee
    expect(fiche.account).toMatchObject({ identifiant: 'paul', sections: ['atelier'], admin: false, mustChangePassword: true })
    expect(await auditActions(adminId)).toEqual(expect.arrayContaining(['employee.created', 'user.created']))
  })

  it('ne crée rien si l’identifiant est déjà pris', async () => {
    await createUser({ identifiant: 'paul' })
    const res = await admin.post('/api/employees', { ...PAUL, compte: { identifiant: 'paul', sections: ['atelier'] } })
    expect(res.statusCode).toBe(409)
    expect(res.json().field).toBe('identifiant')
    expect(await db.select().from(employees)).toHaveLength(0)
  })

  it('transforme les champs vides en « non renseigné »', async () => {
    const res = await admin.post('/api/employees', { prenom: 'Marie', nom: 'Durand', poste: '  ', telephone: '', email: '', contrat: '', dateEntree: '' })
    expect(res.statusCode).toBe(201)
    const fiche = (await admin.get(`/api/employees/${res.json().id}`)).json().employee
    expect(fiche).toMatchObject({ poste: null, telephone: null, email: null, contrat: null, dateEntree: null })
  })

  it.each([
    [{ prenom: '' }, 'prenom', /prénom/],
    [{ email: 'pas-un-mail' }, 'email', /e-mail/],
    [{ telephone: 'appelle-moi' }, 'telephone', /téléphone/],
    [{ contrat: 'freelance' }, 'contrat', /contrat/],
    [{ dateEntree: '2024-13-45' }, 'dateEntree', /Date invalide/],
    [{ dateEntree: '2025-01-01', dateSortie: '2024-01-01' }, 'dateSortie', /après la date d’entrée/],
    [{ compte: { identifiant: 'Paul Martin', sections: ['atelier'] } }, 'identifiant', /identifiant/i],
    [{ compte: { identifiant: 'paul', sections: ['patron'] } }, 'sections', /.+/],
    [{ compte: { identifiant: 'paul', sections: [], admin: false } }, 'sections', /au moins une section/],
  ])('refuse %o et désigne le champ', async (override, field, msg) => {
    const res = await admin.post('/api/employees', { ...PAUL, ...override })
    expect(res.statusCode).toBe(400)
    expect(res.json().field).toBe(field)
    expect(res.json().error).toMatch(msg)
  })
})

describe('Liste', () => {
  beforeEach(async () => {
    await admin.post('/api/employees', { ...PAUL, compte: { identifiant: 'paul', sections: ['atelier'] } })
    await admin.post('/api/employees', { prenom: 'Marie', nom: 'Durand', poste: 'Commerciale' })
    await admin.post('/api/employees', { prenom: 'Jean', nom: 'Ancien', dateEntree: '2020-01-01', dateSortie: '2023-06-30' })
    await admin.post('/api/employees', { prenom: 'Léa', nom: 'Bientôt', dateSortie: shift(10) })
  })

  it('montre les salariés en poste par défaut, triés par nom, avec les totaux', async () => {
    const res = (await admin.get('/api/employees')).json()
    expect(res.employees.map((e: { nom: string }) => e.nom)).toEqual(['Bientôt', 'Durand', 'Martin'])
    expect(res.totals).toEqual({ actifs: 3, partis: 1 })
  })

  it('filtre les salariés partis', async () => {
    const res = (await admin.get('/api/employees?statut=partis')).json()
    expect(res.employees.map((e: { prenom: string }) => e.prenom)).toEqual(['Jean'])
  })

  it('cherche par nom, prénom, nom complet, poste ou identifiant', async () => {
    const names = async (q: string) => (await admin.get(`/api/employees?statut=tous&q=${encodeURIComponent(q)}`)).json().employees.map((e: { prenom: string }) => e.prenom)
    expect(await names('mart')).toEqual(['Paul'])
    expect(await names('Paul Martin')).toEqual(['Paul'])
    expect(await names('commerc')).toEqual(['Marie'])
    expect(await names('paul')).toEqual(['Paul'])
    expect(await names('%')).toEqual([])
  })

  it('indique le compte lié sans jamais exposer de hash', async () => {
    const res = await admin.get('/api/employees')
    const paul = res.json().employees.find((e: { prenom: string }) => e.prenom === 'Paul')
    expect(paul.account).toMatchObject({ identifiant: 'paul', sections: ['atelier'], admin: false })
    expect(res.body).not.toMatch(/argon2|passwordHash|password_hash/)
  })

  it('refuse un filtre invalide', async () => {
    expect((await admin.get('/api/employees?statut=vire')).statusCode).toBe(400)
  })
})

describe('Fiche et modification', () => {
  it('renvoie 404 pour une fiche inconnue ou un id invalide', async () => {
    expect((await admin.get('/api/employees/00000000-0000-4000-8000-000000000000')).statusCode).toBe(404)
    expect((await admin.get('/api/employees/42')).statusCode).toBe(404)
  })

  it('modifie la fiche, renomme le compte, et note les champs sans copier les notes', async () => {
    const { id } = (await admin.post('/api/employees', { ...PAUL, compte: { identifiant: 'paul', sections: ['atelier'] } })).json()
    const res = await admin.patch(`/api/employees/${id}`, { nom: 'Martin-Roux', notes: 'Information confidentielle' })
    expect(res.statusCode).toBe(200)
    const fiche = (await admin.get(`/api/employees/${id}`)).json()
    expect(fiche.employee).toMatchObject({ nom: 'Martin-Roux', notes: 'Information confidentielle' })
    const [u] = await db.select().from(users).where(eq(users.identifiant, 'paul'))
    expect(u!.nom).toBe('Paul Martin-Roux')
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, 'employee.updated'))
    expect(entry!.details).toEqual({ nom: 'Paul Martin-Roux', champs: ['nom', 'notes'] })
    expect(JSON.stringify(entry)).not.toContain('confidentielle')
    expect(fiche.activity.map((a: { action: string }) => a.action)).toContain('employee.updated')
  })

  it('ne note rien si rien ne change', async () => {
    const { id } = (await admin.post('/api/employees', PAUL)).json()
    await admin.patch(`/api/employees/${id}`, { poste: 'Plieur' })
    expect(await auditActions(adminId)).not.toContain('employee.updated')
  })

  it('vérifie l’ordre des dates avec les valeurs déjà enregistrées', async () => {
    const { id } = (await admin.post('/api/employees', PAUL)).json()
    const res = await admin.patch(`/api/employees/${id}`, { dateSortie: '2020-01-01' })
    expect(res.statusCode).toBe(400)
    expect(res.json().field).toBe('dateSortie')
  })

  it('crée un compte pour un salarié qui n’en a pas, une seule fois', async () => {
    const { id } = (await admin.post('/api/employees', PAUL)).json()
    const res = await admin.post(`/api/employees/${id}/account`, { identifiant: 'pmartin', sections: ['atelier'] })
    expect(res.statusCode).toBe(201)
    expect((await client(app).post('/api/auth/login', { identifiant: 'pmartin', password: res.json().tempPassword })).statusCode).toBe(200)
    expect((await admin.post(`/api/employees/${id}/account`, { identifiant: 'autre', sections: ['atelier'] })).statusCode).toBe(409)
  })

  it('les comptes listent le salarié lié', async () => {
    const { id } = (await admin.post('/api/employees', { ...PAUL, compte: { identifiant: 'paul', sections: ['atelier'] } })).json()
    const list = (await admin.get('/api/users')).json().users
    expect(list.find((u: { identifiant: string }) => u.identifiant === 'paul').employeeId).toBe(id)
    expect(list.find((u: { identifiant: string }) => u.identifiant === 'chef').employeeId).toBeNull()
  })
})

describe('Date de sortie', () => {
  it('une date de sortie aujourd’hui désactive le compte et déconnecte la personne', async () => {
    const { id, tempPassword } = (await admin.post('/api/employees', { ...PAUL, compte: { identifiant: 'paul', sections: ['atelier'] } })).json()
    const paul = await loginAs(app, 'paul', tempPassword)
    const res = await admin.patch(`/api/employees/${id}`, { dateSortie: todayParis() })
    expect(res.json().accountDisabled).toBe(true)
    expect((await paul.get('/api/auth/me')).statusCode).toBe(401)
    expect((await client(app).post('/api/auth/login', { identifiant: 'paul', password: tempPassword })).statusCode).toBe(403)
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, 'user.disabled'))
    expect(entry).toMatchObject({ userId: null, details: expect.objectContaining({ raison: 'date de sortie' }) })
  })

  it('une date de sortie future ne désactive rien… jusqu’au jour venu', async () => {
    const { id } = (await admin.post('/api/employees', { ...PAUL, compte: { identifiant: 'paul', sections: ['atelier'] } })).json()
    await admin.patch(`/api/employees/${id}`, { dateSortie: shift(5) })
    expect((await admin.get(`/api/employees/${id}`)).json().employee.account.disabledAt).toBeNull()
    // Le temps passe : la date est atteinte, la tâche horaire désactive le compte
    await db
      .update(employees)
      .set({ dateSortie: shift(0) })
      .where(eq(employees.id, id))
    expect(await applyDepartures()).toBe(1)
    expect((await admin.get(`/api/employees/${id}`)).json().employee.account.disabledAt).not.toBeNull()
    expect(await applyDepartures()).toBe(0)
  })

  it('un salarié saisi déjà parti a son compte désactivé dès la création', async () => {
    const { tempPassword } = (await admin.post('/api/employees', { ...PAUL, dateSortie: '2025-01-31', compte: { identifiant: 'paul', sections: ['atelier'] } })).json()
    expect((await client(app).post('/api/auth/login', { identifiant: 'paul', password: tempPassword })).statusCode).toBe(403)
  })

  it('deux applications simultanées ne désactivent et ne notent le compte qu’une fois', async () => {
    const { id } = (await admin.post('/api/employees', { ...PAUL, compte: { identifiant: 'paul', sections: ['atelier'] } })).json()
    await db
      .update(employees)
      .set({ dateSortie: shift(0) })
      .where(eq(employees.id, id))
    const counts = await Promise.all([applyDepartures(), applyDepartures(), applyDepartures()])
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1)
    const entries = await db.select().from(auditLog).where(eq(auditLog.action, 'user.disabled'))
    expect(entries).toHaveLength(1)
  })

  it('ne touche pas aux comptes sans fiche salarié', async () => {
    await createUser({ identifiant: 'poste-atelier' })
    expect(await applyDepartures()).toBe(0)
    expect((await client(app).post('/api/auth/login', { identifiant: 'poste-atelier', password: PASSWORD })).statusCode).toBe(200)
  })
})
