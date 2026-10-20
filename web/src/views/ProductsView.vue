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
  </section>

  <section class="card">
    <p v-if="error" class="alert bad" role="alert">{{ error }}</p>
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
            <th>Produit</th>
            <th class="hide-sm">Déclinaisons</th>
            <th class="hide-sm n">À partir de</th>
            <th>Sur le site</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in produits" :key="p.id" class="click" @click="router.push({ name: 'product', params: { id: p.id } })">
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
    <p v-if="produits.length" class="muted foot">{{ enLigne }} produit{{ enLigne > 1 ? 's' : '' }} en ligne sur {{ produits.length }}.</p>
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
