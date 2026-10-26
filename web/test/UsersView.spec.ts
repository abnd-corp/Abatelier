import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import UsersView from '@/views/UsersView.vue'
import { useAuthStore } from '@/stores/auth'
import { ADMIN, freshPinia, makeRouter, mockApi } from './helpers'

const now = new Date().toISOString()
const USERS = {
  users: [
    {
      id: ADMIN.id,
      identifiant: 'chef',
      nom: 'Le Chef',
      sections: ['ventes', 'atelier', 'direction'],
      admin: true,
      mustChangePassword: false,
      disabledAt: null,
      createdAt: now,
      lastLoginAt: now,
      activeSessions: 1,
    },
    { id: 'p1', identifiant: 'paul', nom: 'Paul Martin', sections: ['atelier'], admin: false, mustChangePassword: true, disabledAt: null, createdAt: now, lastLoginAt: null, activeSessions: 0 },
    { id: 'm1', identifiant: 'marie', nom: 'Marie', sections: ['atelier'], admin: false, mustChangePassword: false, disabledAt: now, createdAt: now, lastLoginAt: now, activeSessions: 0 },
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

describe('Gestion des comptes', () => {
  it('affiche le statut de chaque compte', async () => {
    const { row } = await setup()
    expect(row('Le Chef').text()).toContain('(vous)')
    expect(row('Le Chef').text()).toContain('Actif')
    expect(row('Paul Martin').text()).toContain('Mot de passe à changer')
    expect(row('Marie').text()).toContain('Désactivé')
  })

  it('affiche les droits de chaque compte et propose les sections à cocher', async () => {
    const withAdmin = {
      users: [
        ...USERS.users,
        { id: 'r1', identifiant: 'claire', nom: 'Claire Petit', sections: ['ventes'], admin: true, mustChangePassword: false, disabledAt: null, createdAt: now, lastLoginAt: now, activeSessions: 0 },
      ],
    }
    const { wrapper, row } = await setup({ 'GET /users': [200, withAdmin] })
    expect(row('Paul Martin').text()).toContain('Atelier')
    expect(row('Claire Petit').text()).toContain('Ventes')
    expect(row('Claire Petit').text()).toContain('Administration')
    expect(row('Le Chef').text()).toContain('Direction')
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Ajouter un compte'))!
      .trigger('click')
    expect(wrapper.findAll('fieldset input[type="checkbox"]').map((i) => i.attributes('id'))).toEqual(['new-ventes', 'new-atelier', 'new-direction', 'new-admin'])
  })

  it('modifie les droits d’un compte, jamais les siens', async () => {
    const { wrapper, calls, row } = await setup({ 'PATCH /users/p1': [200, { ok: true }] })
    expect(row('Le Chef').text()).not.toContain('Modifier')
    await row('Paul Martin').get('button[aria-label="Modifier les droits de Paul Martin"]').trigger('click')
    expect((wrapper.get('#droits-p1-atelier').element as HTMLInputElement).checked).toBe(true)
    await wrapper.get('#droits-p1-ventes').setValue(true)
    await wrapper.get('#droits-p1-admin').setValue(true)
    await wrapper.get('button[aria-label="Enregistrer les droits de Paul Martin"]').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ sections: ['ventes', 'atelier'], admin: true })
    expect(wrapper.text()).toContain('Les droits de Paul Martin sont enregistrés.')
  })

  it('n’affiche ni désactivation ni réinitialisation sur son propre compte', async () => {
    const { row } = await setup()
    const buttons = row('Le Chef')
      .findAll('button')
      .map((b) => b.text())
    expect(buttons).not.toContain('Désactiver')
    expect(buttons).not.toContain('Nouveau mot de passe')
    expect(row('Le Chef').find('button[aria-label^="Modifier les droits"]').exists()).toBe(false)
  })

  it('crée un compte et affiche le mot de passe temporaire une seule fois', async () => {
    const { wrapper, calls } = await setup({ 'POST /users': [201, { id: 'n1', tempPassword: 'aaaa-bbbb-cccc-dddd' }] })
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Ajouter un compte'))!
      .trigger('click')
    await wrapper.get('#new-nom').setValue('Jean Dupont')
    await wrapper.get('#new-identifiant').setValue('jean')
    await wrapper.get('#new-direction').setValue(true)
    await wrapper.get('#new-admin').setValue(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ identifiant: 'jean', nom: 'Jean Dupont', sections: ['atelier', 'direction'], admin: true })
    expect(wrapper.text()).toContain('Mot de passe temporaire de Jean Dupont')
    expect(wrapper.get('.temp-pw code').text()).toBe('aaaa-bbbb-cccc-dddd')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'J’ai noté')!
      .trigger('click')
    expect(wrapper.text()).not.toContain('aaaa-bbbb-cccc-dddd')
  })

  it('demande confirmation avant de désactiver', async () => {
    const { row, calls } = await setup({ 'POST /users/p1/disable': [200, { ok: true }] })
    await row('Paul Martin')
      .findAll('button')
      .find((b) => b.text() === 'Désactiver')!
      .trigger('click')
    expect(calls.some((c) => c.path === '/users/p1/disable')).toBe(false)
    expect(row('Paul Martin').text()).toContain('déconnectée partout')
    await row('Paul Martin')
      .findAll('button')
      .find((b) => b.text() === 'Confirmer')!
      .trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.method === 'POST' && c.path === '/users/p1/disable')).toBe(true)
  })

  it('l’annulation n’envoie rien', async () => {
    const { row, calls } = await setup()
    await row('Paul Martin')
      .findAll('button')
      .find((b) => b.text() === 'Désactiver')!
      .trigger('click')
    await row('Paul Martin')
      .findAll('button')
      .find((b) => b.text() === 'Annuler')!
      .trigger('click')
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([])
  })

  it('affiche l’erreur renvoyée par le serveur', async () => {
    const { wrapper, row } = await setup({ 'PATCH /users/p1': [400, { error: 'Il doit rester au moins un compte Direction actif.' }] })
    await row('Paul Martin').get('button[aria-label^="Modifier les droits"]').trigger('click')
    await wrapper.get('#droits-p1-atelier').setValue(false)
    await wrapper.get('button[aria-label^="Enregistrer les droits"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Il doit rester au moins un compte Direction actif.')
  })
})
