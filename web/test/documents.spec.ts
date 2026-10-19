import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import DocumentsView from '@/views/DocumentsView.vue'
import { formatNumber, type DocumentSettings } from '@/lib/documents'
import { describe as describeEntry, type AuditEntry } from '@/lib/audit-labels'
import { useAuthStore } from '@/stores/auth'
import { ADMIN, freshPinia, makeRouter, mockApi } from './helpers'

// pdf.js ne sait pas dessiner dans jsdom : on simule le rendu et on note les appels
const render = vi.hoisted(() => vi.fn(async (_data: ArrayBuffer, el: HTMLElement) => {
  el.innerHTML = '<canvas role="img" aria-label="Aperçu, page 1 sur 1"></canvas>'
  return 1
}))
vi.mock('@/lib/pdf-render', () => ({ renderPdf: render }))
afterEach(() => render.mockClear())

const SETTINGS: DocumentSettings = {
  company: {
    raisonSociale: 'Alu Pliage Service',
    formeJuridique: '',
    capital: '',
    adresse: '42490 Fraisses',
    telephone: '',
    email: '',
    siteWeb: '',
    siret: '',
    rcs: '',
    tvaIntra: '',
    iban: '',
    bic: '',
    logo: false,
    logoUpdatedAt: null,
  },
  template: {
    couleur: '#5b34c4',
    entete: '',
    conditionsPaiement: '',
    validiteDevis: 30,
    echeanceFacture: 30,
    noteDevis: '',
    noteFacture: '',
    mentionsLegales: '',
    piedDePage: '',
  },
  numbering: { annee: 2026, devis: { numero: 1, label: 'D-2026-0001', verrouille: false }, facture: { numero: 1, label: 'F-2026-0001', verrouille: false } },
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function setup(path = '/modeles-documents', extra: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({
    'GET /documents/settings': [200, SETTINGS],
    'POST /documents/preview': [200, { pdf: true }],
    ...extra,
  })
  const pinia = freshPinia()
  useAuthStore().user = ADMIN
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(DocumentsView, { global: { plugins: [pinia, router] }, attachTo: document.body })
  await flushPromises()
  await wait(5)
  await flushPromises()
  const btn = (text: string) => wrapper.findAll('button').find((b) => b.text().includes(text))!
  const val = (sel: string) => (wrapper.get(sel).element as HTMLInputElement).value
  return { wrapper, router, calls, btn, val }
}

describe('Modèles de documents', () => {
  it('formate les numéros comme l’API', () => {
    expect(formatNumber('devis', 2026, 7)).toBe('D-2026-0007')
  })

  it('affiche l’identité, le logo de l’appli et un premier aperçu du devis', async () => {
    const { wrapper, calls, val } = await setup()
    expect(val('#c-raison')).toBe('Alu Pliage Service')
    expect(val('#c-adresse')).toBe('42490 Fraisses')
    expect(wrapper.text()).toContain('Logo de l’appli, utilisé par défaut.')
    const preview = calls.find((c) => c.path === '/documents/preview')!
    expect(preview.body.type).toBe('devis')
    expect(render).toHaveBeenCalledTimes(1)
    expect(wrapper.find('canvas').exists()).toBe(true)
    expect(wrapper.text()).toContain('1 page')
  })

  it('met l’aperçu à jour après une pause dans la saisie, avec les valeurs non enregistrées', async () => {
    const { wrapper, calls } = await setup()
    await wrapper.get('#c-raison').setValue('Alu Pliage Service SARL')
    await wrapper.get('#c-raison').setValue('Alu Pliage Service SAS')
    await wait(600)
    await flushPromises()
    const previews = calls.filter((c) => c.path === '/documents/preview')
    // Une seule requête pour les deux frappes
    expect(previews).toHaveLength(2)
    expect(previews[1]!.body.company.raisonSociale).toBe('Alu Pliage Service SAS')
  })

  it('passe à l’aperçu de la facture', async () => {
    const { wrapper, calls } = await setup()
    await wrapper.findAll('.switch button')[1]!.trigger('click')
    await wait(5)
    await flushPromises()
    expect(calls.filter((c) => c.path === '/documents/preview').at(-1)!.body.type).toBe('facture')
  })

  it('garde l’ancien aperçu et dit pourquoi quand un réglage est invalide', async () => {
    const { wrapper } = await setup('/modeles-documents', {
      'POST /documents/preview': (body) => (body.template.couleur === 'rouge' ? [400, { error: 'Couleur invalide : format #rrggbb attendu.', field: 'couleur' }] : [200, {}]),
    })
    await wrapper.get('#tab-modele').trigger('click')
    await wrapper.get('#t-couleur').setValue('rouge')
    await wait(600)
    await flushPromises()
    expect(wrapper.text()).toContain('Aperçu non mis à jour : Couleur invalide')
    expect(wrapper.find('canvas').exists()).toBe(true)
  })

  it('enregistre seulement les parties modifiées', async () => {
    const { wrapper, calls, btn } = await setup('/modeles-documents', {
      'PATCH /documents/company': [200, { company: { ...SETTINGS.company, siret: '732 829 320 00074' } }],
    })
    expect(btn('Enregistrer').attributes('disabled')).toBeDefined()
    await wrapper.get('#c-siret').setValue('73282932000074')
    expect(wrapper.text()).toContain('Modifications non enregistrées')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls.filter((c) => c.method === 'PATCH').map((c) => c.path)).toEqual(['/documents/company'])
    expect(calls.find((c) => c.method === 'PATCH')!.body.siret).toBe('73282932000074')
    // Valeur mise en forme par l'API
    expect((wrapper.get('#c-siret').element as HTMLInputElement).value).toBe('732 829 320 00074')
    expect(wrapper.text()).toContain('Modèles enregistrés')
  })

  it('emmène sur l’onglet du champ en erreur', async () => {
    const { wrapper, router } = await setup('/modeles-documents?onglet=modele', {
      'PATCH /documents/company': [400, { error: 'SIRET : 14 chiffres attendus.', field: 'siret' }],
    })
    await wrapper.get('#c-siret').setValue('123')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#tab-entreprise').attributes('aria-selected')).toBe('true')
    expect(router.currentRoute.value.query.onglet).toBeUndefined()
    expect(wrapper.get('#c-siret').attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('SIRET : 14 chiffres attendus.')
  })

  it('montre le prochain numéro en cours de saisie, et n’envoie que le numéro changé', async () => {
    const { wrapper, calls } = await setup('/modeles-documents?onglet=numerotation', {
      'PATCH /documents/numbering': [200, { numbering: { ...SETTINGS.numbering, facture: { numero: 128, label: 'F-2026-0128', verrouille: false } } }],
    })
    expect(wrapper.find('#n-prefixe-devis').exists()).toBe(false)
    expect(wrapper.text()).toContain('Prochain devis : D-2026-0001')
    await wrapper.get('#n-facture').setValue('128')
    expect(wrapper.text()).toContain('Prochaine facture : F-2026-0128')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls.filter((c) => c.method === 'PATCH').map((c) => [c.path, c.body])).toEqual([['/documents/numbering', { facture: '128' }]])
  })

  it('grise le prochain numéro une fois le premier document créé', async () => {
    const { wrapper } = await setup('/modeles-documents?onglet=numerotation', {
      'GET /documents/settings': [200, { ...SETTINGS, numbering: { ...SETTINGS.numbering, devis: { numero: 8, label: 'D-2026-0008', verrouille: true } } }],
    })
    expect(wrapper.get('#n-devis').attributes('disabled')).toBeDefined()
    expect(wrapper.get('#n-devis').attributes('aria-describedby')).toBe('n-devis-lock')
    expect(wrapper.get('#n-devis-lock').text()).toBe('Verrouillé : un devis a déjà été créé.')
    expect(wrapper.get('#n-facture').attributes('disabled')).toBeUndefined()
  })

  it('envoie un logo PNG tout de suite, et refuse un autre format sans appeler l’API', async () => {
    const { wrapper, calls } = await setup('/modeles-documents', {
      'PUT /documents/logo': [200, { company: { ...SETTINGS.company, logo: true } }],
    })
    const input = wrapper.get('input[type="file"]')
    const choose = async (file: File) => {
      Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
      await input.trigger('change')
      await flushPromises()
    }
    await choose(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }))
    expect(wrapper.text()).toContain('Format non pris en charge')
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
    await choose(new File([new Uint8Array(2 * 1024 * 1024)], 'gros.png', { type: 'image/png' }))
    expect(wrapper.text()).toContain('1 Mo maximum')
    await choose(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', { type: 'image/png' }))
    expect(calls.some((c) => c.method === 'PUT' && c.path === '/documents/logo')).toBe(true)
    expect(wrapper.get('img[alt="Logo envoyé"]').attributes('src')).toBe('/api/documents/logo?v=1')
    expect(wrapper.text()).toContain('Revenir au logo de l’appli')
  })

  it('décrit les changements des modèles dans le journal', () => {
    const e = (action: string, details: object) => describeEntry({ action, details } as unknown as AuditEntry).text
    expect(e('documents.company_updated', { changements: { siret: { avant: '', apres: '732 829 320 00074' } } })).toBe('A modifié l’identité de l’entreprise : SIRET vide → « 732 829 320 00074 »')
    expect(e('documents.numbering_updated', { type: 'facture', annee: 2026, avant: 1, apres: 128 })).toBe('A fixé le prochain numéro de facture 2026 : 1 → 128')
    expect(e('documents.logo_updated', { type: 'image/png', largeur: 200, hauteur: 80 })).toBe('A envoyé un nouveau logo (PNG, 200 × 80 px)')
    expect(e('documents.template_updated', { changements: { mentionsLegales: { avant: '', apres: 'x'.repeat(80) } } })).toBe(`A modifié le modèle des devis et factures : mentions légales vide → « ${'x'.repeat(57)}… »`)
  })
})
