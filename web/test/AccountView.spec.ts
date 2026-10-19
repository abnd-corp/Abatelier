import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AccountView from '@/views/AccountView.vue'
import { useAuthStore, type User } from '@/stores/auth'
import { ADMIN, freshPinia, makeRouter, mockApi } from './helpers'

const SESSIONS = {
  sessions: [
    { id: 'a', device: 'Firefox sur Linux', ip: '10.0.0.1', remember: false, createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), current: true },
    { id: 'b', device: 'Chrome sur Android', ip: '10.0.0.2', remember: true, createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), current: false },
  ],
}

async function setup(user: User = ADMIN, extra: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({ 'GET /auth/sessions': [200, SESSIONS], ...extra })
  const pinia = freshPinia()
  useAuthStore().user = user
  const router = makeRouter()
  await router.push('/mon-compte')
  await router.isReady()
  const wrapper = mount(AccountView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, calls }
}

const submit = (w: Awaited<ReturnType<typeof setup>>['wrapper']) => w.get('form button[type="submit"]')

describe('Mon compte : mot de passe', () => {
  it('coche les règles au fur et à mesure de la saisie', async () => {
    const { wrapper } = await setup()
    const rules = () => wrapper.findAll('#pw-rules li').map((li) => li.classes().includes('ok'))
    expect(rules()).toEqual([false, false, false])
    await wrapper.get('#pw-next').setValue('Tole-pliee-bleu-42')
    expect(rules()).toEqual([true, true, true])
    expect(wrapper.get('.strength').text()).toMatch(/Bon|Excellent|Correct/)
  })

  it('n’active le bouton que si tout est valide et confirmé', async () => {
    const { wrapper } = await setup()
    await wrapper.get('#pw-current').setValue('Ancien-mot-2026')
    await wrapper.get('#pw-next').setValue('Tole-pliee-bleu-42')
    await wrapper.get('#pw-confirm').setValue('Tole-pliee-bleu-4')
    expect(wrapper.text()).toContain('ne correspondent pas')
    expect(submit(wrapper).attributes('disabled')).toBeDefined()
    await wrapper.get('#pw-confirm').setValue('Tole-pliee-bleu-42')
    expect(submit(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('affiche l’erreur du serveur sur le bon champ', async () => {
    const { wrapper } = await setup(ADMIN, {
      'POST /auth/password': [400, { error: 'Le mot de passe actuel est incorrect.', field: 'current' }],
    })
    await wrapper.get('#pw-current').setValue('faux')
    await wrapper.get('#pw-next').setValue('Tole-pliee-bleu-42')
    await wrapper.get('#pw-confirm').setValue('Tole-pliee-bleu-42')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Le mot de passe actuel est incorrect.')
    expect(wrapper.get('#pw-current').attributes('aria-invalid')).toBe('true')
  })

  it('après un mot de passe temporaire, ouvre l’application une fois changé', async () => {
    const { wrapper, router } = await setup(
      { ...ADMIN, mustChangePassword: true },
      { 'POST /auth/password': [200, { user: ADMIN, closedSessions: 1 }] },
    )
    expect(wrapper.text()).toContain('mot de passe est temporaire')
    expect(wrapper.get('label[for="pw-current"]').text()).toBe('Mot de passe temporaire')
    await wrapper.get('#pw-current').setValue('ABCD-efgh-2345-JKLM')
    await wrapper.get('#pw-next').setValue('Tole-pliee-bleu-42')
    await wrapper.get('#pw-confirm').setValue('Tole-pliee-bleu-42')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(useAuthStore().user?.mustChangePassword).toBe(false)
    expect(router.currentRoute.value.name).toBe('dashboard')
  })
})

describe('Mon compte : appareils', () => {
  it('liste les appareils et marque celui en cours', async () => {
    const { wrapper } = await setup()
    const items = wrapper.findAll('.sessions li')
    expect(items).toHaveLength(2)
    expect(items[0]!.text()).toContain('Firefox sur Linux')
    expect(items[0]!.text()).toContain('Cet appareil')
    expect(items[0]!.find('button').exists()).toBe(false)
    expect(items[1]!.text()).toContain('reste connecté')
  })

  it('déconnecte un autre appareil', async () => {
    const { wrapper, calls } = await setup(ADMIN, { 'DELETE /auth/sessions/b': [204] })
    await wrapper.findAll('.sessions li')[1]!.get('button').trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/auth/sessions/b')).toBe(true)
  })
})
