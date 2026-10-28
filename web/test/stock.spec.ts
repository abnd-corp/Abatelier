import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import StockView from '@/views/StockView.vue'
import { describe as describeEntry, type AuditEntry } from '@/lib/audit-labels'
import type { Feuille, Mouvement } from '@/lib/stock'
import { useAuthStore } from '@/stores/auth'
import { ADMIN, freshPinia, makeRouter, mockApi } from './helpers'

// La caméra (lecture de codes-barres) n'est pas utilisée ici
vi.mock('@/lib/scan', () => ({ startScan: vi.fn() }))

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
  etat: 'ok',
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
  etat: 'critique',
}
const MV: Mouvement = { id: 'x1', at: '2026-10-22T08:30:00Z', libelle: F1.libelle, delta: -3, apres: 7, motif: 'fabrication', note: 'C-2026-0004', par: 'Plieur' }
const OPTIONS = {
  materials: [
    { id: 'm1', label: 'Aluminium 1,5 mm' },
    { id: 'm2', label: 'Aluminium 1 mm' },
  ],
  colors: [{ id: 'c1', label: 'Gris anthracite (RAL 7016)', hex: '#383e42' }],
}
const btn = (w: ReturnType<typeof mount>, text: string) => w.findAll('button').find((b) => b.text() === text)!
const chip = (w: ReturnType<typeof mount>, text: string) => w.findAll('.chip').find((c) => c.text() === text)!
const ouvrirAjoutFeuilles = (w: ReturnType<typeof mount>) => btn(w, 'Ajouter des feuilles').trigger('click')
const ouvrirAjoutChutes = (w: ReturnType<typeof mount>) => btn(w, 'Ajouter des chutes').trigger('click')
const LIST = { feuilles: [F1, F2], totaux: { references: 2, feuillesEntieres: 10, chutes: 2, m2Entieres: 37.5, m2Chutes: 2.7, bas: 1 } }

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
  it('affiche une carte par feuille, répartie entre feuilles entières et chutes, et résume le stock', async () => {
    const { wrapper } = await mountStock()
    // F1 (entière) dans « Feuilles entières », F2 (chute) dans « Chutes »
    const entieres = wrapper.get('#entieres-titre').element.parentElement!
    const card1 = entieres.querySelector('.sheet-card')!
    expect(norm(card1.textContent!)).toContain('Aluminium')
    expect(card1.textContent).toContain('Gris anthracite')
    expect(norm(card1.textContent!)).toContain('1 250 × 3 000 mm')
    expect(card1.querySelector('.qty b')!.textContent).toBe('10')
    expect(card1.textContent).toContain('Correct')

    const chutesSection = wrapper.get('#chutes-titre').element.parentElement!
    const card2 = chutesSection.querySelector('.sheet-card')!
    expect(card2.textContent).toContain('Brut')
    expect(norm(card2.querySelector('.qty')!.textContent!)).toContain('2 morceaux')
    expect(card2.textContent).toContain('Critique')

    const t = norm(wrapper.get('.totaux').text())
    expect(t).toContain('Références2')
    // Les chutes ne sont pas des feuilles entières : des totaux séparés, jamais mélangés
    expect(t).toContain('Feuilles entières10')
    expect(t).toContain('37,5 m²')
    expect(t).toContain('Chutes2')
    expect(t).toContain('2,7 m²')
    expect(t).toContain('Stock bas1')
    expect(wrapper.get('#f-matiere').text()).toContain('Aluminium')
  })

  it('filtre en détail (matière, épaisseur, coloris, format, état)', async () => {
    const { wrapper } = await mountStock()
    expect(wrapper.find('.reset').exists()).toBe(false)
    await wrapper.get('#f-etat').setValue('critique')
    expect(wrapper.findAll('.sheet-card')).toHaveLength(1)
    expect(wrapper.get('.sheet-card').text()).toContain('Brut')
    expect(wrapper.find('.reset').exists()).toBe(true)
    await wrapper.get('.reset').trigger('click')
    expect(wrapper.findAll('.sheet-card')).toHaveLength(2)
  })

  it('garde le formulaire d’ajout et l’historique fermés, et les ouvre à la demande', async () => {
    const { wrapper } = await mountStock()
    expect(wrapper.find('#ajout').exists()).toBe(false)
    expect(wrapper.find('#hist-liste').exists()).toBe(false)
    expect(btn(wrapper, 'Ajouter des feuilles').attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('button[aria-controls="hist-liste"]').text()).toContain('Derniers mouvements (1)')
    await ouvrirAjoutFeuilles(wrapper)
    expect(wrapper.find('#ajout').exists()).toBe(true)
    expect(wrapper.get('#ajout-titre').text()).toBe('Ajouter des feuilles')
    expect(btn(wrapper, 'Fermer le formulaire').attributes('aria-expanded')).toBe('true')
    // L'autre bouton bascule sur l'autre type sans fermer
    await btn(wrapper, 'Ajouter des chutes').trigger('click')
    expect(wrapper.get('#ajout-titre').text()).toBe('Ajouter des chutes')
    await btn(wrapper, 'Fermer le formulaire').trigger('click')
    expect(wrapper.find('#ajout').exists()).toBe(false)
    await wrapper.get('button[aria-controls="hist-liste"]').trigger('click')
    expect(wrapper.find('#hist-liste').exists()).toBe(true)
  })

  it('ajoute une feuille, referme le formulaire, et montre l’erreur du champ concerné', async () => {
    const { wrapper, calls } = await mountStock({ 'POST /stock/feuilles': [201, { feuille: F1 }] })
    await ouvrirAjoutFeuilles(wrapper)
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
    await ouvrirAjoutFeuilles(bad.wrapper)
    await bad.wrapper.get('#s-matiere').setValue('m1')
    await bad.wrapper.get('form.grid').trigger('submit')
    await flushPromises()
    expect(bad.wrapper.get('#s-largeur-e').text()).toBe('Largeur : 50 mm minimum.')
    expect(bad.wrapper.get('#s-largeur').attributes('aria-invalid')).toBe('true')
  })

  it('enregistre le code-barres du fournisseur avec la nouvelle référence', async () => {
    const { wrapper, calls } = await mountStock({ 'POST /stock/feuilles': [201, { feuille: F1 }] })
    await ouvrirAjoutFeuilles(wrapper)
    await wrapper.get('#s-matiere').setValue('m1')
    await wrapper.get('#s-code').setValue('3760123456789')
    await wrapper.get('form.grid').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({ materialId: 'm1', code: '3760123456789' })
    const sans = await mountStock({ 'POST /stock/feuilles': [201, { feuille: F1 }] })
    await ouvrirAjoutFeuilles(sans.wrapper)
    await sans.wrapper.get('#s-matiere').setValue('m1')
    await sans.wrapper.get('form.grid').trigger('submit')
    await flushPromises()
    expect(sans.calls.find((c) => c.method === 'POST')!.body).not.toHaveProperty('code')
  })

  it('ouvre les codes-barres d’une référence, en associe un et recharge la liste', async () => {
    const { wrapper, calls } = await mountStock({ 'POST /stock/codes': [201, { ok: true }] })
    const bouton = () => wrapper.get(`button[aria-label="Codes-barres : ${F1.libelle}"]`)
    expect(wrapper.find(`#code-${F1.id}`).exists()).toBe(false)
    await bouton().trigger('click')
    expect(bouton().attributes('aria-expanded')).toBe('true')
    await wrapper.get(`#code-${F1.id}`).setValue('3760123456789')
    await wrapper.get(`#code-${F1.id}`).element.closest('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST' && c.path === '/stock/codes')!.body).toEqual({ code: '3760123456789', sheetId: F1.id })
    expect(calls.filter((c) => c.path === '/stock/feuilles' && c.method === 'GET')).toHaveLength(2)
    await bouton().trigger('click')
    expect(wrapper.find(`#code-${F1.id}`).exists()).toBe(false)
  })

  it('enregistre une sortie avec son motif, puis une entrée, puis un inventaire, via un seul bouton « Ajuster »', async () => {
    const { wrapper, calls } = await mountStock({ 'POST /stock/feuilles/f1/mouvement': [200, { quantite: 7, bas: false }] })
    const ajuster = () => wrapper.get(`button[aria-label="Ajuster le stock : ${F1.libelle}"]`).trigger('click')

    await ajuster()
    await chip(wrapper, 'Sortie').trigger('click')
    await wrapper.get('#m-f1').setValue('3')
    await wrapper.get('#mm-f1').setValue('fabrication')
    await wrapper.get('#mn-f1').setValue('C-2026-0004')
    await wrapper.get('form.move').trigger('submit')
    await flushPromises()
    expect(calls.filter((c) => c.path === '/stock/feuilles/f1/mouvement')[0]!.body).toEqual({ delta: -3, motif: 'fabrication', note: 'C-2026-0004' })
    expect(wrapper.get('[role="status"]').text()).toContain('7 feuilles')
    // Le panneau s'est refermé : un nouvel « Ajuster » repart par défaut sur une entrée
    expect(wrapper.find('form.move').exists()).toBe(false)

    await ajuster()
    await wrapper.get('#m-f1').setValue('20')
    await wrapper.get('form.move').trigger('submit')
    await flushPromises()
    expect(calls.filter((c) => c.path === '/stock/feuilles/f1/mouvement')[1]!.body).toEqual({ delta: 20, motif: 'reception', note: '' })

    await ajuster()
    await chip(wrapper, 'Compter').trigger('click')
    expect((wrapper.get('#m-f1').element as HTMLInputElement).value).toBe('10')
    await wrapper.get('#m-f1').setValue('8')
    await wrapper.get('form.move').trigger('submit')
    await flushPromises()
    expect(calls.filter((c) => c.path === '/stock/feuilles/f1/mouvement')[2]!.body).toEqual({ quantite: 8, motif: 'inventaire', note: '' })
  })

  it('refuse une quantité vide ou nulle sans appeler le serveur, et affiche le refus du serveur', async () => {
    const { wrapper, calls } = await mountStock({ 'POST /stock/feuilles/f1/mouvement': [409, { error: 'Il n’y a que 10 feuilles en stock : impossible d’en sortir 30.', field: 'delta' }] })
    await wrapper.get(`button[aria-label="Ajuster le stock : ${F1.libelle}"]`).trigger('click')
    await chip(wrapper, 'Sortie').trigger('click')
    await wrapper.get('form.move').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('supérieur à 0')
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
    await wrapper.get('#m-f1').setValue('30')
    await wrapper.get('form.move').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Il n’y a que 10 feuilles')
  })

  it('ajoute une note derrière un bouton, sans la mélanger avec le panneau d’ajustement', async () => {
    const { wrapper, calls } = await mountStock({ 'PATCH /stock/feuilles/f1': [200, { ok: true }] })
    expect(wrapper.get(`button[aria-label^="Modifier la note : "]`).text()).toBe('Modifier la note')
    await wrapper.get(`button[aria-label^="Modifier la note : "]`).trigger('click')
    await wrapper.get(`input#note-f1`).setValue('Rack B')
    await wrapper.get('form.move').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ note: 'Rack B' })
    // F2 n'a pas encore de note : le bouton invite à en ajouter une
    expect(wrapper.get(`button[aria-label^="Ajouter une note : "]`).text()).toBe('Ajouter une note')
  })

  it('n’affiche pas d’alerte de stock bas sur une chute', async () => {
    const { wrapper } = await mountStock()
    const chutesSection = wrapper.get('#chutes-titre').element.parentElement!
    expect(chutesSection.querySelector('.seuil')).toBeNull()
    await ouvrirAjoutChutes(wrapper)
    expect(wrapper.find('#s-seuil').exists()).toBe(false)
  })

  it('ne propose jamais de supprimer une référence, modifie le seuil et la note, et montre l’historique', async () => {
    const vide = { ...F2, id: 'f3', quantite: 0, bas: false, etat: 'vide' as const, libelle: 'Aluminium 1 mm · brut · 450 × 3 000 mm' }
    const { wrapper, calls } = await mountStock({
      'GET /stock/feuilles': [200, { ...LIST, feuilles: [F1, vide] }],
      'PATCH /stock/feuilles/f1': [200, { ok: true }],
    })
    // Même vide, une référence ne se supprime pas depuis le stock (la direction l'archive dans Matériaux)
    expect(wrapper.find('button[aria-label^="Supprimer"]').exists()).toBe(false)
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
    const empty = await mountStock({ 'GET /stock/feuilles': [200, { feuilles: [], totaux: { references: 0, feuillesEntieres: 0, chutes: 0, m2Entieres: 0, m2Chutes: 0, bas: 0 } }] })
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
    expect(e('stock.moved', { libelle: 'X', delta: 12, apres: 22, motif: 'reception', code: '3760123456789' })).toBe('Entrée de 12 feuilles : X (reste 22) · code 3760123456789')
    expect(e('stock.code_linked', { libelle: 'X', code: '3760123456789' })).toBe('A associé le code-barres 3760123456789 à la feuille X')
    expect(e('stock.code_unlinked', { libelle: 'X', code: '3760123456789' })).toBe('A retiré le code-barres 3760123456789 de la feuille X')
    expect(e('stock.sheet_deleted', { libelle: 'X' })).toBe('A supprimé du stock la référence X')
    expect(e('stock.sheet_archived', { libelle: 'X' })).toBe('A archivé la référence X')
    expect(e('stock.sheet_unarchived', { libelle: 'X' })).toBe('A désarchivé la référence X')
  })
})
