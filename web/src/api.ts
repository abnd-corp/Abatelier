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

/** Appel JSON vers l'API. Le cookie de session part automatiquement (même origine). */
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'Impossible de joindre le serveur. Vérifiez votre connexion.')
  }
  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      data?.error ?? (res.status === 429 ? 'Trop de tentatives. Réessayez dans une minute.' : 'Le serveur a rencontré un problème. Réessayez.')
    const err = new ApiError(res.status, message, data?.code, data?.field)
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/me') apiEvents.onUnauthorized()
    if (res.status === 403 && err.code === 'PASSWORD_CHANGE_REQUIRED') apiEvents.onPasswordChangeRequired()
    throw err
  }
  return data as T
}
