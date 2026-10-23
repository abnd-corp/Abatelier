import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface TempPassword {
  // Page sur laquelle afficher le mot de passe (évite de le montrer ailleurs par erreur)
  for: string
  nom: string
  identifiant: string
  password: string
}

export const useUiStore = defineStore('ui', () => {
  // Dernier élément du fil d'Ariane (ex. le nom du salarié), valable pour une seule page
  const crumb = ref<{ for: string; label: string } | null>(null)
  // Mot de passe temporaire à montrer une seule fois après une création de compte
  const tempPassword = ref<TempPassword | null>(null)
  return { crumb, tempPassword }
})
