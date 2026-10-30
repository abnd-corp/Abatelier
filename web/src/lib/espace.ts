// Espace client du site : types des réponses de l'API et petits outils d'affichage.
import type { BillingStatut } from '@/lib/billing'

export interface Compte {
  prenom: string | null
  nom: string | null
  email: string
  telephone: string | null
  type: 'particulier' | 'professionnel'
  /** Statut professionnel validé par l'atelier : seul à donner droit à la remise pro. */
  proVerifie: boolean
  /** Faux pour un espace créé avec Google : la fermeture se confirme alors avec l'adresse e-mail */
  motDePasse: boolean
}

/** « Mes informations » : coordonnées et adresse de facturation du client. */
export interface Profil {
  type: 'particulier' | 'professionnel'
  proVerifie: boolean
  raisonSociale: string | null
  siret: string | null
  tvaIntra: string | null
  prenom: string | null
  nom: string | null
  email: string | null
  telephone: string | null
  adresse: string | null
  codePostal: string | null
  ville: string | null
}

export type EtapeStatut = 'recue' | 'validee' | 'fabrication' | 'prete' | 'livree' | 'annulee'
export type EspaceDocType = 'devis' | 'facture' | 'avoir'

export interface EspaceDocRef {
  id: string
  type?: EspaceDocType
  numero: string
  statut: BillingStatut
}

export interface EspaceOrderSummary {
  id: string
  numero: string
  kind: 'sur_mesure' | 'boutique'
  statut: EtapeStatut
  statutLabel: string
  ttc: number
  createdAt: string
  datePrevue: string | null
  devis: EspaceDocRef | null
  facture: EspaceDocRef | null
}

export interface EspaceDocument {
  id: string
  type: EspaceDocType
  numero: string
  emisLe: string
  echeance: string | null
  ttc: number
  reponse: 'accepte' | 'refuse' | null
  payeLe: string | null
  statut: BillingStatut
}

export interface EspacePaiement {
  statut: 'attente' | 'paye' | 'echec' | 'rembourse'
  montantTtc: number
  paidAt: string | null
  refundedAt: string | null
  refundMotif: string | null
}

export interface EspaceOrder {
  paiement: EspacePaiement | null
  commande: {
    id: string
    numero: string
    kind: 'sur_mesure' | 'boutique'
    statut: EtapeStatut
    statutLabel: string
    createdAt: string
    datePrevue: string | null
    delaiJours: number
    livraison: { mode: 'retrait' | 'livraison'; adresse: string | null; codePostal: string | null; ville: string | null }
    totaux: { brut: number; remisePro: number; complementMinimum: number; livraisonPrix: number; ht: number; tauxTva: number; tva: number; ttc: number }
  }
  etapes: { statut: EtapeStatut; label: string; at: string }[]
  lignes: {
    repere: string | null
    modeleLabel: string
    cap: number
    materialLabel: string
    colorLabel: string
    colorHex: string
    cotes: number[]
    angles: number[]
    longueur: number
    quantite: number
    accessoires: { nom: string; unite: 'piece' | 'paire'; prix: number; quantite: number }[]
    prixUnitaire: number
    total: number
  }[]
  documents: EspaceDocument[]
}

/** Étapes d'une commande menée à terme, dans l'ordre. Une commande annulée sort de ce parcours. */
export const PARCOURS: { statut: EtapeStatut; label: string; aide: string }[] = [
  { statut: 'recue', label: 'Demande reçue', aide: 'Votre demande est enregistrée.' },
  { statut: 'validee', label: 'Commande validée', aide: 'Votre commande est enregistrée, avec une date estimée d’après le délai annoncé.' },
  { statut: 'fabrication', label: 'En fabrication', aide: 'Vos pièces sont en cours de pliage.' },
  { statut: 'prete', label: 'Prête', aide: 'Vos pièces sont prêtes.' },
  { statut: 'livree', label: 'Livrée ou retirée', aide: 'Commande terminée.' },
]

export const documentUrl = (id: string) => `/api/espace/documents/${id}/pdf`

const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
/** « 20 octobre 2026 » à partir d'une date AAAA-MM-JJ ou d'un horodatage. */
export const jour = (d: string) => dayFmt.format(new Date(d.length === 10 ? `${d}T12:00:00` : d))

/** « Jean Dupont », ou l'adresse e-mail si le compte n'a pas de nom. */
export const nomCompte = (c: Compte) => [c.prenom, c.nom].filter(Boolean).join(' ') || c.email

/** Libellé et teinte d'un devis ou d'une facture vus par le client (« envoyé » n'a pas de sens pour lui). */
export function statutDocument(type: EspaceDocType, s: BillingStatut): { label: string; tone: 'ok' | 'warn' | 'accent' | 'neutral' | 'bad' } {
  if (type === 'devis') {
    if (s === 'accepte') return { label: 'Devis accepté', tone: 'ok' }
    if (s === 'refuse') return { label: 'Devis refusé', tone: 'neutral' }
    if (s === 'expire') return { label: 'Devis expiré', tone: 'warn' }
    return { label: 'Devis à valider', tone: 'accent' }
  }
  if (type === 'avoir') return { label: 'Avoir', tone: 'neutral' }
  if (s === 'payee') return { label: 'Facture payée', tone: 'ok' }
  if (s === 'annulee') return { label: 'Facture annulée', tone: 'neutral' }
  if (s === 'en_retard') return { label: 'Facture à régler (en retard)', tone: 'bad' }
  return { label: 'Facture à régler', tone: 'warn' }
}

/** Page où revenir après la connexion : seulement l'espace client ou le configurateur, jamais un autre site. */
export function retourEspace(value: unknown): string {
  if (typeof value !== 'string' || value.startsWith('//') || value.startsWith('/\\')) return '/espace'
  return /^\/(espace|configurateur|boutique|panier)(\/|\?|$)/.test(value) ? value : '/espace'
}

/** Texte de l'étape « reçue » d'une commande payée en ligne : le contrat est déjà formé. */
export const AIDE_RECUE_BOUTIQUE = 'Votre paiement est reçu ; l’atelier vérifie que tout est réalisable.'
