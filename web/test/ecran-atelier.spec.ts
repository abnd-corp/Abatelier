import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import EcranAtelierView from '@/views/EcranAtelierView.vue'
import { useAuthStore } from '@/stores/auth'
import { ATELIER, freshPinia, makeRouter, mockApi } from './helpers'

const ligne = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  numero: `C-2026-00${id}`,
  client: `Client ${id}`,
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
    ligne('5', { statut: 'prete' }),
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
  it('range les commandes en quatre colonnes, les prêtes séparées en à livrer et à retirer, avec leur nombre', async () => {
    const { wrapper } = await setup({ 'GET /public/ecran': [200, ECRAN] })
    expect(colonne(wrapper, 'validee').get('h2').text()).toContain('À lancer')
    expect(colonne(wrapper, 'validee').get('h2').text()).toContain('2')
    expect(colonne(wrapper, 'validee').text()).toContain('C-2026-001')
    expect(colonne(wrapper, 'fabrication').text()).toContain('Bavette')
    expect(colonne(wrapper, 'livrer').text()).toContain('C-2026-003')
    expect(colonne(wrapper, 'livrer').get('h2').text()).toContain('À livrer')
    expect(colonne(wrapper, 'retirer').get('h2').text()).toContain('À retirer')
    expect(colonne(wrapper, 'retirer').text()).toContain('C-2026-005')
    expect(colonne(wrapper, 'retirer').text()).not.toContain('C-2026-003')
  })

  it('met le nom du client en gros, avant le numéro, et coiffe À livrer et À retirer d’un titre « Prêtes »', async () => {
    const { wrapper } = await setup({ 'GET /public/ecran': [200, ECRAN] })
    const li = colonne(wrapper, 'validee').get('li')
    expect(li.get('.client').text()).toBe('Client 1')
    expect(li.text().indexOf('Client 1')).toBeLessThan(li.text().indexOf('C-2026-001'))
    expect(wrapper.get('.pretes-titre').text()).toContain('Prêtes')
    expect(wrapper.get('.pretes-titre').text()).toContain('2')
  })

  it('affiche l’heure avec les secondes', async () => {
    const { wrapper } = await setup({ 'GET /public/ecran': [200, ECRAN] })
    expect(wrapper.get('time.heure').text()).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('met en avant ce qui est en retard, et le compte en haut', async () => {
    const { wrapper } = await setup({ 'GET /public/ecran': [200, ECRAN] })
    expect(wrapper.get('.retards').text()).toBe('1 en retard')
    expect(wrapper.findAll('li.retard')).toHaveLength(1)
    expect(wrapper.get('li.retard').text()).toContain('Bandeau')
    // Une commande prête n'est jamais en retard
    expect(wrapper.find('[data-colonne="livrer"] .retard, [data-colonne="retirer"] .retard').exists()).toBe(false)
  })

  it('ne montre ni prix ni bouton d’action', async () => {
    const { wrapper } = await setup({ 'GET /public/ecran': [200, ECRAN] })
    expect(wrapper.text()).not.toMatch(/€/)
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Lancer la fabrication')
    expect(wrapper.find('a.btn').exists()).toBe(false)
  })

  it('le dit quand le serveur ne répond plus, et garde ce qui était affiché', async () => {
    vi.useFakeTimers()
    let panne = false
    const { wrapper } = await setup({ 'GET /public/ecran': () => (panne ? [500, { error: 'Panne.' }] : [200, ECRAN]) })
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
    const { wrapper } = await setup({ 'GET /public/ecran': [200, { orders: [], now: ECRAN.now }] })
    expect(wrapper.findAll('.vide')).toHaveLength(4)
  })

  it('descend doucement, marque une pause en bas, puis remonte à la même vitesse sans sauter en haut', async () => {
    const valeurs: number[] = []
    const proto = HTMLElement.prototype
    Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => 400 })
    Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => 100 })
    Object.defineProperty(proto, 'scrollTop', { configurable: true, get: () => 0, set: (v: number) => void valeurs.push(v) })
    let suite: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => ((suite = cb), 1))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    try {
      mockApi({ 'GET /public/ecran': [200, ECRAN] })
      const pinia = freshPinia()
      useAuthStore().user = ATELIER
      const router = makeRouter()
      await router.push('/ecran-atelier')
      await router.isReady()
      const wrapper = mount(EcranAtelierView, { global: { plugins: [pinia, router] }, attachTo: document.body })
      await flushPromises()
      // Une image par seconde : 30 px/s, 300 px à parcourir, 3 s de pause en haut et en bas
      for (let t = 0; t <= 30_000; t += 1000) suite?.(t)
      const bas = valeurs.indexOf(Math.max(...valeurs))
      expect(Math.max(...valeurs)).toBe(300)
      const montee = valeurs.slice(bas + 1).filter((v) => v < 300)
      expect(montee.length).toBeGreaterThan(5)
      // Chaque pas de la remontée fait 30 px au plus : jamais de retour brutal en haut
      let precedent = 300
      for (const v of valeurs.slice(bas)) {
        expect(precedent - v).toBeLessThanOrEqual(30)
        precedent = v
      }
      expect(valeurs.at(-1)).toBeLessThan(300)
      wrapper.unmount()
    } finally {
      delete (proto as unknown as Record<string, unknown>).scrollHeight
      delete (proto as unknown as Record<string, unknown>).clientHeight
      delete (proto as unknown as Record<string, unknown>).scrollTop
      vi.unstubAllGlobals()
    }
  })
})
