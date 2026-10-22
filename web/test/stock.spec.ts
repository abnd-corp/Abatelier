import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import StockView from '@/views/StockView.vue'
import { describe as describeEntry, type AuditEntry } from '@/lib/audit-labels'
import type { Feuille, Mouvement } from '@/lib/stock'
import { useAuthStore } from '@/stores/auth'
import { ADMIN, freshPinia, makeRouter, mockApi } from './helpers'

const norm = (t: string) => t.replace(/[\u202f\u00a0]/g, ' ')
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
  note: 'Palette 2',
  libelle: 'Aluminium 1,5 mm · Gris anthracite (RAL 7016) · 1 250 × 3 000 mm',
  bas: false,
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
  largeur: 450,
  longueur: 3000,
  chute: true,
  quantite: 2,
  seuil: 3,
  note: '',
  libelle: 'Aluminium 1 mm · brut · 450 × 3 000 mm (chute)',
  bas: true,
}
const MV: Mouvement = { id: 'x1', at: '2026-10-22T08:30:00Z', libelle: F1.libelle, delta: -3, apres: 7, motif: 'fabrication', note: 'C-2026-0004', par: 'Plieur' }
const OPTIONS = {
  materials: [
    { id: 'm1', label: 'Aluminium 1,5 mm' },
    { id: 'm2', label: 'Aluminium 1 mm' },
  ],
  colors: [{ id: 'c1', label: 'Gris anthracite (RAL 7016)', hex: '#383e42' }],
}
const ouvrirAjout = (w: ReturnType<typeof mount>) => w.get('button[aria-controls="ajout"]').trigger('click')
const LIST = { feuilles: [F1, F2], totaux: { references: 2, feuilles: 12, m2: 38.4, bas: 1 } }

beforeEach(() => localStorage.clear())

async function mountStock(extra: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({ 'GET /stock/feuilles': [200, LIST], 'GET /stock/mouvements': [200, { mouvements: [MV] }], 'GET /stock/options': [200, OPTIONS], ...extra })
  const pinia = freshPinia()
  useAuthStore().user = ADMIN
  const router = makeRouter()
  await router.push('/stock')
  await router.isReady()
  const wrapper = mount(StockView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, calls }
}

