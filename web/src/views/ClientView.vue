<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api, ApiError } from '@/api'
import { clientName, contactName, hasIdentity, ORIGINE_LABELS, place, toFields, TYPE_LABELS, type Client, type ClientFields, type ClientSite } from '@/lib/clients'
import { describe, type AuditEntry } from '@/lib/audit-labels'
import { dateTime, relative } from '@/lib/format'
import { formatDay } from '@/lib/employees'
import { eur } from '@/lib/catalog'
import { statutOf, type OrderStatut } from '@/lib/orders'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/AppIcon.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import ClientForm from '@/components/ClientForm.vue'

const route = useRoute()
const auth = useAuthStore()
const ui = useUiStore()
// La RH consulte les fiches sans les modifier
const canManage = computed(() => auth.can('clients.manage'))

const client = ref<Client | null>(null)
const sites = ref<ClientSite[]>([])
const activity = ref<AuditEntry[]>([])
// Commandes du client (null si l'on n'a pas accès aux commandes, comme la RH)
const commandes = ref<{ list: { id: string; numero: string; statut: OrderStatut; ttc: number; createdAt: string }[]; totalTtc: number } | null>(null)
const loadError = ref('')
const notice = ref('')
const actionError = ref('')

const id = computed(() => route.params.id as string)
const name = computed(() => (client.value ? clientName(client.value) : ''))

