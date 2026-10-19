import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import UsersView from '@/views/UsersView.vue'
import { useAuthStore } from '@/stores/auth'
import { ADMIN, freshPinia, makeRouter, mockApi } from './helpers'

const now = new Date().toISOString()
const USERS = {
  users: [
    { id: ADMIN.id, identifiant: 'chef', nom: 'Le Chef', role: 'admin', mustChangePassword: false, disabledAt: null, createdAt: now, lastLoginAt: now, activeSessions: 1 },
    { id: 'p1', identifiant: 'paul', nom: 'Paul Martin', role: 'atelier', mustChangePassword: true, disabledAt: null, createdAt: now, lastLoginAt: null, activeSessions: 0 },
    { id: 'm1', identifiant: 'marie', nom: 'Marie', role: 'atelier', mustChangePassword: false, disabledAt: now, createdAt: now, lastLoginAt: now, activeSessions: 0 },
  ],
}

async function setup(extra: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({ 'GET /users': [200, USERS], ...extra })
  const pinia = freshPinia()
  useAuthStore().user = ADMIN
  const router = makeRouter()
  await router.push('/utilisateurs')
  await router.isReady()
  const wrapper = mount(UsersView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  const row = (nom: string) => wrapper.findAll('tbody tr').find((tr) => tr.text().includes(nom))!
  return { wrapper, calls, row }
}

describe('Gestion des utilisateurs', () => {
  it('affiche le statut de chaque compte', async () => {
    const { row } = await setup()
    expect(row('Le Chef').text()).toContain('(vous)')
    expect(row('Le Chef').text()).toContain('Actif')
    expect(row('Paul Martin').text()).toContain('Mot de passe à changer')
    expect(row('Marie').text()).toContain('Désactivé')
  })

  it('n’affiche ni désactivation ni réinitialisation sur son propre compte', async () => {
    const { row } = await setup()
    const buttons = row('Le Chef').findAll('button').map((b) => b.text())
    expect(buttons).not.toContain('Désactiver')
    expect(buttons).not.toContain('Nouveau mot de passe')
    expect(row('Le Chef').get('select').attributes('disabled')).toBeDefined()
  })

  it('crée un compte et affiche le mot de passe temporaire une seule fois', async () => {
    const { wrapper, calls } = await setup({ 'POST /users': [201, { id: 'n1', tempPassword: 'aaaa-bbbb-cccc-dddd' }] })
    await wrapper.findAll('button').find((b) => b.text().includes('Ajouter un utilisateur'))!.trigger('click')
    await wrapper.get('#new-nom').setValue('Jean Dupont')
    await wrapper.get('#new-identifiant').setValue('jean')
    await wrapper.get('#new-role').setValue('admin')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ identifiant: 'jean', nom: 'Jean Dupont', role: 'admin' })
    expect(wrapper.text()).toContain('Mot de passe temporaire de Jean Dupont')
    expect(wrapper.get('.temp-pw code').text()).toBe('aaaa-bbbb-cccc-dddd')
    await wrapper.findAll('button').find((b) => b.text() === 'J’ai noté')!.trigger('click')
    expect(wrapper.text()).not.toContain('aaaa-bbbb-cccc-dddd')
  })

  it('demande confirmation avant de désactiver', async () => {
    const { row, calls } = await setup({ 'POST /users/p1/disable': [200, { ok: true }] })
    await row('Paul Martin').findAll('button').find((b) => b.text() === 'Désactiver')!.trigger('click')
    expect(calls.some((c) => c.path === '/users/p1/disable')).toBe(false)
    expect(row('Paul Martin').text()).toContain('déconnectée partout')
    await row('Paul Martin').findAll('button').find((b) => b.text() === 'Confirmer')!.trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.method === 'POST' && c.path === '/users/p1/disable')).toBe(true)
  })

  it('l’annulation n’envoie rien', async () => {
    const { row, calls } = await setup()
    await row('Paul Martin').findAll('button').find((b) => b.text() === 'Désactiver')!.trigger('click')
    await row('Paul Martin').findAll('button').find((b) => b.text() === 'Annuler')!.trigger('click')
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([])
  })

  it('affiche l’erreur renvoyée par le serveur', async () => {
    const { wrapper, row } = await setup({ 'PATCH /users/p1': [400, { error: 'Il doit rester au moins un administrateur actif.' }] })
    await row('Paul Martin').get('select').setValue('admin')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Il doit rester au moins un administrateur actif.')
  })
})
