import { env } from './env.js'

// Avis Google de la fiche de l'entreprise, lus côté serveur avec l'API Places (nouvelle version).
// Le visiteur ne contacte jamais Google : pas de cookie, pas de script tiers. Résultat gardé en mémoire quelques heures.

export interface Avis {
  auteur: string
  note: number
  texte: string
  quand: string
}
export interface AvisGoogle {
  // Faux tant qu'il manque la clé ou l'identifiant de la fiche : la page affiche alors seulement le lien
  configure: boolean
  // Vrai si Google ne répond pas et qu'on n'a rien en réserve
  indisponible: boolean
  note: number | null
  total: number
  avis: Avis[]
  lien: string | null
  lienAvis: string | null
}

const TTL_MS = 6 * 3600_000
// Après un échec, on attend avant de réessayer, pour ne pas rappeler Google à chaque visite
const RETRY_MS = 5 * 60_000

let cache: { at: number; ok: boolean; data: AvisGoogle } | null = null
export const resetReviewsCache = () => (cache = null)

const placeUrl = (id: string) => `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(id)}`

const base = (): AvisGoogle => {
  const id = env.GOOGLE_PLACE_ID
  return {
    configure: Boolean(id && env.GOOGLE_PLACES_API_KEY),
    indisponible: false,
    note: null,
    total: 0,
    avis: [],
    lien: id ? placeUrl(id) : null,
    lienAvis: id ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(id)}` : null,
  }
}

interface PlaceReview {
  rating?: number
  relativePublishTimeDescription?: string
  text?: { text?: string }
  originalText?: { text?: string }
  authorAttribution?: { displayName?: string }
}

export async function getReviews(): Promise<AvisGoogle> {
  const start = base()
  if (!start.configure) return start
  const now = Date.now()
  if (cache && now - cache.at < (cache.ok ? TTL_MS : RETRY_MS)) return cache.data

  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(env.GOOGLE_PLACE_ID!)}?languageCode=fr`, {
      headers: { 'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY!, 'X-Goog-FieldMask': 'rating,userRatingCount,reviews,googleMapsUri' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`Google Places : HTTP ${res.status}`)
    const json = (await res.json()) as { rating?: number; userRatingCount?: number; googleMapsUri?: string; reviews?: PlaceReview[] }
    const data: AvisGoogle = {
      ...start,
      note: typeof json.rating === 'number' ? Math.round(json.rating * 10) / 10 : null,
      total: json.userRatingCount ?? 0,
      lien: json.googleMapsUri ?? start.lien,
      avis: (json.reviews ?? [])
        .map((r) => ({
          auteur: r.authorAttribution?.displayName?.trim() || 'Client Google',
          note: Math.round(r.rating ?? 0),
          texte: (r.text?.text ?? r.originalText?.text ?? '').trim(),
          quand: r.relativePublishTimeDescription ?? '',
        }))
        // Un avis sans texte (juste des étoiles) n'apporte rien sur la page
        .filter((r) => r.texte && r.note >= 1)
        .slice(0, 5),
    }
    cache = { at: now, ok: true, data }
    return data
  } catch (e) {
    console.error('Avis Google indisponibles :', e instanceof Error ? e.message : e)
    // En cas d'échec, on garde les derniers avis connus, même périmés
    const data = cache?.data.avis.length ? cache.data : { ...start, indisponible: true }
    cache = { at: now, ok: false, data }
    return data
  }
}
