import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import EspaceAvantages from '@/components/site/EspaceAvantages.vue'
import EspaceAuthView from '@/views/site/EspaceAuthView.vue'
import EspaceHomeView from '@/views/site/EspaceHomeView.vue'
import EspaceOrderView from '@/views/site/EspaceOrderView.vue'
import { describe as describeEntry, type AuditEntry } from '@/lib/audit-labels'
import { retourEspace, statutDocument, type EspaceOrder, type EspaceOrderSummary } from '@/lib/espace'
import { useEspaceStore } from '@/stores/espace'
import { freshPinia, makeRouter, mockApi } from './helpers'

const norm = (t: string) => t.replace(/[  ]/g, ' ')
const COMPTE = { prenom: 'Jean', nom: 'Dupont', email: 'jean@example.com', telephone: null, type: 'particulier' as const }

async function mountAt(component: object, path: string, routes: Parameters<typeof mockApi>[0], props: Record<string, unknown> = {}, logged = true) {
  const calls = mockApi(routes)
  const pinia = freshPinia()
  if (logged) useEspaceStore().compte = COMPTE
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(component, { props, global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, calls }
}
const button = (w: ReturnType<typeof mount>, text: string) => w.findAll('button').find((b) => b.text().includes(text))!

const SUMMARY: EspaceOrderSummary[] = [
  { id: 'o1', numero: 'C-2026-0002', kind: 'sur_mesure' as const, statut: 'recue', statutLabel: 'Reçue', ttc: 518.54, createdAt: '2026-10-20T08:00:00Z', datePrevue: null, devis: { id: 'd1', numero: 'D-2026-0002', statut: 'emis' }, facture: null },
  { id: 'o2', numero: 'C-2026-0001', kind: 'sur_mesure' as const, statut: 'fabrication', statutLabel: 'En fabrication', ttc: 120, createdAt: '2026-10-10T08:00:00Z', datePrevue: '2026-10-28', devis: { id: 'd0', numero: 'D-2026-0001', statut: 'accepte' }, facture: null },
]

const ORDER = (over: Partial<EspaceOrder['commande']> = {}, extra: Partial<EspaceOrder> = {}): EspaceOrder => ({
  paiement: null,
  commande: {
    id: 'o1',
    numero: 'C-2026-0002',
    kind: 'sur_mesure',
    statut: 'recue',
    statutLabel: 'Reçue',
    createdAt: '2026-10-20T08:00:00Z',
    datePrevue: null,
    delaiJours: 5,
    livraison: { mode: 'retrait', adresse: null, codePostal: null, ville: null },
    totaux: { brut: 432.12, remisePro: 0, complementMinimum: 0, livraisonPrix: 0, ht: 432.12, tauxTva: 20, tva: 86.42, ttc: 518.54 },
    ...over,
  },
  etapes: [{ statut: 'recue', label: 'Reçue', at: '2026-10-20T08:00:00Z' }],
  lignes: [
    {
      repere: 'Mur sud',
      modeleLabel: 'Couvertine',
      cap: -45,
      materialLabel: 'Aluminium 1,5 mm',
      colorLabel: 'Gris anthracite (RAL 7016)',
      colorHex: '#383e42',
      cotes: [20, 70, 300, 70, 20],
      angles: [-135, 90, 90, -135],
      longueur: 3000,
      quantite: 4,
      accessoires: [{ nom: 'Bouchon de couvertine', unite: 'piece', prix: 5, quantite: 2 }],
      prixUnitaire: 100.08,
      total: 432.12,
    },
  ],
  documents: [{ id: 'd1', type: 'devis', numero: 'D-2026-0002', emisLe: '2026-10-20T08:00:00Z', echeance: '2026-11-19', ttc: 518.54, reponse: null, payeLe: null, statut: 'emis' }],
  ...extra,
})

describe('Outils de l’espace client', () => {
  it('ne revient que vers l’espace client ou le configurateur', () => {
    expect(retourEspace('/espace/commandes/o1')).toBe('/espace/commandes/o1')
    expect(retourEspace('/configurateur')).toBe('/configurateur')
    expect(retourEspace('/boutique/abc')).toBe('/boutique/abc')
    for (const bad of ['//pirate.example', 'https://pirate.example', '/tableau-de-bord', '/espace/../x/\\evil', undefined, 42, '/\\pirate']) expect(retourEspace(bad === '/espace/../x/\\evil' ? '/\\x' : bad)).toBe('/espace')
  })

  it('traduit l’état d’un devis ou d’une facture pour le client', () => {
    expect(statutDocument('devis', 'emis')).toEqual({ label: 'Devis à valider', tone: 'accent' })
    expect(statutDocument('devis', 'envoye').label).toBe('Devis à valider')
    expect(statutDocument('devis', 'accepte').label).toBe('Devis accepté')
    expect(statutDocument('devis', 'expire').label).toBe('Devis expiré')
    expect(statutDocument('facture', 'payee').tone).toBe('ok')
    expect(statutDocument('facture', 'en_retard').tone).toBe('bad')
    expect(statutDocument('facture', 'envoyee').label).toBe('Facture à régler')
  })

  it('décrit les actions de l’espace client dans le journal', () => {
    const e = (action: string, details: object) => norm(describeEntry({ action, details, identifiant: 'espace:c1' } as unknown as AuditEntry).text)
    expect(e('espace.registered', { nom: 'Jean Dupont' })).toBe('Espace client créé : Jean Dupont')
    expect(e('espace.login', {})).toMatch(/Connexion d’un client/)
    expect(e('espace.login_failed', {})).toMatch(/Échec/)
    expect(e('espace.document_downloaded', { type: 'devis', numero: 'D-2026-0002' })).toBe('Un client a téléchargé le devis D-2026-0002')
    expect(e('espace.devis_answered', { numero: 'D-2026-0002', commande: 'C-2026-0002', reponse: 'accepte' })).toMatch(/accepté le devis D-2026-0002 \(commande C-2026-0002\)/)
    expect(e('order.created', { numero: 'C-2026-0002', client: 'Jean Dupont', ht: 432.12, origine: 'espace' })).toMatch(/demandée depuis l’espace client/)
    expect(e('billing.devis_created', { numero: 'D-2026-0002', client: 'Jean Dupont', commande: 'C-2026-0002', ttc: 518.54, origine: 'espace' })).toMatch(/remis dans l’espace client/)
  })
})

describe('Avantages et données', () => {
  it('dit ce que le client y gagne, sans parler des données (elles sont dans la politique de confidentialité)', async () => {
    const { wrapper } = await mountAt(EspaceAvantages, '/configurateur', {}, {})
    const t = wrapper.text()
    for (const gain of ['Votre devis tout de suite', 'Le suivi de votre commande', 'Acceptez en un clic', 'Tout au même endroit']) expect(t).toContain(gain)
    expect(t).not.toContain('Ce que nous faisons de vos données')
    expect(t).not.toContain('nous envoyer votre plan')
    expect(wrapper.find('a[href="/contact"]').exists()).toBe(false)
    expect(wrapper.get('aside').attributes('aria-label')).toBe('Pourquoi créer un espace client')
  })

  it('s’affiche à côté du formulaire, à la connexion comme à la création du compte', async () => {
    const signup = await mountAt(EspaceAuthView, '/espace/inscription', {}, { mode: 'inscription' }, false)
    expect(signup.wrapper.text()).toContain('Pourquoi un espace client ?')
    const login = await mountAt(EspaceAuthView, '/espace/connexion', {}, { mode: 'connexion' }, false)
    expect(login.wrapper.text()).toContain('Pourquoi un espace client ?')
    expect(login.wrapper.get('.page').classes()).toContain('wide')
    expect(login.wrapper.get('.page').element.children[0]!.tagName).toBe('SECTION')
    expect(login.wrapper.get('.page').element.children[1]!.tagName).toBe('ASIDE')
  })
})

describe('Connexion et création de l’espace client', () => {
  it('se connecte puis revient à la page demandée', async () => {
    const { wrapper, router, calls } = await mountAt(EspaceAuthView, '/espace/connexion?redirect=%2Fespace%2Fcommandes%2Fo1', { 'POST /espace/connexion': [200, { compte: COMPTE }] }, { mode: 'connexion' }, false)
    expect(wrapper.get('h1').text()).toBe('Me connecter')
    expect(wrapper.find('#auth-nom').exists()).toBe(false)
    await wrapper.get('#auth-email').setValue('jean@example.com')
    await wrapper.get('#auth-password').setValue('Plieuse-numerique-2026')
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.path === '/espace/connexion')!.body).toEqual({ email: 'jean@example.com', password: 'Plieuse-numerique-2026', remember: true })
    expect(router.currentRoute.value.fullPath).toBe('/espace/commandes/o1')
  })

  it('montre l’erreur de connexion et vide le mot de passe', async () => {
    const { wrapper } = await mountAt(EspaceAuthView, '/espace/connexion', { 'POST /espace/connexion': [401, { error: 'Adresse e-mail ou mot de passe incorrect.' }] }, { mode: 'connexion' }, false)
    await wrapper.get('#auth-email').setValue('jean@example.com')
    await wrapper.get('#auth-password').setValue('mauvais')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Adresse e-mail ou mot de passe incorrect.')
    expect((wrapper.get('#auth-password').element as HTMLInputElement).value).toBe('')
  })

  it('prévient quand la session a expiré, et propose de créer son espace', async () => {
    const { wrapper } = await mountAt(EspaceAuthView, '/espace/connexion?expire=1', {}, { mode: 'connexion' }, false)
    expect(wrapper.text()).toContain('Votre session a expiré')
    expect(wrapper.get('a[href="/espace/inscription"]').text()).toBe('Créer mon espace')
  })

  it('crée l’espace client avec le consentement, puis ouvre l’espace', async () => {
    const { wrapper, router, calls } = await mountAt(EspaceAuthView, '/espace/inscription', { 'POST /espace/inscription': [201, { compte: COMPTE }] }, { mode: 'inscription' }, false)
    expect(wrapper.get('h1').text()).toBe('Créer mon espace client')
    expect(wrapper.get('.trap').attributes('aria-hidden')).toBe('true')
    await wrapper.get('#auth-prenom').setValue('Jean')
    await wrapper.get('#auth-nom').setValue('Dupont')
    await wrapper.get('#auth-email').setValue('jean@example.com')
    await wrapper.get('#auth-telephone').setValue('06 12 34 56 78')
    await wrapper.get('#auth-password').setValue('Plieuse-numerique-2026')
    await wrapper.get('#auth-consentement').setValue(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.path === '/espace/inscription')!.body).toEqual({ prenom: 'Jean', nom: 'Dupont', email: 'jean@example.com', telephone: '06 12 34 56 78', password: 'Plieuse-numerique-2026', consentement: true, site: '' })
    expect(router.currentRoute.value.fullPath).toBe('/espace')
  })

  it('affiche chaque erreur sous son champ et met le focus sur le premier', async () => {
    const { wrapper } = await mountAt(EspaceAuthView, '/espace/inscription', { 'POST /espace/inscription': [400, { error: 'Le mot de passe doit faire au moins 12 caractères.', field: 'password' }] }, { mode: 'inscription' }, false)
    await wrapper.get('#auth-password').setValue('court')
    // Le mot de passe saisi guide l'utilisateur
    expect(wrapper.get('#auth-h-password').text()).toContain('Solidité : Trop faible')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#auth-e-password').text()).toContain('au moins 12')
    expect(wrapper.get('#auth-password').attributes('aria-invalid')).toBe('true')
  })
})

