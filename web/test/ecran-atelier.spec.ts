import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import EcranAtelierView from '@/views/EcranAtelierView.vue'
import { useAuthStore } from '@/stores/auth'
import { ATELIER, freshPinia, makeRouter, mockApi } from './helpers'

const ligne = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  numero: `C-2026-00${id}`,
  statut: 'validee',
  livraisonMode: 'retrait',
  datePrevue: '2999-01-01',
  pieces: 4,
  modeles: 'Couvertine',
  ...o,
})
const ECRAN = {
  orders: [
    ligne('1'),
    ligne('2', { statut: 'fabrication', modeles: 'Bavette' }),
    ligne('3', { statut: 'prete', livraisonMode: 'livraison' }),
    ligne('4', { datePrevue: '2000-01-01', modeles: 'Bandeau' }),
  ],
  now: '2026-10-30T08:00:00Z',
}

afterEach(() => vi.useRealTimers())
beforeEach(() => vi.useRealTimers())

async function setup(routes: Parameters<typeof mockApi>[0]) {
  const calls = mockApi(routes)
  const pinia = freshPinia()
  useAuthStore().user = ATELIER
  const router = makeRouter()
  await router.push('/ecran-atelier')
  await router.isReady()
  const wrapper = mount(EcranAtelierView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, calls }
}
const colonne = (w: Awaited<ReturnType<typeof setup>>['wrapper'], id: string) => w.get(`[data-colonne="${id}"]`)

describe('Écran de l’atelier', () => {
  it('range les commandes en trois colonnes, avec leur nombre', async () => {
    const { wrapper } = await setup({ 'GET /ecran': [200, ECRAN] })
    expect(colonne(wrapper, 'validee').get('h2').text()).toContain('À lancer')
    expect(colonne(wrapper, 'validee').get('h2').text()).toContain('2')
    expect(colonne(wrapper, 'validee').text()).toContain('C-2026-001')
    expect(colonne(wrapper, 'fabrication').text()).toContain('Bavette')
    expect(colonne(wrapper, 'prete').text()).toContain('Livraison')
  })

  it('met en avant ce qui est en retard, et le compte en haut', async () => {
    const { wrapper } = await setup({ 'GET /ecran': [200, ECRAN] })
    expect(wrapper.get('.retards').text()).toBe('1 en retard')
    expect(wrapper.findAll('li.retard')).toHaveLength(1)
    expect(wrapper.get('li.retard').text()).toContain('Bandeau')
    // Une commande prête n'est jamais en retard
    expect(colonne(wrapper, 'prete').find('.retard').exists()).toBe(false)
  })

  it('ne montre ni client, ni prix, ni bouton d’action', async () => {
    const { wrapper } = await setup({ 'GET /ecran': [200, ECRAN] })
    expect(wrapper.text()).not.toMatch(/€|client/i)
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Lancer la fabrication')
    expect(wrapper.get('a.btn').attributes('href')).toBe('/tableau-de-bord')
  })

  it('le dit quand le serveur ne répond plus, et garde ce qui était affiché', async () => {
    vi.useFakeTimers()
    let panne = false
    const { wrapper } = await setup({ 'GET /ecran': () => (panne ? [500, { error: 'Panne.' }] : [200, ECRAN]) })
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    panne = true
    await vi.advanceTimersByTimeAsync(15_100)
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Plus de nouvelles du serveur')
    expect(colonne(wrapper, 'validee').text()).toContain('C-2026-001')
    panne = false
    await vi.advanceTimersByTimeAsync(15_100)
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('affiche « Aucune » dans une colonne vide', async () => {
    const { wrapper } = await setup({ 'GET /ecran': [200, { orders: [], now: ECRAN.now }] })
    expect(wrapper.findAll('.vide')).toHaveLength(3)
  })
})
