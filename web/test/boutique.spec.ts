import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ProductsView from '@/views/ProductsView.vue'
import ProductView from '@/views/ProductView.vue'
import BoutiqueView from '@/views/site/BoutiqueView.vue'
import BoutiqueProduitView from '@/views/site/BoutiqueProduitView.vue'
import PanierView from '@/views/site/PanierView.vue'
import PaiementRetourView from '@/views/site/PaiementRetourView.vue'
import PaiementSimulationView from '@/views/site/PaiementSimulationView.vue'
import OrderLineCard from '@/components/orders/OrderLineCard.vue'
import { describe as describeEntry, type AuditEntry } from '@/lib/audit-labels'
import { prixMin, type AdminProduit, type AdminProduitDetail, type BoutiqueData, type PanierPrix } from '@/lib/boutique'
import { useAuthStore } from '@/stores/auth'
import { useEspaceStore } from '@/stores/espace'
import { usePanierStore } from '@/stores/panier'
import { ADMIN, freshPinia, makeRouter, mockApi } from './helpers'

const norm = (t: string) => t.replace(/[  ]/g, ' ')
const V1 = '11111111-1111-4111-8111-111111111111'
const V2 = '22222222-2222-4222-8222-222222222222'
const P1 = '33333333-3333-4333-8333-333333333333'
const COMPTE = { prenom: 'Jean', nom: 'Dupont', email: 'jean@example.com', telephone: null, type: 'particulier' as const, proVerifie: false }

const BOUTIQUE: BoutiqueData = {
  paiement: true,
  produits: [
    {
      id: P1,
      nom: 'Couvertine blanche RAL 9010',
      categorie: 'Couvertine',
      description: 'Couvertine en aluminium laqué.\n\nLivrée sans visserie.',
      image: null,
      variantes: [
        { id: V1, libelle: '270 mm · 1 m', reference: 'CV-270-1', prixTtc: 21 },
        { id: V2, libelle: '320 mm · 3 m', reference: '', prixTtc: 84 },
      ],
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      nom: 'Bavette grise',
      categorie: 'Bavette',
      description: '',
      image: { url: '/api/public/boutique/images/x?v=1', alt: 'Bavette grise posée' },
      variantes: [{ id: '55555555-5555-4555-8555-555555555555', libelle: '150 mm', reference: '', prixTtc: 15 }],
    },
  ],
}

beforeEach(() => {
  localStorage.clear()
})

