<script setup lang="ts">
import { CONTRAT_LABELS, type Contrat, type EmployeeFields } from '@/lib/employees'

// Formulaire de fiche salarié, utilisé pour l'ajout et la modification.
// L'erreur renvoyée par l'API (champ + message) s'affiche sous le champ concerné.
defineProps<{ error?: { field?: string; msg: string } | null }>()
const model = defineModel<EmployeeFields>({ required: true })

const contrats = Object.entries(CONTRAT_LABELS) as [Contrat, string][]
const errorFor = (field: string, error?: { field?: string; msg: string } | null) => (error?.field === field ? error.msg : '')
</script>

<template>
  <div class="form-grid">
    <fieldset class="card group">
      <legend>Identité</legend>
      <div class="row">
        <div class="field">
          <label for="f-prenom">Prénom <span class="req" aria-hidden="true">*</span></label>
          <input id="f-prenom" v-model.trim="model.prenom" class="input" autocomplete="off" required :aria-invalid="!!errorFor('prenom', error) || undefined" aria-describedby="e-prenom" />
          <span v-if="errorFor('prenom', error)" id="e-prenom" class="field-error">{{ errorFor('prenom', error) }}</span>
        </div>
        <div class="field">
          <label for="f-nom">Nom <span class="req" aria-hidden="true">*</span></label>
          <input id="f-nom" v-model.trim="model.nom" class="input" autocomplete="off" required :aria-invalid="!!errorFor('nom', error) || undefined" aria-describedby="e-nom" />
          <span v-if="errorFor('nom', error)" id="e-nom" class="field-error">{{ errorFor('nom', error) }}</span>
        </div>
      </div>
    </fieldset>

    <fieldset class="card group">
      <legend>Poste et contrat</legend>
      <div class="row">
        <div class="field">
          <label for="f-poste">Poste</label>
          <input id="f-poste" v-model="model.poste" class="input" placeholder="Plieur, commercial…" list="postes" autocomplete="off" />
          <datalist id="postes">
            <option value="Plieur" />
            <option value="Chef d’atelier" />
            <option value="Commercial" />
            <option value="Livreur" />
            <option value="Secrétariat" />
          </datalist>
        </div>
        <div class="field">
          <label for="f-contrat">Contrat</label>
          <select id="f-contrat" v-model="model.contrat" class="input" :aria-invalid="!!errorFor('contrat', error) || undefined">
            <option :value="null">Non renseigné</option>
            <option v-for="[value, label] in contrats" :key="value" :value="value">{{ label }}</option>
          </select>
          <span v-if="errorFor('contrat', error)" class="field-error">{{ errorFor('contrat', error) }}</span>
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label for="f-entree">Date d’entrée</label>
          <input id="f-entree" v-model="model.dateEntree" class="input" type="date" :aria-invalid="!!errorFor('dateEntree', error) || undefined" />
          <span v-if="errorFor('dateEntree', error)" class="field-error">{{ errorFor('dateEntree', error) }}</span>
        </div>
        <div class="field">
          <label for="f-sortie">Date de sortie</label>
          <input id="f-sortie" v-model="model.dateSortie" class="input" type="date" :aria-invalid="!!errorFor('dateSortie', error) || undefined" aria-describedby="h-sortie e-sortie" />
          <span id="h-sortie" class="hint muted">Le compte de connexion sera désactivé automatiquement ce jour-là.</span>
          <span v-if="errorFor('dateSortie', error)" id="e-sortie" class="field-error">{{ errorFor('dateSortie', error) }}</span>
        </div>
      </div>
    </fieldset>

    <fieldset class="card group">
      <legend>Coordonnées</legend>
      <div class="row">
        <div class="field">
          <label for="f-tel">Téléphone</label>
          <input id="f-tel" v-model="model.telephone" class="input" type="tel" inputmode="tel" autocomplete="off" placeholder="06 12 34 56 78" :aria-invalid="!!errorFor('telephone', error) || undefined" />
          <span v-if="errorFor('telephone', error)" class="field-error">{{ errorFor('telephone', error) }}</span>
        </div>
        <div class="field">
          <label for="f-email">E-mail</label>
          <input id="f-email" v-model="model.email" class="input" type="email" autocomplete="off" placeholder="prenom.nom@exemple.fr" :aria-invalid="!!errorFor('email', error) || undefined" />
          <span v-if="errorFor('email', error)" class="field-error">{{ errorFor('email', error) }}</span>
        </div>
      </div>
    </fieldset>

    <fieldset class="card group">
      <legend>Notes internes</legend>
      <div class="field">
        <label for="f-notes" class="sr-only">Notes internes</label>
        <textarea id="f-notes" v-model="model.notes" class="input" rows="4" placeholder="Habilitations, permis cariste, remarques…" aria-describedby="h-notes" />
        <span id="h-notes" class="hint muted">Visibles uniquement par la direction et la RH.</span>
      </div>
    </fieldset>

    <slot />
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
