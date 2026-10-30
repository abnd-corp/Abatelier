import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ProductionSuiviView from '@/views/ProductionSuiviView.vue'
import ProductionOrderView from '@/views/ProductionOrderView.vue'
import { useAuthStore, type User } from '@/stores/auth'
import { avancement, type Suivi } from '@/lib/production'
import { ATELIER, freshPinia, makeRouter, mockApi } from './helpers'

const LIGNE = {
  id: 'l1',
  repere: 'Mur sud',
  modeleLabel: 'Couvertine',
  cap: 0,
  materialLabel: 'Aluminium 1,5 mm',
  colorLabel: 'Gris anthracite (RAL 7016)',
  colorHex: '#383e42',
  cotes: [20, 70, 300, 70, 20],
  angles: [135, 90, 90, 135],
  longueur: 3000,
  quantite: 4,
  accessoires: [],
}
const DETAIL = {
  order: { id: 'o1', numero: 'C-2026-0001', client: 'Toitures du Forez', statut: 'fabrication', statutLabel: 'En fabrication', next: 'prete' },
  lignes: [LIGNE],
  events: [],
}
const etape = (plat: boolean): { pts: [number, number][]; plat: boolean } => ({
  pts: [
    [0, 0],
    [20, 0],
    [plat ? 480 : 90, 100],
  ],
  plat,
})
const SUIVI = (over: Partial<Suivi> = {}): Suivi => ({
  plan: {
    groupes: [
      {
        id: 'l1',
        numero: 1,
        label: 'Aluminium 1,5 mm · Gris anthracite (RAL 7016)',
        recuperer: [{ cle: 'recup:l1', ligneId: 'l1', piece: 1, texte: '2 × feuille 1 250 × 3 000 mm' }],
        decoupes: [
          {
            cle: 'decoupe:l1',
            ligneId: 'l1',
            piece: 1,
            titre: 'Pièce 1 · Couvertine · Mur sud',
            consigne: '4 bandes de 480 mm de large × 3 000 mm de long',
            pose: '2 bandes par feuille, dans le sens de la longueur de la feuille',
            quantite: 4,
            plan: { feuilleLargeur: 1250, feuilleLongueur: 3000, parFeuille: 2, sensLongueur: true, colonnes: 2, rangees: 1, developpe: 480, longueur: 3000 },
          },
        ],
        pliages: [
          {
            cle: 'pliage:l1',
            ligneId: 'l1',
            piece: 1,
            titre: 'Pièce 1 · Couvertine · Mur sud',
            consigne: '4 plis à la presse, dans l’ordre 1 à 4',
            plis: [
              { angle: -135, pince: false },
              { angle: 90, pince: false },
              { angle: 90, pince: false },
              { angle: -135, pince: false },
            ],
            traits: [20, 90, 390, 460],
            etapes: [etape(true), etape(true), etape(true), etape(false)],
            quantite: 4,
          },
        ],
        coteCle: 'cote:l1',
        chutes: { garder: [{ nombre: 2, largeur: 290, longueur: 3000 }], jeter: [], pourcent: 23.2, m2: 1.74, minimum: 200 },
        feuilles: [{ sheetId: 's1', nombre: 2 }],
        stockCle: 'stock:l1',
      },
    ],
    apreparer: [{ cle: 'prep:acc:Bouchon|piece', texte: '2 × Bouchon de couvertine' }],
  },
  checks: {},
  modifiable: true,
  ...over,
})

// Un atelier qui gère aussi le stock de feuilles, comme dans l'application
const GESTIONNAIRE: User = { ...ATELIER, permissions: ['orders.production', 'stock.manage'] }

afterEach(() => vi.useRealTimers())
beforeEach(() => vi.useRealTimers())

async function setup(suivi: Suivi, extra: Parameters<typeof mockApi>[0] = {}, user: User = ATELIER) {
  const calls = mockApi({ 'GET /production/o1': [200, DETAIL], 'GET /production/o1/suivi': [200, suivi], 'PUT /production/o1/suivi': [200, {}], ...extra })
  const pinia = freshPinia()
  useAuthStore().user = user
  const router = makeRouter()
  await router.push('/fabrication/o1/suivi')
  await router.isReady()
  const wrapper = mount(ProductionSuiviView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, calls }
}
const bouton = (w: ReturnType<typeof mount>, texte: string) => w.findAll('button').find((b) => b.text().includes(texte))!
const norm = (s: string) => s.replace(/[  ]/g, ' ').replace(/\s+/g, ' ')

