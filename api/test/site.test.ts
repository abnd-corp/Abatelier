import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { auditLog, contactRequests, siteContent } from '../src/db/schema.js'
import { env } from '../src/env.js'
import { resetReviewsCache } from '../src/google-reviews.js'
import { buildApp, client, createUser, loginAs, makePng, resetDb, type App, type Client } from './helpers.js'

let app: App
let direction: Client
let visitor: Client
beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => {
  vi.unstubAllGlobals()
  env.GOOGLE_PLACE_ID = undefined
  env.GOOGLE_PLACES_API_KEY = undefined
  resetReviewsCache()
  return app.close()
})
beforeEach(async () => {
  await resetDb()
  await createUser({ identifiant: 'chef', role: 'direction' })
  direction = await loginAs(app, 'chef')
  visitor = client(app)
})

const entries = (action: string) => db.select().from(auditLog).where(eq(auditLog.action, action))
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n')
const contact = (over: Record<string, unknown> = {}) => ({ nom: 'Jean Dupont', email: 'Jean@Example.com', objet: 'Couvertine 3 m', message: 'Bonjour, je voudrais un devis.', consentement: true, ...over })

describe('Accès', () => {
  it('les routes de gestion sont réservées à la direction', async () => {
    await createUser({ identifiant: 'rh', role: 'rh' })
    await createUser({ identifiant: 'atelier', role: 'atelier' })
    const urls = ['/api/site/content', '/api/site/photos', '/api/site/contacts']
    for (const url of urls) expect((await visitor.get(url)).statusCode, url).toBe(401)
    for (const who of ['rh', 'atelier']) {
      const c = await loginAs(app, who)
      for (const url of urls) expect((await c.get(url)).statusCode, `${who} ${url}`).toBe(403)
      expect((await c.patch('/api/site/content', { valeurs: {} })).statusCode).toBe(403)
      expect((await c.post('/api/site/photos?emplacement=accueil', makePng(300, 300), { 'content-type': 'image/png' })).statusCode).toBe(403)
    }
  })
})

describe('Site public', () => {
  it('sert les textes par défaut, les coordonnées et aucune donnée privée, sans connexion', async () => {
    const res = await visitor.get('/api/public/site')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.contenu['accueil.titre']).toMatch(/sur mesure/)
    expect(body.entreprise.nom).toBe('Alu Pliage Service')
    expect(body.entreprise.itineraire).toMatch(/^https:\/\/www\.google\.com\/maps\//)
    expect(body.photos).toEqual([])
    // Rien d'interne : ni IBAN, ni TVA, ni logo en clair
    expect(JSON.stringify(body)).not.toMatch(/iban|bic|tvaIntra/i)
    expect(res.headers['set-cookie']).toBeUndefined()
    expect(res.headers['cache-control']).toBe('no-cache')
  })

  it('remplace les champs de l’entreprise dans les pages légales', async () => {
    await direction.patch('/api/documents/company', { raisonSociale: 'APS Test', formeJuridique: '', capital: '', adresse: 'ZA du Parc\n42490 Fraisses', telephone: '04 00 00 00 00', email: 'contact@aps.test', siteWeb: '', siret: '', rcs: '', tvaIntra: '', iban: '', bic: '' })
    const { contenu } = (await visitor.get('/api/public/site')).json()
    expect(contenu['legal.mentions']).toContain('APS Test')
    expect(contenu['legal.mentions']).toContain('ZA du Parc, 42490 Fraisses')
    expect(contenu['legal.mentions']).not.toMatch(/\{\w+\}/)
    // SIRET non renseigné : le manque est visible, pas masqué
    expect(contenu['legal.mentions']).toContain('SIRET : À COMPLÉTER')
  })
})

