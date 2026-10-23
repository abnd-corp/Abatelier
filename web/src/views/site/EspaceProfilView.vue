<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import type { Profil } from '@/lib/espace'
import { useEspaceStore } from '@/stores/espace'

// « Mes informations » : type de client, coordonnées et adresse de facturation. L'adresse e-mail est l'identifiant de connexion : elle ne se change pas ici.
const espace = useEspaceStore()
const profil = ref<Profil | null>(null)
const loadError = ref('')
const form = reactive({ type: 'particulier' as Profil['type'], raisonSociale: '', siret: '', tvaIntra: '', prenom: '', nom: '', telephone: '', adresse: '', codePostal: '', ville: '' })
const errors = reactive<Record<string, string>>({})
const failure = ref('')
const notice = ref('')
const saving = ref(false)

const pro = computed(() => form.type === 'professionnel')
// Un professionnel déjà validé garde son statut ; sinon l'atelier doit encore le valider
const enAttente = computed(() => profil.value?.type === 'professionnel' && !profil.value.proVerifie)
const changeVersPro = computed(() => profil.value?.type === 'particulier' && pro.value)

function remplir(p: Profil) {
  profil.value = p
  Object.assign(form, {
    type: p.type,
    raisonSociale: p.raisonSociale ?? '',
    siret: p.siret ?? '',
    tvaIntra: p.tvaIntra ?? '',
    prenom: p.prenom ?? '',
    nom: p.nom ?? '',
    telephone: p.telephone ?? '',
    adresse: p.adresse ?? '',
    codePostal: p.codePostal ?? '',
    ville: p.ville ?? '',
  })
}

onMounted(async () => {
  try {
    remplir((await api<{ profil: Profil }>('/espace/profil')).profil)
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) loadError.value = e instanceof ApiError ? e.message : 'Impossible de charger vos informations. Réessayez.'
  }
})

