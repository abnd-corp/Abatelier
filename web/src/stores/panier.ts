import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { QUANTITE_MAX, type PanierLigne } from '@/lib/boutique'

// Panier de la boutique, gardé dans le navigateur (stockage local, pas un cookie) : rien n'est envoyé au serveur
// avant le paiement. Le prix n'est jamais gardé ici, seulement la déclinaison et la quantité.
const KEY = 'aps-panier'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function read(): PanierLigne[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((l) => l && typeof l.variantId === 'string' && UUID.test(l.variantId) && Number.isInteger(l.quantite) && l.quantite >= 1)
      .map((l) => ({ variantId: l.variantId as string, quantite: Math.min(l.quantite as number, QUANTITE_MAX) }))
      .slice(0, 30)
  } catch {
    // stockage indisponible ou contenu abîmé : panier vide
    return []
  }
}

export const usePanierStore = defineStore('panier', () => {
  const lignes = ref<PanierLigne[]>(read())
  const count = computed(() => lignes.value.reduce((s, l) => s + l.quantite, 0))

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(lignes.value))
    } catch {
      // navigation privée : le panier tient pour cette visite seulement
    }
  }

  function add(variantId: string, quantite = 1) {
    const l = lignes.value.find((x) => x.variantId === variantId)
    if (l) l.quantite = Math.min(l.quantite + quantite, QUANTITE_MAX)
    else lignes.value.push({ variantId, quantite: Math.min(quantite, QUANTITE_MAX) })
    save()
  }
  function setQuantite(variantId: string, quantite: number) {
    const l = lignes.value.find((x) => x.variantId === variantId)
    if (!l) return
    if (!Number.isFinite(quantite) || quantite < 1) l.quantite = 1
    else l.quantite = Math.min(Math.floor(quantite), QUANTITE_MAX)
    save()
  }
  function remove(variantId: string) {
    lignes.value = lignes.value.filter((x) => x.variantId !== variantId)
    save()
  }
  function clear() {
    lignes.value = []
    save()
  }

  return { lignes, count, add, setQuantite, remove, clear }
})
