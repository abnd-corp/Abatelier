import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AppLayout from '@/components/AppLayout.vue'
import { useAuthStore, type User } from '@/stores/auth'
import { ADMIN, ATELIER, freshPinia, makeRouter, mockApi } from './helpers'

async function setup(user: User) {
  const pinia = freshPinia()
  useAuthStore().user = user
  const router = makeRouter()
  await router.push('/')
  await router.isReady()
  const wrapper = mount(AppLayout, { global: { plugins: [pinia, router] } })
  const links = () => wrapper.findAll('nav a').map((a) => a.text())
  return { wrapper, router, links }
}

describe('En-tête de l’application', () => {
  it('montre toutes les sections à un administrateur', async () => {
    const { links, wrapper } = await setup(ADMIN)
    expect(links()).toEqual(['Tableau de bord', 'Utilisateurs', 'Journal'])
    expect(wrapper.text()).toContain('Le Chef')
  })

  it('cache la gestion des comptes et le journal au rôle atelier', async () => {
    const { links } = await setup(ATELIER)
    expect(links()).toEqual(['Tableau de bord'])
  })

  it('cache toute la navigation tant que le mot de passe est temporaire', async () => {
    const { links } = await setup({ ...ADMIN, mustChangePassword: true })
    expect(links()).toEqual([])
  })

  it('déconnecte et renvoie à la page de connexion', async () => {
    const calls = mockApi({ 'POST /auth/logout': [204] })
    const { wrapper, router } = await setup(ADMIN)
    await wrapper.get('button[aria-label="Se déconnecter"]').trigger('click')
    await flushPromises()
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /auth/logout'])
    expect(useAuthStore().user).toBeNull()
    expect(router.currentRoute.value.name).toBe('login')
  })
})