async function save() {
  for (const k of Object.keys(errors)) delete errors[k]
  failure.value = notice.value = ''
  saving.value = true
  try {
    remplir(await espace.modifierProfil({ ...form }))
    notice.value = 'Vos informations sont enregistrées.'
  } catch (e) {
    if (e instanceof ApiError && e.field) errors[e.field] = e.message
    else failure.value = e instanceof ApiError ? e.message : 'Enregistrement impossible. Réessayez.'
    const first = Object.keys(errors)[0]
    if (first) document.getElementById(`pf-${first}`)?.focus()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="s-wrap page">
    <header>
      <RouterLink :to="{ name: 'espace' }" class="back"><AppIcon name="arrow-left" :size="15" /> Mes commandes</RouterLink>
      <span class="eyebrow">Espace client</span>
      <h1>Mes informations</h1>
      <p class="muted">Ces informations figurent sur vos devis et vos factures.</p>
    </header>

    <p v-if="loadError" class="alert bad" role="alert">{{ loadError }}</p>
    <p v-else-if="!profil" class="muted" aria-busy="true">Chargement…</p>
    <form v-else class="card box" novalidate @submit.prevent="save">
      <p v-if="failure" class="alert bad" role="alert">{{ failure }}</p>
      <p v-if="notice" class="alert ok" role="status">{{ notice }}</p>

      <fieldset class="type">
        <legend>Vous êtes</legend>
        <label class="check"><input id="pf-type-particulier" v-model="form.type" type="radio" name="type" value="particulier" /><span>Un particulier</span></label>
        <label class="check"><input id="pf-type-professionnel" v-model="form.type" type="radio" name="type" value="professionnel" /><span>Un professionnel</span></label>
      </fieldset>
      <p v-if="changeVersPro" class="alert" role="status">Après l’enregistrement, l’atelier valide votre statut professionnel avant d’appliquer la remise pro.</p>
      <p v-else-if="enAttente" class="alert" role="status">Votre statut professionnel est en cours de validation par l’atelier. La remise pro s’appliquera une fois validé.</p>
      <p v-else-if="profil.type === 'professionnel' && pro" class="alert ok" role="status">Votre statut professionnel est validé : la remise pro s’applique à vos devis.</p>

      <template v-if="pro">
        <div class="field">
          <label for="pf-raisonSociale">Raison sociale *</label>
          <input id="pf-raisonSociale" v-model="form.raisonSociale" class="input" :class="{ invalid: errors.raisonSociale }" autocomplete="organization" :aria-invalid="!!errors.raisonSociale" />
          <span v-if="errors.raisonSociale" class="field-error">{{ errors.raisonSociale }}</span>
        </div>
        <div class="two">
          <div class="field">
            <label for="pf-siret">SIRET</label>
            <input id="pf-siret" v-model="form.siret" class="input" inputmode="numeric" :class="{ invalid: errors.siret }" :aria-invalid="!!errors.siret" />
            <span v-if="errors.siret" class="field-error">{{ errors.siret }}</span>
          </div>
          <div class="field">
            <label for="pf-tvaIntra">TVA intracommunautaire</label>
            <input id="pf-tvaIntra" v-model="form.tvaIntra" class="input" :class="{ invalid: errors.tvaIntra }" :aria-invalid="!!errors.tvaIntra" />
            <span v-if="errors.tvaIntra" class="field-error">{{ errors.tvaIntra }}</span>
          </div>
        </div>
      </template>

      <div class="two">
        <div class="field">
          <label for="pf-prenom">Prénom</label>
          <input id="pf-prenom" v-model="form.prenom" class="input" autocomplete="given-name" />
        </div>
        <div class="field">
          <label for="pf-nom">Nom *</label>
          <input id="pf-nom" v-model="form.nom" class="input" :class="{ invalid: errors.nom }" autocomplete="family-name" :aria-invalid="!!errors.nom" />
          <span v-if="errors.nom" class="field-error">{{ errors.nom }}</span>
        </div>
      </div>
      <div class="two">
        <div class="field">
          <label for="pf-email">Adresse e-mail</label>
          <input id="pf-email" :value="profil.email ?? ''" class="input" type="email" disabled aria-describedby="pf-h-email" />
          <span id="pf-h-email" class="muted hint">C’est votre identifiant de connexion, il ne se change pas ici.</span>
        </div>
        <div class="field">
          <label for="pf-telephone">Téléphone</label>
          <input id="pf-telephone" v-model="form.telephone" class="input" type="tel" autocomplete="tel" :class="{ invalid: errors.telephone }" :aria-invalid="!!errors.telephone" />
          <span v-if="errors.telephone" class="field-error">{{ errors.telephone }}</span>
        </div>
      </div>

      <h2>Adresse de facturation</h2>
      <div class="field">
        <label for="pf-adresse">Rue</label>
        <input id="pf-adresse" v-model="form.adresse" class="input" autocomplete="street-address" :class="{ invalid: errors.adresse }" :aria-invalid="!!errors.adresse" />
        <span v-if="errors.adresse" class="field-error">{{ errors.adresse }}</span>
      </div>
      <div class="two">
        <div class="field">
          <label for="pf-codePostal">Code postal</label>
          <input
            id="pf-codePostal"
            v-model="form.codePostal"
            class="input"
            inputmode="numeric"
            autocomplete="postal-code"
            :class="{ invalid: errors.codePostal }"
            :aria-invalid="!!errors.codePostal"
          />
          <span v-if="errors.codePostal" class="field-error">{{ errors.codePostal }}</span>
        </div>
        <div class="field">
          <label for="pf-ville">Ville</label>
          <input id="pf-ville" v-model="form.ville" class="input" autocomplete="address-level2" :class="{ invalid: errors.ville }" :aria-invalid="!!errors.ville" />
          <span v-if="errors.ville" class="field-error">{{ errors.ville }}</span>
        </div>
      </div>

      <div class="actions">
        <button class="s-btn primary" type="submit" :disabled="saving">{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.page {
  padding-top: 36px;
  padding-bottom: 40px;
  display: grid;
  gap: 18px;
  justify-items: center;
}
.page > * {
  width: min(100%, 720px);
}
header {
  display: grid;
  gap: 4px;
  justify-items: start;
}
h1 {
  margin: 6px 0 0;
  text-transform: none;
  font-size: clamp(1.7rem, 4vw, 2.4rem);
}
header p {
  margin: 0;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  font-size: 0.92rem;
}
.box {
  padding: 24px;
  display: grid;
  gap: 14px;
}
h2 {
  margin: 6px 0 0;
  font-size: 1.1rem;
}
.two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: start;
}
.type {
  border: 0;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 8px 22px;
  flex-wrap: wrap;
}
.type legend {
  font-weight: 600;
  margin-bottom: 6px;
  padding: 0;
}
.check {
  display: flex;
  gap: 10px;
  align-items: center;
  font-weight: 400 !important;
}
.check input {
  width: 18px;
  height: 18px;
  flex: none;
}
.hint {
  font-size: 0.84rem;
}
@media (max-width: 600px) {
  .two {
    grid-template-columns: minmax(0, 1fr);
  }
  .box {
    padding: 18px;
  }
  .actions .s-btn {
    width: 100%;
  }
}
</style>
