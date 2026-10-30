import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PlanAtelierView from '@/views/PlanAtelierView.vue'
import { lieuOf, MACHINES, placeOrders, stockLayout, type PlanFeuille, type PlanOrder } from '@/lib/plan-atelier'
import { useAuthStore } from '@/stores/auth'
import { ADMIN, freshPinia, makeRouter, mockApi } from './helpers'

const order = (id: string, o: Partial<PlanOrder> = {}): PlanOrder => ({
  id,
  numero: `C-2026-00${id}`,
  client: `Client ${id}`,
  modeles: 'Couvertine',
  statut: 'validee',
  livraisonMode: 'retrait',
  datePrevue: '2026-11-03',
  pieces: 3,
  prisPar: null,
  ...o,
})
const feuille = (id: string, f: Partial<PlanFeuille> = {}): PlanFeuille => ({ id, chute: false, quantite: 20, seuil: 5, libelle: `Aluminium 1,5 mm · brut · ${id}`, etat: 'ok', ...f })

describe('Plan de l’atelier : placement', () => {
  it('range chaque commande dans son lieu d’après son état et son mode de remise', () => {
    expect(lieuOf({ statut: 'validee', livraisonMode: 'retrait' })).toBe('a-lancer')
    expect(lieuOf({ statut: 'fabrication', livraisonMode: 'livraison' })).toBe('fabrication')
    expect(lieuOf({ statut: 'prete', livraisonMode: 'retrait' })).toBe('a-retirer')
    expect(lieuOf({ statut: 'prete', livraisonMode: 'livraison' })).toBe('a-livrer')
  })

  it('pose les commandes en fabrication sur les deux machines tour à tour, et ignore celles qui ne sont pas à l’atelier', () => {
    const placed = placeOrders([
      order('1', { statut: 'fabrication' }),
      order('2', { statut: 'fabrication' }),
      order('3', { statut: 'fabrication' }),
      order('4', { statut: 'livree' }),
      order('5', { statut: 'annulee' }),
    ])
    expect(placed.map((p) => p.order.id)).toEqual(['1', '2', '3'])
    expect(placed.map((p) => p.machine)).toEqual(['plieuse', 'cisaille', 'plieuse'])
    expect(placed[0]).toMatchObject({ x: MACHINES.plieuse.x, y: MACHINES.plieuse.y })
    // La troisième se décale le long de la plieuse : jamais deux colis au même endroit
    expect(placed[2]!.x).toBeGreaterThan(placed[0]!.x)
  })

  it('ne superpose jamais deux colis dans un même lieu', () => {
    const placed = placeOrders(Array.from({ length: 9 }, (_, i) => order(String(i), { statut: i % 3 === 0 ? 'validee' : 'prete', livraisonMode: i % 2 ? 'retrait' : 'livraison' })))
    const spots = placed.map((p) => `${p.x.toFixed(2)}:${p.y.toFixed(2)}`)
    expect(new Set(spots).size).toBe(spots.length)
  })
})

describe('Plan de l’atelier : stock et réception', () => {
  it('répartit les feuilles entières sur deux racks et compte les chutes à part', () => {
    const s = stockLayout([
      feuille('a', { quantite: 12 }),
      feuille('b', { quantite: 3, etat: 'critique' }),
      feuille('c', { quantite: 40 }),
      feuille('d', { chute: true, quantite: 9 }),
      feuille('e', { archivee: true, quantite: 99 }),
    ])
    expect(s.racks[0]!.feuilles.map((f) => f.id)).toEqual(['a', 'b'])
    expect(s.racks[1]!.feuilles.map((f) => f.id)).toEqual(['c'])
    expect(s.racks[0]!.total).toBe(15)
    expect(s.racks[0]!.alerte).toBe(true)
    expect(s.racks[1]!.alerte).toBe(false)
    // Une chute n'est jamais mélangée aux feuilles entières ; une référence archivée n'est pas comptée
    expect(s.chutes).toBe(9)
    expect(s.racks.reduce((n, r) => n + r.total, 0)).toBe(55)
  })

  it('dessine une pile vide pour un rack sans feuille, et plafonnée pour un rack plein', () => {
    expect(stockLayout([]).racks.map((r) => r.couches)).toEqual([0, 0])
    expect(stockLayout([feuille('a', { quantite: 500 })]).racks[0]!.couches).toBe(8)
  })
})

