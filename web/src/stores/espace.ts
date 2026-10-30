import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api'
import type { Compte, Profil } from '@/lib/espace'

// Compte du client connecté à l'espace client du site. Sans lien avec la session de l'atelier (autre cookie, autre API).
export const useEspaceStore = defineStore('espace', () => {
  const compte = ref<Compte | null>(null)
  const loaded = ref(false)
  // Connexion avec Google proposée (configurée côté serveur)
  const google = ref(false)
  const isLoggedIn = computed(() => compte.value !== null)

  /** Vérifie une seule fois si le visiteur a déjà une session. À n'appeler que sur les pages qui en ont besoin. */
  async function ensureLoaded() {
    // Compte déjà connu (connexion ou création à l'instant) : rien à vérifier
    if (loaded.value || compte.value) {
      loaded.value = true
      return
    }
    try {
      const r = await api<{ compte: Compte | null; google?: boolean }>('/espace/session')
      compte.value = r.compte
      google.value = r.google === true
    } catch {
      compte.value = null
    }
    loaded.value = true
  }

  async function inscrire(body: Record<string, unknown>) {
    compte.value = (await api<{ compte: Compte }>('/espace/inscription', { method: 'POST', body })).compte
    loaded.value = true
  }

  async function connecter(email: string, password: string, remember: boolean) {
    compte.value = (await api<{ compte: Compte }>('/espace/connexion', { method: 'POST', body: { email, password, remember } })).compte
    loaded.value = true
  }

  /** Active l'espace d'une fiche existante avec le lien reçu par e-mail : le client choisit son mot de passe et se retrouve connecté. */
  async function activer(jeton: string, password: string) {
    compte.value = (await api<{ compte: Compte }>('/espace/activation', { method: 'POST', body: { jeton, password } })).compte
    loaded.value = true
  }

  /** Dernière étape de l'inscription avec Google : particulier ou professionnel, puis l'espace est créé. */
  async function inscrireGoogle(body: Record<string, unknown>) {
    compte.value = (await api<{ compte: Compte }>('/espace/google/inscription', { method: 'POST', body })).compte
    loaded.value = true
  }

  async function deconnecter() {
    await api('/espace/deconnexion', { method: 'POST' }).catch(() => {})
    compte.value = null
  }

  /** Ferme l'espace : la fiche est anonymisée côté serveur, la session s'arrête. */
  async function fermer(password: string) {
    await api('/espace/compte/fermeture', { method: 'POST', body: { password } })
    compte.value = null
  }

  /** Enregistre « Mes informations » et met à jour le compte affiché (nom, type, statut pro). */
  async function modifierProfil(body: Record<string, unknown>) {
    const { profil } = await api<{ profil: Profil }>('/espace/profil', { method: 'PATCH', body })
    if (compte.value) compte.value = { ...compte.value, prenom: profil.prenom, nom: profil.nom, telephone: profil.telephone, type: profil.type, proVerifie: profil.proVerifie }
    return profil
  }

  /** Session expirée côté serveur : on oublie le compte sans appeler l'API. */
  function forget() {
    compte.value = null
  }

  return { compte, loaded, google, inscrireGoogle, isLoggedIn, ensureLoaded, inscrire, connecter, activer, deconnecter, fermer, modifierProfil, forget }
})
