// Export pour le comptable : fichiers CSV que Excel ouvre directement en français
// (séparateur « ; », virgule décimale, accents corrects grâce au BOM UTF-8).

const BOM = '﻿'

/** Valeur texte : entre guillemets si besoin, et neutralisée si un tableur la prendrait pour une formule (=, +, -, @). */
export function csvText(v: string | null | undefined) {
  let s = (v ?? '').replace(/\r?\n/g, ' ').trim()
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[";]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** 1234.5 → « 1234,50 » (pas de séparateur de milliers : plus sûr à l'import). */
export const csvAmount = (n: number) => n.toFixed(2).replace('.', ',')

/** 2026-10-20 → « 20/10/2026 » */
export const csvDay = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('/') : '')

const parisDay = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' })
export const csvDate = (d: Date) => parisDay.format(d)

/** Assemble les lignes (déjà mises en forme) en fichier CSV. */
export function toCsv(header: string[], rows: string[][]) {
  return BOM + [header, ...rows].map((r) => r.join(';')).join('\r\n') + '\r\n'
}

export const PAIEMENT_LABELS: Record<string, string> = { virement: 'Virement', cheque: 'Chèque', carte: 'Carte bancaire', especes: 'Espèces' }

export const STATUT_LABELS_CSV: Record<string, string> = {
  emise: 'Émise',
  envoyee: 'Envoyée',
  en_retard: 'En retard',
  payee: 'Payée',
  annulee: 'Annulée par un avoir',
  emis: 'Émis',
}
