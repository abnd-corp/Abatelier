import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from './env.js'

// Connexion avec Google (OpenID Connect, code d'autorisation + PKCE). Tout se passe côté serveur : le navigateur est
// seulement redirigé vers Google puis renvoyé chez nous, aucun script de Google n'est chargé sur le site.
// Le jeton d'identité vient de Google par une connexion directe en HTTPS : on en contrôle l'émetteur, le destinataire,
// la durée, le nonce et la vérification de l'adresse e-mail, sans avoir besoin de vérifier une signature.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

export const googleEnabled = () => env.GOOGLE_OAUTH_PROVIDER !== 'none'
export const googleSimulated = () => env.GOOGLE_OAUTH_PROVIDER === 'simulation'

export const b64 = (buf: Buffer) => buf.toString('base64url')
export const randomToken = () => b64(randomBytes(32))
export const pkceChallenge = (verifier: string) => b64(createHash('sha256').update(verifier).digest())

// Clé de signature des cookies de passage : propre à ce processus, ils ne vivent que quelques minutes
const KEY = randomBytes(32)
const mac = (payload: string) => createHmac('sha256', KEY).update(payload).digest()

/** Valeur signée (l'identité reçue de Google ne doit pas pouvoir être forgée par le navigateur). */
export function sign(data: object) {
  const payload = b64(Buffer.from(JSON.stringify(data)))
  return `${payload}.${b64(mac(payload))}`
}
export function unsign<T>(value: string | undefined): T | null {
  if (!value) return null
  const [payload, sig] = value.split('.')
  if (!payload || !sig) return null
  const expected = mac(payload)
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

export interface GoogleIdentity {
  sub: string
  email: string
  prenom: string | null
  nom: string
}

export function authorizationUrl(opts: { redirectUri: string; state: string; nonce: string; challenge: string }) {
  const q = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: opts.state,
    nonce: opts.nonce,
    code_challenge: opts.challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  })
  return `${AUTH_URL}?${q}`
}

/** Faux Google : le « code » porte directement l'identité (fake:e-mail:prénom:nom). Jamais utilisable avec le vrai fournisseur. */
function fromFakeCode(code: string): GoogleIdentity | null {
  const [tag, email, prenom, nom] = code.split(':')
  if (tag !== 'fake' || !email) return null
  return { sub: `fake-${createHash('sha256').update(email).digest('hex').slice(0, 20)}`, email: email.toLowerCase(), prenom: prenom || null, nom: nom || email.split('@')[0]! }
}

/** Échange le code reçu contre l'identité du client. Renvoie null au moindre doute. */
export async function identityFromCode(code: string, opts: { redirectUri: string; verifier: string; nonce: string }): Promise<GoogleIdentity | null> {
  if (googleSimulated()) return fromFakeCode(code)
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
      redirect_uri: opts.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: opts.verifier,
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null
  const { id_token } = (await res.json()) as { id_token?: string }
  const part = id_token?.split('.')[1]
  if (!part) return null
  let c: Record<string, unknown>
  try {
    c = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  const now = Date.now() / 1000
  const ok =
    typeof c.iss === 'string' &&
    ISSUERS.includes(c.iss) &&
    c.aud === env.GOOGLE_OAUTH_CLIENT_ID &&
    typeof c.exp === 'number' &&
    c.exp > now &&
    c.nonce === opts.nonce &&
    typeof c.sub === 'string' &&
    typeof c.email === 'string' &&
    c.email_verified === true
  if (!ok) return null
  const email = (c.email as string).toLowerCase()
  const nom = String(c.family_name ?? c.name ?? email.split('@')[0]).slice(0, 80)
  return { sub: c.sub as string, email, prenom: c.given_name ? String(c.given_name).slice(0, 60) : null, nom }
}
