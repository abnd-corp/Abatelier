import { sql, eq } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/index.js'
import { auditLog, users, type Role } from '../src/db/schema.js'
import { hashPassword } from '../src/auth/password.js'

export type App = Awaited<ReturnType<typeof buildApp>>

export const HOST = 'atelier.test'
export const ORIGIN = `http://${HOST}`
export const PASSWORD = 'Plieuse-numerique-2026'

export { buildApp }

export async function resetDb() {
  await db.execute(sql`truncate audit_log, login_attempts, sessions, employees, users, materials, colors, pricing_settings, accessories, delivery_settings, company_settings, document_template, document_counters, clients, client_sites restart identity cascade`)
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
