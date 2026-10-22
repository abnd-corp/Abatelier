<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { apiBlob, ApiError } from '@/api'
import { renderPdf } from '@/lib/pdf-render'
import type { DocumentType } from '@/lib/documents'
import AppIcon from '@/components/AppIcon.vue'

// Aperçu du modèle avec des données d'exemple, recalculé par l'API à chaque modification
const props = defineProps<{ company: Record<string, unknown>; template: Record<string, unknown>; logoVersion: number }>()

const type = ref<DocumentType>('devis')
const pages = ref<HTMLElement | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const message = ref('')
const pageCount = ref(0)
const fileUrl = ref<string | null>(null)

let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

async function refresh() {
  const mine = ++seq
  state.value = 'loading'
  try {
    const blob = await apiBlob('/documents/preview', { method: 'POST', body: { type: type.value, company: props.company, template: props.template } })
    if (mine !== seq || !pages.value) return
    pageCount.value = await renderPdf(await blob.arrayBuffer(), pages.value, `Aperçu ${type.value === 'devis' ? 'du devis' : 'de la facture'}`)
    if (mine !== seq) return
    if (fileUrl.value) URL.revokeObjectURL(fileUrl.value)
    fileUrl.value = URL.createObjectURL(blob)
    state.value = 'ready'
    message.value = ''
  } catch (e) {
    if (mine !== seq) return
    state.value = 'error'
    // Un champ invalide : on garde le dernier aperçu et on dit pourquoi il n'est pas à jour
    message.value = e instanceof ApiError ? e.message : 'L’aperçu n’a pas pu être affiché.'
  }
}

// On attend une courte pause dans la saisie avant de redemander l'aperçu
const schedule = (delay = 500) => {
  clearTimeout(timer)
  timer = setTimeout(refresh, delay)
}
watch(
  () => [props.company, props.template, props.logoVersion],
  () => schedule(),
  { deep: true },
)
watch(type, () => schedule(0))
watch(pages, (el) => el && schedule(0), { immediate: true })

onBeforeUnmount(() => {
  clearTimeout(timer)
  seq++
  if (fileUrl.value) URL.revokeObjectURL(fileUrl.value)
})
</script>

<template>
  <section class="preview card" aria-label="Aperçu">
    <div class="head">
      <h2>Aperçu</h2>
      <div class="switch" role="group" aria-label="Document à prévisualiser">
        <button type="button" class="chip" :aria-pressed="type === 'devis'" @click="type = 'devis'">Devis</button>
        <button type="button" class="chip" :aria-pressed="type === 'facture'" @click="type = 'facture'">Facture</button>
      </div>
    </div>
    <p class="muted hint">Exemple fictif avec vos réglages, même non enregistrés. Le filigrane « Aperçu » n’apparaît pas sur les vrais documents.</p>
    <p v-if="state === 'error'" class="alert bad" role="alert">Aperçu non mis à jour : {{ message }}</p>
    <div class="sheet" :class="{ busy: state === 'loading' }" :aria-busy="state === 'loading'">
      <div ref="pages" class="pages" />
      <p v-if="state === 'loading' && !pageCount" class="muted wait">Préparation de l’aperçu…</p>
    </div>
    <div class="foot">
      <span class="muted" aria-live="polite">{{ state === 'loading' ? 'Mise à jour…' : pageCount ? `${pageCount} page${pageCount > 1 ? 's' : ''}` : '' }}</span>
      <a v-if="fileUrl" class="btn small" :href="fileUrl" :download="`apercu-${type}.pdf`"><AppIcon name="download" :size="15" />Télécharger le PDF</a>
    </div>
  </section>
</template>

<style scoped>
.preview {
  padding: 16px;
  display: grid;
  gap: 10px;
  align-content: start;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
h2 {
  font-size: 1.05rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.switch {
  display: flex;
  gap: 6px;
}
.chip {
  border: 1px solid var(--line);
  background: var(--surface);
  border-radius: 999px;
  padding: 5px 14px;
  font-weight: 600;
  color: var(--muted);
}
.chip[aria-pressed='true'] {
  color: var(--ink);
  border-color: var(--accent);
  background: var(--accent-soft);
}
.hint {
  font-size: 0.8rem;
  margin: 0;
}
.sheet {
  position: relative;
  min-height: 200px;
  background: var(--surface-2);
  border-radius: 8px;
  padding: 10px;
  transition: opacity 0.15s;
}
.sheet.busy .pages {
  opacity: 0.6;
}
/* Les pages sont du papier blanc, en thème clair comme en sombre */
.pages :deep(canvas) {
  display: block;
  width: 100%;
  height: auto;
  background: #fff;
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.18);
  border-radius: 2px;
}
.pages :deep(canvas + canvas) {
  margin-top: 10px;
}
.wait {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
}
.foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
}
@media (pointer: coarse) {
  .chip {
    min-height: 40px;
  }
}
</style>
