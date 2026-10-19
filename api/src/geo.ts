// Localisation des adresses et distance par la route, avec les services gratuits et sans compte de l'IGN :
//   - géocodage (Base Adresse Nationale) : https://data.geopf.fr/geocodage
//   - itinéraire voiture : https://data.geopf.fr/navigation/itineraire
// Avec GEO_FAKE=1 (tests), aucune requête ne part : quelques communes connues sont localisées en dur.

export interface Place {
  label: string
  lat: number
  lon: number
}

export interface Distance {
  km: number
  // 'route' : itinéraire réel ; 'estimation' : vol d'oiseau × 1,3 si l'itinéraire n'a pas répondu
  methode: 'route' | 'estimation'
}

/** Le service de géocodage ne répond pas : l'erreur est passagère, ce n'est pas l'adresse qui est en cause. */
export class GeoUnavailable extends Error {}

const BASE = 'https://data.geopf.fr'
const TIMEOUT_MS = 6000
// En dessous de ce score, la BAN n'a pas vraiment reconnu l'adresse
const MIN_SCORE = 0.4
// Rapport moyen entre distance par la route et distance à vol d'oiseau
const DETOUR = 1.3

const fake = () => process.env.GEO_FAKE === '1'

// Communes connues des tests, repérées par leur code postal
const FAKE_PLACES: Record<string, Place> = {
  '42490': { label: 'Fraisses 42490', lat: 45.3886, lon: 4.2636 },
  '42000': { label: 'Saint-Étienne 42000', lat: 45.4397, lon: 4.3872 },
  '42700': { label: 'Firminy 42700', lat: 45.3883, lon: 4.2874 },
  '69001': { label: 'Lyon 69001', lat: 45.7676, lon: 4.8345 },
  '75001': { label: 'Paris 75001', lat: 48.8625, lon: 2.3364 },
}

async function getJson(url: string) {
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } })
  } catch {
    throw new GeoUnavailable('Service injoignable')
  }
  if (!res.ok) throw new GeoUnavailable(`Réponse ${res.status}`)
  return res.json() as Promise<any>
}

/** Distance à vol d'oiseau en km (formule de haversine). */
export function crowKm(a: Pick<Place, 'lat' | 'lon'>, b: Pick<Place, 'lat' | 'lon'>) {
  const rad = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

// Objet plutôt que fonctions isolées : les tests peuvent remplacer chaque méthode (vi.spyOn)
export const geo = {
  /** Adresse la plus probable, ou null si elle n'est pas reconnue. */
  async geocode(query: string): Promise<Place | null> {
    if (fake()) {
      const cp = /\b(\d{5})\b/.exec(query)?.[1]
      return (cp && FAKE_PLACES[cp]) || null
    }
    const data = await getJson(`${BASE}/geocodage/search?limit=1&q=${encodeURIComponent(query)}`)
    const f = data?.features?.[0]
    if (!f || (f.properties?.score ?? 0) < MIN_SCORE) return null
    const [lon, lat] = f.geometry.coordinates as [number, number]
    return { label: String(f.properties.label), lat, lon }
  },

  /** Distance en voiture entre deux points ; estimation si l'itinéraire ne répond pas. */
  async roadKm(from: Pick<Place, 'lat' | 'lon'>, to: Pick<Place, 'lat' | 'lon'>): Promise<Distance> {
    const estimate: Distance = { km: crowKm(from, to) * DETOUR, methode: 'estimation' }
    if (fake()) return { ...estimate, methode: 'route' }
    try {
      const data = await getJson(
        `${BASE}/navigation/itineraire?resource=bdtopo-osrm&profile=car&optimization=fastest&distanceUnit=kilometer&getSteps=false` +
          `&start=${from.lon},${from.lat}&end=${to.lon},${to.lat}`,
      )
      return typeof data?.distance === 'number' ? { km: data.distance, methode: 'route' } : estimate
    } catch {
      return estimate
    }
  },
}
