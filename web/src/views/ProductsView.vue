<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import { eur } from '@/lib/catalog'
import { adminImageUrl, type AdminProduit } from '@/lib/boutique'

// Gestion de la boutique : la liste des produits, avec leur mise en ligne
const router = useRouter()
const produits = ref<AdminProduit[]>([])
const loading = ref(true)
const error = ref('')
const nom = ref('')
const creating = ref(false)
const nomError = ref('')

async function load() {
  try {
    produits.value = (await api<{ produits: AdminProduit[] }>('/boutique/produits')).produits
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

const enLigne = computed(() => produits.value.filter((p) => p.actif).length)

// Recherche et filtre par catégorie
const q = ref('')
const categorie = ref('')
const categories = computed(() => [...new Set(produits.value.map((p) => p.categorie).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')))
const visibles = computed(() => {
  const mot = q.value.trim().toLowerCase()
  return produits.value.filter((p) => (!categorie.value || p.categorie === categorie.value) && (!mot || p.nom.toLowerCase().includes(mot)))
})

// Sélection pour agir sur plusieurs produits à la fois
const choisis = ref<string[]>([])
const tousChoisis = computed(() => visibles.value.length > 0 && visibles.value.every((p) => choisis.value.includes(p.id)))
const toggleTous = () => (choisis.value = tousChoisis.value ? choisis.value.filter((id) => !visibles.value.some((p) => p.id === id)) : [...new Set([...choisis.value, ...visibles.value.map((p) => p.id)])])
const confirmSuppr = ref(false)
const notice = ref('')
async function lot(action: 'mettre_en_ligne' | 'retirer' | 'supprimer') {
  error.value = ''
  notice.value = ''
  try {
    const { produits: n } = await api<{ produits: number }>('/boutique/produits/lot', { method: 'POST', body: { ids: choisis.value, action } })
    notice.value = `${n} produit${n > 1 ? 's' : ''} ${action === 'mettre_en_ligne' ? 'mis en ligne' : action === 'retirer' ? 'retiré' + (n > 1 ? 's' : '') + ' du site' : 'supprimé' + (n > 1 ? 's' : '')}.`
    choisis.value = []
    confirmSuppr.value = false
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Action impossible.'
  }
}

// Import d'un catalogue (fichier JSON de l'ancienne boutique)
const importing = ref(false)
async function importer(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  error.value = ''
  notice.value = ''
  importing.value = true
  try {
    const body = JSON.parse(await file.text())
    const r = await api<{ produitsCrees: number; produitsExistants: number; variantesCreees: number; variantesMisesAJour: number; ignorees: number }>('/boutique/import', { method: 'POST', body: { produits: Array.isArray(body) ? body : body.produits } })
    notice.value = `Import terminé : ${r.produitsCrees} produit${r.produitsCrees > 1 ? 's' : ''} créé${r.produitsCrees > 1 ? 's' : ''} (cachés du site), ${r.produitsExistants} déjà présent${r.produitsExistants > 1 ? 's' : ''}, ${r.variantesCreees} déclinaison${r.variantesCreees > 1 ? 's' : ''} ajoutée${r.variantesCreees > 1 ? 's' : ''}, ${r.variantesMisesAJour} prix mis à jour, ${r.ignorees} ignorée${r.ignorees > 1 ? 's' : ''} (indisponibles ou à 0 €).`
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Fichier illisible : choisissez le catalogue au format JSON.'
  } finally {
    importing.value = false
    input.value = ''
  }
}

async function create() {
  nomError.value = ''
  creating.value = true
  try {
    const { id } = await api<{ id: string }>('/boutique/produits', { method: 'POST', body: { nom: nom.value } })
    await router.push({ name: 'product', params: { id } })
  } catch (e) {
    nomError.value = e instanceof ApiError ? e.message : 'Création impossible.'
    document.getElementById('prod-nom')?.focus()
  } finally {
    creating.value = false
  }
}

async function toggle(p: AdminProduit) {
  error.value = ''
  try {
    await api(`/boutique/produits/${p.id}`, { method: 'PATCH', body: { actif: !p.actif } })
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? `${p.nom} : ${e.message}` : 'Modification impossible.'
  }
}
</script>

<template>
  <div class="page-head">
    <div>
      <span class="eyebrow">Direction</span>
      <h1>Boutique</h1>
    </div>
  </div>

  <section class="card new">
    <form class="row" novalidate @submit.prevent="create">
      <div class="field">
        <label for="prod-nom">Nouveau produit</label>
        <input id="prod-nom" v-model="nom" class="input" :class="{ invalid: nomError }" maxlength="120" placeholder="Ex. : Couvertine blanche RAL 9010" autocomplete="off" :aria-invalid="!!nomError" :aria-describedby="nomError ? 'prod-nom-e' : undefined" />
        <span v-if="nomError" id="prod-nom-e" class="field-error">{{ nomError }}</span>
      </div>
      <button class="btn primary" type="submit" :disabled="creating"><AppIcon name="plus" :size="16" /> Créer le produit</button>
    </form>
    <p class="muted hint">Un nouveau produit reste caché du site tant que vous ne l’avez pas mis en ligne : ajoutez d’abord sa description, sa photo et ses déclinaisons avec leurs prix.</p>
    <div class="import">
      <label class="btn small" :class="{ off: importing }" for="prod-import"><AppIcon name="upload" :size="15" /> {{ importing ? 'Import en cours…' : 'Importer un catalogue (JSON)' }}</label>
      <input id="prod-import" class="sr-only" type="file" accept="application/json,.json" :disabled="importing" @change="importer" />
      <span class="muted hint">Les produits importés restent cachés du site ; un produit déjà présent garde sa fiche et reçoit les nouveaux prix.</span>
    </div>
  </section>

  <section class="card">
    <p v-if="error" class="alert bad" role="alert">{{ error }}</p>
    <p v-if="notice" class="alert ok" role="status">{{ notice }}</p>
    <div v-if="produits.length" class="filters">
      <div class="field">
        <label for="prod-q">Rechercher</label>
        <input id="prod-q" v-model="q" class="input" type="search" placeholder="Nom du produit" autocomplete="off" />
      </div>
      <div v-if="categories.length" class="chips" role="group" aria-label="Catégories">
        <button type="button" class="chip" :aria-pressed="!categorie" @click="categorie = ''">Toutes</button>
        <button v-for="c in categories" :key="c" type="button" class="chip" :aria-pressed="categorie === c" @click="categorie = c">{{ c }}</button>
      </div>
    </div>
    <div v-if="choisis.length" class="bulk" role="group" aria-label="Actions sur les produits choisis">
      <b>{{ choisis.length }} produit{{ choisis.length > 1 ? 's' : '' }} choisi{{ choisis.length > 1 ? 's' : '' }}</b>
      <button class="btn small" type="button" @click="lot('mettre_en_ligne')">Mettre en ligne</button>
      <button class="btn small" type="button" @click="lot('retirer')">Retirer du site</button>
      <button v-if="!confirmSuppr" class="btn small danger" type="button" @click="confirmSuppr = true">Supprimer…</button>
      <template v-else>
        <button class="btn small danger" type="button" @click="lot('supprimer')">Confirmer la suppression</button>
        <button class="btn small" type="button" @click="confirmSuppr = false">Garder</button>
      </template>
    </div>
    <div v-if="!loading && !produits.length && !error" class="empty">
      <AppIcon name="box" :size="32" class="muted" />
      <p><b>Aucun produit pour l’instant.</b></p>
      <p class="muted">Créez votre premier produit ci-dessus : il apparaîtra dans la boutique du site dès que vous le mettrez en ligne.</p>
    </div>
    <div v-else class="table-wrap">
      <table class="table fits-sm" :aria-busy="loading">
        <caption class="sr-only">Produits de la boutique</caption>
        <thead>
          <tr>
            <th class="check"><input type="checkbox" :checked="tousChoisis" aria-label="Choisir tous les produits affichés" @change="toggleTous" /></th>
            <th>Produit</th>
            <th class="hide-sm">Déclinaisons</th>
            <th class="hide-sm n">À partir de</th>
            <th>Sur le site</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in visibles" :key="p.id" class="click" @click="router.push({ name: 'product', params: { id: p.id } })">
            <td class="check" @click.stop><input v-model="choisis" type="checkbox" :value="p.id" :aria-label="`Choisir ${p.nom}`" /></td>
            <td>
              <span class="who">
                <span class="thumb">
                  <img v-if="p.hasImage" :src="adminImageUrl(p.id, p.version)" alt="" loading="lazy" />
                  <span v-else class="ph">Insérez une photo</span>
                </span>
                <span>
                  <RouterLink :to="{ name: 'product', params: { id: p.id } }" class="name" @click.stop>{{ p.nom }}</RouterLink>
                  <span class="sub">{{ p.categorie || 'Sans catégorie' }}</span>
                </span>
              </span>
            </td>
            <td class="hide-sm">{{ p.actives }} en vente<span v-if="p.variantes > p.actives" class="sub">{{ p.variantes - p.actives }} retirée{{ p.variantes - p.actives > 1 ? 's' : '' }}</span></td>
            <td class="hide-sm n">{{ p.prixMinTtc === null ? '—' : `${eur(p.prixMinTtc)} TTC` }}</td>
            <td @click.stop>
              <span class="state">
                <span class="pill" :class="p.actif ? 'ok' : 'neutral'">{{ p.actif ? 'En ligne' : 'Hors ligne' }}</span>
                <button class="btn small" type="button" :aria-label="`${p.actif ? 'Retirer du site' : 'Mettre en ligne'} : ${p.nom}`" @click="toggle(p)">{{ p.actif ? 'Retirer' : 'Mettre en ligne' }}</button>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="produits.length && !visibles.length" class="muted foot">Aucun produit ne correspond.</p>
    <p v-if="produits.length" class="muted foot">{{ enLigne }} produit{{ enLigne > 1 ? 's' : '' }} en ligne sur {{ produits.length }}<template v-if="visibles.length !== produits.length"> · {{ visibles.length }} affiché{{ visibles.length > 1 ? 's' : '' }}</template>.</p>
  </section>
</template>

<style scoped>
.page-head {
  margin-bottom: 16px;
}
.card {
  margin-bottom: 16px;
}
.new {
  padding: 18px 20px;
  display: grid;
  gap: 10px;
}
.row {
  display: flex;
  gap: 12px;
  align-items: end;
  flex-wrap: wrap;
}
.row .field {
  flex: 1 1 320px;
}
.hint {
  font-size: 0.86rem;
}
.import {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.import label {
  cursor: pointer;
}
.import label.off {
  opacity: 0.6;
  pointer-events: none;
}
.import input:focus-visible + .hint,
.import label:has(+ input:focus-visible) {
  outline: 2px solid var(--accent);
}
.filters {
  display: flex;
  gap: 12px 18px;
  align-items: end;
  flex-wrap: wrap;
  padding: 12px 16px 0;
}
.filters .field {
  flex: 0 1 280px;
}
.bulk {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin: 12px 16px 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--accent-soft);
}
.check {
  width: 36px;
}
.btn.danger {
  color: var(--bad);
  border-color: var(--bad);
}
.who {
  display: flex;
  gap: 12px;
  align-items: center;
}
.name {
  font-weight: 600;
  color: var(--ink);
  text-decoration: none;
}
.thumb {
  width: 64px;
  height: 48px;
  flex: none;
  border-radius: 6px;
  overflow: hidden;
  background: var(--surface-2);
  border: 1px solid var(--line);
  display: grid;
  place-items: center;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ph {
  font-size: 0.64rem;
  line-height: 1.15;
  text-align: center;
  color: var(--muted);
  padding: 2px 4px;
}
.state {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.click {
  cursor: pointer;
}
.click:hover td {
  background: var(--surface-2);
}
.empty {
  padding: 36px 20px;
  display: grid;
  justify-items: center;
  gap: 8px;
  text-align: center;
}
.foot {
  padding: 12px 16px;
  margin: 0;
  font-size: 0.86rem;
}
.alert {
  margin: 12px;
}
</style>
