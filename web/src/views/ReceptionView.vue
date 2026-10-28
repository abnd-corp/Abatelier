<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import { startScan } from '@/lib/scan'
import type { Feuille, Mouvement } from '@/lib/stock'

// Réception de marchandise, pensée pour le téléphone : on scanne (ou saisit) le code-barres du fournisseur,
// l'application retrouve la référence, et on indique le nombre de feuilles reçues.
interface Options {
  materials: { id: string; label: string }[]
  colors: { id: string; label: string; hex: string }[]
}

type Step = 'scan' | 'trouve' | 'inconnu' | 'nouvelle'
const step = ref<Step>('scan')
const saisie = ref('')
const code = ref('')
const feuille = ref<Feuille | null>(null)
const quantite = ref('')
const note = ref('')
const error = ref('')
const notice = ref('')
const busy = ref(false)
const recents = ref<Mouvement[]>([])
const codeInput = ref<HTMLInputElement | null>(null)
const qtyInput = ref<HTMLInputElement | null>(null)

// Caméra : c'est le geste principal, elle démarre toute seule. La saisie à la main n'est qu'un secours.
const camera = ref(false)
const cameraError = ref('')
const manual = ref(false)
const video = ref<HTMLVideoElement | null>(null)
let stopCamera: (() => void) | null = null

async function loadRecents() {
  try {
    recents.value = (await api<{ mouvements: Mouvement[] }>('/stock/mouvements')).mouvements.filter((m) => m.motif === 'reception').slice(0, 5)
  } catch {
    // l'historique est un confort : la réception marche sans
  }
}
onMounted(() => {
  loadRecents()
  openCamera()
})
onBeforeUnmount(() => stopCamera?.())

async function openCamera() {
  cameraError.value = ''
  stopCamera?.()
  camera.value = true
  await nextTick()
  if (!video.value) return
  try {
    stopCamera = await startScan(video.value, (c) => {
      camera.value = false
      saisie.value = c
      lookup()
    })
  } catch (e) {
    camera.value = false
    cameraError.value = e instanceof Error ? e.message : 'Caméra indisponible.'
    // Sans caméra, la saisie devient la seule voie : on l'ouvre
    manual.value = true
    await nextTick()
    codeInput.value?.focus()
  }
}
function closeCamera() {
  stopCamera?.()
  stopCamera = null
  camera.value = false
}
async function showManual() {
  manual.value = true
  await nextTick()
  codeInput.value?.focus()
}

const normalise = (c: string) => c.trim().toUpperCase()

async function lookup() {
  error.value = notice.value = ''
  const c = normalise(saisie.value)
  if (!c) {
    error.value = 'Scannez ou saisissez le code-barres.'
    return
  }
  busy.value = true
  try {
    const res = await api<{ code: string; feuille: Feuille }>(`/stock/codes/${encodeURIComponent(c)}`)
    code.value = res.code
    feuille.value = res.feuille
    quantite.value = ''
    note.value = ''
    closeCamera()
    step.value = 'trouve'
    await nextTick()
    qtyInput.value?.focus()
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      code.value = c
      closeCamera()
      step.value = 'inconnu'
      await loadChoices()
    } else error.value = e instanceof ApiError ? e.message : 'Recherche impossible.'
  } finally {
    busy.value = false
  }
}

async function receive() {
  error.value = ''
  const n = Number(quantite.value)
  if (!Number.isInteger(n) || n < 1) {
    error.value = 'Indiquez le nombre de feuilles reçues.'
    return
  }
  busy.value = true
  try {
    const res = await api<{ feuille: Feuille; recu: number }>('/stock/reception', { method: 'POST', body: { code: code.value, quantite: n, note: note.value } })
    notice.value = `${res.recu} feuille${res.recu > 1 ? 's' : ''} reçue${res.recu > 1 ? 's' : ''} : ${res.feuille.libelle}. Stock : ${res.feuille.quantite}.`
    reset()
    await loadRecents()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Enregistrement impossible.'
  } finally {
    busy.value = false
  }
}

