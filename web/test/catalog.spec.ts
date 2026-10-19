import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CatalogView from '@/views/CatalogView.vue'
import { eur, mm, pct, toField, type Color, type Material, type PricingSettings } from '@/lib/catalog'
import { describe as describeEntry, type AuditEntry } from '@/lib/audit-labels'
import { useAuthStore } from '@/stores/auth'
import { ADMIN, freshPinia, makeRouter, mockApi } from './helpers'

// Les montants utilisent l'espace insécable fine française avant « € » : on la ramène à une espace simple
const n = (t: string) => t.replace(/[\u202f\u00a0]/g, ' ')

const MATS: Material[] = [
  { id: 'm1', nom: 'Aluminium', epaisseur: 1.5, prixM2: 62, retourMin: 10, actif: true, position: 1 },
  { id: 'm2', nom: 'Aluminium', epaisseur: 2, prixM2: 78, retourMin: 15, actif: true, position: 2 },
  { id: 'm3', nom: 'Inox', epaisseur: 1, prixM2: 120, retourMin: 10, actif: false, position: 3 },
]
const COLS: Color[] = [
  { id: 'c1', nom: 'Gris anthracite', reference: 'RAL 7016', hex: '#383e42', majoration: 0, delaiSup: 0, actif: true, position: 1 },
  { id: 'c2', nom: 'Chêne doré', reference: 'Aspect bois', hex: '#a9733f', majoration: 35, delaiSup: 5, actif: true, position: 2 },
  { id: 'c3', nom: 'Brut', reference: 'Non laqué', hex: '#cdd1d4', majoration: -15, delaiSup: 0, actif: true, position: 3 },
]

const SETTINGS: PricingSettings = {
  prixPliMl: 0.9,
  miseEnRoute: 18,
  minimumCommande: 45,
  remisePro: 10,
  tva: 20,
  delaiStandard: 5,
  remisesQuantite: [
    { seuil: 20, remise: 5 },
    { seuil: 50, remise: 10 },
  ],
  largeurTole: 1250,
  longueurMin: 200,
  longueurMax: 3000,
  plisMax: 8,
}

async function setup(path = '/catalogue', extra: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({
    'GET /catalog/materials': [200, { materials: MATS }],
    'GET /catalog/colors': [200, { colors: COLS }],
    'GET /catalog/settings': [200, { settings: SETTINGS }],
    ...extra,
  })
  const pinia = freshPinia()
  useAuthStore().user = ADMIN
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(CatalogView, { global: { plugins: [pinia, router] }, attachTo: document.body })
  await flushPromises()
  const panel = (id: string) => wrapper.get(`#panel-${id}`)
  return { wrapper, router, calls, panel }
}

describe('Formats du catalogue', () => {
  it('affiche les prix, épaisseurs et majorations à la française', () => {
    expect(n(eur(62))).toBe('62,00 €')
    expect(mm(1.5)).toBe('1,50 mm')
    expect(pct(12)).toBe('+12 %')
    expect(pct(-15)).toBe('−15 %')
    expect(pct(0)).toBe('—')
    expect(toField(62.5)).toBe('62,5')
  })

  it('décrit les changements de prix dans le journal', () => {
    const e = { action: 'catalog.material_updated', details: { nom: 'Aluminium 1,50 mm', changements: { prixM2: { avant: 62, apres: 64.9 } } } } as unknown as AuditEntry
    expect(n(describeEntry(e).text)).toBe('A modifié la matière Aluminium 1,50 mm : prix au m² 62,00 € → 64,90 €')
  })
})