describe('Mes commandes', () => {
  it('liste les commandes avec leur étape et l’état du devis, et prévient qu’un devis attend', async () => {
    const { wrapper } = await mountAt(EspaceHomeView, '/espace', { 'GET /espace/commandes': [200, { commandes: SUMMARY }] })
    expect(wrapper.get('h1').text()).toBe('Bonjour Jean Dupont')
    const rows = wrapper.findAll('ul.list > li')
    expect(rows).toHaveLength(2)
    expect(norm(rows[0]!.text())).toContain('C-2026-0002')
    expect(rows[0]!.text()).toContain('Reçue')
    expect(rows[0]!.text()).toContain('Devis à valider')
    expect(norm(rows[0]!.text())).toContain('518,54 €')
    expect(rows[1]!.text()).toContain('En fabrication')
    expect(rows[1]!.text()).toContain('Devis accepté')
    expect(rows[1]!.text()).toContain('prévue le 28 octobre 2026')
    expect(wrapper.get('[role="status"]').text()).toContain('Un devis attend')
    expect(rows[0]!.get('a').attributes('href')).toBe('/espace/commandes/o1')
  })

  it('propose le configurateur quand il n’y a rien, et dit les erreurs', async () => {
    const empty = await mountAt(EspaceHomeView, '/espace', { 'GET /espace/commandes': [200, { commandes: [] }] })
    expect(empty.wrapper.text()).toContain('Pas encore de commande')
    expect(empty.wrapper.find('a[href="/configurateur"]').exists()).toBe(true)
    const down = await mountAt(EspaceHomeView, '/espace', { 'GET /espace/commandes': [500, { error: 'Le serveur a rencontré un problème.' }] })
    expect(down.wrapper.get('[role="alert"]').text()).toContain('problème')
  })

  it('se déconnecte et revient à l’accueil du site', async () => {
    const { wrapper, router, calls } = await mountAt(EspaceHomeView, '/espace', { 'GET /espace/commandes': [200, { commandes: [] }], 'POST /espace/deconnexion': [204] })
    await button(wrapper, 'Me déconnecter').trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.method === 'POST' && c.path === '/espace/deconnexion')).toBe(true)
    expect(useEspaceStore().compte).toBeNull()
    expect(router.currentRoute.value.name).toBe('site-home')
  })
})

