import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MateriauxView from '@/views/MateriauxView.vue'
import type { Feuille } from '@/lib/stock'
import { useAuthStore } from '@/stores/auth'
import { ADMIN, freshPinia, makeRouter, mockApi } from './helpers'

// La caméra (lecture de codes-barres) n'est pas utilisée ici
vi.mock('@/lib/scan', () => ({ startScan: vi.fn() }))

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
  codes: ['3760123456789'],
}
const F2: Feuille = {
  ...F1,
  id: 'f2',
  materialId: 'm2',
  epaisseur: 1,
  colorId: null,
  coloris: null,
  reference: null,
  hex: null,
  quantite: 0,
  libelle: 'Aluminium 1 mm · brut · 1 250 × 3 000 mm',
  codes: [],
}
const CHUTE: Feuille = { ...F1, id: 'f3', chute: true, largeur: 450, quantite: 4, libelle: 'Aluminium 1,5 mm · Gris anthracite (RAL 7016) · 450 × 3 000 mm (chute)', codes: [] }
const OPTIONS = {
  materials: [{ id: 'm1', label: 'Aluminium 1,5 mm', nom: 'Aluminium', epaisseur: 1.5 }],
  colors: [{ id: 'c1', label: 'Gris anthracite (RAL 7016)', hex: '#383e42', nom: 'Gris anthracite', reference: 'RAL 7016' }],
}

async function mountPage(extra: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({ 'GET /stock/feuilles': [200, { feuilles: [F1, F2] }], 'GET /stock/options?tous=1': [200, OPTIONS], ...extra })
  const pinia = freshPinia()
  useAuthStore().user = ADMIN
  const router = makeRouter()
  await router.push('/materiaux')
  await router.isReady()
  const wrapper = mount(MateriauxView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, calls }
}

beforeEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('Matériaux', () => {
  it('liste les références avec leur format, leur stock et le nombre de codes-barres', async () => {
    const { wrapper } = await mountPage()
    const lignes = wrapper.findAll('ul.refs > li')
    expect(lignes).toHaveLength(2)
    expect(lignes[0]!.text()).toContain('Aluminium')
    expect(lignes[0]!.text()).toContain('Gris anthracite · RAL 7016')
    expect(lignes[0]!.text()).toContain('10 en stock')
    expect(wrapper.get(`button[aria-label="Codes-barres : ${F1.libelle}"]`).text()).toContain('(1)')
    expect(lignes[1]!.text()).toContain('Brut, sans laquage')
  })

  it('ne liste pas les chutes : elles restent au stock de l’atelier', async () => {
    const { wrapper } = await mountPage({ 'GET /stock/feuilles': [200, { feuilles: [F1, CHUTE] }] })
    expect(wrapper.findAll('ul.refs > li')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('(chute)')
  })

  it('affiche un message quand il n’y a encore aucune référence', async () => {
    const { wrapper } = await mountPage({ 'GET /stock/feuilles': [200, { feuilles: [] }] })
    expect(wrapper.text()).toContain('Aucune référence pour l’instant')
    expect(wrapper.find('#m-filtre').exists()).toBe(false)
  })

  it('cherche par texte ou par code-barres', async () => {
    const { wrapper } = await mountPage()
    await wrapper.get('#m-filtre').setValue('brut')
    expect(wrapper.findAll('ul.refs > li')).toHaveLength(1)
    await wrapper.get('#m-filtre').setValue('3760123')
    expect(wrapper.findAll('ul.refs > li')[0]!.text()).toContain('Gris anthracite')
    await wrapper.get('#m-filtre').setValue('zzz')
    expect(wrapper.text()).toContain('Aucune référence ne correspond')
  })

  it('ajoute une référence en champs libres, à zéro en stock, avec son code-barres, puis recharge la liste', async () => {
    const { wrapper, calls } = await mountPage({ 'POST /stock/feuilles': [201, { feuille: F1 }] })
    expect(wrapper.find('#ajout').exists()).toBe(false)
    await wrapper.get('button[aria-controls="ajout"]').trigger('click')
    // Champs libres, pas de listes déroulantes : seulement des suggestions
    expect(wrapper.find('#ajout select').exists()).toBe(false)
    expect(wrapper.findAll('#m-matieres option').map((o) => o.attributes('value'))).toEqual(['Aluminium'])
    expect(wrapper.findAll('#m-epaisseurs option').map((o) => o.attributes('value'))).toEqual(['1,5'])
    expect(wrapper.findAll('#m-references option').map((o) => o.attributes('value'))).toEqual(['RAL 7016'])
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('#m-reference').attributes('disabled')).toBeDefined()
    await wrapper.get('#m-matiere').setValue('Acier inox')
    await wrapper.get('#m-epaisseur').setValue('0,8')
    await wrapper.get('#m-coloris').setValue('Brossé')
    await wrapper.get('#m-reference').setValue('INOX-B')
    await wrapper.get('#m-code').setValue('3760999888777')
    await wrapper.get('form.grid').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      matiere: 'Acier inox',
      epaisseur: 0.8,
      coloris: 'Brossé',
      reference: 'INOX-B',
      largeur: 1250,
      longueur: 3000,
      quantite: 0,
      code: '3760999888777',
    })
    expect(wrapper.get('[role="status"]').text()).toContain('Référence ajoutée')
    expect(wrapper.find('#ajout').exists()).toBe(false)
    expect(calls.filter((c) => c.method === 'GET' && c.path === '/stock/feuilles')).toHaveLength(2)
  })

  it('une tôle brute n’envoie ni coloris ni référence', async () => {
    const { wrapper, calls } = await mountPage({ 'POST /stock/feuilles': [201, { feuille: F1 }] })
    await wrapper.get('button[aria-controls="ajout"]').trigger('click')
    await wrapper.get('#m-matiere').setValue('Aluminium')
    await wrapper.get('#m-epaisseur').setValue('2')
    await wrapper.get('form.grid').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ matiere: 'Aluminium', epaisseur: 2, largeur: 1250, longueur: 3000, quantite: 0 })
  })

  it('montre l’erreur du champ concerné : épaisseur, code déjà pris…', async () => {
    const { wrapper } = await mountPage({ 'POST /stock/feuilles': [400, { error: 'Épaisseur : nombre attendu.', field: 'epaisseur' }] })
    await wrapper.get('button[aria-controls="ajout"]').trigger('click')
    await wrapper.get('#m-matiere').setValue('Aluminium')
    await wrapper.get('form.grid').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.field-error').text()).toContain('Épaisseur')
    expect(wrapper.get('#m-epaisseur').attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('#ajout').exists()).toBe(true)
    const pris = await mountPage({ 'POST /stock/feuilles': [409, { error: 'Ce code-barres est déjà associé à une autre référence.', field: 'code' }] })
    await pris.wrapper.get('button[aria-controls="ajout"]').trigger('click')
    await pris.wrapper.get('#m-matiere').setValue('Aluminium')
    await pris.wrapper.get('#m-epaisseur').setValue('1,5')
    await pris.wrapper.get('#m-code').setValue('3760123456789')
    await pris.wrapper.get('form.grid').trigger('submit')
    await flushPromises()
    expect(pris.wrapper.get('.field-error').text()).toContain('déjà associé')
  })

  it('ouvre les codes-barres d’une référence pour en ajouter ou en retirer', async () => {
    const { wrapper } = await mountPage()
    expect(wrapper.find(`#code-${F1.id}`).exists()).toBe(false)
    await wrapper.get(`button[aria-label="Codes-barres : ${F1.libelle}"]`).trigger('click')
    expect(wrapper.text()).toContain('3760123456789')
    expect(wrapper.find(`#code-${F1.id}`).exists()).toBe(true)
    await wrapper.get(`button[aria-label="Codes-barres : ${F1.libelle}"]`).trigger('click')
    expect(wrapper.find(`#code-${F1.id}`).exists()).toBe(false)
  })

  it('n’archive qu’une référence sans stock, et ne propose jamais de la supprimer', async () => {
    const { wrapper, calls } = await mountPage({ 'POST /stock/feuilles/f2/archive': [200, { ok: true }] })
    expect(wrapper.find('button[aria-label^="Supprimer"]').exists()).toBe(false)
    expect(wrapper.find(`button[aria-label="Archiver la référence ${F1.libelle}"]`).exists()).toBe(false)
    await wrapper.get(`button[aria-label="Archiver la référence ${F2.libelle}"]`).trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.method === 'POST' && c.path === '/stock/feuilles/f2/archive')).toBe(true)
    expect(wrapper.get('[role="status"]').text()).toContain('Référence archivée')
  })

  it('montre les références archivées à part et permet de les désarchiver', async () => {
    const ARCH: Feuille = { ...F2, archivee: true }
    const { wrapper, calls } = await mountPage({
      'GET /stock/feuilles?archivees=1': [200, { feuilles: [ARCH] }],
      'POST /stock/feuilles/f2/unarchive': [200, { ok: true }],
    })
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Voir les archivées')!
      .trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.path === '/stock/feuilles?archivees=1')).toBe(true)
    expect(wrapper.find('button[aria-controls="ajout"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label^="Codes-barres"]').exists()).toBe(false)
    await wrapper.get(`button[aria-label="Désarchiver la référence ${ARCH.libelle}"]`).trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.method === 'POST' && c.path === '/stock/feuilles/f2/unarchive')).toBe(true)
    expect(wrapper.get('[role="status"]').text()).toContain('Référence désarchivée')
  })
})
