import type { Role } from '@/stores/auth'

export type Contrat = 'cdi' | 'cdd' | 'apprentissage' | 'interim' | 'stage'

export const CONTRAT_LABELS: Record<Contrat, string> = {
  cdi: 'CDI',
  cdd: 'CDD',
  apprentissage: 'Apprentissage',
  interim: 'Intérim',
  stage: 'Stage',
}

export interface EmployeeAccount {
  id: string
  identifiant: string
  role: Role
  disabledAt: string | null
  mustChangePassword: boolean
  lastLoginAt: string | null
  activeSessions?: number
}

export interface EmployeeFields {
  prenom: string
  nom: string
  poste: string | null
  contrat: Contrat | null
  dateEntree: string | null
  dateSortie: string | null
  telephone: string | null
  email: string | null
  notes: string | null
}

export interface Employee extends EmployeeFields {
  id: string
  account: EmployeeAccount | null
}

export const fullName = (e: Pick<EmployeeFields, 'prenom' | 'nom'>) => `${e.prenom} ${e.nom}`

/** Date du jour à l'heure de Paris (AAAA-MM-JJ), comme côté serveur. */
export const todayParis = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
/** « 2024-03-01 » → « 1er mars 2024 », « 2024-03-12 » → « 12 mars 2024 » */
export const formatDay = (d: string | null) => (d ? dateFmt.format(new Date(`${d}T00:00:00Z`)).replace(/^1 /, '1er ') : '—')

export type Tone = 'ok' | 'warn' | 'neutral'

/** Situation du salarié à aujourd'hui. */
export function employmentStatus(e: Pick<EmployeeFields, 'dateSortie'>, today = todayParis()): { label: string; tone: Tone } {
  if (!e.dateSortie) return { label: 'En poste', tone: 'ok' }
  if (e.dateSortie > today) return { label: `Départ prévu le ${formatDay(e.dateSortie)}`, tone: 'warn' }
  return { label: `Parti le ${formatDay(e.dateSortie)}`, tone: 'neutral' }
}

export function accountStatus(a: EmployeeAccount | null): { label: string; tone: Tone } {
  if (!a) return { label: 'Pas de compte', tone: 'neutral' }
  if (a.disabledAt) return { label: 'Désactivé', tone: 'neutral' }
  if (a.mustChangePassword) return { label: 'Mot de passe à changer', tone: 'warn' }
  return { label: 'Actif', tone: 'ok' }
}

/** Identifiant proposé à partir du prénom : « Léa-Marie » → « lea-marie ». */
export function suggestIdentifiant(prenom: string, nom = '') {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
  const base = clean(prenom)
  if (base.length >= 3) return base
  const withNom = clean(`${prenom}.${nom}`)
  return withNom.length >= 3 ? withNom : base
}

export const emptyFields = (): EmployeeFields => ({
  prenom: '',
  nom: '',
  poste: '',
  contrat: null,
  dateEntree: '',
  dateSortie: '',
  telephone: '',
  email: '',
  notes: '',
})