describe('Page Plan de l’atelier', () => {
  beforeEach(() => {
    vi.useRealTimers()
    // jsdom n'a pas de canvas : le plan reste vide, les listes suffisent à ces tests
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })

  async function setup(routes: Parameters<typeof mockApi>[0]) {
    const calls = mockApi(routes)
    const pinia = freshPinia()
    useAuthStore().user = ADMIN
    const router = makeRouter()
    await router.push('/plan-atelier')
    await router.isReady()
    const wrapper = mount(PlanAtelierView, { global: { plugins: [pinia, router] } })
    await flushPromises()
    return { wrapper, router, calls }
  }
  const PLAN = { orders: [order('1'), order('2', { statut: 'fabrication', prisPar: 'Paul Martin' }), order('3', { statut: 'prete', livraisonMode: 'livraison' })], feuilles: [], reception: null }

  it('liste les commandes par lieu, sans aucun prix, d’une seule lecture', async () => {
    const { wrapper, calls } = await setup({ 'GET /plan': [200, PLAN] })
    expect(wrapper.get('h1').text()).toBe('Plan de l’atelier')
    expect(wrapper.get('[data-lieu="a-lancer"]').text()).toContain('C-2026-001')
    expect(wrapper.get('[data-lieu="fabrication"]').text()).toContain('C-2026-002')
    expect(wrapper.get('[data-lieu="a-livrer"]').text()).toContain('C-2026-003')
    expect(wrapper.find('[data-lieu="a-retirer"]').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/€/)
    expect(wrapper.get('canvas').attributes('aria-label')).toContain('1 commande(s) à lancer, 1 en fabrication, 0 à retirer, 1 à livrer')
    expect(calls.map((c) => c.path)).toEqual(['/plan'])
  })

  it('signale les références sous leur seuil et la réception en cours', async () => {
    const { wrapper } = await setup({
      'GET /plan': [200, { orders: [], feuilles: [feuille('a', { quantite: 2, etat: 'critique', libelle: 'Aluminium 1 mm · blanc' }), feuille('b', { quantite: 30 })], reception: { feuilles: 18 } }],
    })
    expect(wrapper.text()).toContain('Rien à fabriquer pour l’instant.')
    expect(wrapper.get('[aria-label="Références sous leur seuil"]').text()).toContain('Aluminium 1 mm · blanc')
    expect(wrapper.get('[role="status"]').text()).toContain('18 feuilles')
    expect(wrapper.text()).toContain('32 feuilles entières')
  })

  it('affiche l’erreur quand le plan ne se charge pas', async () => {
    const { wrapper } = await setup({ 'GET /plan': [500, { error: 'Panne.' }] })
    expect(wrapper.get('[role="alert"]').text()).toContain('Panne.')
  })

  it('occupe toute la page : un bouton pour fermer, des listes qu’on range', async () => {
    const { wrapper } = await setup({ 'GET /plan': [200, PLAN] })
    expect(wrapper.get('a.btn').attributes('href')).toBe('/tableau-de-bord')
    expect(wrapper.get('a.btn').text()).toContain('Fermer')
    expect(wrapper.get('#listes-plan').attributes('style') ?? '').not.toContain('display: none')
    const bouton = wrapper.get('button[aria-controls="listes-plan"]')
    await bouton.trigger('click')
    expect(bouton.attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('#listes-plan').attributes('style') ?? '').toContain('display: none')
  })

  it('désigne une commande au premier clic ; la fiche n’est proposée qu’à qui gère les commandes', async () => {
    const { wrapper } = await setup({ 'GET /plan': [200, PLAN] })
    const ligne = wrapper.get('[data-lieu="a-lancer"] .ligne')
    await ligne.trigger('click')
    expect(ligne.attributes('aria-pressed')).toBe('true')
    await ligne.trigger('click')
    expect(ligne.attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('[data-lieu="a-lancer"] a.ouvrir').attributes('href')).toBe('/commandes/1')
    // Sans le droit sur les commandes, pas de lien vers la fiche
    useAuthStore().user = { ...ADMIN, permissions: ['plan.read'] }
    await flushPromises()
    expect(wrapper.find('a.ouvrir').exists()).toBe(false)
  })

  it('se met à jour tout seul', async () => {
    vi.useFakeTimers()
    const calls = mockApi({ 'GET /plan': [200, PLAN] })
    const pinia = freshPinia()
    useAuthStore().user = ADMIN
    const router = makeRouter()
    await router.push('/plan-atelier')
    await router.isReady()
    const wrapper = mount(PlanAtelierView, { global: { plugins: [pinia, router] } })
    await flushPromises()
    const lectures = () => calls.filter((c) => c.path === '/plan').length
    const avant = lectures()
    await vi.advanceTimersByTimeAsync(15_100)
    expect(lectures()).toBe(avant + 1)
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(lectures()).toBe(avant + 1)
  })
})