async function mountAt(component: object, path: string, routes: Parameters<typeof mockApi>[0], props: Record<string, unknown> = {}, opts: { admin?: boolean; compte?: boolean } = {}) {
  const calls = mockApi(routes)
  const pinia = freshPinia()
  if (opts.admin) useAuthStore().user = ADMIN
  if (opts.compte) useEspaceStore().compte = COMPTE
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(component, { props, global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, calls }
}
const button = (w: ReturnType<typeof mount>, text: string) => w.findAll('button').find((b) => b.text().includes(text))!

describe('Panier (stockage local)', () => {
  it('garde les articles dans le navigateur, additionne, borne et vide', () => {
    freshPinia()
    const p = usePanierStore()
    p.add(V1)
    p.add(V1, 2)
    p.add(V2, 5)
    expect(p.lignes).toEqual([
      { variantId: V1, quantite: 3 },
      { variantId: V2, quantite: 5 },
    ])
    expect(p.count).toBe(8)
    p.setQuantite(V1, 0)
    expect(p.lignes[0]!.quantite).toBe(1)
    p.setQuantite(V1, 5000)
    expect(p.lignes[0]!.quantite).toBe(999)
    expect(JSON.parse(localStorage.getItem('aps-panier')!)).toHaveLength(2)
    p.remove(V2)
    expect(p.count).toBe(999)
    p.clear()
    expect(p.lignes).toEqual([])
  })

  it('relit un panier enregistré, et ignore un contenu abîmé ou étranger', () => {
    localStorage.setItem(
      'aps-panier',
      JSON.stringify([
        { variantId: V1, quantite: 2 },
        { variantId: 'pas-un-uuid', quantite: 1 },
        { variantId: V2, quantite: -3 },
        { variantId: V2, quantite: 'beaucoup' },
      ]),
    )
    freshPinia()
    expect(usePanierStore().lignes).toEqual([{ variantId: V1, quantite: 2 }])
    localStorage.setItem('aps-panier', '{pas du json')
    freshPinia()
    expect(usePanierStore().lignes).toEqual([])
    localStorage.setItem('aps-panier', '"texte"')
    freshPinia()
    expect(usePanierStore().lignes).toEqual([])
  })
})

describe('La boutique du site', () => {
  it('liste les produits avec leur prix de départ, une photo ou l’invitation à en insérer une, et filtre par catégorie', async () => {
    const { wrapper } = await mountAt(BoutiqueView, '/boutique', { 'GET /public/boutique': [200, BOUTIQUE] })
    const cards = wrapper.findAll('ul.grid > li')
    expect(cards).toHaveLength(2)
    expect(norm(cards[0]!.text())).toContain('Couvertine blanche RAL 9010')
    expect(norm(cards[0]!.text())).toContain('À partir de 21,00 € TTC')
    expect(cards[0]!.text()).toContain('Insérez une photo')
    expect(cards[0]!.get('a').attributes('href')).toBe(`/boutique/${P1}`)
    expect(norm(cards[1]!.text())).not.toContain('À partir de')
    expect(cards[1]!.get('img').attributes('alt')).toBe('Bavette grise posée')
    expect(cards[1]!.text()).not.toContain('Insérez une photo')
    expect(prixMin(BOUTIQUE.produits[0]!)).toBe(21)
    await wrapper
      .findAll('.chip')
      .find((c) => c.text() === 'Bavette')!
      .trigger('click')
    expect(wrapper.findAll('ul.grid > li')).toHaveLength(1)
  })

  it('prévient quand le paiement n’est pas ouvert, quand la boutique est vide, ou en panne', async () => {
    const closed = await mountAt(BoutiqueView, '/boutique', { 'GET /public/boutique': [200, { ...BOUTIQUE, paiement: false }] })
    expect(closed.wrapper.text()).toContain('paiement en ligne n’est pas encore ouvert')
    const empty = await mountAt(BoutiqueView, '/boutique', { 'GET /public/boutique': [200, { paiement: true, produits: [] }] })
    expect(empty.wrapper.text()).toContain('La boutique ouvre bientôt')
    const down = await mountAt(BoutiqueView, '/boutique', { 'GET /public/boutique': [500, { error: 'Le serveur a rencontré un problème.' }] })
    expect(down.wrapper.find('[role="alert"]').exists()).toBe(true)
  })

  it('montre la fiche produit, calcule le total et ajoute la déclinaison choisie au panier', async () => {
    const { wrapper } = await mountAt(BoutiqueProduitView, `/boutique/${P1}`, { 'GET /public/boutique': [200, BOUTIQUE] }, { id: P1 }, { compte: true })
    expect(wrapper.get('h1').text()).toBe('Couvertine blanche RAL 9010')
    expect(wrapper.findAll('p.desc').map((p) => p.text())).toEqual(['Couvertine en aluminium laqué.', 'Livrée sans visserie.'])
    expect(wrapper.text()).toContain('Insérez une photo')
    const options = wrapper.findAll('#b-variante option').map((o) => norm(o.text()))
    expect(options).toEqual(['270 mm · 1 m · 21,00 € TTC', '320 mm · 3 m · 84,00 € TTC'])
    await wrapper.get('#b-variante').setValue(V2)
    await wrapper.get('#b-quantite').setValue(3)
    expect(norm(wrapper.get('.total').text())).toContain('252,00 €')
    await wrapper.get('form').trigger('submit')
    expect(usePanierStore().lignes).toEqual([{ variantId: V2, quantite: 3 }])
    expect(wrapper.get('[role="status"]').text()).toContain('Ajouté au panier')
    expect(wrapper.get('[role="status"] a').attributes('href')).toBe('/panier')
    // Changer de version efface la confirmation
    await wrapper.get('#b-variante').setValue(V1)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('décrit l’import, la copie, les prix en lot et les actions en lot dans le journal', () => {
    const e = (action: string, details: object): string =>
      describeEntry({ id: 1, at: '2026-10-22T08:00:00Z', action, actor: 'Chef', targetType: null, targetId: null, ip: null, details } as unknown as AuditEntry).text
    expect(norm(e('product.imported', { produitsCrees: 2, variantesCreees: 10, variantesMisesAJour: 3 }))).toBe(
      'A importé un catalogue : 2 produits créés (cachés du site), 10 déclinaisons ajoutées, 3 prix mis à jour',
    )
    expect(e('product.duplicated', { source: 'A', nom: 'B' })).toBe('A copié le produit « A » en « B »')
    expect(e('product.prices_adjusted', { nom: 'A', pourcent: -5, variantes: 3 })).toBe('A baissé de 5 % les prix de « A » (3 déclinaisons)')
    expect(e('product.bulk', { action: 'supprimer', produits: 2 })).toBe('A supprimé 2 produits')
  })

  it('sans espace client : bouton « Ajouter au panier » désactivé, avec le chemin pour créer un espace ou se connecter', async () => {
    const { wrapper } = await mountAt(BoutiqueProduitView, `/boutique/${P1}`, { 'GET /public/boutique': [200, BOUTIQUE], 'GET /espace/session': [200, { compte: null }] }, { id: P1 })
    const add = button(wrapper, 'Ajouter au panier')
    expect(add.attributes('disabled')).toBeDefined()
    expect(add.attributes('aria-describedby')).toBe('b-compte')
    const note = wrapper.get('#b-compte')
    expect(note.text()).toContain('Il faut un espace client')
    expect(note.findAll('a').map((a) => a.attributes('href'))).toEqual([`/espace/inscription?redirect=/boutique/${P1}`, `/espace/connexion?redirect=/boutique/${P1}`])
    await wrapper.get('form').trigger('submit')
    expect(usePanierStore().lignes).toEqual([])
  })

  it('dit qu’un produit retiré n’est plus en vente', async () => {
    const { wrapper } = await mountAt(BoutiqueProduitView, '/boutique/x', { 'GET /public/boutique': [200, BOUTIQUE] }, { id: '99999999-9999-4999-8999-999999999999' })
    expect(wrapper.text()).toContain('n’est plus en vente')
    expect(wrapper.find('form').exists()).toBe(false)
  })
})

describe('Le panier', () => {
  const PRIX: PanierPrix = {
    lignes: [
      { variantId: V1, produitId: P1, produit: 'Couvertine blanche RAL 9010', libelle: '270 mm · 1 m', quantite: 2, prixHt: 17.5, prixTtc: 21, totalTtc: 42 },
      { variantId: V2, produitId: P1, produit: 'Couvertine blanche RAL 9010', libelle: '320 mm · 3 m', quantite: 1, prixHt: 70, prixTtc: 84, totalTtc: 84 },
    ],
    indisponibles: [],
    totals: { brut: 105, livraisonPrix: 0, ht: 105, tauxTva: 20, tva: 21, ttc: 126, delaiJours: 5 },
    distanceKm: null,
    paiement: true,
  }
  const routes = (extra: Parameters<typeof mockApi>[0] = {}) =>
    ({ 'GET /public/boutique': [200, BOUTIQUE], 'GET /espace/session': [200, { compte: null }], 'POST /public/boutique/panier': [200, PRIX], ...extra }) as Parameters<typeof mockApi>[0]
  const mountCart = async (extra: Parameters<typeof mockApi>[0] = {}, opts: { compte?: boolean } = {}) => {
    localStorage.setItem(
      'aps-panier',
      JSON.stringify([
        { variantId: V1, quantite: 2 },
        { variantId: V2, quantite: 1 },
      ]),
    )
    const r = await mountAt(PanierView, '/panier', routes(extra), {}, opts)
    await new Promise((res) => setTimeout(res, 50))
    await flushPromises()
    return r
  }

  it('est vide au départ, avec le chemin vers la boutique', async () => {
    const { wrapper } = await mountAt(PanierView, '/panier', routes())
    expect(wrapper.text()).toContain('Votre panier est vide')
    expect(wrapper.find('a[href="/boutique"]').exists()).toBe(true)
  })

  it('chiffre avec le serveur (jamais de prix envoyé) et montre les lignes et le total TTC', async () => {
    const { wrapper, calls } = await mountCart()
    const post = calls.find((c) => c.path === '/public/boutique/panier')!
    expect(post.body).toEqual({
      lignes: [
        { variantId: V1, quantite: 2 },
        { variantId: V2, quantite: 1 },
      ],
      livraison: { mode: 'retrait' },
    })
    const rows = wrapper.findAll('ul.lignes > li')
    expect(rows).toHaveLength(2)
    expect(norm(rows[0]!.text())).toContain('270 mm · 1 m')
    expect(norm(rows[0]!.text())).toContain('21,00 € TTC l’unité')
    expect(norm(rows[0]!.text())).toContain('42,00 €')
    expect(norm(wrapper.get('.recap').text())).toContain('Total TTC126,00 €')
    expect(norm(wrapper.get('.recap').text())).toContain('TVA 20 %21,00 €')
  })

  it('change une quantité ou retire un article, et recalcule', async () => {
    const { wrapper, calls } = await mountCart()
    await wrapper.get(`#q-${V1}`).setValue('4')
    expect(usePanierStore().lignes[0]).toEqual({ variantId: V1, quantite: 4 })
    await wrapper.get(`button[aria-label="Retirer Couvertine blanche RAL 9010 320 mm · 3 m du panier"]`).trigger('click')
    expect(usePanierStore().lignes).toEqual([{ variantId: V1, quantite: 4 }])
    await new Promise((r) => setTimeout(r, 400))
    await flushPromises()
    expect(calls.filter((c) => c.path === '/public/boutique/panier').length).toBeGreaterThanOrEqual(2)
  })

  it('propose de retirer les articles qui ne sont plus en vente, et bloque le paiement', async () => {
    const gone = { ...PRIX, indisponibles: [V2], lignes: [PRIX.lignes[0]!] }
    const { wrapper } = await mountCart({ 'POST /public/boutique/panier': [200, gone] }, { compte: true })
    expect(wrapper.get('[role="alert"]').text()).toContain('Un article de votre panier n’est plus en vente')
    expect(button(wrapper, 'Payer').attributes('disabled')).toBeDefined()
    await button(wrapper, 'Les retirer').trigger('click')
    expect(usePanierStore().lignes.map((l) => l.variantId)).toEqual([V1])
  })

  it('demande la création de l’espace client avec ses avantages, puis paie', async () => {
    const { wrapper, calls, router } = await mountCart({
      'POST /espace/inscription': [201, { compte: COMPTE }],
      'POST /espace/boutique/paiement': [201, { id: 'p1', url: '/paiement-simulation/p1' }],
    })
    expect(wrapper.text()).toContain('Pour payer et suivre votre commande, créez votre espace client')
    expect(wrapper.text()).toContain('Pourquoi un espace client ?')
    await wrapper.get('#pan-nom').setValue('Dupont')
    await wrapper.get('#pan-email').setValue('jean@example.com')
    await wrapper.get('#pan-password').setValue('Plieuse-numerique-2026')
    await wrapper.get('#pan-consentement').setValue(true)
    await wrapper.get('form.auth').trigger('submit')
    await flushPromises()
    const order = calls.map((c) => c.path)
    expect(order.indexOf('/espace/inscription')).toBeLessThan(order.indexOf('/espace/boutique/paiement'))
    const pay = calls.find((c) => c.path === '/espace/boutique/paiement')!
    expect(pay.body).toEqual({
      lignes: [
        { variantId: V1, quantite: 2 },
        { variantId: V2, quantite: 1 },
      ],
      livraison: { mode: 'retrait' },
    })
    expect(JSON.stringify(pay.body)).not.toMatch(/prix|ttc|126/i)
    expect(router.currentRoute.value.fullPath).toBe('/paiement-simulation/p1')
  })

  it('connecté : un clic pour payer, l’adresse de livraison est demandée avant', async () => {
    const { wrapper, calls } = await mountCart({ 'POST /espace/boutique/paiement': [201, { id: 'p1', url: 'https://checkout.stripe.test/pay/x' }] }, { compte: true })
    expect(wrapper.find('form.auth').exists()).toBe(false)
    expect(wrapper.get('.pay').text()).toContain('Jean Dupont')
    expect(wrapper.get('.pay').text()).toContain('ferme dès la confirmation du paiement')
    // Livraison : le paiement attend une adresse complète
    await wrapper.findAll('input[name="mode"]')[1]!.setValue(true)
    expect(button(wrapper, 'Payer').attributes('disabled')).toBeDefined()
    await wrapper.get('#l-adresse').setValue('12 chemin du Bois')
    await wrapper.get('#l-cp').setValue('42700')
    await wrapper.get('#l-ville').setValue('Firminy')
    await new Promise((r) => setTimeout(r, 450))
    await flushPromises()
    expect(calls.filter((c) => c.path === '/public/boutique/panier').at(-1)!.body.livraison).toEqual({ mode: 'livraison', adresse: '12 chemin du Bois', codePostal: '42700', ville: 'Firminy' })
    expect(button(wrapper, 'Payer').attributes('disabled')).toBeUndefined()
  })

  it('dit que le paiement n’est pas ouvert, et montre les erreurs du serveur', async () => {
    const closed = await mountCart({ 'POST /public/boutique/panier': [200, { ...PRIX, paiement: false }] })
    expect(closed.wrapper.text()).toContain('paiement en ligne n’est pas encore ouvert')
    expect(closed.wrapper.find('form.auth').exists()).toBe(false)
    const far = await mountCart({ 'POST /public/boutique/panier': [400, { error: 'Adresse à 120 km : au-delà de la zone de livraison.', field: 'livraison' }] }, { compte: true })
    await far.wrapper.findAll('input[name="mode"]')[1]!.setValue(true)
    await far.wrapper.get('#l-adresse').setValue('1 rue')
    await far.wrapper.get('#l-cp').setValue('69000')
    await far.wrapper.get('#l-ville').setValue('Lyon')
    await new Promise((r) => setTimeout(r, 450))
    await flushPromises()
    expect(far.wrapper.get('.adresse [role="alert"]').text()).toContain('au-delà de la zone')
  })
})

describe('Après le paiement', () => {
  const retour = (statut: string, commande: { id: string; numero: string } | null = null) =>
    mountAt(
      PaiementRetourView,
      '/boutique/commande/p1',
      { 'GET /espace/boutique/paiements/p1': [200, { id: 'p1', statut, montantTtc: 126, commande, simulation: true }] },
      { id: 'p1' },
      { compte: true },
    )

  it('confirme la commande payée et vide le panier', async () => {
    localStorage.setItem('aps-panier', JSON.stringify([{ variantId: V1, quantite: 2 }]))
    freshPinia()
    const { wrapper } = await retour('paye', { id: 'o1', numero: 'C-2026-0007' })
    expect(wrapper.get('h1').text()).toBe('Merci, votre commande est confirmée')
    expect(norm(wrapper.text())).toContain('126,00 €')
    expect(wrapper.text()).toContain('C-2026-0007')
    expect(wrapper.text()).toContain('vous rembourserions intégralement')
    expect(wrapper.get('a.s-btn').attributes('href')).toBe('/espace/commandes/o1')
  })

  it('un paiement échoué ne crée rien et garde le panier', async () => {
    const { wrapper } = await retour('echec')
    expect(wrapper.get('h1').text()).toBe('Le paiement n’a pas abouti')
    expect(wrapper.text()).toContain('Aucun montant n’a été débité')
    expect(wrapper.get('a.s-btn').attributes('href')).toBe('/panier')
  })

  it('une commande sur mesure payée garde le panier de la boutique et oublie la saisie du configurateur ; un échec renvoie au configurateur', async () => {
    localStorage.setItem('aps-panier', JSON.stringify([{ variantId: V1, quantite: 2 }]))
    sessionStorage.setItem('aps-configurateur', '{}')
    const pinia = freshPinia()
    const mount1 = async (statut: string, commande: object | null) => {
      mockApi({ 'GET /espace/boutique/paiements/p1': [200, { id: 'p1', statut, montantTtc: 518.54, commande, simulation: true, surMesure: true }] })
      const router = makeRouter()
      await router.push('/boutique/commande/p1')
      await router.isReady()
      const wrapper = mount(PaiementRetourView, { props: { id: 'p1' }, global: { plugins: [pinia, router] } })
      await flushPromises()
      return wrapper
    }
    const failed = await mount1('echec', null)
    expect(failed.text()).toContain('votre configuration est conservée')
    expect(failed.get('a.s-btn').attributes('href')).toBe('/configurateur')
    expect(sessionStorage.getItem('aps-configurateur')).toBe('{}')
    const paid = await mount1('paye', { id: 'o1', numero: 'C-2026-0007' })
    expect(paid.get('h1').text()).toBe('Merci, votre commande est confirmée')
    expect(sessionStorage.getItem('aps-configurateur')).toBeNull()
    expect(usePanierStore().lignes).toEqual([{ variantId: V1, quantite: 2 }])
  })

  it('attend la confirmation du prestataire sans conclure trop tôt', async () => {
    const { wrapper } = await retour('attente')
    expect(wrapper.get('h1').text()).toContain('Nous attendons la confirmation')
    expect(wrapper.text()).toContain('quelques secondes')
  })

  it('la page de démonstration paie ou fait échouer, puis revient au suivi', async () => {
    const calls = mockApi({
      'GET /espace/boutique/paiements/p1': [200, { id: 'p1', statut: 'attente', montantTtc: 126, commande: null, simulation: true }],
      'POST /espace/boutique/paiements/p1/simulation': [200, { statut: 'paye' }],
    })
    const pinia = freshPinia()
    const router = makeRouter()
    await router.push('/paiement-simulation/p1')
    await router.isReady()
    const wrapper = mount(PaiementSimulationView, { props: { id: 'p1' }, global: { plugins: [pinia, router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('aucune carte n’est demandée')
    await button(wrapper, 'paiement réussi').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.path.endsWith('/simulation'))!.body).toEqual({ issue: 'paye' })
    expect(router.currentRoute.value.fullPath).toBe('/boutique/commande/p1')
  })

  it('refuse la page de démonstration pour un vrai paiement', async () => {
    mockApi({ 'GET /espace/boutique/paiements/p1': [200, { id: 'p1', statut: 'attente', montantTtc: 126, commande: null, simulation: false }] })
    const pinia = freshPinia()
    const router = makeRouter()
    const wrapper = mount(PaiementSimulationView, { props: { id: 'p1' }, global: { plugins: [pinia, router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('ne se règle pas ici')
    expect(wrapper.find('button').exists()).toBe(false)
  })
})

describe('Gestion des produits', () => {
  const LIST: AdminProduit[] = [
    { id: P1, nom: 'Couvertine blanche RAL 9010', categorie: 'Couvertine', actif: true, hasImage: false, version: 1, variantes: 3, actives: 2, prixMinTtc: 21 },
    { id: 'p2', nom: 'Bavette en préparation', categorie: '', actif: false, hasImage: true, version: 5, variantes: 0, actives: 0, prixMinTtc: null },
  ]

  it('liste les produits avec leur état, leur prix de départ et « Insérez une photo » quand il n’y a pas de photo', async () => {
    const { wrapper } = await mountAt(ProductsView, '/produits', { 'GET /boutique/produits': [200, { produits: LIST, tva: 20 }] }, {}, { admin: true })
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('Couvertine blanche RAL 9010')
    expect(rows[0]!.text()).toContain('En ligne')
    expect(rows[0]!.text()).toContain('Insérez une photo')
    expect(norm(rows[0]!.text())).toContain('21,00 € TTC')
    expect(rows[0]!.text()).toContain('1 retirée')
    expect(rows[1]!.text()).toContain('Hors ligne')
    expect(rows[1]!.text()).toContain('Sans catégorie')
    expect(rows[1]!.get('img').attributes('src')).toBe('/api/boutique/produits/p2/image?v=5')
    expect(wrapper.text()).toContain('1 produit en ligne sur 2')
  })

  it('cherche par nom, filtre par catégorie, et agit sur plusieurs produits à la fois', async () => {
    const { wrapper, calls } = await mountAt(
      ProductsView,
      '/produits',
      { 'GET /boutique/produits': [200, { produits: LIST, tva: 20 }], 'POST /boutique/produits/lot': [200, { produits: 2 }] },
      {},
      { admin: true },
    )
    await wrapper.get('#prod-q').setValue('bavette')
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.text()).toContain('1 affiché')
    await wrapper.get('#prod-q').setValue('xyz')
    expect(wrapper.text()).toContain('Aucun produit ne correspond')
    await wrapper.get('#prod-q').setValue('')
    await wrapper
      .findAll('.chip')
      .find((c) => c.text() === 'Couvertine')!
      .trigger('click')
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    await wrapper
      .findAll('.chip')
      .find((c) => c.text() === 'Toutes')!
      .trigger('click')
    expect(wrapper.find('.bulk').exists()).toBe(false)
    await wrapper.get('thead input[type="checkbox"]').setValue(true)
    expect(wrapper.get('.bulk').text()).toContain('2 produits choisis')
    await button(wrapper, 'Retirer du site').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.path === '/boutique/produits/lot')!.body).toEqual({ ids: [P1, 'p2'], action: 'retirer' })
    expect(wrapper.get('[role="status"]').text()).toContain('2 produits retirés du site')
  })

  it('demande confirmation avant de supprimer en lot, et dit pourquoi une mise en ligne est refusée', async () => {
    const { wrapper, calls } = await mountAt(
      ProductsView,
      '/produits',
      {
        'GET /boutique/produits': [200, { produits: LIST, tva: 20 }],
        'POST /boutique/produits/lot': [409, { error: 'Sans déclinaison active, impossible de mettre en ligne : Bavette en préparation.' }],
      },
      {},
      { admin: true },
    )
    await wrapper.get('tbody tr:nth-child(2) input[type="checkbox"]').setValue(true)
    await button(wrapper, 'Supprimer…').trigger('click')
    expect(calls.filter((c) => c.path === '/boutique/produits/lot')).toHaveLength(0)
    expect(button(wrapper, 'Confirmer la suppression')).toBeTruthy()
    await button(wrapper, 'Garder').trigger('click')
    await button(wrapper, 'Mettre en ligne').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Bavette en préparation')
  })

  it('importe un catalogue JSON et donne le bilan', async () => {
    const { wrapper, calls } = await mountAt(
      ProductsView,
      '/produits',
      {
        'GET /boutique/produits': [200, { produits: [], tva: 20 }],
        'POST /boutique/import': [200, { produitsCrees: 2, produitsExistants: 1, variantesCreees: 10, variantesMisesAJour: 3, ignorees: 4 }],
      },
      {},
      { admin: true },
    )
    const file = new File([JSON.stringify([{ nom: 'A', variations: [] }])], 'catalogue.json', { type: 'application/json' })
    const input = wrapper.get('#prod-import')
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await flushPromises()
    expect(calls.find((c) => c.path === '/boutique/import')!.body).toEqual({ produits: [{ nom: 'A', variations: [] }] })
    expect(norm(wrapper.get('[role="status"]').text())).toContain('2 produits créés (cachés du site), 1 déjà présent, 10 déclinaisons ajoutées, 3 prix mis à jour, 4 ignorées')
    const bad = await mountAt(ProductsView, '/produits', { 'GET /boutique/produits': [200, { produits: [], tva: 20 }] }, {}, { admin: true })
    const junk = bad.wrapper.get('#prod-import')
    Object.defineProperty(junk.element, 'files', { value: [new File(['pas du json'], 'x.json')] })
    await junk.trigger('change')
    await flushPromises()
    expect(bad.wrapper.get('[role="alert"]').text()).toContain('Fichier illisible')
  })

  it('crée un produit puis ouvre sa fiche, et montre l’erreur du serveur', async () => {
    const ok = await mountAt(ProductsView, '/produits', { 'GET /boutique/produits': [200, { produits: [], tva: 20 }], 'POST /boutique/produits': [201, { id: 'new1' }] }, {}, { admin: true })
    expect(ok.wrapper.text()).toContain('Aucun produit pour l’instant')
    await ok.wrapper.get('#prod-nom').setValue('Chapeau de pilier')
    await ok.wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(ok.calls.find((c) => c.method === 'POST')!.body).toEqual({ nom: 'Chapeau de pilier' })
    expect(ok.router.currentRoute.value.fullPath).toBe('/produits/new1')
    const bad = await mountAt(
      ProductsView,
      '/produits',
      { 'GET /boutique/produits': [200, { produits: [], tva: 20 }], 'POST /boutique/produits': [400, { error: 'Le nom du produit est requis.', field: 'nom' }] },
      {},
      { admin: true },
    )
    await bad.wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(bad.wrapper.get('#prod-nom-e').text()).toBe('Le nom du produit est requis.')
  })

  it('met un produit en ligne ou le retire, et dit pourquoi c’est impossible', async () => {
    const { wrapper, calls } = await mountAt(
      ProductsView,
      '/produits',
      {
        'GET /boutique/produits': [200, { produits: LIST, tva: 20 }],
        'PATCH /boutique/produits/p2': [409, { error: 'Ajoutez au moins une déclinaison active (avec son prix) avant de mettre ce produit en ligne.', field: 'actif' }],
        [`PATCH /boutique/produits/${P1}`]: [200, { ok: true }],
      },
      {},
      { admin: true },
    )
    await button(wrapper, 'Mettre en ligne').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Bavette en préparation : Ajoutez au moins une déclinaison')
    await button(wrapper, 'Retirer').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.path === `/boutique/produits/${P1}`)!.body).toEqual({ actif: false })
  })

  const DETAIL = (
    over: Partial<AdminProduitDetail['produit']> = {},
    variantes: AdminProduitDetail['variantes'] = [{ id: 'v1', libelle: '270 mm · 1 m', reference: 'CV', prixHt: 17.5, prixTtc: 21, actif: true }],
  ): AdminProduitDetail => ({
    produit: {
      id: P1,
      nom: 'Couvertine blanche',
      categorie: 'Couvertine',
      description: 'Texte',
      actif: false,
      hasImage: false,
      version: 3,
      imageAlt: '',
      imageLargeur: null,
      imageHauteur: null,
      ...over,
    },
    variantes,
    tva: 20,
  })
  const mountProduct = (d: AdminProduitDetail, extra: Parameters<typeof mockApi>[0] = {}) =>
    mountAt(ProductView, `/produits/${P1}`, { [`GET /boutique/produits/${P1}`]: [200, d], ...extra }, { id: P1 }, { admin: true })

  it('copie le produit sous un autre nom et ouvre la copie', async () => {
    const { wrapper, router, calls } = await mountProduct(DETAIL(), { [`POST /boutique/produits/${P1}/dupliquer`]: [201, { id: 'copie1' }] })
    await button(wrapper, 'Copier ce produit').trigger('click')
    expect((wrapper.get('#copie-nom').element as HTMLInputElement).value).toBe('Couvertine blanche (copie)')
    await wrapper.get('#copie-nom').setValue('Couvertine gris RAL 7016')
    await wrapper.get('form.copy').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.path.endsWith('/dupliquer'))!.body).toEqual({ nom: 'Couvertine gris RAL 7016' })
    expect(router.currentRoute.value.fullPath).toBe('/produits/copie1')
  })

  it('recharge la fiche quand on passe à une autre (après une copie)', async () => {
    const { wrapper } = await mountProduct(DETAIL(), { '/boutique/produits/copie1': [200, DETAIL({ nom: 'Copie' })] })
    expect(wrapper.get('h1').text()).toBe('Couvertine blanche')
    mockApi({ 'GET /boutique/produits/copie1': [200, DETAIL({ nom: 'Couvertine gris' })] })
    await (wrapper as unknown as { setProps: (p: object) => Promise<void> }).setProps({ id: 'copie1' })
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Couvertine gris')
    expect(wrapper.find('form.copy').exists()).toBe(false)
  })

  it('ajuste tous les prix en pour cent, et refuse une saisie vide ou nulle', async () => {
    const { wrapper, calls } = await mountProduct(DETAIL(), { [`POST /boutique/produits/${P1}/prix`]: [200, { variantes: 1 }] })
    await wrapper.get('form.ajust').trigger('submit')
    expect(wrapper.get('#ajust-e').text()).toContain('Indiquez un pourcentage')
    await wrapper.get('#ajust-pct').setValue('0')
    await wrapper.get('form.ajust').trigger('submit')
    expect(calls.filter((c) => c.path.endsWith('/prix'))).toHaveLength(0)
    await wrapper.get('#ajust-pct').setValue('5,5')
    await wrapper.get('form.ajust').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.path.endsWith('/prix'))!.body).toEqual({ pourcent: 5.5 })
    expect(wrapper.get('[role="status"]').text()).toContain('augmentés de 5,5 %')
  })

  it('montre la fiche avec « Insérez une photo », la mise en ligne et les prix TTC avec leur HT', async () => {
    const { wrapper } = await mountProduct(DETAIL())
    expect(wrapper.get('h1').text()).toBe('Couvertine blanche')
    expect((wrapper.get('#f-nom').element as HTMLInputElement).value).toBe('Couvertine blanche')
    expect((wrapper.get('#f-description').element as HTMLTextAreaElement).value).toBe('Texte')
    expect(wrapper.get('.preview').text()).toContain('Insérez une photo')
    expect(wrapper.text()).toContain('Hors ligne')
    expect(button(wrapper, 'Mettre en ligne')).toBeDefined()
    expect((wrapper.get('input[aria-label="Prix TTC de 270 mm · 1 m"]').element as HTMLInputElement).value).toBe('21,00')
    expect(norm(wrapper.get('tbody').text())).toContain('17,50 € HT')
    expect(wrapper.text()).toContain('TVA 20 % comprise')
  })

  it('enregistre la fiche, avec l’erreur du serveur sous le champ', async () => {
    const { wrapper, calls } = await mountProduct(DETAIL(), { [`PATCH /boutique/produits/${P1}`]: [200, { ok: true }] })
    await wrapper.get('#f-nom').setValue('Couvertine blanche 9010')
    await wrapper.get('#f-description').setValue('Nouvelle description')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ nom: 'Couvertine blanche 9010', categorie: 'Couvertine', description: 'Nouvelle description' })
    expect(wrapper.get('[role="status"]').text()).toBe('Fiche enregistrée.')
    const bad = await mountProduct(DETAIL(), { [`PATCH /boutique/produits/${P1}`]: [400, { error: 'Le nom du produit est requis.', field: 'nom' }] })
    await bad.wrapper.get('#f-nom').setValue('')
    await bad.wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(bad.wrapper.get('#f-nom-e').text()).toBe('Le nom du produit est requis.')
  })

  it('met en ligne, ou explique qu’il faut une déclinaison', async () => {
    const ok = await mountProduct(DETAIL(), { [`PATCH /boutique/produits/${P1}`]: [200, { ok: true }] })
    await button(ok.wrapper, 'Mettre en ligne').trigger('click')
    await flushPromises()
    expect(ok.calls.find((c) => c.method === 'PATCH')!.body).toEqual({ actif: true })
    expect(ok.wrapper.get('[role="status"]').text()).toContain('en ligne sur le site')
    const no = await mountProduct(DETAIL({}, []), {
      [`PATCH /boutique/produits/${P1}`]: [409, { error: 'Ajoutez au moins une déclinaison active (avec son prix) avant de mettre ce produit en ligne.', field: 'actif' }],
    })
    expect(no.wrapper.text()).toContain('Aucune déclinaison')
    await button(no.wrapper, 'Mettre en ligne').trigger('click')
    await flushPromises()
    expect(no.wrapper.get('[role="alert"]').text()).toContain('au moins une déclinaison')
  })

  it('ajoute une déclinaison, modifie un prix, la retire de la vente et la supprime', async () => {
    const { wrapper, calls } = await mountProduct(DETAIL(), {
      [`POST /boutique/produits/${P1}/variantes`]: [201, { variante: { id: 'v2' } }],
      'PATCH /boutique/variantes/v1': [200, { ok: true }],
      'DELETE /boutique/variantes/v1': [200, { ok: true }],
    })
    await wrapper.get('#v-libelle').setValue('320 mm · 3 m')
    await wrapper.get('#v-prixTtc').setValue('84,00')
    await wrapper.get('form.add').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ libelle: '320 mm · 3 m', reference: '', prixTtc: '84,00' })
    const price = wrapper.get('input[aria-label="Prix TTC de 270 mm · 1 m"]')
    await price.setValue('22,50')
    await price.trigger('change')
    await flushPromises()
    expect(calls.find((c) => c.method === 'PATCH' && c.path === '/boutique/variantes/v1')!.body).toEqual({ prixTtc: '22,50' })
    await wrapper.get('input[aria-label="270 mm · 1 m en vente"]').setValue(false)
    await flushPromises()
    expect(calls.filter((c) => c.method === 'PATCH').at(-1)!.body).toEqual({ actif: false })
    await wrapper.get('button[aria-label="Supprimer la déclinaison 270 mm · 1 m"]').trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/boutique/variantes/v1')).toBe(true)
  })

  it('signale l’erreur d’une déclinaison à son champ (libellé en double, prix invalide)', async () => {
    const { wrapper } = await mountProduct(DETAIL(), { [`POST /boutique/produits/${P1}/variantes`]: [400, { error: 'Prix TTC : nombre attendu.', field: 'prixTtc' }] })
    await wrapper.get('#v-libelle').setValue('x')
    await wrapper.get('#v-prixTtc').setValue('abc')
    await wrapper.get('form.add').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#v-prix-e').text()).toBe('Prix TTC : nombre attendu.')
    expect(wrapper.get('#v-prixTtc').attributes('aria-invalid')).toBe('true')
  })

  it('affiche la photo envoyée, avec sa description, et propose de la retirer', async () => {
    const { wrapper, calls } = await mountProduct(DETAIL({ hasImage: true, imageAlt: 'Couvertine posée' }), { [`DELETE /boutique/produits/${P1}/image`]: [200, { ok: true }] })
    expect(wrapper.get('.preview img').attributes('src')).toBe(`/api/boutique/produits/${P1}/image?v=3`)
    expect(wrapper.get('.preview img').attributes('alt')).toBe('Couvertine posée')
    expect(wrapper.get('.preview').text()).not.toContain('Insérez une photo')
    await button(wrapper, 'Retirer la photo').trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true)
  })

  it('demande confirmation avant de supprimer un produit', async () => {
    const { wrapper, router, calls } = await mountProduct(DETAIL(), { [`DELETE /boutique/produits/${P1}`]: [200, { ok: true }] })
    await button(wrapper, 'Supprimer ce produit').trigger('click')
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    await button(wrapper, 'Garder').trigger('click')
    expect(button(wrapper, 'Oui, supprimer')).toBeUndefined()
    await button(wrapper, 'Supprimer ce produit').trigger('click')
    await button(wrapper, 'Oui, supprimer').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/produits')
  })

  it('dit quand le produit n’existe pas', async () => {
    const { wrapper } = await mountAt(ProductView, '/produits/x', { 'GET /boutique/produits/x': [404, { error: 'Produit introuvable.' }] }, { id: 'x' }, { admin: true })
    expect(wrapper.text()).toContain('n’existe pas')
  })
})

