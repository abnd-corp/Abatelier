import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { auditLog, billingDocuments, clients, colors, contactRequests, materials, orders, siteContent } from '../src/db/schema.js'
import { env } from '../src/env.js'
import { resetReviewsCache } from '../src/google-reviews.js'
import { buildApp, client, createUser, loginAs, M, makePng, resetDb, seedModels, type App, type Client } from './helpers.js'
import { setTransport, type Transport } from '../src/mail.js'

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
const contact = (over: Record<string, unknown> = {}) => ({
  nom: 'Jean Dupont',
  email: 'Jean@Example.com',
  objet: 'Couvertine 3 m',
  message: 'Bonjour, je voudrais un devis.',
  consentement: true,
  ...over,
})

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
    await direction.patch('/api/documents/company', {
      raisonSociale: 'APS Test',
      formeJuridique: '',
      capital: '',
      adresse: 'ZA du Parc\n42490 Fraisses',
      telephone: '04 00 00 00 00',
      email: 'contact@aps.test',
      siteWeb: '',
      siret: '',
      rcs: '',
      tvaIntra: '',
      iban: '',
      bic: '',
    })
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
    expect(res.json()).toMatchObject({
      configure: true,
      indisponible: false,
      note: 4.9,
      total: 23,
      lien: 'https://maps.google.com/?cid=1',
      avis: [{ auteur: 'Marie L.', note: 5, texte: 'Très bon travail.', quand: 'il y a 2 mois' }],
    })
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 403 })),
    )
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
    expect(robots.body).toContain('Disallow: /espace')
    expect(robots.body).toContain('Sitemap: https://atelier.test/sitemap.xml')
    const map = await visitor.get('/api/public/sitemap.xml', { 'x-forwarded-proto': 'https' })
    expect(map.headers['content-type']).toMatch(/application\/xml/)
    expect(map.body).toContain('<loc>https://atelier.test/pliage-aluminium</loc>')
    expect(map.body).not.toContain('/clients')
  })
})

