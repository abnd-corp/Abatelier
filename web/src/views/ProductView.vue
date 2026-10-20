<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import { eur, toMoneyField } from '@/lib/catalog'
import { adminImageUrl, type AdminProduitDetail, type AdminVariante } from '@/lib/boutique'
import { resizePhoto } from '@/lib/image'

// Fiche d'un produit de la boutique : description, photo, mise en ligne et déclinaisons avec leur prix
const props = defineProps<{ id: string }>()
const router = useRouter()
const data = ref<AdminProduitDetail | null>(null)
const notFound = ref(false)
const error = ref('')
const info = ref('')

const form = reactive({ nom: '', categorie: '', description: '' })
const errors = reactive<Record<string, string>>({})
const saving = ref(false)

async function load() {
  try {
    const d = await api<AdminProduitDetail>(`/boutique/produits/${props.id}`)
    data.value = d
    Object.assign(form, { nom: d.produit.nom, categorie: d.produit.categorie, description: d.produit.description })
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound.value = true
    else error.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
}
onMounted(load)

const produit = computed(() => data.value?.produit)

async function saveFiche() {
  for (const k of Object.keys(errors)) delete errors[k]
  error.value = ''
  info.value = ''
  saving.value = true
  try {
    await api(`/boutique/produits/${props.id}`, { method: 'PATCH', body: { nom: form.nom, categorie: form.categorie, description: form.description } })
    info.value = 'Fiche enregistrée.'
    await load()
  } catch (e) {
    if (e instanceof ApiError && e.field) errors[e.field] = e.message
    else error.value = e instanceof ApiError ? e.message : 'Enregistrement impossible.'
  } finally {
    saving.value = false
  }
}

// --- Mise en ligne ---
async function setActif(actif: boolean) {
  error.value = ''
  info.value = ''
  try {
    await api(`/boutique/produits/${props.id}`, { method: 'PATCH', body: { actif } })
    info.value = actif ? 'Le produit est en ligne sur le site.' : 'Le produit n’est plus visible sur le site.'
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Modification impossible.'
  }
}

// --- Photo ---
const file = ref<HTMLInputElement | null>(null)
const alt = ref('')
const uploading = ref(false)
async function upload() {
  error.value = ''
  info.value = ''
  const f = file.value?.files?.[0]
  if (!f) {
    error.value = 'Choisissez une photo.'
    return
  }
  uploading.value = true
  try {
    const blob = await resizePhoto(f)
    await api(`/boutique/produits/${props.id}/image?alt=${encodeURIComponent(alt.value || produit.value?.imageAlt || form.nom)}`, { method: 'PUT', raw: blob })
    info.value = 'Photo enregistrée.'
    if (file.value) file.value.value = ''
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Envoi impossible.'
  } finally {
    uploading.value = false
  }
}
async function removeImage() {
  error.value = ''
  try {
    await api(`/boutique/produits/${props.id}/image`, { method: 'DELETE' })
    info.value = 'Photo retirée.'
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Suppression impossible.'
  }
}
async function saveAlt(ev: Event) {
  const value = (ev.target as HTMLInputElement).value.trim()
  if (value === produit.value?.imageAlt) return
  try {
    await api(`/boutique/produits/${props.id}`, { method: 'PATCH', body: { imageAlt: value } })
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Enregistrement impossible.'
  }
}

// --- Déclinaisons ---
const rowErrors = reactive<Record<string, string>>({})
const draft = reactive({ libelle: '', reference: '', prixTtc: '' })
const draftErrors = reactive<Record<string, string>>({})
const adding = ref(false)

async function patchVariant(v: AdminVariante, body: Record<string, unknown>) {
  delete rowErrors[v.id]
  try {
    await api(`/boutique/variantes/${v.id}`, { method: 'PATCH', body })
    await load()
  } catch (e) {
    rowErrors[v.id] = e instanceof ApiError ? e.message : 'Enregistrement impossible.'
    await load()
  }
}
const onText = (v: AdminVariante, key: 'libelle' | 'reference' | 'prixTtc', ev: Event) => {
  const value = (ev.target as HTMLInputElement).value
  if (key === 'prixTtc' ? Number(value.replace(/\s/g, '').replace(',', '.')) === v.prixTtc : value === v[key]) return
  patchVariant(v, { [key]: value })
}
async function removeVariant(v: AdminVariante) {
  delete rowErrors[v.id]
  try {
    await api(`/boutique/variantes/${v.id}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    rowErrors[v.id] = e instanceof ApiError ? e.message : 'Suppression impossible.'
  }
}
async function addVariant() {
  for (const k of Object.keys(draftErrors)) delete draftErrors[k]
  adding.value = true
  try {
    await api(`/boutique/produits/${props.id}/variantes`, { method: 'POST', body: { ...draft } })
    Object.assign(draft, { libelle: '', reference: '', prixTtc: '' })
    await load()
    document.getElementById('v-libelle')?.focus()
  } catch (e) {
    if (e instanceof ApiError && e.field) draftErrors[e.field] = e.message
    else draftErrors.libelle = e instanceof ApiError ? e.message : 'Ajout impossible.'
    document.getElementById(`v-${e instanceof ApiError && e.field ? e.field : 'libelle'}`)?.focus()
  } finally {
    adding.value = false
  }
}

// --- Suppression ---
const confirmDelete = ref(false)
async function remove() {
  try {
    await api(`/boutique/produits/${props.id}`, { method: 'DELETE' })
    await router.replace({ name: 'products' })
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Suppression impossible.'
  }
}
</script>

<template>
  <p v-if="notFound" class="alert bad" role="alert">Ce produit n’existe pas (ou plus). <RouterLink :to="{ name: 'products' }">Retour à la boutique</RouterLink></p>
  <p v-else-if="!data || !produit" class="muted" aria-busy="true">Chargement…</p>
  <template v-else>
    <div class="page-head">
      <div>
        <span class="eyebrow">Boutique</span>
        <h1>{{ produit.nom }}</h1>
      </div>
      <div class="head-actions">
        <span class="pill" :class="produit.actif ? 'ok' : 'neutral'">{{ produit.actif ? 'En ligne' : 'Hors ligne' }}</span>
        <button v-if="!produit.actif" class="btn primary" type="button" @click="setActif(true)">Mettre en ligne</button>
        <button v-else class="btn" type="button" @click="setActif(false)">Retirer du site</button>
      </div>
    </div>

    <p v-if="error" class="alert bad" role="alert">{{ error }}</p>
    <p v-if="info" class="alert ok" role="status">{{ info }}</p>

    <div class="grid">
      <form class="card box" novalidate @submit.prevent="saveFiche">
        <h2>Fiche produit</h2>
        <div class="field">
          <label for="f-nom">Nom *</label>
          <input id="f-nom" v-model="form.nom" class="input" :class="{ invalid: errors.nom }" maxlength="120" :aria-invalid="!!errors.nom" :aria-describedby="errors.nom ? 'f-nom-e' : undefined" />
          <span v-if="errors.nom" id="f-nom-e" class="field-error">{{ errors.nom }}</span>
        </div>
        <div class="field">
          <label for="f-categorie">Catégorie</label>
          <input id="f-categorie" v-model="form.categorie" class="input" maxlength="60" placeholder="Couvertine, bavette, bandeau, accessoire…" list="categories" />
          <datalist id="categories"><option>Couvertine</option><option>Bavette</option><option>Bandeau</option><option>Accessoire</option></datalist>
        </div>
        <div class="field">
          <label for="f-description">Description affichée sur le site</label>
          <textarea id="f-description" v-model="form.description" class="input" rows="7" maxlength="4000" :class="{ invalid: errors.description }" placeholder="Matière, usage, ce qui est fourni, conseils de pose…" />
          <span v-if="errors.description" class="field-error">{{ errors.description }}</span>
        </div>
        <p><button class="btn primary" type="submit" :disabled="saving">{{ saving ? 'Enregistrement…' : 'Enregistrer la fiche' }}</button></p>
      </form>

      <section class="card box" aria-labelledby="photo">
        <h2 id="photo">Photo</h2>
        <div class="preview">
          <img v-if="produit.hasImage" :src="adminImageUrl(produit.id, produit.version)" :alt="produit.imageAlt || produit.nom" />
          <div v-else class="empty-photo"><AppIcon name="profile" :size="56" /><span>Insérez une photo</span></div>
        </div>
        <div class="field">
          <label for="p-file">{{ produit.hasImage ? 'Remplacer la photo' : 'Ajouter une photo' }}</label>
          <input id="p-file" ref="file" type="file" class="input" accept="image/png,image/jpeg" />
          <span class="muted hint">JPEG ou PNG, réduite automatiquement. 200 × 200 pixels minimum.</span>
        </div>
        <div v-if="!produit.hasImage" class="field">
          <label for="p-alt">Description de la photo (pour les malvoyants et Google)</label>
          <input id="p-alt" v-model="alt" class="input" maxlength="160" placeholder="Ex. : Couvertine blanche posée sur un muret" />
        </div>
        <div class="actions">
          <button class="btn primary" type="button" :disabled="uploading" @click="upload">{{ uploading ? 'Envoi…' : 'Envoyer la photo' }}</button>
          <button v-if="produit.hasImage" class="btn" type="button" @click="removeImage">Retirer la photo</button>
        </div>
        <div v-if="produit.hasImage" class="field">
          <label for="p-alt2">Description de la photo</label>
          <input id="p-alt2" class="input" :value="produit.imageAlt" maxlength="160" @change="saveAlt" />
        </div>
      </section>
    </div>

    <section class="card box" aria-labelledby="variantes">
      <h2 id="variantes">Déclinaisons et prix</h2>
      <p class="muted hint">Une déclinaison est une version du produit avec son prix : une taille, un coloris, une épaisseur… Le prix est celui que voit le client, TVA {{ data.tva.toLocaleString('fr-FR') }} % comprise.</p>
      <div class="table-wrap">
        <table class="table">
          <caption class="sr-only">Déclinaisons du produit</caption>
          <thead>
            <tr>
              <th>Libellé</th>
              <th>Référence</th>
              <th class="n">Prix TTC</th>
              <th>En vente</th>
              <th><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in data.variantes" :key="v.id">
              <td><input :aria-label="`Libellé de ${v.libelle}`" class="input compact wide" :value="v.libelle" maxlength="120" @change="onText(v, 'libelle', $event)" /></td>
              <td><input :aria-label="`Référence de ${v.libelle}`" class="input compact" :value="v.reference" maxlength="60" @change="onText(v, 'reference', $event)" /></td>
              <td class="n">
                <input :aria-label="`Prix TTC de ${v.libelle}`" class="input compact price" inputmode="decimal" :value="toMoneyField(v.prixTtc)" @change="onText(v, 'prixTtc', $event)" />
                <span class="sub">{{ eur(v.prixHt) }} HT</span>
              </td>
              <td><label class="check"><input type="checkbox" :checked="v.actif" :aria-label="`${v.libelle} en vente`" @change="patchVariant(v, { actif: ($event.target as HTMLInputElement).checked })" /><span>{{ v.actif ? 'Oui' : 'Non' }}</span></label></td>
              <td><button class="btn small danger" type="button" :aria-label="`Supprimer la déclinaison ${v.libelle}`" @click="removeVariant(v)"><AppIcon name="trash" :size="14" /></button></td>
            </tr>
            <tr v-for="(msg, key) in rowErrors" :key="key">
              <td colspan="5" class="field-error" role="alert">{{ msg }}</td>
            </tr>
            <tr v-if="!data.variantes.length">
              <td colspan="5" class="muted">Aucune déclinaison : ajoutez la première ci-dessous. Sans elle, le produit ne peut pas être mis en ligne.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <form class="add" novalidate @submit.prevent="addVariant">
        <div class="field">
          <label for="v-libelle">Libellé *</label>
          <input id="v-libelle" v-model="draft.libelle" class="input" :class="{ invalid: draftErrors.libelle }" maxlength="120" placeholder="320 mm · 1 mm · 3 m" :aria-invalid="!!draftErrors.libelle" :aria-describedby="draftErrors.libelle ? 'v-libelle-e' : undefined" />
          <span v-if="draftErrors.libelle" id="v-libelle-e" class="field-error">{{ draftErrors.libelle }}</span>
        </div>
        <div class="field">
          <label for="v-reference">Référence</label>
          <input id="v-reference" v-model="draft.reference" class="input" maxlength="60" />
        </div>
        <div class="field">
          <label for="v-prixTtc">Prix TTC (€) *</label>
          <input id="v-prixTtc" v-model="draft.prixTtc" class="input" inputmode="decimal" :class="{ invalid: draftErrors.prixTtc }" placeholder="84,00" :aria-invalid="!!draftErrors.prixTtc" :aria-describedby="draftErrors.prixTtc ? 'v-prix-e' : undefined" />
          <span v-if="draftErrors.prixTtc" id="v-prix-e" class="field-error">{{ draftErrors.prixTtc }}</span>
        </div>
        <button class="btn primary" type="submit" :disabled="adding"><AppIcon name="plus" :size="16" /> Ajouter</button>
      </form>
    </section>

    <section class="card box danger-zone" aria-labelledby="suppr">
      <h2 id="suppr">Supprimer le produit</h2>
      <p class="muted">Pour le cacher sans le perdre, utilisez « Retirer du site ». La suppression efface la fiche, la photo et les déclinaisons ; les commandes déjà passées gardent leur détail.</p>
      <p v-if="!confirmDelete"><button class="btn danger" type="button" @click="confirmDelete = true">Supprimer ce produit</button></p>
      <p v-else class="actions">
        <button class="btn danger" type="button" @click="remove">Oui, supprimer définitivement</button>
        <button class="btn" type="button" @click="confirmDelete = false">Garder</button>
      </p>
    </section>
  </template>
</template>

<style scoped>
.page-head {
  margin-bottom: 16px;
}
.head-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  margin-bottom: 16px;
}
.box {
  padding: 20px 22px;
  display: grid;
  gap: 14px;
  margin-bottom: 16px;
}
.grid .box {
  margin-bottom: 0;
}
.box h2,
.box p {
  margin: 0;
}
.hint {
  font-size: 0.86rem;
}
.preview {
  aspect-ratio: 4 / 3;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  display: grid;
  place-items: center;
}
.preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.empty-photo {
  display: grid;
  justify-items: center;
  gap: 8px;
  color: var(--accent);
}
.empty-photo span {
  color: var(--muted);
  font-size: 0.9rem;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.table .input.wide {
  min-width: 14em;
}
.table .price {
  width: 7em;
  text-align: right;
}
.check {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.add {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
}
.danger-zone {
  border-color: var(--line);
}
.alert {
  margin-bottom: 12px;
}
@media (max-width: 900px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .add {
    grid-template-columns: minmax(0, 1fr);
  }
  .add .btn {
    justify-self: start;
  }
}
</style>
