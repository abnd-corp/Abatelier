import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource-variable/instrument-sans'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import App from './App.vue'
import { router } from './router'
import { apiEvents } from './api'
import { useAuthStore } from './stores/auth'
import './style.css'

const app = createApp(App).use(createPinia()).use(router)

const auth = useAuthStore()
apiEvents.onUnauthorized = () => {
  auth.forget()
  const current = router.currentRoute.value
  if (!current.meta.public) router.replace({ name: 'login', query: { redirect: current.fullPath, expire: '1' } })
}
apiEvents.onPasswordChangeRequired = () => router.replace({ name: 'account' })

app.mount('#app')