describe('Page Tarifs et catalogue', () => {
  it('liste les matières actives, avec leur prix', async () => {
    const { panel, wrapper } = await setup()
    const rows = panel('matieres').findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('Aluminium')
    expect(rows[0]!.text()).toContain('1,50 mm')
    expect(n(rows[0]!.text())).toContain('62,00 €')
    expect(wrapper.get('#tab-matieres').text()).toContain('2')
  })

  it('montre les matières désactivées sur demande', async () => {
    const { panel } = await setup()
    await panel('matieres').get('#materials-inactive').setValue(true)
    expect(panel('matieres').findAll('tbody tr')).toHaveLength(3)
    expect(panel('matieres').text()).toContain('Inox')
  })

  it('ajoute une matière en saisissant les nombres à la française', async () => {
    const { panel, calls } = await setup('/catalogue', {
      'POST /catalog/materials': [201, { material: { ...MATS[0], id: 'm9', epaisseur: 3, prixM2: 95.5 } }],
    })
    const p = panel('matieres')
    await p.findAll('button').find((b) => b.text().includes('Ajouter une matière'))!.trigger('click')
    await p.get('#m-epaisseur').setValue('3')
    await p.get('#m-prix').setValue('95,50')
    await p.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ nom: 'Aluminium', epaisseur: '3', prixM2: '95,50', retourMin: '10' })
    expect(p.text()).toContain('3,00 mm ajouté')
  })

  it('pré-remplit la modification et affiche l’erreur sous le bon champ', async () => {
    const { panel } = await setup('/catalogue', {
      'PATCH /catalog/materials/m1': [400, { error: 'Prix au m² : 0 € minimum.', field: 'prixM2' }],
    })
    const p = panel('matieres')
    await p.get('button[aria-label="Modifier Aluminium 1,50 mm"]').trigger('click')
    expect((p.get('#m-prix').element as HTMLInputElement).value).toBe('62')
    await p.get('#m-prix').setValue('-3')
    await p.get('form').trigger('submit')
    await flushPromises()
    expect(p.get('#m-prix').attributes('aria-invalid')).toBe('true')
    expect(p.text()).toContain('Prix au m² : 0 € minimum.')
  })

  it('désactive une matière en un clic', async () => {
    const { panel, calls } = await setup('/catalogue', { 'PATCH /catalog/materials/m1': [200, { material: { ...MATS[0], actif: false } }] })
    await panel('matieres').findAll('tbody tr')[0]!.findAll('button').find((b) => b.text() === 'Désactiver')!.trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ actif: false })
    expect(panel('matieres').text()).toContain('ne sera plus proposé')
  })

  it('l’onglet Coloris montre la teinte, la majoration et le délai', async () => {
    const { wrapper, panel, router } = await setup()
    await wrapper.get('#tab-coloris').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.onglet).toBe('coloris')
    const rows = panel('coloris').findAll('tbody tr')
    expect(rows[1]!.text()).toContain('Aspect bois')
    expect(rows[1]!.text()).toContain('+35 %')
    expect(rows[1]!.text()).toContain('+5 j')
    expect(rows[2]!.text()).toContain('−15 %')
  })

  it('ouvre directement l’onglet demandé dans l’adresse', async () => {
    const { wrapper } = await setup('/catalogue?onglet=coloris')
    expect(wrapper.get('#tab-coloris').attributes('aria-selected')).toBe('true')
  })

  it('les flèches du clavier passent d’un onglet à l’autre', async () => {
    const { wrapper } = await setup()
    await wrapper.get('[role="tablist"]').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.get('#tab-coloris').attributes('aria-selected')).toBe('true')
    expect(document.activeElement?.id).toBe('tab-coloris')
  })

  it('ajoute un coloris avec sa teinte', async () => {
    const { wrapper, panel, calls } = await setup('/catalogue', {
      'POST /catalog/colors': [201, { color: { ...COLS[0], id: 'c9', reference: 'RAL 3004', nom: 'Rouge pourpre' } }],
    })
    await wrapper.get('#tab-coloris').trigger('click')
    const p = panel('coloris')
    await p.findAll('button').find((b) => b.text().includes('Ajouter un coloris'))!.trigger('click')
    await p.get('#c-reference').setValue('RAL 3004')
    await p.get('#c-nom').setValue('Rouge pourpre')
    await p.get('#c-hex').setValue('#6d1a2a')
    await p.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({ reference: 'RAL 3004', nom: 'Rouge pourpre', hex: '#6d1a2a', majoration: '0' })
  })
})

