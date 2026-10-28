<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { startScan } from '@/lib/scan'

// Champ de code-barres : on le saisit, ou on le scanne avec la caméra (le code lu remplit le champ).
defineProps<{ id: string; invalid?: boolean }>()
const model = defineModel<string>({ required: true })

const camera = ref(false)
const cameraError = ref('')
const video = ref<HTMLVideoElement | null>(null)
let stop: (() => void) | null = null

async function open() {
  cameraError.value = ''
  stop?.()
  camera.value = true
  await nextTick()
  if (!video.value) return
  try {
    stop = await startScan(video.value, (c) => {
      model.value = c.toUpperCase()
      camera.value = false
    })
  } catch (e) {
    camera.value = false
    cameraError.value = e instanceof Error ? e.message : 'Caméra indisponible.'
  }
}
function close() {
  stop?.()
  stop = null
  camera.value = false
}
onBeforeUnmount(() => stop?.())
</script>

<template>
  <div class="code-field">
    <div class="row">
      <input
        :id="id"
        v-model="model"
        class="input mono"
        :class="{ invalid }"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        placeholder="Scannez ou saisissez le code"
        :aria-invalid="invalid"
      />
      <button v-if="!camera" class="btn" type="button" @click="open"><AppIcon name="eye" :size="16" />Scanner</button>
      <button v-else class="btn" type="button" @click="close">Arrêter la caméra</button>
    </div>
    <div v-show="camera" class="viewer">
      <video ref="video" class="video" playsinline muted aria-label="Caméra : placez le code-barres dans le cadre" />
      <span class="frame" aria-hidden="true" />
    </div>
    <p v-if="cameraError" class="alert bad" role="alert">{{ cameraError }}</p>
  </div>
</template>

<style scoped>
.code-field {
  display: grid;
  gap: 8px;
}
.row {
  display: flex;
  gap: 8px;
}
.row .input {
  flex: 1;
  min-width: 0;
}
.viewer {
  position: relative;
  overflow: hidden;
  border-radius: 10px;
  max-width: 420px;
}
.video {
  display: block;
  width: 100%;
  background: #000;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}
.frame {
  position: absolute;
  inset: 22% 10%;
  border: 3px solid rgb(255 255 255 / 0.85);
  border-radius: 12px;
  pointer-events: none;
}
</style>
