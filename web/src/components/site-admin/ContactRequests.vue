<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import { eur } from '@/lib/catalog'
import AppIcon from '@/components/AppIcon.vue'
import { dateTime } from '@/lib/format'
import type { Demande } from '@/lib/site-admin'

const emit = defineEmits<{ count: [n: number] }>()
const router = useRouter()

type Filtre = 'a_traiter' | 'traitees' | 'toutes'
const filtre = ref<Filtre>('a_traiter')
const demandes = ref<Demande[]>([])
const aTraiter = ref(0)
const loading = ref(true)
const error = ref('')
const openId = ref<string | null>(null)
const busy = ref<string | null>(null)
const confirmDelete = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api<{ demandes: Demande[]; aTraiter: number }>(`/site/contacts?filtre=${filtre.value}`)
    demandes.value = res.demandes
    aTraiter.value = res.aTraiter
    emit('count', res.aTraiter)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(filtre, load)

async function mark(d: Demande, traite: boolean) {
  busy.value = d.id
  error.value = ''
  try {
    await api(`/site/contacts/${d.id}/traite`, { method: 'POST', body: { traite } })
    // La demande change de liste : on la referme, pour ne pas la retrouver ouverte ailleurs
    openId.value = null
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Action impossible.'
  } finally {
    busy.value = null
  }
}
// Commande de l'atelier créée d'après les pièces du configurateur (et la fiche client si besoin)
async function createOrder(d: Demande) {
  busy.value = d.id
  error.value = ''
  try {
    const res = await api<{ id: string }>(`/site/contacts/${d.id}/commande`, { method: 'POST' })
    await router.push({ name: 'order', params: { id: res.id } })
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Création de la commande impossible.'
  } finally {
    busy.value = null
  }
}
async function remove(d: Demande) {
  busy.value = d.id
  error.value = ''
  try {
    await api(`/site/contacts/${d.id}`, { method: 'DELETE' })
    confirmDelete.value = null
    openId.value = null
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Suppression impossible.'
  } finally {
    busy.value = null
  }
}
const place = (d: Demande) => [d.adresse, [d.codePostal, d.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')
const FILTERS: { value: Filtre; label: string }[] = [
  { value: 'a_traiter', label: 'À traiter' },
  { value: 'traitees', label: 'Traitées' },
  { value: 'toutes', label: 'Toutes' },
]
</script>

<template>
  <section class="card pane">
    <div class="chips" role="group" aria-label="Filtre">
      <button v-for="f in FILTERS" :key="f.value" type="button" class="chip" :aria-pressed="filtre === f.value" @click="filtre = f.value">
        {{ f.label }}<span v-if="f.value === 'a_traiter'" class="count">{{ aTraiter }}</span>
      </button>
    </div>
    <p v-if="error" class="alert bad" role="alert">{{ error }}</p>

    <div v-if="!loading && !demandes.length && !error" class="empty">
      <AppIcon name="inbox" :size="32" class="muted" />
      <p><b>{{ filtre === 'a_traiter' ? 'Aucune demande à traiter.' : 'Aucune demande.' }}</b></p>
      <p class="muted">Les messages envoyés depuis la page Contact du site arrivent ici.</p>
    </div>

    <ul class="list" :aria-busy="loading">
      <li v-for="d in demandes" :key="d.id" class="req" :class="{ done: d.traiteAt }">
        <button type="button" class="summary" :aria-expanded="openId === d.id" @click="openId = openId === d.id ? null : d.id">
          <span class="main">
            <b>{{ d.objet }}</b>
            <span class="muted">{{ d.nom }}<template v-if="place(d)"> · {{ place(d) }}</template></span>
          </span>
          <span class="meta">
            <AppIcon v-if="d.fichierNom" name="file" :size="15" title="Plan joint" />
            <span v-if="d.traiteAt" class="pill ok">Traitée</span>
            <span class="muted nowrap">{{ dateTime(d.createdAt) }}</span>
          </span>
        </button>

        <div v-if="openId === d.id" class="detail">
          <div v-if="d.configuration" class="config">
            <b>Pièces choisies dans le configurateur</b>
            <ul>
              <li v-for="(l, i) in d.configuration.resume" :key="i">{{ l }}</li>
            </ul>
            <p class="muted">Prix affiché au visiteur : {{ eur(d.configuration.ht) }} HT, {{ eur(d.configuration.ttc) }} TTC</p>
          </div>
          <p v-if="d.message" class="message">{{ d.message }}</p>
          <dl>
            <div><dt>E-mail</dt><dd><a :href="`mailto:${d.email}`">{{ d.email }}</a></dd></div>
            <div v-if="d.telephone"><dt>Téléphone</dt><dd><a :href="`tel:${d.telephone.replace(/\s/g, '')}`">{{ d.telephone }}</a></dd></div>
            <div v-if="place(d)"><dt>Adresse</dt><dd>{{ place(d) }}</dd></div>
            <div v-if="d.fichierNom">
              <dt>Plan joint</dt>
              <dd><a :href="`/api/site/contacts/${d.id}/fichier`" download>{{ d.fichierNom }}</a></dd>
            </div>
          </dl>
          <p v-if="d.fichierNom" class="muted note">Le plan vient d’un inconnu : ouvrez-le seulement si vous êtes à l’aise avec ce fichier.</p>
          <div class="actions">
            <RouterLink v-if="d.commandeId" class="btn primary small" :to="{ name: 'order', params: { id: d.commandeId } }"><AppIcon name="box" :size="15" />Voir la commande</RouterLink>
            <button v-else-if="d.configuration" type="button" class="btn primary small" :disabled="busy === d.id" @click="createOrder(d)"><AppIcon name="box" :size="15" />Créer la commande</button>
            <button v-if="!d.traiteAt" type="button" class="btn small" :class="{ primary: !d.configuration && !d.commandeId }" :disabled="busy === d.id" @click="mark(d, true)"><AppIcon name="check" :size="15" />Marquer comme traitée</button>
            <button v-else type="button" class="btn small" :disabled="busy === d.id" @click="mark(d, false)">Remettre à traiter</button>
            <a class="btn small" :href="`mailto:${d.email}?subject=${encodeURIComponent('Re : ' + d.objet)}`"><AppIcon name="mail" :size="15" />Répondre</a>
            <button v-if="confirmDelete !== d.id" type="button" class="btn small danger" @click="confirmDelete = d.id"><AppIcon name="trash" :size="15" />Supprimer</button>
            <template v-else>
              <span class="muted">Supprimer définitivement ?</span>
              <button type="button" class="btn small danger" :disabled="busy === d.id" @click="remove(d)">Oui, supprimer</button>
              <button type="button" class="btn small" @click="confirmDelete = null">Non</button>
            </template>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.pane {
  padding: 16px;
  display: grid;
  gap: 14px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.req {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
}
.req.done {
  background: var(--surface-2);
}
.summary {
  width: 100%;
  border: 0;
  background: none;
  text-align: left;
  padding: 12px 14px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  border-radius: 10px;
}
.main {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.meta {
  display: flex;
  gap: 10px;
  align-items: center;
}
.detail {
  padding: 0 14px 14px;
  display: grid;
  gap: 12px;
  border-top: 1px solid var(--line);
  padding-top: 12px;
}
.message {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
dl {
  margin: 0;
  display: grid;
  gap: 4px;
  font-size: 0.9rem;
}
dl div {
  display: flex;
  gap: 8px;
}
dt {
  color: var(--muted);
  min-width: 90px;
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.note {
  font-size: 0.82rem;
}
.config {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 12px;
  display: grid;
  gap: 6px;
}
.config ul {
  margin: 0;
  padding-left: 1.1em;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.empty {
  display: grid;
  gap: 6px;
  justify-items: center;
  padding: 32px 12px;
  text-align: center;
}
/* Le chiffre à côté du filtre « À traiter » */
.count {
  margin-left: 6px;
  font-family: var(--f-mono);
  font-size: 0.78rem;
}
.nowrap {
  white-space: nowrap;
  font-size: 0.82rem;
}
</style>
