export class ApiError extends Error {
  status: number
  code?: string
  field?: string

  constructor(status: number, message: string, code?: string, field?: string) {
    super(message)
    this.status = status
    this.code = code
    this.field = field
  }
}

/** Réactions globales, branchées dans main.ts (session expirée, mot de passe à changer). */
export const apiEvents = {
  onUnauthorized: () => {},
  onPasswordChangeRequired: () => {},
}

type Options = { method?: string; body?: unknown; raw?: Blob }

async function request(path: string, options: Options): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers: options.raw ? { 'Content-Type': options.raw.type } : options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.raw ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'Impossible de joindre le serveur. Vérifiez votre connexion.')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    const message =
      data?.error ?? (res.status === 429 ? 'Trop de tentatives. Réessayez dans une minute.' : 'Le serveur a rencontré un problème. Réessayez.')
    const err = new ApiError(res.status, message, data?.code, data?.field)
    if (res.status === 401 && path !== '/auth/login') apiEvents.onUnauthorized()
    if (res.status === 403 && err.code === 'PASSWORD_CHANGE_REQUIRED') apiEvents.onPasswordChangeRequired()
    throw err
  }
  return res
}

/**
 * Appel JSON vers l'API. Le cookie de session part automatiquement (même origine).
 * `raw` envoie un fichier tel quel (ex. une image), avec son type.
 */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const res = await request(path, options)
  if (res.status === 204) return undefined as T
  return (await res.json().catch(() => null)) as T
}

/** Appel dont la réponse est un fichier (ex. un PDF). */
export async function apiBlob(path: string, options: Options = {}): Promise<Blob> {
  return (await request(path, options)).blob()
}