describe('Textes', () => {
  it('modifie un texte, le journalise sans son contenu et le sert au public', async () => {
    const res = await direction.patch('/api/site/content', { valeurs: { 'accueil.titre': '  Nouveau titre  ' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().champs.find((f: { key: string }) => f.key === 'accueil.titre')).toMatchObject({ valeur: 'Nouveau titre', modifie: true })
    expect((await visitor.get('/api/public/site')).json().contenu['accueil.titre']).toBe('Nouveau titre')
    const [e] = await entries('site.content_updated')
    expect(e!.details).toEqual({ champs: ['Titre principal'] })
    expect(JSON.stringify(e!.details)).not.toContain('Nouveau titre')
  })

  it('refuse un champ inconnu, un texte vide ou trop long', async () => {
    expect((await direction.patch('/api/site/content', { valeurs: { inconnu: 'x' } })).json()).toMatchObject({ field: 'inconnu' })
    expect((await direction.patch('/api/site/content', { valeurs: { 'accueil.titre': '   ' } })).json()).toMatchObject({ field: 'accueil.titre', error: expect.stringMatching(/vide/) })
    expect((await direction.patch('/api/site/content', { valeurs: { 'accueil.titre': 'x'.repeat(121) } })).json().error).toMatch(/120 caractères/)
    expect((await direction.patch('/api/site/content', {})).statusCode).toBe(400)
  })

  it('ne journalise rien quand rien ne change, et rétablit le texte d’origine', async () => {
    await direction.patch('/api/site/content', { valeurs: { 'accueil.titre': 'Autre' } })
    await direction.patch('/api/site/content', { valeurs: { 'accueil.titre': 'Autre' } })
    expect(await entries('site.content_updated')).toHaveLength(1)
    expect((await direction.post('/api/site/content/reset', { key: 'accueil.titre' })).statusCode).toBe(200)
    expect(await db.select().from(siteContent)).toHaveLength(0)
    expect(await entries('site.content_reset')).toHaveLength(1)
    expect((await direction.post('/api/site/content/reset', { key: 'x' })).statusCode).toBe(400)
  })
})

describe('Photos', () => {
  const upload = (c: Client, place = 'realisation', img: Buffer = makePng(300, 200), alt = '') =>
    c.post(`/api/site/photos?emplacement=${place}&alt=${encodeURIComponent(alt)}`, img, { 'content-type': 'image/png' })

  it('envoie une photo, la sert au public avec un cache long, la décrit, la déplace et la supprime', async () => {
    const a = (await upload(direction, 'realisation', makePng(300, 200), 'Couvertine blanche')).json().id
    const b = (await upload(direction, 'realisation')).json().id
    const list = (await direction.get('/api/site/photos')).json().photos
    expect(list.map((p: { id: string }) => p.id)).toEqual([a, b])

    const img = await visitor.get(`/api/public/photos/${a}`)
    expect(img.statusCode).toBe(200)
    expect(img.headers['content-type']).toBe('image/png')
    expect(img.headers['cache-control']).toContain('immutable')
    expect(img.headers['x-content-type-options']).toBe('nosniff')
    expect((await visitor.get('/api/public/site')).json().photos[0]).toMatchObject({ id: a, alt: 'Couvertine blanche', emplacement: 'realisation' })

    expect((await direction.post(`/api/site/photos/${b}/deplacer`, { sens: 'haut' })).statusCode).toBe(200)
    expect((await direction.get('/api/site/photos')).json().photos.map((p: { id: string }) => p.id)).toEqual([b, a])

    expect((await direction.patch(`/api/site/photos/${a}`, { alt: 'Nouvelle description', emplacement: 'couvertine' })).statusCode).toBe(200)
    expect((await direction.delete(`/api/site/photos/${a}`)).statusCode).toBe(200)
    expect((await visitor.get(`/api/public/photos/${a}`)).statusCode).toBe(404)
    for (const action of ['site.photo_added', 'site.photo_updated', 'site.photo_deleted']) expect((await entries(action)).length, action).toBeGreaterThan(0)
  })

  it('refuse un faux PNG, un format inconnu, une image trop petite ou trop lourde, un emplacement inconnu', async () => {
    const fake = Buffer.concat([makePng(300, 300).subarray(0, 30), Buffer.from('pas une image')])
    expect((await upload(direction, 'accueil', fake)).json()).toMatchObject({ field: 'photo', error: expect.stringMatching(/illisible/) })
    expect((await upload(direction, 'accueil', makePng(100, 100))).json().error).toMatch(/trop petite/)
    expect((await upload(direction, 'inconnu')).statusCode).toBe(400)
    expect((await direction.post('/api/site/photos?emplacement=accueil', Buffer.from('<svg/>'), { 'content-type': 'image/svg+xml' })).statusCode).toBe(415)
    expect((await upload(direction, 'accueil', Buffer.alloc(3 * 1024 * 1024 + 2000))).statusCode).toBe(413)
    expect((await direction.get('/api/site/photos')).json().photos).toEqual([])
  })

  it('renvoie 404 pour une photo inconnue', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000'
    expect((await direction.patch(`/api/site/photos/${unknown}`, { alt: 'x' })).statusCode).toBe(404)
    expect((await direction.delete(`/api/site/photos/${unknown}`)).statusCode).toBe(404)
    expect((await visitor.get('/api/public/photos/pas-un-uuid')).statusCode).toBe(404)
  })
})

describe('Formulaire de contact', () => {
  it('enregistre une demande, normalise l’e-mail, la journalise sans son contenu', async () => {
    const res = await visitor.post('/api/public/contact', contact({ telephone: '06 12 34 56 78', codePostal: '42490', ville: 'Fraisses' }))
    expect(res.statusCode).toBe(201)
    const [row] = await db.select().from(contactRequests)
    expect(row).toMatchObject({ nom: 'Jean Dupont', email: 'jean@example.com', telephone: '06 12 34 56 78', fichier: null })
    const [e] = await entries('contact.received')
    expect(e).toMatchObject({ userId: null, targetId: row!.id })
    expect(JSON.stringify(e!.details)).not.toMatch(/jean|devis/i)
  })

  it('valide les champs et exige le consentement', async () => {
    const cases: [Record<string, unknown>, string, RegExp][] = [
      [{ nom: '' }, 'nom', /nom/],
      [{ email: 'pas-un-mail' }, 'email', /e-mail/],
      [{ objet: '' }, 'objet', /objet/],
      [{ message: '' }, 'message', /message/],
      [{ telephone: 'abc' }, 'telephone', /téléphone/],
      [{ codePostal: '123' }, 'codePostal', /5 chiffres/],
      [{ consentement: false }, 'consentement', /Cochez/],
    ]
    for (const [over, field, msg] of cases) {
      const res = await visitor.post('/api/public/contact', contact(over))
      expect(res.statusCode, field).toBe(400)
      expect(res.json()).toMatchObject({ field, error: expect.stringMatching(msg) })
    }
    expect(await db.select().from(contactRequests)).toHaveLength(0)
  })

  it('joint un plan PDF, contrôlé sur son contenu réel', async () => {
    const ok = await visitor.post('/api/public/contact', contact({ fichier: { nom: 'plan couvertine.pdf', contenu: pdf.toString('base64') } }))
    expect(ok.statusCode).toBe(201)
    const [row] = await db.select().from(contactRequests)
    expect(row).toMatchObject({ fichierNom: 'plan couvertine.pdf', fichierType: 'application/pdf' })

    // Un exécutable renommé en .pdf est refusé, comme un fichier vide ou trop lourd
    const exe = await visitor.post('/api/public/contact', contact({ fichier: { nom: 'plan.pdf', contenu: Buffer.from('MZ\x90\x00 exécutable').toString('base64') } }))
    expect(exe.json()).toMatchObject({ field: 'fichier', error: expect.stringMatching(/Format non accepté/) })
    const big = await visitor.post('/api/public/contact', contact({ fichier: { nom: 'gros.pdf', contenu: Buffer.concat([pdf, Buffer.alloc(5 * 1024 * 1024)]).toString('base64') } }))
    expect(big.statusCode).toBe(413)
    expect(await db.select().from(contactRequests)).toHaveLength(1)
  })

  it('ignore les robots (champ caché rempli) sans rien enregistrer', async () => {
    const res = await visitor.post('/api/public/contact', contact({ site: 'http://spam.example' }))
    expect(res.statusCode).toBe(201)
    expect(await db.select().from(contactRequests)).toHaveLength(0)
  })

  it('limite le nombre d’envois par heure et par adresse', async () => {
    for (let i = 0; i < env.CONTACT_RATE_LIMIT; i++) expect((await visitor.post('/api/public/contact', contact())).statusCode).toBe(201)
    const res = await visitor.post('/api/public/contact', contact())
    expect(res.statusCode).toBe(429)
    expect(res.json().error).toMatch(/Trop de tentatives/)
  })
})

describe('Demandes reçues (direction)', () => {
  it('liste, télécharge le plan en pièce jointe, traite, rouvre et supprime', async () => {
    await visitor.post('/api/public/contact', contact({ fichier: { nom: 'plan.pdf', contenu: pdf.toString('base64') } }))
    const list = (await direction.get('/api/site/contacts')).json()
    expect(list.aTraiter).toBe(1)
    const d = list.demandes[0]
    expect(d).toMatchObject({ nom: 'Jean Dupont', fichierNom: 'plan.pdf' })
    // La liste ne transporte jamais le contenu du fichier
    expect(JSON.stringify(list)).not.toContain('PDF-1.4')

    const file = await direction.get(`/api/site/contacts/${d.id}/fichier`)
    expect(file.statusCode).toBe(200)
    expect(file.headers['content-type']).toBe('application/pdf')
    expect(file.headers['content-disposition']).toMatch(/^attachment/)
    expect(file.headers['x-content-type-options']).toBe('nosniff')
    expect(file.rawPayload.equals(pdf)).toBe(true)
    expect(await entries('contact.file_downloaded')).toHaveLength(1)

    expect((await direction.post(`/api/site/contacts/${d.id}/traite`, { traite: true })).statusCode).toBe(200)
    expect((await direction.get('/api/site/contacts')).json()).toMatchObject({ aTraiter: 0, demandes: [] })
    expect((await direction.get('/api/site/contacts?filtre=traitees')).json().demandes).toHaveLength(1)
    expect((await direction.post(`/api/site/contacts/${d.id}/traite`, { traite: false })).statusCode).toBe(200)
    expect((await direction.post(`/api/site/contacts/${d.id}/traite`, {})).statusCode).toBe(400)

    expect((await direction.delete(`/api/site/contacts/${d.id}`)).statusCode).toBe(200)
    expect((await direction.get(`/api/site/contacts/${d.id}/fichier`)).statusCode).toBe(404)
    for (const a of ['contact.handled', 'contact.reopened', 'contact.deleted']) expect((await entries(a)).length, a).toBe(1)
  })
})

describe('Avis Google', () => {
  const place = (over: object = {}) => ({
    rating: 4.87,
    userRatingCount: 23,
    googleMapsUri: 'https://maps.google.com/?cid=1',
    reviews: [
      { rating: 5, text: { text: 'Très bon travail.' }, relativePublishTimeDescription: 'il y a 2 mois', authorAttribution: { displayName: 'Marie L.' } },
      { rating: 5, text: { text: '' }, authorAttribution: { displayName: 'Sans texte' } },
    ],
    ...over,
  })

  it('sans clé : seulement le lien vers la fiche, aucun appel à Google', async () => {
    env.GOOGLE_PLACE_ID = 'ChIJtest'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const res = await visitor.get('/api/public/avis')
    expect(res.json()).toMatchObject({ configure: false, avis: [], lien: expect.stringContaining('ChIJtest') })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lit la note et les avis côté serveur, ignore les avis sans texte, garde le résultat en cache', async () => {
    env.GOOGLE_PLACE_ID = 'ChIJtest'
    env.GOOGLE_PLACES_API_KEY = 'cle-secrete'
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(place())))
    vi.stubGlobal('fetch', fetchMock)
    const res = await visitor.get('/api/public/avis')
    expect(res.json()).toMatchObject({ configure: true, indisponible: false, note: 4.9, total: 23, lien: 'https://maps.google.com/?cid=1', avis: [{ auteur: 'Marie L.', note: 5, texte: 'Très bon travail.', quand: 'il y a 2 mois' }] })
    // La clé n'est jamais renvoyée au visiteur
    expect(res.body).not.toContain('cle-secrete')
    await visitor.get('/api/public/avis')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/v1/places/ChIJtest')
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('cle-secrete')
  })

  it('reste utilisable quand Google ne répond pas', async () => {
    env.GOOGLE_PLACE_ID = 'ChIJtest'
    env.GOOGLE_PLACES_API_KEY = 'cle-secrete'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })))
    const res = await visitor.get('/api/public/avis')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ configure: true, indisponible: true, avis: [], lien: expect.stringContaining('ChIJtest') })
  })
})

describe('Référencement', () => {
  it('donne robots.txt et le plan du site avec l’adresse réelle, et cache l’atelier', async () => {
    const robots = await visitor.get('/api/public/robots.txt', { 'x-forwarded-proto': 'https' })
    expect(robots.headers['content-type']).toMatch(/text\/plain/)
    expect(robots.body).toContain('Disallow: /api/')
    expect(robots.body).toContain('Disallow: /clients')
    expect(robots.body).toContain('Sitemap: https://atelier.test/sitemap.xml')
    const map = await visitor.get('/api/public/sitemap.xml', { 'x-forwarded-proto': 'https' })
    expect(map.headers['content-type']).toMatch(/application\/xml/)
    expect(map.body).toContain('<loc>https://atelier.test/pliage-aluminium</loc>')
    expect(map.body).not.toContain('/clients')
  })
})
