<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import { accessLabel, useAuthStore } from '@/stores/auth'
import { checkPassword } from '@/lib/password'
import { relative, dateTime } from '@/lib/format'
import PasswordInput from '@/components/PasswordInput.vue'
import AppIcon from '@/components/AppIcon.vue'

interface Session {
  id: string
  device: string
  ip: string | null
  remember: boolean
  createdAt: string
  lastSeenAt: string
  current: boolean
}

const auth = useAuthStore()
const router = useRouter()
const mustChange = computed(() => auth.user?.mustChangePassword ?? false)

// Changement de mot de passe
const current = ref('')
const next = ref('')
const confirm = ref('')
const pwError = ref<{ msg: string; field?: string } | null>(null)
const pwSuccess = ref('')
const saving = ref(false)
const check = computed(() => checkPassword(next.value, { identifiant: auth.user?.identifiant, nom: auth.user?.nom }))
const mismatch = computed(() => confirm.value.length > 0 && confirm.value !== next.value)
const canSubmit = computed(() => current.value && check.value.valid && next.value === confirm.value && !saving.value)

async function changePassword() {
  pwError.value = null
  pwSuccess.value = ''
  saving.value = true
  const wasTemporary = mustChange.value
  try {
    const closed = await auth.changePassword(current.value, next.value)
    current.value = next.value = confirm.value = ''
    pwSuccess.value = closed ? `Mot de passe changé. ${closed} autre(s) appareil(s) ont été déconnectés.` : 'Mot de passe changé.'
    await loadSessions()
    if (wasTemporary) await router.replace({ name: 'dashboard' })
  } catch (e) {
    pwError.value = e instanceof ApiError ? { msg: e.message, field: e.field } : { msg: 'Le changement a échoué. Réessayez.' }
  } finally {
    saving.value = false
  }
}

// Appareils connectés
const sessions = ref<Session[]>([])
const sessionsError = ref('')
async function loadSessions() {
  try {
    sessions.value = (await api<{ sessions: Session[] }>('/auth/sessions')).sessions
  } catch (e) {
    sessionsError.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
}
async function revoke(id: string) {
  await api(`/auth/sessions/${id}`, { method: 'DELETE' }).catch(() => {})
  await loadSessions()
}
async function revokeOthers() {
  await api('/auth/sessions', { method: 'DELETE' }).catch(() => {})
  await loadSessions()
}
const others = computed(() => sessions.value.filter((s) => !s.current).length)

onMounted(loadSessions)
</script>

<template>
  <div class="page-head">
    <div>
      <span class="eyebrow">{{ auth.user?.identifiant }} · {{ auth.user ? accessLabel(auth.user) : '' }}</span>
      <h1>Mon compte</h1>
    </div>
  </div>

  <p v-if="mustChange" class="alert" role="status">
    <AppIcon name="shield" />
    Votre mot de passe est temporaire. Choisissez-en un nouveau pour accéder à l’application.
  </p>

  <div class="grid">
    <form class="card section" novalidate @submit.prevent="changePassword">
      <h2>Changer mon mot de passe</h2>

      <p v-if="pwSuccess" class="alert ok" role="status">{{ pwSuccess }}</p>
      <p v-if="pwError" class="alert bad" role="alert">{{ pwError.msg }}</p>

      <!-- Champ caché pour que le gestionnaire de mots de passe associe le bon compte -->
      <input type="text" name="username" autocomplete="username" :value="auth.user?.identifiant" hidden readonly />

      <div class="field">
        <label for="pw-current">{{ mustChange ? 'Mot de passe temporaire' : 'Mot de passe actuel' }}</label>
        <PasswordInput id="pw-current" v-model="current" autocomplete="current-password" :invalid="pwError?.field === 'current'" />
      </div>

      <div class="field">
        <label for="pw-next">Nouveau mot de passe</label>
        <PasswordInput id="pw-next" v-model="next" autocomplete="new-password" describedby="pw-rules" :invalid="pwError?.field === 'next'" />
        <div class="meter" :data-score="check.score" aria-hidden="true"><span v-for="i in 4" :key="i" :class="{ on: next && i <= Math.max(check.score, 1) }" /></div>
        <div id="pw-rules" class="rules">
          <span class="strength"
            >Robustesse : <b>{{ next ? check.label : '—' }}</b></span
          >
          <ul>
            <li v-for="r in check.rules" :key="r.label" :class="{ ok: r.ok }"><AppIcon :name="r.ok ? 'check' : 'plus'" :size="14" :class="{ x: !r.ok }" />{{ r.label }}</li>
          </ul>
          <span class="muted tip">Astuce : une phrase de 4 ou 5 mots est facile à retenir et très robuste.</span>
        </div>
      </div>

      <div class="field">
        <label for="pw-confirm">Confirmer le nouveau mot de passe</label>
        <PasswordInput id="pw-confirm" v-model="confirm" autocomplete="new-password" :invalid="mismatch" />
        <span v-if="mismatch" class="field-error">Les deux mots de passe ne correspondent pas.</span>
      </div>

      <p class="muted note">Vos autres appareils seront déconnectés.</p>
      <div>
        <button class="btn primary" type="submit" :disabled="!canSubmit">{{ saving ? 'Enregistrement…' : 'Changer le mot de passe' }}</button>
      </div>
    </form>

    <section class="card section">
      <div class="sec-h">
        <h2>Appareils connectés</h2>
        <button v-if="others > 0" class="btn" type="button" @click="revokeOthers">Déconnecter les autres</button>
      </div>
      <p v-if="sessionsError" class="alert bad">{{ sessionsError }}</p>
      <ul class="sessions">
        <li v-for="s in sessions" :key="s.id">
          <AppIcon name="device" :size="22" class="muted" />
          <div class="s-info">
            <b>{{ s.device }}</b>
            <span v-if="s.current" class="pill accent">Cet appareil</span>
            <span class="muted s-meta">
              {{ s.ip ?? 'IP inconnue' }} · actif {{ relative(s.lastSeenAt) }} ·
              <span :title="dateTime(s.createdAt)">connecté {{ relative(s.createdAt) }}</span>
              · {{ s.remember ? 'reste connecté' : 'déconnexion après inactivité' }}
            </span>
          </div>
          <button v-if="!s.current" class="btn small" type="button" @click="revoke(s.id)">Déconnecter</button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
.section {
  padding: 22px;
  display: grid;
  gap: 14px;
}
.sec-h {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.meter {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  margin-top: 4px;
}
.meter span {
  height: 5px;
  border-radius: 3px;
  background: var(--line);
}
.meter[data-score='0'] .on,
.meter[data-score='1'] .on {
  background: var(--bad);
}
.meter[data-score='2'] .on {
  background: var(--warn);
}
.meter[data-score='3'] .on,
.meter[data-score='4'] .on {
  background: var(--ok);
}
.rules {
  display: grid;
  gap: 4px;
  font-size: 0.82rem;
}
.rules ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 2px;
}
.rules li {
  display: flex;
  gap: 6px;
  align-items: center;
  color: var(--muted);
}
.rules li.ok {
  color: var(--ok);
}
.rules .x {
  transform: rotate(45deg);
}
.tip,
.note {
  font-size: 0.8rem;
}
.sessions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
}
.sessions li {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 0;
  border-top: 1px solid var(--line);
}
.sessions li:first-child {
  border-top: 0;
}
.s-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: center;
}
.s-meta {
  width: 100%;
  font-size: 0.8rem;
}
@media (max-width: 860px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