describe('Fermer mon espace', () => {
  const open = async (routes: Parameters<typeof mockApi>[0] = {}) => {
    const m = await mountAt(EspaceHomeView, '/espace', { 'GET /espace/commandes': [200, { commandes: [] }], ...routes })
    await button(m.wrapper, 'Fermer mon espace…').trigger('click')
    return m
  }

  it('demande le mot de passe, ferme l’espace et revient à l’accueil', async () => {
    const { wrapper, router, calls } = await open({ 'POST /espace/compte/fermeture': [204] })
    expect(button(wrapper, 'Fermer définitivement').attributes('disabled')).toBeDefined()
    await wrapper.get('#close-password').setValue('Plieuse-numerique-2026')
    await wrapper.get('form.close-form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.path === '/espace/compte/fermeture')!.body).toEqual({ password: 'Plieuse-numerique-2026' })
    expect(useEspaceStore().compte).toBeNull()
    expect(router.currentRoute.value.name).toBe('site-home')
  })

  it('affiche le refus (commande en cours, mauvais mot de passe) et garde le compte', async () => {
    const { wrapper, router } = await open({ 'POST /espace/compte/fermeture': [409, { error: 'Vous avez encore une commande ou un paiement en cours.' }] })
    await wrapper.get('#close-password').setValue('x')
    await wrapper.get('form.close-form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('en cours')
    expect(useEspaceStore().compte).not.toBeNull()
    expect(router.currentRoute.value.path).toBe('/espace')
  })

  it('peut être annulé', async () => {
    const { wrapper } = await open()
    await button(wrapper, 'Annuler').trigger('click')
    expect(wrapper.find('#close-password').exists()).toBe(false)
  })
})

describe('Ma commande', () => {
  const mountOrder = (data: EspaceOrder, extra: Parameters<typeof mockApi>[0] = {}) => mountAt(EspaceOrderView, '/espace/commandes/o1', { 'GET /espace/commandes/o1': [200, data], ...extra }, { id: 'o1' })

  it('montre le suivi : étape en cours, étapes passées datées, étapes à venir', async () => {
    const { wrapper } = await mountOrder(
      ORDER({ statut: 'fabrication', statutLabel: 'En fabrication', datePrevue: '2026-10-28' }, { etapes: [{ statut: 'recue', label: 'Reçue', at: '2026-10-20T08:00:00Z' }, { statut: 'validee', label: 'Validée', at: '2026-10-21T08:00:00Z' }, { statut: 'fabrication', label: 'En fabrication', at: '2026-10-22T08:00:00Z' }] }),
    )
    const steps = wrapper.findAll('ol.steps > li')
    expect(steps.map((s) => s.classes().filter((c) => ['done', 'now', 'todo'].includes(c))[0])).toEqual(['done', 'done', 'now', 'todo', 'todo'])
    expect(steps[2]!.attributes('aria-current')).toBe('step')
    expect(steps[0]!.text()).toContain('20 octobre 2026')
    expect(steps[2]!.text()).toContain('Vos pièces sont en cours de pliage')
    expect(wrapper.get('.top').text()).toContain('prévue le 28 octobre 2026')
    expect(wrapper.get('h1').text()).toBe('C-2026-0002')
  })

  it('une commande annulée sort du parcours, une commande livrée est entièrement cochée', async () => {
    const cancelled = await mountOrder(ORDER({ statut: 'annulee', statutLabel: 'Annulée' }, { etapes: [{ statut: 'recue', label: 'Reçue', at: '2026-10-20T08:00:00Z' }, { statut: 'annulee', label: 'Annulée', at: '2026-10-21T08:00:00Z' }] }))
    expect(cancelled.wrapper.find('ol.steps').exists()).toBe(false)
    expect(cancelled.wrapper.text()).toContain('Cette commande a été annulée le 21 octobre 2026')
    expect(cancelled.wrapper.text()).not.toContain('Accepter le devis')
    const done = await mountOrder(ORDER({ statut: 'livree', statutLabel: 'Livrée' }))
    expect(done.wrapper.findAll('ol.steps > li.done')).toHaveLength(5)
  })

  it('montre les pièces, les montants et le retrait, sans les notes internes', async () => {
    const { wrapper } = await mountOrder(ORDER())
    const t = norm(wrapper.text())
    expect(t).toContain('4 × Couvertine')
    expect(t).toContain('Mur sud')
    expect(t).toContain('Aluminium 1,5 mm · Gris anthracite (RAL 7016) · longueur 3 000 mm')
    expect(t).toContain('A 20 · B 70 · C 300 · D 70 · E 20 mm')
    expect(t).toContain('+ 2 × Bouchon de couvertine')
    expect(t).toContain('Total HT432,12 €')
    expect(t).toContain('TVA 20 %86,42 €')
    expect(t).toContain('Total TTC518,54 €')
    expect(t).toContain('Retrait à l’atelier.')
    expect(wrapper.findAll('svg.sketch')).toHaveLength(1)
  })

  it('télécharge le devis en PDF et l’accepte', async () => {
    let answered = false
    const { wrapper, calls } = await mountOrder(ORDER(), {
      'POST /espace/documents/d1/reponse': () => {
        answered = true
        return [200, { statut: 'accepte' }]
      },
    })
    expect(wrapper.get('#devis').text()).toContain('Devis à valider')
    expect(norm(wrapper.get('#devis').text())).toContain('518,54 € TTC')
    expect(wrapper.get('#devis').text()).toContain('valable jusqu’au 19 novembre 2026')
    expect(wrapper.get('#devis a[href="/api/espace/documents/d1/pdf"]').attributes('target')).toBe('_blank')
    expect(wrapper.get('#devis a').attributes('rel')).toContain('noopener')
    await button(wrapper, 'Accepter le devis').trigger('click')
    await flushPromises()
    expect(answered).toBe(true)
    expect(calls.find((c) => c.path === '/espace/documents/d1/reponse')!.body).toEqual({ reponse: 'accepte' })
    expect(wrapper.get('[role="status"]').text()).toContain('transmis à l’atelier')
    // La commande est rechargée après la réponse
    expect(calls.filter((c) => c.path === '/espace/commandes/o1')).toHaveLength(2)
  })

  it('demande confirmation avant de refuser, et laisse changer d’avis', async () => {
    const { wrapper, calls } = await mountOrder(ORDER(), { 'POST /espace/documents/d1/reponse': [200, { statut: 'refuse' }] })
    await button(wrapper, 'Refuser').trigger('click')
    expect(calls.some((c) => c.path === '/espace/documents/d1/reponse')).toBe(false)
    await button(wrapper, 'Garder le devis').trigger('click')
    expect(button(wrapper, 'Confirmer le refus')).toBeUndefined()
    await button(wrapper, 'Refuser').trigger('click')
    await button(wrapper, 'Confirmer le refus').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.path === '/espace/documents/d1/reponse')!.body).toEqual({ reponse: 'refuse' })
  })

  it('n’offre plus de réponse quand le devis est déjà accepté, refusé ou expiré', async () => {
    for (const [statut, label] of [['accepte', 'Devis accepté'], ['refuse', 'Devis refusé'], ['expire', 'Devis expiré']] as const) {
      const doc = { ...ORDER().documents[0]!, statut, reponse: statut === 'expire' ? null : (statut as 'accepte' | 'refuse') }
      const { wrapper } = await mountOrder(ORDER({}, { documents: [doc] }))
      expect(wrapper.get('#devis').text()).toContain(label)
      expect(button(wrapper, 'Accepter le devis')).toBeUndefined()
      expect(wrapper.find('#devis a').exists()).toBe(true)
    }
  })

  it('affiche l’erreur du serveur à l’acceptation', async () => {
    const { wrapper } = await mountOrder(ORDER(), { 'POST /espace/documents/d1/reponse': [409, { error: 'Ce devis a expiré. Demandez-en un nouveau depuis le configurateur, aux tarifs actuels.' }] })
    await button(wrapper, 'Accepter le devis').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('a expiré')
  })

  it('dit que le devis est en préparation quand il n’existe pas encore, et liste les factures', async () => {
    const none = await mountOrder(ORDER({}, { documents: [] }))
    expect(none.wrapper.text()).toContain('en cours de préparation')
    const fact = { id: 'f1', type: 'facture' as const, numero: 'F-2026-0001', emisLe: '2026-10-25T08:00:00Z', echeance: '2026-11-25', ttc: 518.54, reponse: null, payeLe: null, statut: 'emise' as const }
    const { wrapper } = await mountOrder(ORDER({}, { documents: [ORDER().documents[0]!, fact] }))
    const docs = wrapper.get('ul.docs')
    expect(docs.text()).toContain('F-2026-0001')
    expect(docs.text()).toContain('Facture à régler')
    expect(docs.get('a').attributes('href')).toBe('/api/espace/documents/f1/pdf')
  })

  it('dit quand la commande est introuvable ou n’est pas à ce client', async () => {
    const { wrapper } = await mountAt(EspaceOrderView, '/espace/commandes/x', { 'GET /espace/commandes/x': [404, { error: 'Commande introuvable.' }] }, { id: 'x' })
    expect(wrapper.text()).toContain('Commande introuvable')
    expect(wrapper.find('ol.steps').exists()).toBe(false)
  })
})

describe('Compte client dans l’application', () => {
  it('ne vérifie la session qu’à la demande, et l’oublie à la déconnexion', async () => {
    const calls = mockApi({ 'GET /espace/session': [200, { compte: COMPTE }], 'POST /espace/deconnexion': [204] })
    freshPinia()
    const espace = useEspaceStore()
    expect(calls).toHaveLength(0)
    await espace.ensureLoaded()
    await espace.ensureLoaded()
    expect(calls.filter((c) => c.path === '/espace/session')).toHaveLength(1)
    expect(espace.isLoggedIn).toBe(true)
    await espace.deconnecter()
    expect(espace.isLoggedIn).toBe(false)
  })

  it('traite une réponse en erreur comme « pas connecté »', async () => {
    mockApi({ 'GET /espace/session': [500, { error: 'boom' }] })
    freshPinia()
    const espace = useEspaceStore()
    await espace.ensureLoaded()
    expect(espace.compte).toBeNull()
    expect(espace.loaded).toBe(true)
  })
})