describe('Stock de feuilles', () => {
  it('liste les feuilles avec matière, épaisseur, coloris, format, quantité et alerte, et résume le stock', async () => {
    const { wrapper } = await mountStock()
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(norm(rows[0]!.text())).toContain('Aluminium 1,5 mm')
    expect(rows[0]!.text()).toContain('Gris anthracite')
    expect(norm(rows[0]!.text())).toContain('1 250 × 3 000 mm')
    expect(rows[0]!.get('b').text()).toBe('10')
    expect(rows[1]!.text()).toContain('Brut')
    expect(rows[1]!.text()).toContain('Chute')
    expect(rows[1]!.text()).toContain('Stock bas')
    expect(rows[0]!.text()).not.toContain('Stock bas')
    const t = norm(wrapper.get('.totaux').text())
    expect(t).toContain('Références2')
    expect(t).toContain('Feuilles12')
    expect(t).toContain('38,4 m²')
    expect(t).toContain('Stock bas1')
    expect(wrapper.get('#liste ~ .chips, .chips').text()).toContain('Aluminium 1 mm')
  })

  it('filtre par matière', async () => {
    const { wrapper } = await mountStock()
    await wrapper
      .findAll('.chip')
      .find((c) => c.text() === 'Aluminium 1 mm')!
      .trigger('click')
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.findAll('tbody tr')[0]!.text()).toContain('Brut')
  })

  it('garde le formulaire d’ajout et l’historique fermés, et les ouvre à la demande', async () => {
    const { wrapper } = await mountStock()
    expect(wrapper.find('#ajout').exists()).toBe(false)
    expect(wrapper.find('#hist-liste').exists()).toBe(false)
    expect(wrapper.get('button[aria-controls="ajout"]').attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('button[aria-controls="hist-liste"]').text()).toContain('Derniers mouvements (1)')
    await ouvrirAjout(wrapper)
    expect(wrapper.find('#ajout').exists()).toBe(true)
    expect(wrapper.get('button[aria-controls="ajout"]').attributes('aria-expanded')).toBe('true')
    await wrapper.get('button[aria-controls="ajout"]').trigger('click')
    expect(wrapper.find('#ajout').exists()).toBe(false)
    await wrapper.get('button[aria-controls="hist-liste"]').trigger('click')
    expect(wrapper.find('#hist-liste').exists()).toBe(true)
  })

  it('ajoute une feuille, referme le formulaire, et montre l’erreur du champ concerné', async () => {
    const { wrapper, calls } = await mountStock({ 'POST /stock/feuilles': [201, { feuille: F1 }] })
    await ouvrirAjout(wrapper)
    await wrapper.get('#s-matiere').setValue('m1')
    await wrapper.get('#s-coloris').setValue('c1')
    await wrapper.get('#s-largeur').setValue('1250')
    await wrapper.get('#s-longueur').setValue('3000')
    await wrapper.get('#s-quantite').setValue('10')
    await wrapper.get('form.grid').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ materialId: 'm1', colorId: 'c1', largeur: 1250, longueur: 3000, quantite: 10, seuil: 0, chute: false, note: '' })
    expect(wrapper.get('[role="status"]').text()).toContain('Feuille ajoutée')
    expect(wrapper.find('#ajout').exists()).toBe(false)
    const bad = await mountStock({ 'POST /stock/feuilles': [400, { error: 'Largeur : 50 mm minimum.', field: 'largeur' }] })
    await ouvrirAjout(bad.wrapper)
    await bad.wrapper.get('#s-matiere').setValue('m1')
    await bad.wrapper.get('form.grid').trigger('submit')
    await flushPromises()
    expect(bad.wrapper.get('#s-largeur-e').text()).toBe('Largeur : 50 mm minimum.')
    expect(bad.wrapper.get('#s-largeur').attributes('aria-invalid')).toBe('true')
  })

  it('enregistre une sortie avec son motif, puis une entrée, puis un inventaire', async () => {
    const { wrapper, calls } = await mountStock({ 'POST /stock/feuilles/f1/mouvement': [200, { quantite: 7, bas: false }] })
    await wrapper.get(`button[aria-label="Sortie de feuilles : ${F1.libelle}"]`).trigger('click')
    await wrapper.get('#m-f1').setValue('3')
    await wrapper.get('#mm-f1').setValue('fabrication')
    await wrapper.get('#mn-f1').setValue('C-2026-0004')
    await wrapper.get('form.move').trigger('submit')
    await flushPromises()
    expect(calls.filter((c) => c.path === '/stock/feuilles/f1/mouvement')[0]!.body).toEqual({ delta: -3, motif: 'fabrication', note: 'C-2026-0004' })
    expect(wrapper.get('[role="status"]').text()).toContain('7 feuilles')
    await wrapper.get(`button[aria-label="Entrée de feuilles : ${F1.libelle}"]`).trigger('click')
    await wrapper.get('#m-f1').setValue('20')
    await wrapper.get('form.move').trigger('submit')
    await flushPromises()
    expect(calls.filter((c) => c.path === '/stock/feuilles/f1/mouvement')[1]!.body).toEqual({ delta: 20, motif: 'reception', note: '' })
    await wrapper.get(`button[aria-label="Inventaire : ${F1.libelle}"]`).trigger('click')
    expect((wrapper.get('#m-f1').element as HTMLInputElement).value).toBe('10')
    await wrapper.get('#m-f1').setValue('8')
    await wrapper.get('form.move').trigger('submit')
    await flushPromises()
    expect(calls.filter((c) => c.path === '/stock/feuilles/f1/mouvement')[2]!.body).toEqual({ quantite: 8, motif: 'inventaire', note: '' })
  })

  it('refuse une quantité vide ou nulle sans appeler le serveur, et affiche le refus du serveur', async () => {
    const { wrapper, calls } = await mountStock({ 'POST /stock/feuilles/f1/mouvement': [409, { error: 'Il n’y a que 10 feuilles en stock : impossible d’en sortir 30.', field: 'delta' }] })
    await wrapper.get(`button[aria-label="Sortie de feuilles : ${F1.libelle}"]`).trigger('click')
    await wrapper.get('form.move').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('supérieur à 0')
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
    await wrapper.get('#m-f1').setValue('30')
    await wrapper.get('form.move').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Il n’y a que 10 feuilles')
  })

  it('ne propose de supprimer qu’une référence vide, modifie le seuil et la note, et montre l’historique', async () => {
    const vide = { ...F2, id: 'f3', quantite: 0, bas: false, libelle: 'Aluminium 1 mm · brut · 450 × 3 000 mm' }
    const { wrapper, calls } = await mountStock({
      'GET /stock/feuilles': [200, { ...LIST, feuilles: [F1, vide] }],
      'DELETE /stock/feuilles/f3': [200, { ok: true }],
      'PATCH /stock/feuilles/f1': [200, { ok: true }],
    })
    expect(wrapper.find(`button[aria-label^="Supprimer la référence ${F1.libelle}"]`).exists()).toBe(false)
    await wrapper.get('button[aria-label^="Supprimer la référence"]').trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/stock/feuilles/f3')).toBe(true)
    await wrapper.get(`input[aria-label="Alerte stock bas de ${F1.libelle}"]`).setValue('6')
    await wrapper.get(`input[aria-label="Alerte stock bas de ${F1.libelle}"]`).trigger('change')
    await flushPromises()
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ seuil: 6 })
    await wrapper.get('button[aria-controls="hist-liste"]').trigger('click')
    const h = norm(wrapper.get('.hist').text())
    expect(h).toContain('−3')
    expect(h).toContain('Utilisée en fabrication · C-2026-0004 · reste 7')
    expect(h).toContain('Plieur')
  })

  it('invite à ajouter des feuilles quand le stock est vide, et dit les erreurs', async () => {
    const empty = await mountStock({ 'GET /stock/feuilles': [200, { feuilles: [], totaux: { references: 0, feuilles: 0, m2: 0, bas: 0 } }] })
    expect(empty.wrapper.text()).toContain('Aucune feuille en stock pour l’instant')
    const down = await mountStock({ 'GET /stock/feuilles': [500, { error: 'Le serveur a rencontré un problème.' }] })
    expect(down.wrapper.get('[role="alert"]').text()).toContain('problème')
  })

  it('décrit le stock dans le journal', () => {
    const e = (action: string, details: object): string =>
      describeEntry({ id: 1, at: '2026-10-22T08:00:00Z', action, actor: 'Chef', targetType: null, targetId: null, ip: null, details } as unknown as AuditEntry).text
    expect(norm(e('stock.sheet_created', { libelle: 'Alu 1,5 mm · brut · 1 250 × 3 000 mm', quantite: 10 }))).toBe('A ajouté au stock la feuille Alu 1,5 mm · brut · 1 250 × 3 000 mm (10)')
    expect(e('stock.moved', { libelle: 'X', delta: -3, apres: 7, motif: 'fabrication' })).toBe('Sortie de 3 feuilles : X (reste 7)')
    expect(e('stock.moved', { libelle: 'X', delta: 2, apres: 9, motif: 'inventaire' })).toBe('Inventaire de 2 feuilles : X (reste 9)')
    expect(e('stock.sheet_deleted', { libelle: 'X' })).toBe('A supprimé du stock la référence X')
  })
})