describe('Suivi de la fabrication', () => {
  it('range la fiche : les pièces, puis chaque feuille avec récupérer, découper, plier, mettre de côté et la chute', async () => {
    const { wrapper } = await setup(SUIVI())
    const txt = norm(wrapper.text())
    for (const attendu of [
      'Toitures du Forez',
      'Les pièces',
      'Feuille 1 sur 1',
      '1. Récupérer la matière',
      '2 × feuille 1 250 × 3 000 mm',
      '2. Découper',
      'toutes les découpes d’abord',
      '4 bandes de 480 mm de large × 3 000 mm de long',
      '3. Plier',
      'puis tous les pliages',
      'Traits de pli à partir du bord (mm) : 20 · 90 · 390 · 460',
      '4. Mettre de côté',
      'Chute de cette feuille',
      '2 × 290 × 3 000 mm',
      '23,2 % de la matière',
      'À préparer à part',
      '2 × Bouchon de couvertine',
    ])
      expect(txt, attendu).toContain(attendu)
    expect(wrapper.findAll('.vignettes li')).toHaveLength(4)
    expect(wrapper.find('svg[aria-label*="Feuille 1250"]').exists() || wrapper.find('figure svg').exists()).toBe(true)
    // Du client : le nom seulement, jamais de prix
    expect(txt).not.toContain('€')
    expect(wrapper.get('a[href="/api/production/o1/fiche.pdf"]').text()).toContain('Imprimer la fiche')
  })

  it('compte les bandes découpées avec + et −, et enregistre à chaque fois', async () => {
    const { wrapper, calls } = await setup(SUIVI())
    const decoupe = wrapper.get('[data-decoupe="1"]')
    expect(decoupe.get('output').text()).toBe('0 / 4')
    await decoupe.get('button[aria-label^="Une bande découpée de plus"]').trigger('click')
    await decoupe.get('button[aria-label^="Une bande découpée de plus"]').trigger('click')
    await flushPromises()
    expect(decoupe.get('output').text()).toBe('2 / 4')
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.body)).toEqual([
      { cle: 'decoupe:l1', count: 1 },
      { cle: 'decoupe:l1', count: 2 },
    ])
    await decoupe.get('button[aria-label^="Une bande de moins"]').trigger('click')
    await flushPromises()
    expect(decoupe.get('output').text()).toBe('1 / 4')
    await bouton(decoupe as never, 'Tout').trigger('click')
    await flushPromises()
    expect(decoupe.get('output').text()).toBe('4 / 4')
    expect(decoupe.get('output').classes()).toContain('complet')
    expect(calls.at(-1)).toMatchObject({ method: 'PUT', body: { cle: 'decoupe:l1', count: 4 } })
    // Plus rien à ajouter
    expect(decoupe.get('button[aria-label^="Une bande découpée de plus"]').attributes('disabled')).toBeDefined()
  })

  it('coche une case simple, et montre qui l’a cochée', async () => {
    const { wrapper, calls } = await setup(SUIVI({ checks: { 'recup:l1': { count: 1, par: 'Claire Nadal', le: '2026-10-30T08:00:00Z' } } }))
    const case1 = wrapper.get('input[type="checkbox"]')
    expect((case1.element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.text()).toContain('Claire Nadal')
    await case1.setValue(false)
    await flushPromises()
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({ cle: 'recup:l1', count: 0 })
  })

  it('revient en arrière et le dit quand le serveur refuse', async () => {
    const { wrapper } = await setup(SUIVI(), { 'PUT /production/o1/suivi': [409, { error: 'Cette commande est déjà prête : le suivi ne se modifie plus.' }] })
    const decoupe = wrapper.get('[data-decoupe="1"]')
    await decoupe.get('button[aria-label^="Une bande découpée de plus"]').trigger('click')
    await flushPromises()
    expect(decoupe.get('output').text()).toBe('0 / 4')
    expect(wrapper.get('[role="alert"]').text()).toContain('déjà prête')
  })

  it('affiche l’avancement de toute la commande', async () => {
    const suivi = SUIVI({ checks: { 'recup:l1': { count: 1, par: null, le: '' }, 'decoupe:l1': { count: 4, par: null, le: '' } } })
    // 1 + 4 + 4 + 1 + 1 : 11 étapes, dont 5 faites
    expect(avancement(suivi.plan, suivi.checks)).toEqual({ fait: 5, total: 11, pourcent: 45 })
    const { wrapper } = await setup(suivi)
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('45')
    expect(norm(wrapper.get('[role="progressbar"]').text())).toContain('5 / 11 étapes')
  })

  it('ne propose le stock qu’une fois les découpes faites, et à ceux qui gèrent le stock', async () => {
    const attente = await setup(SUIVI(), {}, GESTIONNAIRE)
    const mettre = () => bouton(attente.wrapper as never, 'Mettre à jour le stock')
    expect(mettre().attributes('disabled')).toBeDefined()
    expect(attente.wrapper.text()).toContain('Disponible quand toutes les découpes')
    // Sans la permission « stock.manage », pas de bouton
    const sansStock = await setup(SUIVI({ checks: { 'decoupe:l1': { count: 4, par: null, le: '' } } }), {}, ATELIER)
    expect(sansStock.wrapper.findAll('button').some((b) => b.text().includes('Mettre à jour le stock'))).toBe(false)
  })

  it('met le stock à jour et le dit, puis recharge', async () => {
    let fait = false
    const suivi = SUIVI({ checks: { 'decoupe:l1': { count: 4, par: null, le: '' } } })
    const { wrapper, calls } = await setup(
      suivi,
      {
        'GET /production/o1/suivi': () => [200, fait ? { ...suivi, checks: { ...suivi.checks, 'stock:l1': { count: 1, par: 'Le Chef', le: '2026-10-30T09:00:00Z' } } } : suivi],
        'POST /production/o1/suivi/stock': () => ((fait = true), [200, { sorties: ['2 × Aluminium 1,5 mm · 1 250 × 3 000 mm'], chutes: ['2 × 290 × 3 000 mm (chute)'] }]),
      },
      GESTIONNAIRE,
    )
    await bouton(wrapper, 'Mettre à jour le stock').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ groupe: 'l1' })
    expect(wrapper.get('[role="status"]').text()).toContain('Stock à jour')
    expect(wrapper.text()).toContain('Stock à jour pour cette feuille (Le Chef)')
    expect(wrapper.findAll('button').some((b) => b.text().includes('Mettre à jour le stock'))).toBe(false)
  })

  it('bloque toutes les cases quand la commande est prête', async () => {
    const { wrapper } = await setup(SUIVI({ modifiable: false }))
    expect(wrapper.text()).toContain('le suivi n’est plus modifiable')
    for (const c of wrapper.findAll('input[type="checkbox"]')) expect(c.attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-decoupe="1"] button[aria-label^="Une bande découpée de plus"]').attributes('disabled')).toBeDefined()
  })

  it('dit « feuille à choisir » sans chute quand le stock ne propose rien', async () => {
    const suivi = SUIVI()
    suivi.plan.groupes[0]!.chutes = null
    suivi.plan.groupes[0]!.feuilles = []
    suivi.plan.groupes[0]!.decoupes[0]!.plan = null
    const { wrapper } = await setup(suivi)
    expect(norm(wrapper.text())).toContain('aucune feuille conseillée en stock')
    expect(wrapper.find('.chute').exists()).toBe(false)
  })

  it('est proposé depuis la fiche de la commande', async () => {
    const calls = mockApi({ 'GET /production/o1': [200, DETAIL], 'GET /production/o1/feuilles': [200, { lignes: [] }] })
    void calls
    const pinia = freshPinia()
    useAuthStore().user = ATELIER
    const router = makeRouter()
    await router.push('/fabrication/o1')
    await router.isReady()
    const wrapper = mount(ProductionOrderView, { global: { plugins: [pinia, router] } })
    await flushPromises()
    expect(wrapper.get('a[href="/fabrication/o1/suivi"]').text()).toContain('Suivre pas à pas')
  })
})
