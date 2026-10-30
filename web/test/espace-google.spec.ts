import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import EspaceAuthForm from '@/components/site/EspaceAuthForm.vue'
import EspaceAuthView from '@/views/site/EspaceAuthView.vue'
import EspaceGoogleInscriptionView from '@/views/site/EspaceGoogleInscriptionView.vue'
import EspaceHomeView from '@/views/site/EspaceHomeView.vue'
import { describe as describeEntry, type AuditEntry } from '@/lib/audit-labels'
import { useEspaceStore } from '@/stores/espace'
import { freshPinia, makeRouter, mockApi } from './helpers'

const COMPTE = { prenom: 'Marie', nom: 'Martin', email: 'marie@exemple.fr', telephone: null, type: 'particulier' as const, proVerifie: false, motDePasse: false }

async function mountAt(component: object, path: string, routes: Parameters<typeof mockApi>[0], opts: { google?: boolean; compte?: typeof COMPTE | null; props?: Record<string, unknown> } = {}) {
  const calls = mockApi(routes)
  const pinia = freshPinia()
  const espace = useEspaceStore()
  espace.google = opts.google ?? false
  espace.compte = opts.compte ?? null
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(component, { props: opts.props, global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, calls }
}

describe('Bouton « Continuer avec Google »', () => {
  it('est proposé sur la connexion et sur la création de l’espace quand Google est configuré, avec la page où revenir', async () => {
    const { wrapper } = await mountAt(EspaceAuthView, '/espace/connexion?redirect=%2Fespace%2Fprofil', {}, { google: true, props: { mode: 'connexion' } })
    const lien = wrapper.get('[data-testid="google"]')
    expect(lien.text()).toContain('Continuer avec Google')
    expect(lien.attributes('href')).toBe('/api/espace/google/debut?retour=%2Fespace%2Fprofil')
    expect(lien.find('svg').exists()).toBe(true)
    const ins = await mountAt(EspaceAuthView, '/espace/inscription', {}, { google: true, props: { mode: 'inscription' } })
    expect(ins.wrapper.get('[data-testid="google"]').attributes('href')).toBe('/api/espace/google/debut?retour=%2Fespace')
  })

  it('reste caché quand Google n’est pas configuré', async () => {
    const { wrapper } = await mountAt(EspaceAuthView, '/espace/connexion', {}, { google: false, props: { mode: 'connexion' } })
    expect(wrapper.find('[data-testid="google"]').exists()).toBe(false)
  })

  it('reste caché dans le configurateur, où la redirection ferait perdre la pièce en cours', async () => {
    const { wrapper } = await mountAt(EspaceAuthForm, '/configurateur', {}, { google: true, props: { mode: 'connexion', submitText: 'Me connecter', after: () => undefined, avecGoogle: false } })
    expect(wrapper.find('[data-testid="google"]').exists()).toBe(false)
  })

  it.each([
    ['echec', /n’a pas abouti/],
    ['desactive', /désactivé/],
    ['indisponible', /pas disponible/],
  ])('explique le retour « %s » de Google', async (code, texte) => {
    const { wrapper } = await mountAt(EspaceAuthView, `/espace/connexion?google=${code}`, {}, { google: true, props: { mode: 'connexion' } })
    expect(wrapper.get('[role="alert"]').text()).toMatch(texte)
  })

  it('n’affiche rien pour un code inconnu', async () => {
    const { wrapper } = await mountAt(EspaceAuthView, '/espace/connexion?google=<b>x</b>', {}, { google: true, props: { mode: 'connexion' } })
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})

describe('Dernière étape de l’inscription avec Google', () => {
  const EN_ATTENTE = { email: 'marie@exemple.fr', prenom: 'Marie', nom: 'Martin' }

  it('montre ce que Google a confirmé, puis crée l’espace et revient à la page demandée', async () => {
    const { wrapper, router, calls } = await mountAt(EspaceGoogleInscriptionView, '/espace/google-inscription?retour=%2Fespace%2Fprofil', {
      'GET /espace/google/en-attente': [200, EN_ATTENTE],
      'POST /espace/google/inscription': [201, { compte: COMPTE }],
    })
    expect(wrapper.text()).toContain('Marie Martin')
    expect(wrapper.text()).toContain('marie@exemple.fr')
    await wrapper.get('#g-type-professionnel').setValue(true)
    await wrapper.get('#g-raisonSociale').setValue('Toitures Martin')
    await wrapper.get('#g-telephone').setValue('06 12 34 56 78')
    await wrapper.get('#g-consentement').setValue(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ type: 'professionnel', raisonSociale: 'Toitures Martin', telephone: '06 12 34 56 78', consentement: true })
    expect(useEspaceStore().compte?.email).toBe('marie@exemple.fr')
    expect(router.currentRoute.value.fullPath).toBe('/espace/profil')
  })

  it('affiche les erreurs de l’API à côté du champ concerné', async () => {
    const { wrapper } = await mountAt(EspaceGoogleInscriptionView, '/espace/google-inscription', {
      'GET /espace/google/en-attente': [200, EN_ATTENTE],
      'POST /espace/google/inscription': [400, { error: 'Indiquez la raison sociale de votre entreprise.', field: 'raisonSociale' }],
    })
    await wrapper.get('#g-type-professionnel').setValue(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.field-error').text()).toContain('raison sociale')
    expect(useEspaceStore().compte).toBeNull()
  })

  it('dit que l’inscription a expiré et propose de recommencer', async () => {
    const { wrapper } = await mountAt(EspaceGoogleInscriptionView, '/espace/google-inscription', { 'GET /espace/google/en-attente': [404, { error: 'expirée' }] })
    expect(wrapper.get('[role="alert"]').text()).toContain('a expiré')
    expect(wrapper.find('form').exists()).toBe(false)
  })
})

describe('Fermer son espace créé avec Google', () => {
  async function ouvrir(compte: typeof COMPTE) {
    const r = await mountAt(
      EspaceHomeView,
      '/espace',
      { 'GET /espace/commandes': [200, { commandes: [] }], 'GET /espace/documents': [200, { documents: [] }], 'POST /espace/compte/fermeture': [204] },
      { compte },
    )
    await r.wrapper
      .findAll('button')
      .find((b) => b.text().includes('Fermer mon espace…'))!
      .trigger('click')
    return r
  }

  it('demande l’adresse e-mail faute de mot de passe, et l’envoie pour confirmer', async () => {
    const { wrapper, calls } = await ouvrir(COMPTE)
    expect(wrapper.find('#close-password').exists()).toBe(false)
    expect(wrapper.get('label[for="close-email"]').text()).toContain('adresse e-mail')
    await wrapper.get('#close-email').setValue('marie@exemple.fr')
    await wrapper.get('form.close-form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.path === '/espace/compte/fermeture')!.body).toEqual({ password: 'marie@exemple.fr' })
  })

  it('garde le mot de passe pour un espace qui en a un', async () => {
    const { wrapper } = await ouvrir({ ...COMPTE, motDePasse: true })
    expect(wrapper.find('#close-email').exists()).toBe(false)
    expect(wrapper.find('#close-password').exists()).toBe(true)
  })
})

describe('Journal : connexion avec Google', () => {
  const texte = (action: string, details: object = {}) => describeEntry({ action, details } as unknown as AuditEntry).text
  it('décrit les actions liées à Google', () => {
    expect(texte('espace.registered', { nom: 'Marie Martin', via: 'google' })).toBe('Espace client créé avec Google : Marie Martin')
    expect(texte('espace.registered', { nom: 'Marie Martin' })).toBe('Espace client créé : Marie Martin')
    expect(texte('espace.login', { via: 'google' })).toBe('Connexion d’un client à son espace avec Google')
    expect(texte('espace.login')).toBe('Connexion d’un client à son espace')
    expect(texte('espace.google_linked')).toContain('Google rattaché')
    expect(texte('espace.google_activated')).toContain('fiche créée par l’atelier')
    expect(texte('espace.google_failed')).toContain('Échec')
  })
})