describe('Configurateur public', () => {
  let ids: { alu: string; anthracite: string }
  beforeEach(async () => {
    await seedModels()
    const [alu] = await db.insert(materials).values({ nom: 'Aluminium', epaisseur: 1.5, prixM2: 62, retourMin: 10 }).returning()
    const [anthracite] = await db.insert(colors).values({ nom: 'Gris anthracite', reference: 'RAL 7016', hex: '#383e42' }).returning()
    ids = { alu: alu!.id, anthracite: anthracite!.id }
  })
  const piece = (over: Record<string, unknown> = {}) => ({
    repere: 'Mur sud',
    modelId: M.couvertine,
    materialId: ids.alu,
    colorId: ids.anthracite,
    cotes: [20, 70, 300, 70, 20],
    angles: [135, 90, 90, 135],
    longueur: 3000,
    quantite: 4,
    accessoires: [],
    ...over,
  })
  const config = (over: Record<string, unknown> = {}) => ({ lignes: [piece()], livraison: { mode: 'retrait' }, ...over })
  const devis = (over: Record<string, unknown> = {}) => ({
    ...config(),
    nom: 'Jean Dupont',
    email: 'Jean@Example.com',
    telephone: '06 12 34 56 78',
    codePostal: '42490',
    ville: 'Fraisses',
    message: 'Pour un muret.',
    consentement: true,
    ...over,
  })
  const mailSent: Parameters<Transport['sendMail']>[0][] = []
  afterEach(() => {
    setTransport(null)
    env.SMTP_HOST = undefined
    env.MAIL_FROM = undefined
    env.MAIL_ALERT_TO = undefined
    mailSent.length = 0
  })

  it('les textes légaux par défaut couvrent l’espace client : données, cookie de session, fermeture du compte', async () => {
    const c = (await visitor.get('/api/public/site')).json().contenu as Record<string, string>
    expect(c['legal.confidentialite']).toMatch(/espace client/)
    expect(c['legal.confidentialite']).toMatch(/chiffrée/)
    expect(c['legal.confidentialite']).toMatch(/fermeture de votre espace client/)
    expect(c['legal.cookies']).toMatch(/espace client/)
    expect(c['legal.cookies']).toMatch(/strictement nécessaire/)
    expect(c['legal.cookies']).not.toMatch(/Seule l’équipe/)
  })

  it('donne le catalogue sans connexion, sans prix de matière ni donnée interne', async () => {
    const res = await visitor.get('/api/public/configurateur')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.models.map((m: { nom: string }) => m.nom)).toContain('Couvertine')
    expect(body.materials[0]).toMatchObject({ label: 'Aluminium 1,5 mm', retourMin: 10 })
    expect(body.limits).toMatchObject({ longueurMax: expect.any(Number), plisMax: expect.any(Number) })
    expect(res.body).not.toMatch(/prixM2|prixPliMl|remisePro|miseEnRoute/i)
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('chiffre comme l’atelier le ferait pour un particulier, sans compte', async () => {
    const dupont = (await direction.post('/api/clients', { type: 'particulier', prenom: 'Jean', nom: 'Dupont' })).json().id
    const atelier = (await direction.post('/api/orders/quote', { clientId: dupont, ...config() })).json()
    const res = await visitor.post('/api/public/configurateur/chiffrage', config())
    expect(res.statusCode, res.body).toBe(200)
    const pub = res.json()
    expect(pub.totals).toEqual(atelier.totals)
    expect(pub.lignes).toEqual(atelier.lignes)
    expect(pub.totals.remisePro).toBe(0)
    expect(pub.totals.ttc).toBeGreaterThan(0)
    // Un chiffrage ne crée ni commande ni client
    expect(await db.select().from(orders)).toHaveLength(0)
  })

  it('donne une estimation PDF sans compte, sans numéro de devis, sans rien enregistrer', async () => {
    const res = await visitor.post('/api/public/configurateur/estimation.pdf', config())
    expect(res.statusCode, res.body).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.headers['set-cookie']).toBeUndefined()
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
    expect(await db.select().from(orders)).toHaveLength(0)
    expect(await db.select().from(billingDocuments)).toHaveLength(0)
    // Les erreurs de saisie sont les mêmes que pour le chiffrage
    const bad = await visitor.post('/api/public/configurateur/estimation.pdf', config({ lignes: [] }))
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error).toMatch(/au moins une pièce/)
  })

  it('refuse ce que la plieuse ne sait pas faire, avec le champ concerné', async () => {
    const bad = async (body: object) => (await visitor.post('/api/public/configurateur/chiffrage', body)).json()
    expect(await bad(config({ lignes: [piece({ longueur: 99999 })] }))).toMatchObject({ field: expect.stringMatching(/^lignes\.0\.longueur/) })
    expect(await bad(config({ lignes: [piece({ angles: [0, 90, 90, 135] })] }))).toMatchObject({ field: expect.stringMatching(/^lignes\.0\.angles/) })
    expect(await bad(config({ lignes: [] }))).toMatchObject({ error: expect.stringMatching(/au moins une pièce/) })
    expect(await bad(config({ lignes: Array(21).fill(piece()) }))).toMatchObject({ error: expect.stringMatching(/20 pièces maximum/) })
    expect(await bad(config({ lignes: [piece({ modelId: '00000000-0000-4000-8000-000000000000' })] }))).toMatchObject({ error: expect.any(String) })
    expect(await bad({})).toMatchObject({ error: expect.any(String) })
  })

  it('limite le nombre de chiffrages par minute et par adresse', async () => {
    env.QUOTE_RATE_LIMIT = 3
    const limited = await buildApp()
    try {
      const c = client(limited)
      for (let i = 0; i < 3; i++) expect((await c.post('/api/public/configurateur/chiffrage', config())).statusCode).toBe(200)
      const res = await c.post('/api/public/configurateur/chiffrage', config())
      expect(res.statusCode).toBe(429)
    } finally {
      env.QUOTE_RATE_LIMIT = 60
      await limited.close()
    }
  })

  it('n’accepte plus de demande de devis anonyme : le devis passe par l’espace client', async () => {
    const res = await visitor.post('/api/public/devis', devis())
    expect(res.statusCode).toBe(404)
    expect(await db.select().from(contactRequests)).toHaveLength(0)
  })

  describe('commande créée par la direction', () => {
    // Demandes reçues avant l'espace client : elles portent leurs pièces et se transforment toujours en commande
    const request = async (over: Record<string, unknown> = {}) => {
      const { ttc, ht } = (await visitor.post('/api/public/configurateur/chiffrage', config())).json().totals
      await db.insert(contactRequests).values({
        nom: 'Jean Dupont',
        email: String(over.email ?? 'jean@example.com').toLowerCase(),
        telephone: '06 12 34 56 78',
        codePostal: '42490',
        ville: 'Fraisses',
        objet: 'Demande de devis : 4 pièces',
        message: 'Pour un muret.',
        configuration: { lignes: config().lignes as never, livraison: { mode: 'retrait' }, resume: ['4 × Couvertine (Mur sud)'], ht, ttc },
      })
      const list = (await direction.get('/api/site/contacts')).json().demandes
      return list[0] as { id: string; configuration: { ttc: number; resume: string[] }; commandeId: string | null }
    }

    it('montre les pièces et le prix dans la liste des demandes', async () => {
      const d = await request()
      expect(d.configuration.resume).toHaveLength(1)
      expect(d.configuration.ttc).toBeGreaterThan(0)
      expect(d.commandeId).toBeNull()
    })

    it('crée la fiche client et la commande, au prix que le visiteur a vu, et traite la demande', async () => {
      const d = await request()
      const res = await direction.post(`/api/site/contacts/${d.id}/commande`)
      expect(res.statusCode, res.body).toBe(201)
      const { id, numero } = res.json()
      expect(numero).toMatch(/^C-\d{4}-\d{4}$/)
      const [c] = await db.select().from(clients)
      expect(c).toMatchObject({ type: 'particulier', origine: 'site', prenom: 'Jean', nom: 'Dupont', email: 'jean@example.com', ville: 'Fraisses' })
      const order = (await direction.get(`/api/orders/${id}`)).json()
      expect(order.order.statut).toBe('recue')
      expect(order.order.ttc).toBe(d.configuration.ttc)
      expect(order.client.id).toBe(c!.id)
      expect(order.order.notes).toContain('Demande de devis du site')
      const after = (await direction.get('/api/site/contacts?filtre=traitees')).json().demandes[0]
      expect(after).toMatchObject({ commandeId: id })
      expect(after.traiteAt).not.toBeNull()
      const [e] = await entries('contact.order_created')
      expect(e!.details).toMatchObject({ commande: numero, clientCree: true })
      expect((await entries('client.created')).length).toBe(1)
    })

    it('reprend la fiche client existante quand l’adresse e-mail est connue', async () => {
      await direction.post('/api/clients', { type: 'particulier', prenom: 'Jean', nom: 'Dupont', email: 'jean@example.com' })
      const d = await request()
      expect((await direction.post(`/api/site/contacts/${d.id}/commande`)).statusCode).toBe(201)
      expect(await db.select().from(clients)).toHaveLength(1)
      expect((await entries('contact.order_created'))[0]!.details).toMatchObject({ clientCree: false })
    })

    it('ne crée qu’une commande par demande', async () => {
      const d = await request()
      await direction.post(`/api/site/contacts/${d.id}/commande`)
      const again = await direction.post(`/api/site/contacts/${d.id}/commande`)
      expect(again.statusCode).toBe(409)
      expect(again.json().error).toMatch(/déjà été créée/)
      expect(await db.select().from(orders)).toHaveLength(1)
    })

    it('refuse une demande sans pièces, et dit quand le catalogue a changé depuis', async () => {
      expect((await visitor.post('/api/public/contact', { nom: 'A B', email: 'a@b.fr', objet: 'Question', message: 'Bonjour', consentement: true })).statusCode).toBe(201)
      const [plain] = await db.select().from(contactRequests)
      const res = await direction.post(`/api/site/contacts/${plain!.id}/commande`)
      expect(res.statusCode).toBe(409)
      expect(res.json().error).toMatch(/ne vient pas du configurateur/)

      const d = await request({ email: 'autre@example.com' })
      await db.update(materials).set({ actif: false })
      const gone = await direction.post(`/api/site/contacts/${d.id}/commande`)
      expect(gone.statusCode).toBe(400)
      expect(await db.select().from(orders)).toHaveLength(0)
    })

    it('est réservé à la direction', async () => {
      const d = await request()
      const unknown = '00000000-0000-4000-8000-000000000000'
      expect((await visitor.post(`/api/site/contacts/${d.id}/commande`)).statusCode).toBe(401)
      await createUser({ identifiant: 'claire', role: 'rh' })
      expect((await (await loginAs(app, 'claire')).post(`/api/site/contacts/${d.id}/commande`)).statusCode).toBe(403)
      expect((await direction.post(`/api/site/contacts/${unknown}/commande`)).statusCode).toBe(404)
    })
  })
})