describe('Articles de la boutique dans les commandes', () => {
  const line = {
    repere: null,
    modeleLabel: 'Couvertine blanche',
    cap: 0,
    materialLabel: '270 mm · 1 m',
    colorLabel: '',
    colorHex: '#cdd1d4',
    cotes: [] as number[],
    angles: [] as number[],
    longueur: 0,
    quantite: 2,
    accessoires: [],
    prixUnitaire: 17.5,
    remiseQuantite: 0,
    miseEnRoute: 0,
    total: 35,
  }
  it('affiche un article sans profil ni cotes, avec son prix à l’unité', () => {
    const w = mount(OrderLineCard, { props: { index: 0, line, prices: true } })
    expect(w.find('svg').exists()).toBe(false)
    expect(w.text()).toContain('Couvertine blanche')
    expect(w.text()).toContain('270 mm · 1 m')
    expect(w.text()).not.toMatch(/Cotes|Développé|mise en route/)
    expect(norm(w.text())).toContain('17,50 € l’unité')
    expect(norm(w.text())).toContain('35,00 € HT')
    // Une pièce sur mesure garde tout son détail
    const pliee = mount(OrderLineCard, { props: { index: 0, line: { ...line, cotes: [20, 70], angles: [90], longueur: 3000, miseEnRoute: 18, colorLabel: 'Gris' }, prices: true } })
    expect(pliee.find('svg').exists()).toBe(true)
    expect(pliee.text()).toContain('Cotes')
    expect(norm(pliee.text())).toContain('mise en route 18,00 €')
  })

  it('décrit la boutique dans le journal', () => {
    const e = (action: string, details: object) => norm(describeEntry({ action, details, identifiant: null, userId: null } as unknown as AuditEntry).text)
    expect(e('product.created', { nom: 'Couvertine' })).toBe('A créé le produit « Couvertine »')
    expect(e('product.updated', { nom: 'Couvertine', champs: ['nom', 'description'] })).toBe('A modifié le produit « Couvertine » (nom, description)')
    expect(e('product.activated', { nom: 'Couvertine' })).toMatch(/mis en ligne/)
    expect(e('product.deactivated', { nom: 'Couvertine' })).toMatch(/retiré du site/)
    expect(e('product.deleted', { nom: 'Couvertine' })).toMatch(/supprimé/)
    expect(e('product.image_updated', { nom: 'Couvertine', largeur: 800, hauteur: 600 })).toMatch(/photo.*800 × 600/)
    expect(e('product.image_deleted', { nom: 'Couvertine' })).toMatch(/retiré la photo/)
    expect(e('product.variant_added', { nom: 'Couvertine', libelle: '320 mm', prixTtc: 84 })).toBe('A ajouté la déclinaison « 320 mm » (84,00 € TTC) à « Couvertine »')
    expect(e('product.variant_updated', { nom: 'Couvertine', libelle: '320 mm', prixTtc: { avant: 84, apres: 90 } })).toMatch(/84,00 € → 90,00 € TTC/)
    expect(e('product.variant_deleted', { nom: 'Couvertine', libelle: '320 mm' })).toMatch(/supprimé la déclinaison/)
    expect(e('boutique.checkout_started', { montant: 126, articles: 3 })).toMatch(/Un client ouvre le paiement de 126,00 € \(3 articles\)/)
    expect(e('boutique.payment_confirmed', { numero: 'C-2026-0007', montant: 126 })).toBe('Paiement de 126,00 € reçu : commande C-2026-0007 créée')
    expect(e('boutique.payment_failed', { montant: 126 })).toMatch(/Paiement de 126,00 € abandonné/)
    expect(e('order.refused', { numero: 'C-2026-0007', montant: 126, motif: 'Impossible', avoir: 'A-2026-0001' })).toMatch(
      /refusé la commande C-2026-0007 et remboursé 126,00 € .*Impossible.*A-2026-0001/,
    )
  })
})
