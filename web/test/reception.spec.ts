import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ReceptionView from '@/views/ReceptionView.vue'
import type { Feuille } from '@/lib/stock'
import { useAuthStore } from '@/stores/auth'
import { ATELIER, freshPinia, makeRouter, mockApi } from './helpers'
import { startScan } from '@/lib/scan'

// La caméra est simulée : on garde la fonction appelée à la lecture d'un code
vi.mock('@/lib/scan', () => ({ startScan: vi.fn() }))
let onCode: (code: string) => void = () => {}
const stopCamera = vi.fn()
const cameraOk = () => vi.mocked(startScan).mockImplementation(async (_video, cb) => ((onCode = cb), stopCamera))
const cameraKo = (message: string) => vi.mocked(startScan).mockRejectedValue(new Error(message))

const F1: Feuille = {
  id: 'f1',
  materialId: 'm1',
  matiere: 'Aluminium',
  epaisseur: 1.5,
  colorId: 'c1',
  coloris: 'Gris anthracite',
  reference: 'RAL 7016',
  hex: '#383e42',
  largeur: 1250,
  longueur: 3000,
  chute: false,
  quantite: 10,
  seuil: 4,
  note: '',
  libelle: 'Aluminium 1,5 mm · Gris anthracite (RAL 7016) · 1 250 × 3 000 mm',
  bas: false,
  etat: 'ok',
}
const OPTIONS = { materials: [{ id: 'm1', label: 'Aluminium 1,5 mm' }], colors: [{ id: 'c1', label: 'Gris anthracite (RAL 7016)', hex: '#383e42' }] }
const RECENT = { mouvements: [{ id: 'x1', at: '2026-10-26T08:00:00Z', libelle: F1.libelle, delta: 6, apres: 10, motif: 'reception', note: '', par: 'Marc' }] }

async function setup(routes: Parameters<typeof mockApi>[0]) {
  const calls = mockApi({ 'GET /stock/mouvements': [200, RECENT], ...routes })
  const pinia = freshPinia()
  useAuthStore().user = ATELIER
  const router = makeRouter()
  await router.push('/reception')
  await router.isReady()
  const wrapper = mount(ReceptionView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, calls }
}
const btn = (w: ReturnType<typeof mount>, text: string) => w.findAll('button').find((b) => b.text().includes(text))

beforeEach(() => {
  document.body.replaceChildren()
  vi.mocked(startScan).mockReset()
  stopCamera.mockReset()
  // Par défaut, pas de caméra : la saisie à la main prend le relais
  cameraKo('Aucune caméra disponible : saisissez le code à la main.')
})
const openManual = async (w: ReturnType<typeof mount>) => {
  if (!w.find('#r-code').exists()) await w.get('button.link-btn').trigger('click')
}

