<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/api'
import BrandMark from '@/components/BrandMark.vue'
import PasswordInput from '@/components/PasswordInput.vue'
import { safeRedirect } from '@/lib/redirect'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const identifiant = ref('')
const password = ref('')
const remember = ref(false)
const error = ref('')
const loading = ref(false)
const expired = route.query.expire === '1'

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await auth.login(identifiant.value, password.value, remember.value)
    await router.replace(auth.user?.mustChangePassword ? { name: 'account' } : safeRedirect(route.query.redirect))
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Impossible de joindre le serveur. Vérifiez votre connexion.'
    password.value = ''
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="page">
    <form class="card box" novalidate @submit.prevent="submit">
      <div class="brand">
        <BrandMark class="mark" />
        <div>
          <b>Alu Pliage Service</b>
          <span class="muted">Espace atelier</span>
        </div>
      </div>

      <h1>Connexion</h1>

      <p v-if="error" class="alert bad" role="alert">{{ error }}</p>
      <p v-else-if="expired" class="alert" role="status">Votre session a expiré. Reconnectez-vous pour continuer.</p>

      <div class="field">
        <label for="identifiant">Identifiant</label>
        <input
          id="identifiant"
          v-model="identifiant"
          class="input"
          name="username"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          required
          autofocus
        />
      </div>

      <div class="field">
        <label for="password">Mot de passe</label>
        <PasswordInput id="password" v-model="password" autocomplete="current-password" />
      </div>

      <label class="check">
        <input id="remember" v-model="remember" type="checkbox" />
        <span>
          Rester connecté 30 jours
          <small class="muted">À ne pas cocher sur un ordinateur partagé</small>
        </span>
      </label>

      <button class="btn primary submit" type="submit" :disabled="loading || !identifiant || !password">
        {{ loading ? 'Connexion…' : 'Se connecter' }}
      </button>

      <p class="help muted">Mot de passe oublié ? Demandez à un administrateur de le réinitialiser.</p>
    </form>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: max(24px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom))
    max(16px, env(safe-area-inset-left));
  background-color: var(--bg);
  background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 24px 24px;
  background-position: center;
}
.box {
  width: min(380px, 100%);
  padding: 28px;
  display: grid;
  gap: 16px;
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.08);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mark {
  width: 36px;
  height: 36px;
  flex: none;
}
.brand b {
  display: block;
  font-family: var(--f-display);
  font-stretch: 75%;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 1.1rem;
  line-height: 1;
}
.brand span {
  font-size: 0.8rem;
}
h1 {
  font-size: 1.7rem;
  font-weight: 750;
  margin-top: 6px;
}
.check {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 0.9rem;
}
.check input {
  margin-top: 4px;
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}
.check small {
  display: block;
  font-size: 0.78rem;
}
.submit {
  padding: 11px;
  font-size: 1rem;
}
.help {
  font-size: 0.8rem;
  text-align: center;
}
</style>