function reset() {
  step.value = 'scan'
  saisie.value = ''
  code.value = ''
  feuille.value = null
  quantite.value = ''
  note.value = ''
  manual.value = false
  // On repart sur la caméra, prête pour la feuille suivante
  openCamera()
}
function cancel() {
  error.value = notice.value = ''
  reset()
}

// Code inconnu : on l'associe à une référence existante, ou on crée la référence
const all = ref<Feuille[]>([])
const options = ref<Options>({ materials: [], colors: [] })
const filtre = ref('')
async function loadChoices() {
  try {
    const [f, o] = await Promise.all([api<{ feuilles: Feuille[] }>('/stock/feuilles'), api<Options>('/stock/options')])
    all.value = f.feuilles
    options.value = o
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
}
// Espaces insécables des milliers et espaces ordinaires se valent quand on cherche
const flat = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim()
const choices = computed(() => {
  const q = flat(filtre.value)
  return all.value.filter((f) => !q || flat(f.libelle).includes(q)).slice(0, 30)
})

async function link(f: Feuille) {
  error.value = ''
  busy.value = true
  try {
    await api('/stock/codes', { method: 'POST', body: { code: code.value, sheetId: f.id } })
    feuille.value = f
    quantite.value = ''
    step.value = 'trouve'
    await nextTick()
    qtyInput.value?.focus()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Association impossible.'
  } finally {
    busy.value = false
  }
}

const nouvelle = reactive({ materialId: '', colorId: '', largeur: '1250', longueur: '3000' })
const fieldError = ref('')
async function create() {
  error.value = fieldError.value = ''
  busy.value = true
  try {
    const res = await api<{ feuille: Feuille }>('/stock/feuilles', {
      method: 'POST',
      body: { materialId: nouvelle.materialId, colorId: nouvelle.colorId || null, largeur: Number(nouvelle.largeur), longueur: Number(nouvelle.longueur), code: code.value, quantite: 0 },
    })
    feuille.value = res.feuille
    quantite.value = ''
    step.value = 'trouve'
    await nextTick()
    qtyInput.value?.focus()
  } catch (e) {
    if (e instanceof ApiError && e.field) fieldError.value = e.message
    else error.value = e instanceof ApiError ? e.message : 'Création impossible.'
  } finally {
    busy.value = false
  }
}

const bump = (d: number) => {
  quantite.value = String(Math.max(0, (Number(quantite.value) || 0) + d))
}
</script>

<template>
  <div class="page-head">
    <div>
      <span class="eyebrow">Atelier</span>
      <h1>Réception de marchandise</h1>
    </div>
  </div>

  <p v-if="notice" class="alert ok" role="status">{{ notice }}</p>
  <p v-if="error" class="alert bad" role="alert">{{ error }}</p>

  <!-- 1. Scanner le code avec la caméra (saisie à la main en secours) -->
  <section v-if="step === 'scan'" class="card pane" aria-labelledby="scan-titre">
    <h2 id="scan-titre">1. Scannez le code-barres</h2>
    <div v-show="camera" class="viewer">
      <video ref="video" class="video" playsinline muted aria-label="Caméra : placez le code-barres dans le cadre" />
      <span class="frame" aria-hidden="true" />
    </div>
    <p v-if="camera" class="muted hint">Placez le code-barres dans le cadre : la lecture est automatique.</p>
    <p v-if="cameraError" class="alert bad" role="alert">{{ cameraError }}</p>
    <button v-if="!camera" class="btn primary big" type="button" @click="openCamera"><AppIcon name="eye" :size="18" />{{ cameraError ? 'Relancer la caméra' : 'Scanner avec la caméra' }}</button>
    <button v-if="!manual" class="link-btn" type="button" @click="showManual">Le code ne se lit pas ? Le saisir à la main</button>
    <form v-if="manual" class="scan" novalidate @submit.prevent="lookup">
      <label for="r-code">Code-barres saisi à la main</label>
      <input
        id="r-code"
        ref="codeInput"
        v-model="saisie"
        class="input big mono"
        inputmode="text"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        placeholder="Saisissez le code"
        enterkeyhint="search"
      />
      <button class="btn big" type="submit" :disabled="busy || !saisie.trim()">Chercher</button>
    </form>
  </section>

  <!-- 2. Référence trouvée : le nombre reçu -->
  <section v-else-if="step === 'trouve' && feuille" class="card pane" aria-labelledby="trouve-titre">
    <h2 id="trouve-titre">2. Combien de feuilles reçues ?</h2>
    <div class="ref">
      <span v-if="feuille.hex" class="swatch" :style="{ background: feuille.hex }" aria-hidden="true" />
      <div>
        <b>{{ feuille.libelle }}</b>
        <span class="sub mono">Code {{ code }} · en stock : {{ feuille.quantite }}</span>
      </div>
    </div>
    <form class="recv" novalidate @submit.prevent="receive">
      <label for="r-qty">Feuilles reçues</label>
      <div class="stepper">
        <button class="btn big" type="button" aria-label="Une feuille de moins" @click="bump(-1)">−</button>
        <input id="r-qty" ref="qtyInput" v-model="quantite" class="input big mono" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="0" />
        <button class="btn big" type="button" aria-label="Une feuille de plus" @click="bump(1)">+</button>
      </div>
      <div class="quick">
        <button v-for="n in [5, 10, 20, 50]" :key="n" class="chip" type="button" @click="quantite = String(n)">{{ n }}</button>
      </div>
      <label for="r-note">Note (n° de bon de livraison, fournisseur…)</label>
      <input id="r-note" v-model="note" class="input" maxlength="300" autocomplete="off" />
      <div class="actions">
        <button class="btn primary big" type="submit" :disabled="busy || !quantite">Valider l’entrée en stock</button>
        <button class="btn big" type="button" @click="cancel">Annuler</button>
      </div>
    </form>
  </section>

  <!-- 3. Code inconnu -->
  <section v-else-if="step === 'inconnu'" class="card pane" aria-labelledby="inconnu-titre">
    <h2 id="inconnu-titre">Code inconnu</h2>
    <p>
      Le code <b class="mono">{{ code }}</b> n’est pas encore associé à une référence du stock. Choisissez la référence qui lui correspond : il sera reconnu à la prochaine réception.
    </p>
    <label for="r-filtre">Chercher une référence</label>
    <input id="r-filtre" v-model="filtre" class="input" placeholder="Aluminium, Blanc, 1 250…" autocomplete="off" />
    <ul class="choices">
      <li v-for="f in choices" :key="f.id">
        <button class="choice" type="button" :disabled="busy" @click="link(f)">
          <span v-if="f.hex" class="swatch" :style="{ background: f.hex }" aria-hidden="true" />
          <span>{{ f.libelle }}</span>
          <span class="muted mono">{{ f.quantite }}</span>
        </button>
      </li>
      <li v-if="!choices.length" class="muted">Aucune référence ne correspond.</li>
    </ul>
    <div class="actions">
      <button class="btn big" type="button" @click="step = 'nouvelle'"><AppIcon name="plus" :size="18" />Créer une nouvelle référence</button>
      <button class="btn big" type="button" @click="cancel">Annuler</button>
    </div>
  </section>

  <!-- 4. Nouvelle référence pour ce code -->
  <section v-else-if="step === 'nouvelle'" class="card pane" aria-labelledby="nouvelle-titre">
    <h2 id="nouvelle-titre">Nouvelle référence pour le code {{ code }}</h2>
    <form class="recv" novalidate @submit.prevent="create">
      <label for="n-mat">Matière et épaisseur</label>
      <select id="n-mat" v-model="nouvelle.materialId" class="input">
        <option value="" disabled>Choisir…</option>
        <option v-for="m in options.materials" :key="m.id" :value="m.id">{{ m.label }}</option>
      </select>
      <label for="n-col">Coloris</label>
      <select id="n-col" v-model="nouvelle.colorId" class="input">
        <option value="">Brut, sans laquage</option>
        <option v-for="c in options.colors" :key="c.id" :value="c.id">{{ c.label }}</option>
      </select>
      <div class="two">
        <div>
          <label for="n-l">Largeur (mm)</label>
          <input id="n-l" v-model="nouvelle.largeur" class="input mono" inputmode="numeric" />
        </div>
        <div>
          <label for="n-h">Longueur (mm)</label>
          <input id="n-h" v-model="nouvelle.longueur" class="input mono" inputmode="numeric" />
        </div>
      </div>
      <p v-if="fieldError" class="alert bad" role="alert">{{ fieldError }}</p>
      <div class="actions">
        <button class="btn primary big" type="submit" :disabled="busy || !nouvelle.materialId">Créer et continuer</button>
        <button class="btn big" type="button" @click="step = 'inconnu'">Retour</button>
      </div>
    </form>
  </section>

  <section v-if="recents.length && step === 'scan'" class="card pane recents" aria-labelledby="recents-titre">
    <h2 id="recents-titre">Dernières réceptions</h2>
    <ul>
      <li v-for="m in recents" :key="m.id">
        <span>{{ m.libelle }}</span>
        <b class="mono">+{{ m.delta }}</b>
        <span class="muted">{{ m.par ?? '' }}</span>
      </li>
    </ul>
    <RouterLink :to="{ name: 'stock' }" class="btn">Voir le stock</RouterLink>
  </section>
</template>

<style scoped>
.pane {
  display: grid;
  gap: 14px;
  padding: 20px;
  max-width: 560px;
}
h2 {
  margin: 0;
  font-size: 1.15rem;
  text-transform: none;
}
.scan,
.recv {
  display: grid;
  gap: 10px;
}
.big {
  min-height: 52px;
  font-size: 1.1rem;
  width: 100%;
}
.input.big {
  text-align: center;
  letter-spacing: 0.04em;
}
.viewer {
  position: relative;
  overflow: hidden;
  border-radius: 10px;
}
.video {
  display: block;
  width: 100%;
  border-radius: 10px;
  background: #000;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}
.frame {
  position: absolute;
  inset: 22% 10%;
  border: 3px solid rgb(255 255 255 / 0.85);
  border-radius: 12px;
  box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.25);
  pointer-events: none;
}
.link-btn {
  border: 0;
  background: none;
  color: var(--accent);
  text-decoration: underline;
  padding: 10px 0;
  min-height: 44px;
  font-size: 0.95rem;
}
.ref {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: var(--surface-2);
  border-radius: 10px;
  padding: 12px;
}
.ref b {
  display: block;
}
.sub {
  color: var(--muted);
  font-size: 0.85rem;
}
.swatch {
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid var(--line);
  margin-top: 2px;
}
.stepper {
  display: grid;
  grid-template-columns: 64px 1fr 64px;
  gap: 8px;
}
.stepper .btn {
  width: auto;
  font-size: 1.6rem;
}
.quick {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.chip {
  min-height: 44px;
  min-width: 56px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  font-size: 1rem;
}
.actions {
  display: grid;
  gap: 10px;
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.choices {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
  max-height: 46vh;
  overflow: auto;
}
.choice {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 52px;
  padding: 8px 12px;
  text-align: left;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
}
.choice span:nth-child(2) {
  flex: 1;
}
.recents ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.recents li {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 10px;
}
.recents li .muted {
  grid-column: 1 / -1;
  font-size: 0.82rem;
}
.hint {
  font-size: 0.9rem;
}
</style>
