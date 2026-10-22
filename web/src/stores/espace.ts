import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api'
import type { Compte } from '@/lib/espace'

// Compte du client connecté à l'espace client du site. Sans lien avec la session de l'atelier (autre cookie, autre API).
export const useEspaceStore = defineStore('espace', () => {
  const compte = ref<Compte | null>(null)
  const loaded = ref(false)
  const isLoggedIn = computed(() => compte.value !== null)

  /** Vérifie une seule fois si le visiteur a déjà une session. À n'appeler que sur les pages qui en ont besoin. */
  async function ensureLoaded() {
    // Compte déjà connu (connexion ou création à l'instant) : rien à vérifier
    if (loaded.value || compte.value) {
      loaded.value = true
      return
    }
    try {
      compte.value = (await api<{ compte: Compte | null }>('/espace/session')).compte
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

  async function deconnecter() {
    await api('/espace/deconnexion', { method: 'POST' }).catch(() => {})
    compte.value = null
  }

  /** Ferme l'espace : la fiche est anonymisée côté serveur, la session s'arrête. */
  async function fermer(password: string) {
    await api('/espace/compte/fermeture', { method: 'POST', body: { password } })
    compte.value = null
  }

  /** Session expirée côté serveur : on oublie le compte sans appeler l'API. */
  function forget() {
    compte.value = null
  }

  return { compte, loaded, isLoggedIn, ensureLoaded, inscrire, connecter, deconnecter, fermer, forget }
})
