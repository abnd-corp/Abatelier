import { inflateSync } from 'node:zlib'
import { sql, eq } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { auditLog, pieceModels, users, type Role } from '../src/db/schema.js'
import { hashPassword } from '../src/auth/password.js'

export type App = Awaited<ReturnType<typeof buildApp>>

export const HOST = 'atelier.test'
export const ORIGIN = `http://${HOST}`
export const PASSWORD = 'Plieuse-numerique-2026'

export { buildApp }

export async function resetDb() {
  await db.execute(sql`truncate audit_log, login_attempts, sessions, employees, users, materials, colors, pricing_settings, piece_models, accessories, delivery_settings, company_settings, document_template, document_counters, clients, client_sites, orders, order_lines, order_events, billing_documents restart identity cascade`)
}

// Les quatre modèles de départ, avec les identifiants de la migration 0013
export const M = {
  couvertine: '00000000-0000-4000-a000-000000000001',
  bavette: '00000000-0000-4000-a000-000000000002',
  bandeau: '00000000-0000-4000-a000-000000000003',
  autre: '00000000-0000-4000-a000-000000000004',
}
export async function seedModels() {
  await db.insert(pieceModels).values([
    { id: M.couvertine, nom: 'Couvertine', cotes: [20, 70, 300, 70, 20], angles: [-135, 90, 90, -135], noms: ['Larmier', 'Retombée', 'Dessus', 'Retombée', 'Larmier'], cap: -45, longueur: 3000, quantite: 4, position: 1 },
    { id: M.bavette, nom: 'Bavette d’appui', cotes: [30, 220, 45, 15], angles: [-95, 95, 135], noms: ['Rejingot', 'Dessus', 'Nez', 'Retour'], cap: 90, longueur: 1400, quantite: 2, position: 2 },
    { id: M.bandeau, nom: 'Bandeau', cotes: [40, 150], angles: [-90], noms: ['Retour', 'Face'], cap: 180, longueur: 3000, quantite: 6, position: 3 },
    { id: M.autre, nom: 'Autre profil', cotes: [60, 120], angles: [90], noms: ['', ''], cap: 0, longueur: 2000, quantite: 1, position: 4 },
  ])
}

let counter = 0
export async function createUser(
  o: Partial<{ identifiant: string; nom: string; role: Role; password: string; mustChangePassword: boolean; disabled: boolean }> = {},
) {
  counter++
  const identifiant = o.identifiant ?? `user${counter}`
  const password = o.password ?? PASSWORD
  const [u] = await db
    .insert(users)
    .values({
      identifiant,
      nom: o.nom ?? `Utilisateur ${counter}`,
      role: o.role ?? 'atelier',
      passwordHash: await hashPassword(password),
      mustChangePassword: o.mustChangePassword ?? false,
      disabledAt: o.disabled ? new Date() : null,
    })
    .returning()
  return { ...u!, password }
}

type Headers = Record<string, string>

/** Client qui garde son cookie de session entre les requêtes, comme un navigateur. */
export function client(app: App, opts: { userAgent?: string } = {}) {
  let cookie = ''
  async function request(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, body?: unknown, headers: Headers = {}) {
    const res = await app.inject({
      method,
      url,
      headers: {
        host: HOST,
        ...(method !== 'GET' ? { origin: ORIGIN } : {}),
        ...(cookie ? { cookie } : {}),
        ...(opts.userAgent ? { 'user-agent': opts.userAgent } : {}),
        ...headers,
      },
      ...(body !== undefined ? { payload: body as object | Buffer } : {}),
    })
    const set = res.cookies.find((c) => c.name.endsWith('aps_session'))
    if (set) cookie = set.value ? `${set.name}=${set.value}` : ''
    return res
  }
  return {
    get: (url: string, headers?: Headers) => request('GET', url, undefined, headers),
    post: (url: string, body: unknown = {}, headers?: Headers) => request('POST', url, body, headers),
    patch: (url: string, body: unknown, headers?: Headers) => request('PATCH', url, body, headers),
    put: (url: string, body: unknown, headers?: Headers) => request('PUT', url, body, headers),
    delete: (url: string, headers?: Headers) => request('DELETE', url, undefined, headers),
    get cookie() {
      return cookie
    },
    set cookie(v: string) {
      cookie = v
    },
  }
}
export type Client = ReturnType<typeof client>

export async function loginAs(app: App, identifiant: string, password = PASSWORD, extra: { remember?: boolean; userAgent?: string } = {}) {
  const c = client(app, { userAgent: extra.userAgent })
  const res = await c.post('/api/auth/login', { identifiant, password, remember: extra.remember ?? false })
  if (res.statusCode !== 200) throw new Error(`Connexion de ${identifiant} impossible : ${res.statusCode} ${res.body}`)
  return c
}

export async function auditActions(userId?: string) {
  const rows = await db
    .select({ action: auditLog.action })
    .from(auditLog)
    .where(userId ? eq(auditLog.userId, userId) : undefined)
    .orderBy(auditLog.id)
  return rows.map((r) => r.action)
}

// Codes 0x80 à 0x9f du jeu WinAnsi (les autres sont ceux du latin-1)
const CP1252 = '€\x81‚ƒ„…†‡ˆ‰Š‹Œ\x8dŽ\x8f\x90‘’“”•–—˜™š›œ\x9džŸ'
const winAnsi = { decode: (b: Buffer) => [...b].map((c) => (c >= 0x80 && c < 0xa0 ? CP1252[c - 0x80] : String.fromCharCode(c))).join('') }

/** Texte d'un PDF généré par pdfkit : flux décompressés, chaînes hexadécimales des opérateurs TJ remises bout à bout. */
export function pdfText(pdf: Buffer) {
  const raw = pdf.toString('latin1')
  let out = ''
  for (const m of raw.matchAll(/stream\r?\n/g)) {
    const start = m.index! + m[0].length
    const end = raw.indexOf('endstream', start)
    let content: string
    try {
      content = inflateSync(pdf.subarray(start, end)).toString('latin1')
    } catch {
      continue
    }
    for (const tj of content.matchAll(/\[(.*?)\] TJ/g)) {
      out += [...tj[1]!.matchAll(/<([0-9a-f]*)>/g)].map((h) => winAnsi.decode(Buffer.from(h[1]!, 'hex'))).join('') + '\n'
    }
  }
  return out
}
