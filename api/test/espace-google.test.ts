import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { auditLog, clientAccounts, clients } from '../src/db/schema.js'
import { env } from '../src/env.js'
import { hashPassword } from '../src/auth/password.js'
import { buildApp, HOST, PASSWORD, resetDb, type App } from './helpers.js'

let app: App
beforeEach(async () => {
  app = await buildApp()
  await resetDb()
  env.GOOGLE_OAUTH_PROVIDER = 'simulation'
})
afterEach(() => {
  env.GOOGLE_OAUTH_PROVIDER = 'none'
  env.GOOGLE_OAUTH_CLIENT_ID = undefined
  env.GOOGLE_OAUTH_CLIENT_SECRET = undefined
  vi.unstubAllGlobals()
  return app.close()
})

/** Un navigateur : garde tous les cookies (état Google, inscription en attente, session de l'espace client). */
function browser() {
  const jar = new Map<string, string>()
  async function request(method: 'GET' | 'POST', url: string, body?: unknown) {
    const res = await app.inject({
      method,
      url,
      headers: { host: HOST, ...(method === 'POST' ? { origin: `http://${HOST}` } : {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
      ...(body !== undefined ? { payload: body as object } : {}),
    })
    for (const c of res.cookies) {
      if (c.value) jar.set(c.name, c.value)
      else jar.delete(c.name)
    }
    return res
  }
  return {
    get: (url: string) => request('GET', url),
    post: (url: string, body: unknown = {}) => request('POST', url, body),
    jar,
    /** Va chez Google (faux) puis revient : renvoie la réponse du retour, avec son adresse de redirection. */
    async connecter(simule: string, retour?: string) {
      const debut = await request('GET', `/api/espace/google/debut?simule=${encodeURIComponent(simule)}${retour ? `&retour=${encodeURIComponent(retour)}` : ''}`)
      expect(debut.statusCode).toBe(302)
      const back = new URL(debut.headers.location as string, `http://${HOST}`)
      return request('GET', `${back.pathname}${back.search}`)
    },
  }
}

const entries = (action: string) => db.select().from(auditLog).where(eq(auditLog.action, action))
const withGoogle = (over: object = {}) => ({ type: 'particulier', consentement: true, ...over })
const MARIE = 'marie@exemple.fr:Marie:Martin'

describe('Connexion avec Google : désactivée', () => {
  it('renvoie vers la connexion avec un message quand Google n’est pas configuré, et le dit à la page', async () => {
    env.GOOGLE_OAUTH_PROVIDER = 'none'
    const b = browser()
    const res = await b.get('/api/espace/google/debut')
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/espace/connexion?google=indisponible')
    expect((await b.get('/api/espace/session')).json()).toEqual({ compte: null, google: false })
    env.GOOGLE_OAUTH_PROVIDER = 'simulation'
    expect((await b.get('/api/espace/session')).json().google).toBe(true)
  })
})

describe('Connexion avec Google : première visite', () => {
  it('crée l’espace après le choix particulier ou professionnel, sans mot de passe, et l’écrit au journal', async () => {
    const b = browser()
    const back = await b.connecter(MARIE)
    expect(back.headers.location).toMatch(/^\/espace\/google-inscription\?/)
    expect((await b.get('/api/espace/session')).json().compte).toBeNull()
    expect((await b.get('/api/espace/google/en-attente')).json()).toEqual({ email: 'marie@exemple.fr', prenom: 'Marie', nom: 'Martin' })

    // Les mêmes règles que l'inscription classique
    expect((await b.post('/api/espace/google/inscription', withGoogle({ consentement: false }))).statusCode).toBe(400)
    const sansRaison = await b.post('/api/espace/google/inscription', withGoogle({ type: 'professionnel' }))
    expect(sansRaison.statusCode).toBe(400)
    expect(sansRaison.json().field).toBe('raisonSociale')

    const ok = await b.post('/api/espace/google/inscription', withGoogle({ type: 'professionnel', raisonSociale: 'Toitures Martin', telephone: '06 12 34 56 78' }))
    expect(ok.statusCode).toBe(201)
    expect(ok.json().compte).toMatchObject({ email: 'marie@exemple.fr', prenom: 'Marie', nom: 'Martin', type: 'professionnel', proVerifie: false, motDePasse: false })
    expect(ok.body).not.toMatch(/passwordHash|googleSub|fake-/)
    const [c] = await db.select().from(clients)
    expect(c).toMatchObject({ origine: 'site', raisonSociale: 'Toitures Martin', telephone: '06 12 34 56 78', email: 'marie@exemple.fr' })
    const [a] = await db.select().from(clientAccounts)
    expect(a!.passwordHash).toBeNull()
    expect(a!.googleSub).toMatch(/^fake-/)
    expect((await entries('espace.registered'))[0]!.details).toMatchObject({ via: 'google', type: 'professionnel' })
    // Connecté, et l'inscription en attente est consommée
    expect((await b.get('/api/espace/session')).json().compte.email).toBe('marie@exemple.fr')
    expect((await b.get('/api/espace/google/en-attente')).statusCode).toBe(404)
  })

  it('refuse une inscription sans passage par Google, ou avec un cookie fabriqué', async () => {
    const b = browser()
    expect((await b.post('/api/espace/google/inscription', withGoogle())).statusCode).toBe(400)
    b.jar.set('aps_google_nouveau', Buffer.from(JSON.stringify({ sub: 'x', email: 'pirate@exemple.fr', nom: 'Pirate', exp: Date.now() + 60_000 })).toString('base64url') + '.AAAA')
    expect((await b.post('/api/espace/google/inscription', withGoogle())).statusCode).toBe(400)
    expect((await b.get('/api/espace/google/en-attente')).statusCode).toBe(404)
    expect(await db.select().from(clients)).toHaveLength(0)
  })

  it('un client qui revient avec Google retrouve son espace', async () => {
    const b = browser()
    await b.connecter(MARIE)
    await b.post('/api/espace/google/inscription', withGoogle())
    const second = browser()
    const back = await second.connecter(MARIE)
    expect(back.headers.location).toBe('/espace')
    expect((await second.get('/api/espace/session')).json().compte.email).toBe('marie@exemple.fr')
    expect(await db.select().from(clients)).toHaveLength(1)
    expect((await entries('espace.login'))[0]!.details).toMatchObject({ via: 'google' })
  })
})

describe('Connexion avec Google : fiche existante', () => {
  const fiche = (over: object = {}) =>
    db
      .insert(clients)
      .values({ type: 'particulier', nom: 'Martin', prenom: 'Marie', email: 'marie@exemple.fr', origine: 'atelier', ...over })
      .returning()

  it('rattache Google à l’espace existant (même e-mail), sans doublon ni perte du mot de passe', async () => {
    const [c] = await fiche()
    await db.insert(clientAccounts).values({ clientId: c!.id, passwordHash: await hashPassword(PASSWORD) })
    const b = browser()
    const back = await b.connecter('Marie@Exemple.fr:Marie:Martin')
    expect(back.headers.location).toBe('/espace')
    expect((await b.get('/api/espace/session')).json().compte).toMatchObject({ email: 'marie@exemple.fr', motDePasse: true })
    expect(await db.select().from(clients)).toHaveLength(1)
    expect((await db.select().from(clientAccounts))[0]!.googleSub).toMatch(/^fake-/)
    expect(await entries('espace.google_linked')).toHaveLength(1)
    // Le mot de passe marche toujours
    const pw = await browser().post('/api/espace/connexion', { email: 'marie@exemple.fr', password: PASSWORD })
    expect(pw.statusCode).toBe(200)
  })

  it('ouvre l’espace d’une fiche créée par l’atelier : Google prouve que l’adresse est la sienne', async () => {
    await fiche()
    const b = browser()
    expect((await b.connecter(MARIE)).headers.location).toBe('/espace')
    expect((await b.get('/api/espace/session')).json().compte).toMatchObject({ email: 'marie@exemple.fr', motDePasse: false })
    expect(await db.select().from(clients)).toHaveLength(1)
    expect(await entries('espace.google_activated')).toHaveLength(1)
  })

  it('un compte sans mot de passe ne s’ouvre pas avec un mot de passe', async () => {
    await fiche()
    await browser().connecter(MARIE)
    for (const password of ['', 'Plieuse-numerique-2026', 'null', 'undefined']) {
      const res = await browser().post('/api/espace/connexion', { email: 'marie@exemple.fr', password })
      expect(res.statusCode, password).toBe(password === '' ? 400 : 401)
    }
  })

  it('refuse une fiche archivée ou un espace désactivé', async () => {
    const [c] = await fiche()
    const [a] = await db.insert(clientAccounts).values({ clientId: c!.id, passwordHash: null, googleSub: 'fake-x' }).returning()
    await db.update(clientAccounts).set({ disabledAt: new Date() }).where(eq(clientAccounts.id, a!.id))
    const b = browser()
    const res = await b.connecter(MARIE)
    expect(res.headers.location).toBe('/espace/connexion?google=desactive')
    expect((await b.get('/api/espace/session')).json().compte).toBeNull()
  })

  it('ne prend pas un espace déjà lié à un autre compte Google', async () => {
    const [c] = await fiche()
    await db.insert(clientAccounts).values({ clientId: c!.id, passwordHash: null, googleSub: 'un-autre-sub' })
    const b = browser()
    expect((await b.connecter(MARIE)).headers.location).toBe('/espace/connexion?google=echec')
    expect((await b.get('/api/espace/session')).json().compte).toBeNull()
  })
})

describe('Connexion avec Google : sécurité du retour', () => {
  it('refuse un retour sans l’état de départ, avec un autre état, ou une erreur de Google', async () => {
    const b = browser()
    expect((await b.get('/api/espace/google/retour?code=fake:marie@exemple.fr&state=abc')).headers.location).toBe('/espace/connexion?google=echec')
    // État du navigateur de la victime ≠ état de l'attaquant
    await b.get('/api/espace/google/debut?simule=marie@exemple.fr')
    expect((await b.get('/api/espace/google/retour?code=fake:marie@exemple.fr:Marie:Martin&state=autre')).headers.location).toBe('/espace/connexion?google=echec')
    await b.get('/api/espace/google/debut?simule=marie@exemple.fr')
    expect((await b.get('/api/espace/google/retour?error=access_denied&state=abc')).headers.location).toBe('/espace/connexion?google=echec')
    expect(await db.select().from(clients)).toHaveLength(0)
  })

  it('un retour ne sert qu’une fois', async () => {
    const b = browser()
    const debut = await b.get(`/api/espace/google/debut?simule=${MARIE}`)
    const back = new URL(debut.headers.location as string, `http://${HOST}`)
    expect((await b.get(back.pathname + back.search)).headers.location).toMatch(/google-inscription/)
    expect((await b.get(back.pathname + back.search)).headers.location).toBe('/espace/connexion?google=echec')
  })

  it('ne renvoie que vers une page du site', async () => {
    const [c] = await db.insert(clients).values({ type: 'particulier', nom: 'Martin', email: 'marie@exemple.fr', origine: 'atelier' }).returning()
    await db.insert(clientAccounts).values({ clientId: c!.id, passwordHash: null, googleSub: null })
    for (const [retour, attendu] of [
      ['/espace/profil', '/espace/profil'],
      ['//evil.example', '/espace'],
      ['https://evil.example', '/espace'],
      ['/\\evil.example', '/espace'],
    ] as const) {
      expect((await browser().connecter(MARIE, retour)).headers.location, retour).toBe(attendu)
    }
  })

  it('le faux Google est interdit en production sans l’autorisation explicite', () => {
    // La garde est dans env.ts (arrêt au démarrage) : on vérifie que la valeur par défaut reste fermée
    expect(env.GOOGLE_OAUTH_PROVIDER === 'simulation' || env.GOOGLE_OAUTH_PROVIDER === 'none').toBe(true)
    expect(env.ALLOW_FAKE_GOOGLE).toBe(false)
  })
})

describe('Connexion avec Google : le vrai fournisseur', () => {
  const claims = (over: Record<string, unknown> = {}) => ({
    iss: 'https://accounts.google.com',
    aud: 'client-id-test',
    exp: Math.floor(Date.now() / 1000) + 600,
    sub: '1234567890',
    email: 'Marie@Exemple.fr',
    email_verified: true,
    given_name: 'Marie',
    family_name: 'Martin',
    ...over,
  })
  const idToken = (c: object) => `x.${Buffer.from(JSON.stringify(c)).toString('base64url')}.y`

  /** Google répond avec ces informations ; renvoie les appels faits au serveur de Google. */
  function stubGoogle(make: (nonce: string) => object | null) {
    const calls: { url: string; body: URLSearchParams }[] = []
    let nonce = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: init.body as URLSearchParams })
        const c = make(nonce)
        return c ? new Response(JSON.stringify({ id_token: idToken(c) }), { status: 200 }) : new Response('{}', { status: 400 })
      }),
    )
    return { calls, setNonce: (n: string) => (nonce = n) }
  }

  beforeEach(() => {
    env.GOOGLE_OAUTH_PROVIDER = 'google'
    env.GOOGLE_OAUTH_CLIENT_ID = 'client-id-test'
    env.GOOGLE_OAUTH_CLIENT_SECRET = 'secret-test'
  })

  async function parcours(make: (nonce: string) => object | null) {
    const google = stubGoogle(make)
    const b = browser()
    const debut = await b.get('/api/espace/google/debut')
    expect(debut.statusCode).toBe(302)
    const url = new URL(debut.headers.location as string)
    google.setNonce(url.searchParams.get('nonce')!)
    const back = await b.get(`/api/espace/google/retour?code=le-code&state=${url.searchParams.get('state')}`)
    return { back, google, url, b }
  }

  it('envoie vers Google avec PKCE, l’état et le nonce, sans jamais mettre le secret dans l’adresse', async () => {
    stubGoogle(() => null)
    const debut = await browser().get('/api/espace/google/debut')
    const url = new URL(debut.headers.location as string)
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'client-id-test',
      response_type: 'code',
      scope: 'openid email profile',
      code_challenge_method: 'S256',
      redirect_uri: `http://${HOST}/api/espace/google/retour`,
    })
    expect(url.searchParams.get('state')!.length).toBeGreaterThan(30)
    expect(url.searchParams.get('code_challenge')!.length).toBeGreaterThan(30)
    expect(debut.headers.location).not.toContain('secret-test')
    const cookie = debut.cookies.find((c) => c.name === 'aps_google')!
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api/espace/google' })
  })

  it('accepte un jeton valide et envoie le code, la clé PKCE et le secret à Google (pas au navigateur)', async () => {
    const { back, google } = await parcours((nonce) => claims({ nonce }))
    expect(back.headers.location).toMatch(/^\/espace\/google-inscription/)
    expect(google.calls).toHaveLength(1)
    expect(google.calls[0]!.url).toBe('https://oauth2.googleapis.com/token')
    expect(Object.fromEntries(google.calls[0]!.body)).toMatchObject({ code: 'le-code', client_secret: 'secret-test', grant_type: 'authorization_code' })
    expect(google.calls[0]!.body.get('code_verifier')!.length).toBeGreaterThan(30)
  })

  it.each([
    ['une adresse non vérifiée', (nonce: string) => claims({ nonce, email_verified: false })],
    ['un autre destinataire', (nonce: string) => claims({ nonce, aud: 'une-autre-appli' })],
    ['un autre émetteur', (nonce: string) => claims({ nonce, iss: 'https://evil.example' })],
    ['un jeton expiré', (nonce: string) => claims({ nonce, exp: Math.floor(Date.now() / 1000) - 10 })],
    ['un autre nonce', () => claims({ nonce: 'rejoue' })],
    ['un jeton sans adresse', (nonce: string) => claims({ nonce, email: undefined })],
    ['un refus de Google', () => null],
  ])('refuse %s', async (_nom, make) => {
    const { back, b } = await parcours(make)
    expect(back.headers.location).toBe('/espace/connexion?google=echec')
    expect((await b.get('/api/espace/session')).json().compte).toBeNull()
    expect(await db.select().from(clients)).toHaveLength(0)
    expect((await entries('espace.google_failed')).length).toBe(1)
  })
})

describe('Fermeture d’un espace créé avec Google', () => {
  it('se confirme avec l’adresse e-mail, faute de mot de passe', async () => {
    const b = browser()
    await b.connecter(MARIE)
    await b.post('/api/espace/google/inscription', withGoogle())
    const wrong = await b.post('/api/espace/compte/fermeture', { password: 'autre@exemple.fr' })
    expect(wrong.statusCode).toBe(403)
    expect(wrong.json()).toMatchObject({ error: 'Adresse e-mail incorrecte.', field: 'password' })
    expect(await db.select().from(clientAccounts)).toHaveLength(1)
    const ok = await b.post('/api/espace/compte/fermeture', { password: ' Marie@Exemple.fr ' })
    expect(ok.statusCode).toBe(204)
    expect(await db.select().from(clientAccounts)).toHaveLength(0)
    expect((await db.select().from(clients))[0]).toMatchObject({ email: null, nom: 'Client supprimé' })
  })
})
