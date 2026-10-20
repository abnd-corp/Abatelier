import { api } from '@/api'

// Boutique : types des réponses de l'API (site public et gestion) et petits outils d'affichage.

export interface BoutiqueVariante {
  id: string
  libelle: string
  reference: string
  prixTtc: number
}
export interface BoutiqueProduit {
  id: string
  nom: string
  categorie: string
  description: string
  image: { url: string; alt: string } | null
  variantes: BoutiqueVariante[]
}
export interface BoutiqueData {
  // Le paiement en ligne est-il ouvert ? Sinon on propose le panier mais pas le paiement
  paiement: boolean
  produits: BoutiqueProduit[]
}

export interface PanierLigne {
  variantId: string
  quantite: number
}
export type PanierLivraison = { mode: 'retrait' } | { mode: 'livraison'; adresse: string; codePostal: string; ville: string }
export interface PanierPrix {
  lignes: { variantId: string; produitId: string; produit: string; libelle: string; quantite: number; prixHt: number; prixTtc: number; totalTtc: number }[]
  indisponibles: string[]
  totals: { brut: number; livraisonPrix: number; ht: number; tauxTva: number; tva: number; ttc: number; delaiJours: number }
  distanceKm: number | null
  paiement: boolean
}
export interface PaiementStatut {
  id: string
  statut: 'attente' | 'paye' | 'echec' | 'rembourse'
  montantTtc: number
  commande: { id: string; numero: string } | null
  simulation: boolean
}

export const QUANTITE_MAX = 999

/** Prix « à partir de » d'un produit (la déclinaison la moins chère). */
export const prixMin = (p: Pick<BoutiqueProduit, 'variantes'>) => Math.min(...p.variantes.map((v) => v.prixTtc))

// --- Gestion (direction) ---

export interface AdminProduit {
  id: string
  nom: string
  categorie: string
  actif: boolean
  hasImage: boolean
  // Change à chaque modification : sert à rafraîchir la photo affichée
  version: number
  variantes: number
  actives: number
  prixMinTtc: number | null
}
export interface AdminVariante {
  id: string
  libelle: string
  reference: string
  prixHt: number
  prixTtc: number
  actif: boolean
}
export interface AdminProduitDetail {
  produit: { id: string; nom: string; categorie: string; description: string; actif: boolean; hasImage: boolean; version: number; imageAlt: string; imageLargeur: number | null; imageHauteur: number | null }
  variantes: AdminVariante[]
  tva: number
}
export const adminImageUrl = (id: string, version: number) => `/api/boutique/produits/${id}/image?v=${version}`

/** Produits en ligne, frais à chaque visite (un produit peut être retiré à tout moment). */
export const loadBoutique = () => api<BoutiqueData>('/public/boutique')
