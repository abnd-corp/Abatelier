import { ref } from 'vue'
import { api } from '@/api'

// Données du site vitrine : textes, coordonnées, photos (publics, sans connexion)

export type Emplacement = 'accueil' | 'realisation' | 'couvertine' | 'bavette' | 'bandeau'

export interface SitePhotoPublic {
  id: string
  emplacement: Emplacement
  alt: string
  largeur: number
  hauteur: number
}
export interface SiteData {
  entreprise: { nom: string; adresse: string; telephone: string; email: string; siret: string; logo: boolean; itineraire: string }
  contenu: Record<string, string>
  photos: SitePhotoPublic[]
}
export interface Avis {
  auteur: string
  note: number
  texte: string
  quand: string
}
export interface AvisGoogle {
  configure: boolean
  indisponible: boolean
  note: number | null
  total: number
  avis: Avis[]
  lien: string | null
  lienAvis: string | null
}

export const site = ref<SiteData | null>(null)
export const siteError = ref('')
let pending: Promise<void> | null = null

/** Charge le site une seule fois, puis le garde en mémoire pendant la visite. */
export function loadSite(force = false) {
  if (force) pending = null
  pending ??= api<SiteData>('/public/site')
    .then((d) => {
      site.value = d
      siteError.value = ''
    })
    .catch(() => {
      siteError.value = 'Le site est momentanément indisponible. Réessayez dans quelques instants.'
      pending = null
    })
  return pending
}

export const photoUrl = (id: string) => `/api/public/photos/${id}`
export const photosOf = (d: SiteData | null, place: Emplacement) => d?.photos.filter((p) => p.emplacement === place) ?? []

/** Une ligne par élément : « Z, L, U » → ['Z, L, U'] */
export const lines = (text: string | undefined) =>
  (text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
/** Paragraphes séparés par une ligne vide. */
export const paragraphs = (text: string | undefined) =>
  (text ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

export interface LegalBlock {
  titre?: string
  lignes: string[]
}
/** Texte juridique : « # Titre » ouvre une section, une ligne vide sépare les paragraphes. */
export function legalBlocks(text: string): LegalBlock[] {
  const blocks: LegalBlock[] = []
  let block: LegalBlock | null = null
  // Vrai tant qu'un paragraphe est en cours : la ligne suivante s'y ajoute au lieu d'en ouvrir un nouveau
  let open = false
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const heading = /^#\s+(.*)$/.exec(line)
    if (heading) {
      block = { titre: heading[1]!.trim(), lignes: [] }
      blocks.push(block)
      open = false
    } else if (!line) {
      open = false
    } else {
      if (!block) blocks.push((block = { lignes: [] }))
      if (open) block.lignes[block.lignes.length - 1] += '\n' + line
      else {
        block.lignes.push(line)
        open = true
      }
    }
  }
  return blocks
}

/** « 06 10 74 86 83 » → « +33610748683 » pour un lien tel: */
export function telHref(phone: string) {
  const d = phone.replace(/\D/g, '')
  return d.startsWith('0') ? `+33${d.slice(1)}` : d
}

/** Dernière ligne « 42490 Fraisses » → code postal et commune. */
export function splitAddress(adresse: string) {
  const parts = adresse
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const last = parts.at(-1) ?? ''
  const m = /^(\d{5})\s+(.+)$/.exec(last)
  return { rue: (m ? parts.slice(0, -1) : parts).join(', '), codePostal: m?.[1] ?? '', ville: m?.[2] ?? '' }
}

/** Taille maximale et types acceptés pour le plan joint (identiques à l'API). */
export const PLAN_MAX = 5 * 1024 * 1024
export const PLAN_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    r.readAsDataURL(file)
  })
}
