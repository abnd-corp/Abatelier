export interface AuditEntry {
  id: number
  at: string
  action: string
  identifiant: string | null
  nom: string | null
  userId: string | null
  targetType: string | null
  targetId: string | null
  targetName: string | null
  ip: string | null
  device: string
  details: Record<string, unknown> | null
}

export type Tone = 'neutral' | 'bad' | 'accent'

const ROLE: Record<string, string> = { admin: 'administrateur', atelier: 'atelier' }

/** Phrase lisible et couleur pour une ligne du journal. Les futures actions métier s'ajoutent ici. */
export function describe(e: AuditEntry): { text: string; tone: Tone } {
  const d = (e.details ?? {}) as Record<string, any>
  const cible = e.targetName ?? d.nom ?? d.identifiant ?? 'un compte'
  switch (e.action) {
    case 'login.success':
      return { text: d.remember ? 'Connexion (rester connecté)' : 'Connexion', tone: 'neutral' }
    case 'login.failed':
      return { text: e.userId ? 'Mot de passe incorrect' : `Échec de connexion avec l’identifiant « ${e.identifiant} »`, tone: 'bad' }
    case 'login.locked':
      return { text: `Connexion bloquée après trop d’essais (« ${e.identifiant} »)`, tone: 'bad' }
    case 'login.disabled':
      return { text: 'Tentative de connexion sur un compte désactivé', tone: 'bad' }
    case 'logout':
      return { text: 'Déconnexion', tone: 'neutral' }
    case 'password.changed':
      return { text: d.autresSessionsFermees ? `A changé son mot de passe (${d.autresSessionsFermees} autre(s) appareil(s) déconnecté(s))` : 'A changé son mot de passe', tone: 'accent' }
    case 'password.change_failed':
      return { text: 'Mot de passe actuel incorrect lors d’un changement', tone: 'bad' }
    case 'session.revoked':
      return { text: `A déconnecté un appareil (${d.appareil ?? 'inconnu'})`, tone: 'neutral' }
    case 'session.revoked_all':
      return { text: `A déconnecté ses autres appareils (${d.nombre})`, tone: 'neutral' }
    case 'user.created':
      return { text: `A créé le compte de ${d.nom} (${ROLE[d.role] ?? d.role})`, tone: 'accent' }
    case 'user.updated': {
      const parts = []
      if (d.role) parts.push(`rôle ${ROLE[d.role.avant] ?? d.role.avant} → ${ROLE[d.role.apres] ?? d.role.apres}`)
      if (d.nom) parts.push(`nom « ${d.nom.avant} » → « ${d.nom.apres} »`)
      return { text: `A modifié le compte de ${cible} : ${parts.join(', ')}`, tone: 'accent' }
    }
    case 'user.disabled':
      if (d.raison === 'date de sortie') return { text: `Compte de ${cible} désactivé automatiquement : date de sortie atteinte`, tone: 'bad' }
      return { text: `A désactivé le compte de ${cible}`, tone: 'bad' }
    case 'employee.created':
      return { text: `A ajouté ${d.nom} à l’équipe${d.compte ? ' avec un compte de connexion' : ''}`, tone: 'accent' }
    case 'employee.updated':
      return { text: `A modifié la fiche de ${d.nom ?? cible} (${(d.champs ?? []).join(', ')})`, tone: 'neutral' }
    case 'user.enabled':
      return { text: `A réactivé le compte de ${cible}`, tone: 'accent' }
    case 'user.password_reset':
      return { text: `A réinitialisé le mot de passe de ${cible}`, tone: 'accent' }
    default:
      return { text: e.action, tone: 'neutral' }
  }
}