async function load() {
  try {
    const res = await api<{ client: Client; sites: ClientSite[]; activity: AuditEntry[]; commandes: typeof commandes.value }>(`/clients/${id.value}`)
    client.value = res.client
    commandes.value = res.commandes ?? null
    sites.value = res.sites
    activity.value = res.activity
    ui.crumb = { for: route.fullPath, label: clientName(res.client) }
    document.title = `${clientName(res.client)} · Clients · Atelier · Alu Pliage Service`
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
}
onMounted(load)
watch(id, () => {
  editing.value = false
  load()
})

// --- Modification de la fiche ---
const editing = ref(false)
const form = reactive<ClientFields>(toFields({} as Client))
const formError = ref<{ field?: string; msg: string; clientId?: string } | null>(null)
const saving = ref(false)

function startEdit() {
  Object.assign(form, toFields(client.value!))
  formError.value = null
  notice.value = ''
  editing.value = true
}

async function saveEdit() {
  formError.value = null
  saving.value = true
  try {
    await api(`/clients/${id.value}`, { method: 'PATCH', body: { ...form } })
    editing.value = false
    notice.value = 'Fiche enregistrée.'
    await load()
  } catch (e) {
    formError.value = e instanceof ApiError ? { msg: e.message, field: e.field, clientId: e.data?.clientId as string | undefined } : { msg: 'L’enregistrement a échoué.' }
  } finally {
    saving.value = false
  }
}

// --- Archivage ---
const confirmArchive = ref(false)
async function setArchived(archived: boolean) {
  actionError.value = notice.value = ''
  try {
    await api(`/clients/${id.value}/${archived ? 'archive' : 'unarchive'}`, { method: 'POST' })
    notice.value = archived ? 'Client archivé : il n’apparaît plus dans la liste, sa fiche reste consultable.' : 'Client sorti des archives.'
    await load()
  } catch (e) {
    actionError.value = e instanceof ApiError ? e.message : 'L’action a échoué.'
  } finally {
    confirmArchive.value = false
  }
}

// --- Adresses de chantier ---
const emptySite = () => ({ libelle: '', adresse: '', codePostal: '', ville: '' })
// null : formulaire fermé ; 'new' : ajout ; sinon l'id de l'adresse modifiée
const siteEditing = ref<string | null>(null)
const siteForm = reactive(emptySite())
const siteError = ref<{ field?: string; msg: string } | null>(null)
const removing = ref<string | null>(null)
const siteErr = (f: string) => (siteError.value?.field === f ? siteError.value.msg : '')

function openSite(s?: ClientSite) {
  Object.assign(siteForm, s ? { libelle: s.libelle, adresse: s.adresse, codePostal: s.codePostal, ville: s.ville } : emptySite())
  siteError.value = null
  removing.value = null
  siteEditing.value = s?.id ?? 'new'
}

async function saveSite() {
  siteError.value = null
  try {
    if (siteEditing.value === 'new') await api(`/clients/${id.value}/sites`, { method: 'POST', body: { ...siteForm } })
    else await api(`/clients/${id.value}/sites/${siteEditing.value}`, { method: 'PATCH', body: { ...siteForm } })
    siteEditing.value = null
    await load()
  } catch (e) {
    siteError.value = e instanceof ApiError ? { msg: e.message, field: e.field } : { msg: 'L’enregistrement a échoué.' }
  }
}

async function removeSite(siteId: string) {
  actionError.value = ''
  try {
    await api(`/clients/${id.value}/sites/${siteId}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    actionError.value = e instanceof ApiError ? e.message : 'Suppression impossible.'
  } finally {
    removing.value = null
  }
}

const telHref = (t: string) => `tel:${t.replace(/[^+\d]/g, '')}`
</script>

<template>
  <p v-if="loadError" class="alert bad" role="alert">{{ loadError }}</p>

  <template v-if="client">
    <div class="head">
      <RouterLink :to="{ name: 'clients' }" class="back"><AppIcon name="arrow-left" :size="16" />Clients</RouterLink>
      <div class="identity">
        <UserAvatar :name="name" :size="56" />
        <div>
          <h1>{{ name }}</h1>
          <p class="muted">
            {{ TYPE_LABELS[client.type] }}<template v-if="contactName(client)"> · {{ contactName(client) }}</template> · client depuis le
            {{ formatDay(client.createdAt.slice(0, 10)) }}
          </p>
        </div>
        <span v-if="client.archivedAt" class="pill neutral">Archivé</span>
        <button v-if="canManage && !editing" class="btn edit" type="button" @click="startEdit"><AppIcon name="pencil" :size="16" />Modifier la fiche</button>
      </div>
    </div>

    <p v-if="notice" class="alert ok" role="status">{{ notice }}</p>
    <p v-if="actionError" class="alert bad" role="alert">{{ actionError }}</p>

    <form v-if="editing" class="edit-form" novalidate @submit.prevent="saveEdit">
      <p v-if="formError" class="alert bad" role="alert">
        {{ formError.msg }}
        <RouterLink v-if="formError.clientId" :to="{ name: 'client', params: { id: formError.clientId } }">Ouvrir sa fiche</RouterLink>
      </p>
      <ClientForm v-model="form" :error="formError" />
      <div class="actions">
        <button class="btn primary" type="submit" :disabled="saving || !hasIdentity(form)">{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</button>
        <button class="btn" type="button" @click="editing = false">Annuler</button>
      </div>
    </form>

    <div v-else class="grid">
      <div class="col">
        <section class="card block">
          <h2>Coordonnées</h2>
          <ul class="contacts">
            <li>
              <AppIcon name="phone" :size="17" class="muted" />
              <a v-if="client.telephone" :href="telHref(client.telephone)" class="mono">{{ client.telephone }}</a>
              <span v-else class="muted">Pas de téléphone</span>
            </li>
            <li>
              <AppIcon name="mail" :size="17" class="muted" />
              <a v-if="client.email" :href="`mailto:${client.email}`">{{ client.email }}</a>
              <span v-else class="muted">Pas d’e-mail</span>
            </li>
            <li>
              <AppIcon name="map-pin" :size="17" class="muted" />
              <span v-if="client.adresse || place(client)"> {{ client.adresse }}<br v-if="client.adresse && place(client)" />{{ place(client) }} </span>
              <span v-else class="muted">Pas d’adresse de facturation</span>
            </li>
          </ul>
        </section>

        <section v-if="client.type === 'professionnel'" class="card block">
          <h2>Entreprise</h2>
          <dl class="facts">
            <dt>SIRET</dt>
            <dd class="mono">{{ client.siret || '—' }}</dd>
            <dt>TVA intracom.</dt>
            <dd class="mono">{{ client.tvaIntra || '—' }}</dd>
          </dl>
        </section>

        <section class="card block">
          <h2>Notes internes</h2>
          <p v-if="client.notes" class="notes">{{ client.notes }}</p>
          <p v-else class="muted">Aucune note.</p>
          <dl class="facts">
            <dt>Origine</dt>
            <dd>{{ ORIGINE_LABELS[client.origine] }}</dd>
          </dl>
        </section>
      </div>

      <div class="col">
        <section v-if="commandes" class="card block" aria-labelledby="orders-title">
          <div class="block-head">
            <h2 id="orders-title">Commandes</h2>
            <RouterLink v-if="!client.archivedAt" class="btn small" :to="{ name: 'order-new', query: { client: client.id } }"><AppIcon name="plus" :size="15" />Nouvelle commande</RouterLink>
          </div>
          <ul v-if="commandes.list.length" class="orders">
            <li v-for="o in commandes.list.slice(0, 8)" :key="o.id">
              <RouterLink :to="{ name: 'order', params: { id: o.id } }" class="mono">{{ o.numero }}</RouterLink>
              <span class="pill" :class="statutOf(o.statut).tone">{{ statutOf(o.statut).label }}</span>
              <span class="sub">{{ formatDay(o.createdAt.slice(0, 10)) }}</span>
              <span class="amount">{{ eur(o.ttc) }}</span>
            </li>
          </ul>
          <p v-else class="muted">Aucune commande pour l’instant.</p>
          <p v-if="commandes.list.length" class="spent">
            Total dépensé : <b>{{ eur(commandes.totalTtc) }} TTC</b>
            <RouterLink v-if="commandes.list.length > 8" :to="{ name: 'orders', query: { filtre: 'toutes', q: name } }">Tout voir</RouterLink>
          </p>
        </section>

        <section class="card block" aria-labelledby="sites-title">
          <div class="block-head">
            <h2 id="sites-title">Adresses de chantier</h2>
            <button v-if="canManage && siteEditing === null" class="btn small" type="button" @click="openSite()"><AppIcon name="plus" :size="15" />Ajouter</button>
          </div>

          <ul v-if="sites.some((s) => s.id !== siteEditing)" class="sites">
            <template v-for="s in sites" :key="s.id">
              <li v-if="siteEditing !== s.id">
                <AppIcon name="map-pin" :size="17" class="muted" />
                <div class="site-text">
                  <b>{{ s.libelle }}</b>
                  <span class="sub">{{ s.adresse }}, {{ s.codePostal }} {{ s.ville }}</span>
                </div>
                <div v-if="canManage" class="row-actions">
                  <template v-if="removing === s.id">
                    <button class="btn small danger" type="button" @click="removeSite(s.id)">Retirer</button>
                    <button class="btn small" type="button" @click="removing = null">Annuler</button>
                  </template>
                  <template v-else>
                    <button class="btn small icon" type="button" :aria-label="`Modifier ${s.libelle}`" @click="openSite(s)"><AppIcon name="pencil" :size="15" /></button>
                    <button class="btn small icon" type="button" :aria-label="`Retirer ${s.libelle}`" @click="removing = s.id"><AppIcon name="trash" :size="15" /></button>
                  </template>
                </div>
              </li>
            </template>
          </ul>
          <p v-else-if="siteEditing === null" class="muted">Aucune adresse de chantier : les commandes seront livrées à l’adresse de facturation ou retirées à l’atelier.</p>

          <form
            v-if="siteEditing !== null"
            class="site-form"
            novalidate
            :aria-label="siteEditing === 'new' ? 'Nouvelle adresse de chantier' : 'Modifier l’adresse de chantier'"
            @submit.prevent="saveSite"
          >
            <p v-if="siteError && !['libelle', 'adresse', 'codePostal', 'ville'].includes(siteError.field ?? '')" class="alert bad" role="alert">{{ siteError.msg }}</p>
            <div class="field">
              <label for="s-libelle">Nom du chantier</label>
              <input id="s-libelle" v-model="siteForm.libelle" class="input" autocomplete="off" placeholder="Maison Rivière, lotissement des Pins…" :aria-invalid="!!siteErr('libelle') || undefined" />
              <span v-if="siteErr('libelle')" class="field-error">{{ siteErr('libelle') }}</span>
            </div>
            <div class="field">
              <label for="s-adresse">Adresse</label>
              <input id="s-adresse" v-model="siteForm.adresse" class="input" autocomplete="off" :aria-invalid="!!siteErr('adresse') || undefined" />
              <span v-if="siteErr('adresse')" class="field-error">{{ siteErr('adresse') }}</span>
            </div>
            <div class="place">
              <div class="field">
                <label for="s-cp">Code postal</label>
                <input id="s-cp" v-model="siteForm.codePostal" class="input mono" inputmode="numeric" maxlength="5" autocomplete="off" :aria-invalid="!!siteErr('codePostal') || undefined" />
                <span v-if="siteErr('codePostal')" class="field-error">{{ siteErr('codePostal') }}</span>
              </div>
              <div class="field">
                <label for="s-ville">Ville</label>
                <input id="s-ville" v-model="siteForm.ville" class="input" autocomplete="off" :aria-invalid="!!siteErr('ville') || undefined" />
                <span v-if="siteErr('ville')" class="field-error">{{ siteErr('ville') }}</span>
              </div>
            </div>
            <div class="row-actions">
              <button class="btn primary small" type="submit" :disabled="!siteForm.libelle.trim() || !siteForm.adresse.trim()">Enregistrer l’adresse</button>
              <button class="btn small" type="button" @click="siteEditing = null">Annuler</button>
            </div>
          </form>
        </section>

        <section class="card block">
          <h2>Activité récente</h2>
          <ol v-if="activity.length" class="timeline">
            <li v-for="a in activity" :key="a.id">
              <span class="dot" :data-tone="describe(a).tone" aria-hidden="true" />
              <div>
                <span>{{ describe(a).text }}</span>
                <span class="sub" :title="dateTime(a.at)"
                  >{{ relative(a.at) }}<template v-if="a.nom"> · par {{ a.nom }}</template></span
                >
              </div>
            </li>
          </ol>
          <p v-else class="muted">Aucune activité pour l’instant.</p>
        </section>

        <section v-if="canManage" class="card block">
          <h2>Archivage</h2>
          <template v-if="client.archivedAt">
            <p class="muted">Archivé le {{ formatDay(client.archivedAt.slice(0, 10)) }} : la fiche n’apparaît plus dans la liste des clients.</p>
            <div><button class="btn small" type="button" @click="setArchived(false)">Sortir des archives</button></div>
          </template>
          <template v-else-if="confirmArchive">
            <p>Archiver ce client ? Sa fiche et son historique restent consultables dans « Archivés ».</p>
            <div class="row-actions">
              <button class="btn small danger" type="button" @click="setArchived(true)">Confirmer</button>
              <button class="btn small" type="button" @click="confirmArchive = false">Annuler</button>
            </div>
          </template>
          <template v-else>
            <p class="muted">Un client qui ne commande plus peut être archivé. Rien n’est supprimé.</p>
            <div><button class="btn small" type="button" @click="confirmArchive = true">Archiver le client</button></div>
          </template>
        </section>
      </div>
    </div>
  </template>
</template>

<style scoped>
.head {
  display: grid;
  gap: 12px;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  text-decoration: none;
  font-size: 0.88rem;
  width: fit-content;
}
.back:hover {
  color: var(--accent);
}
.identity {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.identity > div {
  min-width: 0;
}
.identity h1 {
  font-size: clamp(1.6rem, 3vw, 2.1rem);
  overflow-wrap: anywhere;
}
.edit {
  margin-left: auto;
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.col {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.block {
  padding: 18px 20px;
  display: grid;
  gap: 12px;
}
.block-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.facts {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 8px 18px;
  margin: 0;
  align-items: center;
}
.facts dt {
  color: var(--muted);
  font-size: 0.86rem;
}
.facts dd {
  margin: 0;
}
.contacts,
.sites {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.contacts li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  overflow-wrap: anywhere;
}
.contacts .icon {
  margin-top: 2px;
  flex: none;
}
.contacts a {
  color: var(--ink);
}
.sites li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}
.sites li:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}
.sites li > .icon {
  flex: none;
}
.site-text {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
}
.orders {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.orders li {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  font-size: 0.9rem;
}
.orders a {
  color: var(--ink);
  font-weight: 650;
}
.orders .sub {
  display: inline;
}
.amount {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.spent {
  margin: 0;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.site-form {
  display: grid;
  gap: 12px;
}
.place {
  display: grid;
  grid-template-columns: minmax(100px, 140px) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}
.row-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.btn.icon {
  padding-inline: 8px;
}
.notes {
  white-space: pre-wrap;
}
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}
.timeline li {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr);
  gap: 10px;
  font-size: 0.88rem;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 6px;
  background: var(--line);
}
.dot[data-tone='accent'] {
  background: var(--accent);
}
.dot[data-tone='bad'] {
  background: var(--bad);
}
.sub {
  display: block;
  font-size: 0.78rem;
  color: var(--muted);
}
.alert a {
  color: inherit;
  font-weight: 650;
  margin-left: auto;
  white-space: nowrap;
}
.edit-form {
  display: grid;
  gap: 16px;
  max-width: 860px;
}
.actions {
  display: flex;
  gap: 8px;
}
@media (max-width: 960px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .edit {
    margin-left: 0;
  }
}
</style>
