import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import EspaceMotDePasseOublieView from '@/views/site/EspaceMotDePasseOublieView.vue'
import EspaceNouveauMotDePasseView from '@/views/site/EspaceNouveauMotDePasseView.vue'
import EspaceAuthForm from '@/components/site/EspaceAuthForm.vue'
import { useEspaceStore } from '@/stores/espace'
import { freshPinia, makeRouter, mockApi } from './helpers'

async function mountAt(component: object, path: string, routes: Parameters<typeof mockApi>[0], props: Record<string, unknown> = {}) {
  const calls = mockApi(routes)
  const pinia = freshPinia()
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(component, { props, global: { plugins: [pinia, router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router, calls, pinia }
}

beforeEach(() => document.body.replaceChildren())

describe('Mot de passe oublié', () => {
  it('envoie l’adresse saisie et répond de la même façon qu’elle existe ou non', async () => {
    const { wrapper, calls } = await mountAt(EspaceMotDePasseOublieView, '/espace/mot-de-passe-oublie', { 'POST /espace/mot-de-passe-oublie': [200, { ok: true }] })
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.get('#oubli-email').setValue('jean@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({ path: '/espace/mot-de-passe-oublie', body: { email: 'jean@example.com' } })
    // Jamais « adresse inconnue » : le message est conditionnel
    const msg = wrapper.get('[role="status"]').text()
    expect(msg).toContain('Si cette adresse correspond à un espace client ou à une fiche, un message vient de vous être envoyé')
    expect(msg).toContain('1 heure')
    expect(msg).toContain('7 jours')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('montre l’erreur quand l’adresse est mal formée ou que l’envoi échoue', async () => {
    const { wrapper } = await mountAt(EspaceMotDePasseOublieView, '/espace/mot-de-passe-oublie', {
      'POST /espace/mot-de-passe-oublie': [400, { error: 'Indiquez votre adresse e-mail.', field: 'email' }],
    })
    await wrapper.get('#oubli-email').setValue('pas une adresse')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Indiquez votre adresse e-mail.')
    expect(wrapper.find('form').exists()).toBe(true)
  })

  it('propose de revenir à la connexion', async () => {
    const { wrapper } = await mountAt(EspaceMotDePasseOublieView, '/espace/mot-de-passe-oublie', {})
    expect(wrapper.get('a[href="/espace/connexion"]').text()).toContain('Retour à la connexion')
  })
})

describe('Page du lien reçu par e-mail', () => {
  const verif = (r: object) => ({ 'POST /espace/jeton/verification': [200, r] }) as Parameters<typeof mockApi>[0]

  it('vérifie le lien, puis enregistre le nouveau mot de passe et le dit', async () => {
    const { wrapper, calls } = await mountAt(EspaceNouveauMotDePasseView, '/espace/nouveau-mot-de-passe?jeton=abcdefghijklmnopqrstuv', {
      ...verif({ valide: true, objet: 'reinitialisation' }),
      'POST /espace/nouveau-mot-de-passe': [200, { ok: true }],
    })
    expect(calls[0]).toMatchObject({ path: '/espace/jeton/verification', body: { jeton: 'abcdefghijklmnopqrstuv' } })
    expect(wrapper.get('h1').text()).toBe('Choisissez un nouveau mot de passe')
    await wrapper.get('#mdp-password').setValue('Cintreuse-hydraulique-2027')
    expect(wrapper.text()).toContain('Solidité')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.path === '/espace/nouveau-mot-de-passe')!.body).toEqual({ jeton: 'abcdefghijklmnopqrstuv', password: 'Cintreuse-hydraulique-2027' })
    expect(wrapper.get('h1').text()).toBe('Mot de passe modifié')
    expect(wrapper.text()).toContain('déconnecté de vos autres appareils')
    expect(wrapper.find('a[href="/espace/connexion"]').exists()).toBe(true)
    // Le mot de passe saisi ne reste pas en mémoire de la page
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('active l’espace d’une fiche existante, connecte le client et l’emmène dans son espace', async () => {
    const compte = { prenom: 'Jean', nom: 'Dupont', email: 'jean@example.com', telephone: null, type: 'particulier', proVerifie: false }
    const { wrapper, router, calls, pinia } = await mountAt(EspaceNouveauMotDePasseView, '/espace/nouveau-mot-de-passe?jeton=abcdefghijklmnopqrstuv', {
      ...verif({ valide: true, objet: 'activation' }),
      'POST /espace/activation': [201, { compte }],
    })
    expect(wrapper.get('h1').text()).toBe('Activez votre espace client')
    expect(wrapper.text()).toContain('Une fiche existe déjà à votre nom')
    await wrapper.get('#mdp-password').setValue('Cintreuse-hydraulique-2027')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.path === '/espace/activation')!.body).toEqual({ jeton: 'abcdefghijklmnopqrstuv', password: 'Cintreuse-hydraulique-2027' })
    expect(useEspaceStore(pinia).isLoggedIn).toBe(true)
    expect(router.currentRoute.value.name).toBe('espace')
  })

  it('dit que le lien n’est plus valable (expiré, déjà utilisé, absent) et propose d’en demander un autre', async () => {
    for (const path of ['/espace/nouveau-mot-de-passe?jeton=abcdefghijklmnopqrstuv', '/espace/nouveau-mot-de-passe']) {
      const { wrapper } = await mountAt(EspaceNouveauMotDePasseView, path, verif({ valide: false }))
      expect(wrapper.get('h1').text()).toBe('Ce lien n’est plus valable')
      expect(wrapper.find('form').exists()).toBe(false)
      expect(wrapper.get('a[href="/espace/mot-de-passe-oublie"]').text()).toContain('Demander un nouveau lien')
      document.body.replaceChildren()
    }
  })

  it('affiche l’erreur du serveur sur le mot de passe sans quitter le formulaire, et passe à « lien invalide » si le lien a servi entre-temps', async () => {
    const faible = await mountAt(EspaceNouveauMotDePasseView, '/espace/nouveau-mot-de-passe?jeton=abcdefghijklmnopqrstuv', {
      ...verif({ valide: true, objet: 'reinitialisation' }),
      'POST /espace/nouveau-mot-de-passe': [400, { error: 'Mot de passe trop courant.', field: 'password' }],
    })
    await faible.wrapper.get('#mdp-password').setValue('motdepasse')
    await faible.wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(faible.wrapper.get('[role="alert"]').text()).toContain('trop courant')
    expect(faible.wrapper.find('form').exists()).toBe(true)
    document.body.replaceChildren()
    const perime = await mountAt(EspaceNouveauMotDePasseView, '/espace/nouveau-mot-de-passe?jeton=abcdefghijklmnopqrstuv', {
      ...verif({ valide: true, objet: 'reinitialisation' }),
      'POST /espace/nouveau-mot-de-passe': [400, { error: 'Ce lien n’est plus valable.', field: 'jeton' }],
    })
    await perime.wrapper.get('#mdp-password').setValue('Cintreuse-hydraulique-2027')
    await perime.wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(perime.wrapper.get('h1').text()).toBe('Ce lien n’est plus valable')
  })
})

describe('Connexion', () => {
  it('propose « Mot de passe oublié ? » sur le formulaire de connexion seulement', async () => {
    const connexion = await mountAt(EspaceAuthForm, '/espace/connexion', {}, { mode: 'connexion', submitText: 'Me connecter' })
    expect(connexion.wrapper.get('a[href="/espace/mot-de-passe-oublie"]').text()).toBe('Mot de passe oublié ?')
    document.body.replaceChildren()
    const inscription = await mountAt(EspaceAuthForm, '/espace/inscription', {}, { mode: 'inscription', submitText: 'Créer' })
    expect(inscription.wrapper.find('a[href="/espace/mot-de-passe-oublie"]').exists()).toBe(false)
  })
})
