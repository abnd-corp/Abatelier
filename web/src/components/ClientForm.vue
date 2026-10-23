<script setup lang="ts">
import { TYPE_LABELS, type ClientFields, type ClientType } from '@/lib/clients'

// Formulaire de fiche client, utilisé pour l'ajout et la modification.
// L'erreur renvoyée par l'API (champ + message) s'affiche sous le champ concerné.
defineProps<{ error?: { field?: string; msg: string } | null }>()
const model = defineModel<ClientFields>({ required: true })

const types = Object.entries(TYPE_LABELS) as [ClientType, string][]
const errorFor = (field: string, error?: { field?: string; msg: string } | null) => (error?.field === field ? error.msg : '')
</script>

<template>
  <div class="form-grid">
    <fieldset class="card group">
      <legend>Type de client</legend>
      <div class="types">
        <label v-for="[value, label] in types" :key="value" class="type" :class="{ on: model.type === value }">
          <input v-model="model.type" type="radio" name="client-type" :value="value" />
          <span>{{ label }}</span>
        </label>
      </div>
    </fieldset>

    <fieldset v-if="model.type === 'professionnel'" class="card group">
      <legend>Entreprise</legend>
      <div class="field">
        <label for="c-raison">Raison sociale <span class="req" aria-hidden="true">*</span></label>
        <input id="c-raison" v-model="model.raisonSociale" class="input" autocomplete="off" required :aria-invalid="!!errorFor('raisonSociale', error) || undefined" />
        <span v-if="errorFor('raisonSociale', error)" class="field-error">{{ errorFor('raisonSociale', error) }}</span>
      </div>
      <div class="row">
        <div class="field">
          <label for="c-siret">SIRET</label>
          <input id="c-siret" v-model="model.siret" class="input mono" inputmode="numeric" autocomplete="off" placeholder="14 chiffres" :aria-invalid="!!errorFor('siret', error) || undefined" />
          <span v-if="errorFor('siret', error)" class="field-error">{{ errorFor('siret', error) }}</span>
        </div>
        <div class="field">
          <label for="c-tva">TVA intracommunautaire</label>
          <input id="c-tva" v-model="model.tvaIntra" class="input mono" autocomplete="off" placeholder="FR12345678901" :aria-invalid="!!errorFor('tvaIntra', error) || undefined" />
          <span v-if="errorFor('tvaIntra', error)" class="field-error">{{ errorFor('tvaIntra', error) }}</span>
        </div>
      </div>
    </fieldset>

    <fieldset class="card group">
      <legend>{{ model.type === 'professionnel' ? 'Contact' : 'Identité' }}</legend>
      <div class="row">
        <div class="field">
          <label for="c-prenom">Prénom</label>
          <input id="c-prenom" v-model="model.prenom" class="input" autocomplete="off" :aria-invalid="!!errorFor('prenom', error) || undefined" />
          <span v-if="errorFor('prenom', error)" class="field-error">{{ errorFor('prenom', error) }}</span>
        </div>
        <div class="field">
          <label for="c-nom">Nom <span v-if="model.type === 'particulier'" class="req" aria-hidden="true">*</span></label>
          <input id="c-nom" v-model="model.nom" class="input" autocomplete="off" :required="model.type === 'particulier'" :aria-invalid="!!errorFor('nom', error) || undefined" />
          <span v-if="errorFor('nom', error)" class="field-error">{{ errorFor('nom', error) }}</span>
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label for="c-tel">Téléphone</label>
          <input
            id="c-tel"
            v-model="model.telephone"
            class="input"
            type="tel"
            inputmode="tel"
            autocomplete="off"
            placeholder="06 12 34 56 78"
            :aria-invalid="!!errorFor('telephone', error) || undefined"
          />
          <span v-if="errorFor('telephone', error)" class="field-error">{{ errorFor('telephone', error) }}</span>
        </div>
        <div class="field">
          <label for="c-email">E-mail</label>
          <input id="c-email" v-model="model.email" class="input" type="email" autocomplete="off" placeholder="nom@exemple.fr" :aria-invalid="!!errorFor('email', error) || undefined" />
          <span v-if="errorFor('email', error)" class="field-error">{{ errorFor('email', error) }}</span>
        </div>
      </div>
    </fieldset>

    <fieldset class="card group">
      <legend>Adresse de facturation</legend>
      <div class="field">
        <label for="c-adresse">Adresse</label>
        <input id="c-adresse" v-model="model.adresse" class="input" autocomplete="off" placeholder="3 rue des Lilas" :aria-invalid="!!errorFor('adresse', error) || undefined" />
        <span v-if="errorFor('adresse', error)" class="field-error">{{ errorFor('adresse', error) }}</span>
      </div>
      <div class="row place">
        <div class="field">
          <label for="c-cp">Code postal</label>
          <input id="c-cp" v-model="model.codePostal" class="input mono" inputmode="numeric" maxlength="5" autocomplete="off" :aria-invalid="!!errorFor('codePostal', error) || undefined" />
          <span v-if="errorFor('codePostal', error)" class="field-error">{{ errorFor('codePostal', error) }}</span>
        </div>
        <div class="field">
          <label for="c-ville">Ville</label>
          <input id="c-ville" v-model="model.ville" class="input" autocomplete="off" :aria-invalid="!!errorFor('ville', error) || undefined" />
          <span v-if="errorFor('ville', error)" class="field-error">{{ errorFor('ville', error) }}</span>
        </div>
      </div>
    </fieldset>

    <slot />

    <fieldset class="card group">
      <legend>Notes internes</legend>
      <div class="field">
        <label for="c-notes" class="sr-only">Notes internes</label>
        <textarea
          id="c-notes"
          v-model="model.notes"
          class="input"
          rows="3"
          placeholder="Habitudes, conditions particulières, accès au chantier…"
          aria-describedby="h-c-notes"
          :aria-invalid="!!errorFor('notes', error) || undefined"
        />
        <span id="h-c-notes" class="hint muted">Jamais visibles par le client.</span>
        <span v-if="errorFor('notes', error)" class="field-error">{{ errorFor('notes', error) }}</span>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.form-grid {
  display: grid;
  gap: 16px;
}
.group {
  margin: 0;
  padding: 18px 20px 20px;
  display: grid;
  gap: 14px;
  min-width: 0;
}
.row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  align-items: start;
}
.row.place {
  grid-template-columns: minmax(110px, 160px) minmax(0, 1fr);
}
.types {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.type {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 9px 14px;
  cursor: pointer;
  font-weight: 600;
}
.type input {
  accent-color: var(--accent);
  margin: 0;
}
.type.on {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.type:focus-within {
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.req {
  color: var(--bad);
}
.hint {
  font-size: 0.8rem;
}
textarea.input {
  resize: vertical;
  font: inherit;
  line-height: 1.5;
}
</style>