describe('Réception de marchandise', () => {
  it('démarre la caméra toute seule, et un code lu lance la recherche sans rien saisir', async () => {
    cameraOk()
    const { wrapper, calls } = await setup({ 'GET /stock/codes/3760123456789': [200, { code: '3760123456789', feuille: F1 }] })
    expect(vi.mocked(startScan)).toHaveBeenCalledTimes(1)
    // La caméra est le geste principal : la saisie reste cachée derrière « Le saisir à la main »
    expect(wrapper.text()).toContain('Placez le code-barres dans le cadre')
    expect(wrapper.find('#r-code').exists()).toBe(false)
    expect(wrapper.find('button.link-btn').text()).toContain('à la main')
    onCode('3760123456789')
    await flushPromises()
    expect(calls.some((c) => c.path === '/stock/codes/3760123456789')).toBe(true)
    expect(wrapper.text()).toContain('Combien de feuilles reçues')
    // Le code est lu : la caméra se coupe pendant la saisie du nombre
    expect(stopCamera).toHaveBeenCalled()
  })

  it('après une réception, la caméra repart pour la feuille suivante', async () => {
    cameraOk()
    const { wrapper } = await setup({
      'GET /stock/codes/ABC123': [200, { code: 'ABC123', feuille: F1 }],
      'POST /stock/reception': [200, { recu: 2, feuille: { ...F1, quantite: 12 } }],
    })
    onCode('ABC123')
    await flushPromises()
    await wrapper.get('#r-qty').setValue('2')
    await wrapper.get('form.recv').trigger('submit')
    await flushPromises()
    expect(vi.mocked(startScan)).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('2 feuilles reçues')
  })

  it('dit pourquoi la caméra ne marche pas et permet de la relancer', async () => {
    cameraKo('Caméra refusée : autorisez-la pour ce site dans le navigateur, puis relancez. Sinon, saisissez le code.')
    const { wrapper } = await setup({})
    expect(wrapper.get('[role="alert"]').text()).toContain('Caméra refusée')
    cameraOk()
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Relancer la caméra'))!
      .trigger('click')
    await flushPromises()
    expect(vi.mocked(startScan)).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('retrouve la référence par son code, demande le nombre et enregistre l’entrée', async () => {
    const { wrapper, calls } = await setup({
      'GET /stock/codes/3760123456789': [200, { code: '3760123456789', feuille: F1 }],
      'POST /stock/reception': [200, { recu: 12, feuille: { ...F1, quantite: 22 } }],
    })
    expect(wrapper.text()).toContain('Scannez le code-barres')
    expect(wrapper.text()).toContain('Dernières réceptions')
    // Sans caméra, l'erreur est dite et la saisie à la main s'ouvre toute seule
    expect(wrapper.get('[role="alert"]').text()).toContain('Aucune caméra disponible')
    expect(wrapper.text()).toContain('Relancer la caméra')
    await wrapper.get('#r-code').setValue('3760123456789')
    await wrapper.get('form.scan').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Combien de feuilles reçues')
    expect(wrapper.text()).toContain(F1.libelle)
    expect(wrapper.text()).toContain('en stock : 10')

    // Les boutons rapides et + / − remplissent le nombre
    await btn(wrapper, '10')!.trigger('click')
    await wrapper.get('button[aria-label="Une feuille de plus"]').trigger('click')
    expect((wrapper.get('#r-qty').element as HTMLInputElement).value).toBe('11')
    await wrapper.get('#r-qty').setValue('12')
    await wrapper.get('#r-note').setValue('BL 4412')
    await wrapper.get('form.recv').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ code: '3760123456789', quantite: 12, note: 'BL 4412' })
    // Retour au scan, avec la confirmation
    expect(wrapper.text()).toContain('12 feuilles reçues')
    expect(wrapper.text()).toContain('Stock : 22')
    expect(wrapper.find('#r-code').exists()).toBe(true)
    expect((wrapper.get('#r-code').element as HTMLInputElement).value).toBe('')
  })

  it('refuse un nombre vide ou nul sans appeler le serveur', async () => {
    const { wrapper, calls } = await setup({ 'GET /stock/codes/ABC123': [200, { code: 'ABC123', feuille: F1 }] })
    await openManual(wrapper)
    await wrapper.get('#r-code').setValue('abc123')
    await wrapper.get('form.scan').trigger('submit')
    await flushPromises()
    expect(calls.some((c) => c.path === '/stock/codes/ABC123')).toBe(true)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.get('#r-qty').setValue('0')
    await wrapper.get('form.recv').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('nombre de feuilles')
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('code inconnu : l’associe à une référence existante puis continue', async () => {
    const { wrapper, calls } = await setup({
      'GET /stock/codes/9990001112223': [404, { error: 'Code-barres inconnu : associez-le à une référence du stock.', code: '9990001112223' }],
      'GET /stock/feuilles': [200, { feuilles: [F1, { ...F1, id: 'f2', largeur: 1000, libelle: 'Aluminium 1,5 mm · Blanc · 1 000 × 2 000 mm', hex: '#fff' }], totaux: {} }],
      'GET /stock/options': [200, OPTIONS],
      'POST /stock/codes': [201, { ok: true }],
    })
    await openManual(wrapper)
    await wrapper.get('#r-code').setValue('9990001112223')
    await wrapper.get('form.scan').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Code inconnu')
    expect(wrapper.text()).toContain('9990001112223')
    // La recherche filtre les références
    await wrapper.get('#r-filtre').setValue('blanc')
    expect(wrapper.findAll('.choice')).toHaveLength(1)
    await wrapper.get('.choice').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ code: '9990001112223', sheetId: 'f2' })
    expect(wrapper.text()).toContain('Combien de feuilles reçues')
  })

  it('code inconnu : crée une nouvelle référence avec ce code, sans stock au départ', async () => {
    const { wrapper, calls } = await setup({
      'GET /stock/codes/ZZZ-0001': [404, { error: 'Code-barres inconnu.', code: 'ZZZ-0001' }],
      'GET /stock/feuilles': [200, { feuilles: [], totaux: {} }],
      'GET /stock/options': [200, OPTIONS],
      'POST /stock/feuilles': [201, { feuille: { ...F1, quantite: 0 } }],
    })
    await openManual(wrapper)
    await wrapper.get('#r-code').setValue('zzz-0001')
    await wrapper.get('form.scan').trigger('submit')
    await flushPromises()
    await btn(wrapper, 'Créer une nouvelle référence')!.trigger('click')
    expect(btn(wrapper, 'Créer et continuer')!.attributes('disabled')).toBeDefined()
    await wrapper.get('#n-mat').setValue('m1')
    await wrapper.get('#n-col').setValue('c1')
    await wrapper.get('form.recv').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ materialId: 'm1', colorId: 'c1', largeur: 1250, longueur: 3000, code: 'ZZZ-0001', quantite: 0 })
    expect(wrapper.text()).toContain('Combien de feuilles reçues')
  })

  it('affiche l’erreur du serveur à l’enregistrement', async () => {
    const { wrapper } = await setup({
      'GET /stock/codes/ABC123': [200, { code: 'ABC123', feuille: F1 }],
      'POST /stock/reception': [400, { error: '100 000 feuilles maximum.', field: 'quantite' }],
    })
    await openManual(wrapper)
    await wrapper.get('#r-code').setValue('ABC123')
    await wrapper.get('form.scan').trigger('submit')
    await flushPromises()
    await wrapper.get('#r-qty').setValue('5')
    await wrapper.get('form.recv').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('100 000 feuilles maximum.')
    expect(wrapper.text()).toContain('Combien de feuilles reçues')
  })
})