describe('Façonnage et conditions', () => {
  const open = async (extra: Parameters<typeof mockApi>[0] = {}) => {
    const r = await setup('/catalogue?onglet=faconnage', extra)
    return { ...r, p: r.panel('faconnage') }
  }
  const save = (p: ReturnType<Awaited<ReturnType<typeof setup>>['panel']>) => p.findAll('button').find((b) => b.text() === 'Enregistrer')!

  it('affiche les réglages à la française et un exemple de calcul', async () => {
    const { p } = await open()
    expect((p.get('#s-pli').element as HTMLInputElement).value).toBe('0,90')
    expect((p.get('#s-tva').element as HTMLInputElement).value).toBe('20')
    expect(n(p.text())).toContain('Une couvertine de 3 m à 4 plis : 10,80 € de façonnage')
    expect(p.findAll('.tiers li')).toHaveLength(2)
  })

  it('n’active l’enregistrement qu’après une modification, et sait annuler', async () => {
    const { p } = await open()
    expect(save(p).attributes('disabled')).toBeDefined()
    await p.get('#s-pli').setValue('1,10')
    expect(save(p).attributes('disabled')).toBeUndefined()
    expect(p.text()).toContain('Modifications non enregistrées')
    await p.findAll('button').find((b) => b.text() === 'Annuler les modifications')!.trigger('click')
    expect((p.get('#s-pli').element as HTMLInputElement).value).toBe('0,90')
    expect(save(p).attributes('disabled')).toBeDefined()
  })

  it('ajoute et supprime des paliers de remise, puis envoie tout', async () => {
    const { p, calls } = await open({ 'PATCH /catalog/settings': [200, { settings: { ...SETTINGS, remisesQuantite: [{ seuil: 20, remise: 5 }] } }] })
    await p.findAll('button').find((b) => b.text().includes('Ajouter un palier'))!.trigger('click')
    expect(p.findAll('.tiers li')).toHaveLength(3)
    expect((p.get('#s-seuil-2').element as HTMLInputElement).value).toBe('100')
    await p.get('button[aria-label="Supprimer le palier 2"]').trigger('click')
    await p.get('button[aria-label="Supprimer le palier 2"]').trigger('click')
    await p.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'PATCH')!.body.remisesQuantite).toEqual([{ seuil: '20', remise: '5' }])
    expect(p.text()).toContain('Réglages enregistrés')
    expect(save(p).attributes('disabled')).toBeDefined()
  })

  it('n’autorise pas plus de 6 paliers', async () => {
    const { p } = await open()
    const add = () => p.findAll('button').find((b) => b.text().includes('Ajouter un palier'))!
    for (let i = 0; i < 4; i++) await add().trigger('click')
    expect(p.findAll('.tiers li')).toHaveLength(6)
    expect(add().attributes('disabled')).toBeDefined()
  })

  it('affiche l’erreur du serveur sous le bon champ', async () => {
    const { p } = await open({ 'PATCH /catalog/settings': [400, { error: 'TVA : 50 % maximum.', field: 'tva' }] })
    await p.get('#s-tva').setValue('80')
    await p.get('form').trigger('submit')
    await flushPromises()
    expect(p.get('#s-tva').attributes('aria-invalid')).toBe('true')
    expect(p.text()).toContain('TVA : 50 % maximum.')
  })

  it('décrit le changement des remises dans le journal', () => {
    const e = {
      action: 'catalog.settings_updated',
      details: { changements: { remisesQuantite: { avant: [{ seuil: 20, remise: 5 }], apres: [] }, tva: { avant: 20, apres: 5.5 } } },
    } as unknown as AuditEntry
    expect(describeEntry(e).text).toBe('A modifié le façonnage et les conditions : remises quantité −5 % dès 20 → aucune, TVA 20 % → 5,5 %')
  })
})
