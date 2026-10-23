import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import LoginView from '@/views/LoginView.vue'
import { ADMIN, freshPinia, makeRouter, mockApi } from './helpers'

async function setup(path = '/connexion') {
  const pinia = freshPinia()
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(LoginView, { global: { plugins: [pinia, router] }, attachTo: document.body })
  return { wrapper, router }
}

async function fill(w: Awaited<ReturnType<typeof setup>>['wrapper'], identifiant = 'chef', password = 'Plieuse-numerique-2026') {
  await w.get('#identifiant').setValue(identifiant)
  await w.get('#password').setValue(password)
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('Page de connexion', () => {
  it('affiche le logo, le nom de l’entreprise et le formulaire', async () => {
    mockApi({})
    const { wrapper } = await setup()
    expect(wrapper.get('svg[role="img"]').attributes('aria-label')).toBe('Alu Pliage Service')
    expect(wrapper.text()).toContain('Alu Pliage Service')
    expect(wrapper.text()).toContain('Espace atelier')
    expect(wrapper.get('h1').text()).toBe('Connexion')
    expect(wrapper.get('#identifiant').attributes('autocomplete')).toBe('username')
    expect(wrapper.get('#password').attributes('autocomplete')).toBe('current-password')
  })

  it('désactive le bouton tant que les deux champs ne sont pas remplis', async () => {
    mockApi({})
    const { wrapper } = await setup()
    const submit = wrapper.get('button[type="submit"]')
    expect(submit.attributes('disabled')).toBeDefined()
    await wrapper.get('#identifiant').setValue('chef')
    expect(submit.attributes('disabled')).toBeDefined()
    await wrapper.get('#password').setValue('x')
    expect(submit.attributes('disabled')).toBeUndefined()
  })

  it('affiche l’erreur du serveur et vide le mot de passe', async () => {
    mockApi({ 'POST /auth/login': [401, { error: 'Identifiant ou mot de passe incorrect.' }] })
    const { wrapper, router } = await setup()
    await fill(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Identifiant ou mot de passe incorrect.')
    expect((wrapper.get('#password').element as HTMLInputElement).value).toBe('')
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('affiche un message clair si le serveur est injoignable', async () => {
    const { wrapper } = await setup()
    globalThis.fetch = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch
    await fill(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toMatch(/Impossible de joindre le serveur/)
  })

  it('envoie « rester connecté » et ouvre le tableau de bord', async () => {
    const calls = mockApi({ 'POST /auth/login': [200, { user: ADMIN }] })
    const { wrapper, router } = await setup()
    await fill(wrapper, 'Chef')
    await wrapper.get('#remember').setValue(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls[0]).toEqual({ method: 'POST', path: '/auth/login', body: { identifiant: 'Chef', password: 'Plieuse-numerique-2026', remember: true } })
    expect(router.currentRoute.value.name).toBe('dashboard')
  })

  it('revient sur la page demandée avant la connexion', async () => {
    mockApi({ 'POST /auth/login': [200, { user: ADMIN }] })
    const { wrapper, router } = await setup('/connexion?redirect=/journal')
    await fill(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/journal')
  })

  it('ignore une redirection vers un autre site', async () => {
    mockApi({ 'POST /auth/login': [200, { user: ADMIN }] })
    const { wrapper, router } = await setup('/connexion?redirect=//site-pirate.example')
    await fill(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/tableau-de-bord')
  })

  it('envoie vers « Mon compte » si le mot de passe est temporaire', async () => {
    mockApi({ 'POST /auth/login': [200, { user: { ...ADMIN, mustChangePassword: true } }] })
    const { wrapper, router } = await setup('/connexion?redirect=/journal')
    await fill(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('account')
  })

  it('prévient quand la session a expiré', async () => {
    mockApi({})
    const { wrapper } = await setup('/connexion?expire=1')
    expect(wrapper.get('[role="status"]').text()).toMatch(/session a expiré/)
  })
})
