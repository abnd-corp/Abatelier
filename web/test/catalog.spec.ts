import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CatalogView from '@/views/CatalogView.vue'
import {
  eur,
  km,
  mm,
  pct,
  qtyRule,
  suggestedQty,
  toField,
  type Accessory,
  type Color,
  type DeliveryEstimate,
  type DeliverySettings,
  type Material,
  type PieceModel,
  type PricingSettings,
} from '@/lib/catalog'
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

const ACCS: Accessory[] = [
  { id: 'a1', nom: 'Bouchon de couvertine', prix: 6.9, unite: 'piece', modeles: ['couvertine'], quantiteAuto: 'fixe', quantiteFixe: 2, actif: true, position: 1 },
  { id: 'a2', nom: 'Éclisse de jonction', prix: 7.8, unite: 'piece', modeles: ['couvertine'], quantiteAuto: 'jonctions', quantiteFixe: 0, actif: true, position: 2 },
  { id: 'a3', nom: 'Embouts de bavette', prix: 9.6, unite: 'paire', modeles: ['bavette'], quantiteAuto: 'par_piece', quantiteFixe: 0, actif: true, position: 3 },
  { id: 'a4', nom: 'Vis inox', prix: 0.4, unite: 'piece', modeles: ['couvertine', 'bandeau'], quantiteAuto: 'aucune', quantiteFixe: 0, actif: false, position: 4 },
]

const DELIVERY: DeliverySettings = {
  retraitActif: true,
  retraitInfo: 'Du lundi au jeudi, 7h30-16h.',
  atelierAdresse: '42490 Fraisses',
  atelierLabel: 'Fraisses 42490',
  zones: [
    { distanceMax: 30, prix: 39, franco: 500 },
    { distanceMax: 80, prix: 69, franco: null },
  ],
  longueurSeuil: null,
  longueurPrix: 0,
}

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
  angleMin: 30,
  angleMax: 175,
  pinceAutorisee: false,
}

// Les identifiants des modèles reprennent leur nom, pour la lisibilité des tests
const PIECES: PieceModel[] = [
  {
    id: 'couvertine',
    nom: 'Couvertine',
    cotes: [20, 70, 300, 70, 20],
    angles: [-135, 90, 90, -135],
    noms: ['Larmier', 'Retombée', 'Dessus', 'Retombée', 'Larmier'],
    cap: -45,
    longueur: 3000,
    quantite: 4,
    actif: true,
    position: 1,
  },
  {
    id: 'bavette',
    nom: 'Bavette d’appui',
    cotes: [30, 220, 45, 15],
    angles: [-95, 95, 135],
    noms: ['Rejingot', 'Dessus', 'Nez', 'Retour'],
    cap: 90,
    longueur: 1400,
    quantite: 2,
    actif: true,
    position: 2,
  },
  { id: 'bandeau', nom: 'Bandeau', cotes: [40, 150], angles: [-90], noms: ['Retour', 'Face'], cap: 180, longueur: 3000, quantite: 6, actif: true, position: 3 },
  { id: 'solin', nom: 'Solin', cotes: [80, 60], angles: [90], noms: ['', ''], cap: 0, longueur: 2000, quantite: 1, actif: false, position: 4 },
]

async function setup(path = '/catalogue', extra: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({
    'GET /catalog/materials': [200, { materials: MATS }],
    'GET /catalog/colors': [200, { colors: COLS }],
    'GET /catalog/settings': [200, { settings: SETTINGS }],
    'GET /catalog/accessories': [200, { accessories: ACCS }],
    'GET /catalog/models': [200, { models: PIECES }],
    'GET /catalog/delivery': [200, { delivery: DELIVERY }],
    'GET /catalog/closures': [200, { closures: [], today: '2026-10-30' }],
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
    await p
      .findAll('button')
      .find((b) => b.text().includes('Ajouter une matière'))!
      .trigger('click')
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
    await panel('matieres')
      .findAll('tbody tr')[0]!
      .findAll('button')
      .find((b) => b.text() === 'Désactiver')!
      .trigger('click')
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
    await p
      .findAll('button')
      .find((b) => b.text().includes('Ajouter un coloris'))!
      .trigger('click')
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
    await p
      .findAll('button')
      .find((b) => b.text() === 'Annuler les modifications')!
      .trigger('click')
    expect((p.get('#s-pli').element as HTMLInputElement).value).toBe('0,90')
    expect(save(p).attributes('disabled')).toBeDefined()
  })

  it('ajoute et supprime des paliers de remise, puis envoie tout', async () => {
    const { p, calls } = await open({ 'PATCH /catalog/settings': [200, { settings: { ...SETTINGS, remisesQuantite: [{ seuil: 20, remise: 5 }] } }] })
    await p
      .findAll('button')
      .find((b) => b.text().includes('Ajouter un palier'))!
      .trigger('click')
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

  it('règle les angles possibles et la pince', async () => {
    const { p, calls } = await open({ 'PATCH /catalog/settings': [200, { settings: { ...SETTINGS, angleMin: 45, pinceAutorisee: true } }] })
    expect((p.get('#s-amin').element as HTMLInputElement).value).toBe('30')
    expect((p.get('#s-amax').element as HTMLInputElement).value).toBe('175')
    await p.get('#s-amin').setValue('45')
    await p.get('input[type="checkbox"]').setValue(true)
    await p.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ angleMin: '45', angleMax: '175', pinceAutorisee: true })
    expect(save(p).attributes('disabled')).toBeDefined()
    const e = { action: 'catalog.settings_updated', details: { changements: { angleMin: { avant: 30, apres: 45 }, pinceAutorisee: { avant: false, apres: true } } } } as unknown as AuditEntry
    expect(describeEntry(e).text).toBe('A modifié le façonnage et les conditions : angle minimum 30° → 45°, pinces non faites → faites')
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

describe('Modèles de pièces', () => {
  const open = async (extra: Parameters<typeof mockApi>[0] = {}) => {
    const r = await setup('/catalogue?onglet=modeles', extra)
    return { ...r, p: r.panel('modeles') }
  }
  const btn = (p: ReturnType<Awaited<ReturnType<typeof setup>>['panel']>, text: string) => p.findAll('button').find((b) => b.text().includes(text))!

  it('liste les modèles actifs avec leur forme, et les désactivés à la demande', async () => {
    const { p, wrapper } = await open()
    expect(wrapper.get('#tab-modeles').text()).toContain('3')
    const cards = p.findAll('li.model')
    expect(cards.map((c) => c.get('b').text())).toEqual(['Couvertine', 'Bavette d’appui', 'Bandeau'])
    expect(n(cards[0]!.text())).toContain('4 plis · développé 480 mm')
    expect(cards[0]!.text()).toContain('A 20B 70C 300D 70E 20')
    expect(cards[0]!.text()).toContain('135° ↓90° ↑')
    expect(cards[0]!.find('svg[aria-label="Forme du modèle Couvertine"]').exists()).toBe(true)
    await p.get('#models-inactive').setValue(true)
    expect(p.findAll('li.model')[3]!.text()).toContain('désactivé')
  })

  it('crée un modèle : nom des cotes, plis avec leur sens, pince, orientation', async () => {
    const { p, calls } = await open({ 'POST /catalog/models': [201, { model: { ...PIECES[0], id: 'faitiere', nom: 'Faîtière' } }] })
    await btn(p, 'Ajouter un modèle').trigger('click')
    await p.get('#m-nom').setValue('Faîtière')
    await btn(p, 'Ajouter un pli').trigger('click')
    await p.get('#m-nom0').setValue('Pan')
    await p.get('#m-cote0').setValue('150')
    await p.get('#m-cote2').setValue('15')
    // Pli 2 en pince, dans l'autre sens
    await p.get('button[aria-label="Inverser le sens du pli 2"]').trigger('click')
    await p.get('#m-angle1').setValue('0')
    expect(p.text()).toContain('° pince')
    await p.get('button[aria-label="Tourner le dessin de 15° à droite"]').trigger('click')
    await p.get('button[aria-label="Tourner le dessin de 15° à droite"]').trigger('click')
    expect(p.find('svg[aria-label="Forme du modèle Faîtière"]').exists()).toBe(true)
    await p.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ nom: 'Faîtière', cotes: [150, 120, 15], angles: [90, -1], noms: ['Pan', '', ''], cap: 30, longueur: 2000, quantite: 1 })
    expect(p.text()).toContain('Faîtière ajouté.')
  })

  it('montre l’erreur sur la cote fautive', async () => {
    const { p } = await open({ 'PATCH /catalog/models/couvertine': [400, { error: 'Cote : 1 mm minimum.', field: 'cotes.2' }] })
    await p.get('button[aria-label="Modifier Couvertine"]').trigger('click')
    expect((p.get('#m-nom2').element as HTMLInputElement).value).toBe('Dessus')
    await p.get('#m-cote2').setValue('0')
    await p.get('form').trigger('submit')
    await flushPromises()
    expect(p.get('#m-cote2').attributes('aria-invalid')).toBe('true')
    expect(p.get('#m-cote1').attributes('aria-invalid')).toBeUndefined()
    expect(p.get('[role="alert"]').text()).toBe('Cote : 1 mm minimum.')
  })

  it('désactive un modèle', async () => {
    const { p, calls } = await open({ 'PATCH /catalog/models/bandeau': [200, { model: { ...PIECES[2], actif: false } }] })
    await p.get('button[aria-label="Désactiver Bandeau"]').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ actif: false })
    expect(p.text()).toContain('Bandeau désactivé : il ne sera plus proposé dans les nouvelles commandes.')
  })

  it('décrit les modèles dans le journal', () => {
    const e = (action: string, details: object) => describeEntry({ action, details } as unknown as AuditEntry).text
    expect(e('catalog.model_created', { nom: 'Faîtière', forme: 'A 150 · 90° · B 120' })).toBe('A ajouté le modèle de pièce Faîtière (A 150 · 90° · B 120)')
    expect(e('catalog.model_updated', { nom: 'Bandeau', changements: { cotes: { avant: [40, 150], apres: [40, 150, 20] }, angles: { avant: [-90], apres: [-90, 1] } } })).toBe(
      'A modifié le modèle de pièce Bandeau : cotes A 40 B 150 → A 40 B 150 C 20, plis 90°↓ → 90°↓ pince',
    )
  })
})

describe('Accessoires', () => {
  const open = async (extra: Parameters<typeof mockApi>[0] = {}) => {
    const r = await setup('/catalogue?onglet=accessoires', extra)
    return { ...r, p: r.panel('accessoires') }
  }
  const add = (p: ReturnType<Awaited<ReturnType<typeof setup>>['panel']>) => p.findAll('button').find((b) => b.text().includes('Ajouter un accessoire'))!

  it('calcule la quantité proposée selon la règle', () => {
    expect(suggestedQty(ACCS[0]!, 4)).toBe(2)
    expect(suggestedQty(ACCS[1]!, 4)).toBe(3)
    expect(suggestedQty(ACCS[1]!, 1)).toBe(0)
    expect(suggestedQty(ACCS[2]!, 4)).toBe(4)
    expect(suggestedQty(ACCS[3]!, 4)).toBe(0)
    expect(suggestedQty(ACCS[0]!, 0)).toBe(0)
    expect(qtyRule(ACCS[0]!)).toBe('2 par ligne')
    expect(qtyRule(ACCS[3]!)).toBe('—')
  })

  it('liste les accessoires actifs avec prix, unité, modèles et règle', async () => {
    const { p, wrapper } = await open()
    expect(wrapper.get('#tab-accessoires').text()).toContain('3')
    const rows = p.findAll('tbody tr')
    expect(rows).toHaveLength(3)
    expect(n(rows[0]!.text())).toContain('6,90 €')
    expect(rows[0]!.text()).toContain('la pièce')
    expect(rows[0]!.text()).toContain('Couvertine')
    expect(rows[0]!.text()).toContain('2 par ligne')
    expect(rows[2]!.text()).toContain('la paire')
    expect(rows[2]!.text()).toContain('1 par pièce')
    await p.get('#accessories-inactive').setValue(true)
    expect(p.findAll('tbody tr')[3]!.text()).toContain('Couvertine, Bandeau')
  })

  it('ajoute un accessoire : modèles cochés, nombre fixe seulement si la règle le demande', async () => {
    const { p, calls } = await open({ 'POST /catalog/accessories': [201, { accessory: { ...ACCS[0], id: 'a9', nom: 'Angle de bandeau' } }] })
    await add(p).trigger('click')
    expect(p.find('#a-fixe').exists()).toBe(false)
    await p.get('#a-nom').setValue('Angle de bandeau')
    await p.get('#a-prix').setValue('14,50')
    const box = p.findAll('.chip input').find((i) => (i.element as HTMLInputElement).value === 'bandeau')!
    await box.setValue(true)
    await p.get('#a-quantite').setValue('fixe')
    await p.get('#a-fixe').setValue('2')
    expect(p.text()).toContain('Pour une ligne de 4 pièces, 2 proposés')
    await p.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      nom: 'Angle de bandeau',
      prix: '14,50',
      unite: 'piece',
      modeles: ['bandeau'],
      quantiteAuto: 'fixe',
      quantiteFixe: '2',
    })
    expect(p.text()).toContain('Angle de bandeau ajouté')
  })

  it('envoie une quantité fixe à zéro pour une autre règle', async () => {
    const { p, calls } = await open({ 'PATCH /catalog/accessories/a1': [200, { accessory: { ...ACCS[0], quantiteAuto: 'par_piece' } }] })
    await p.get('button[aria-label="Modifier Bouchon de couvertine"]').trigger('click')
    expect((p.get('#a-prix').element as HTMLInputElement).value).toBe('6,90')
    expect((p.get('#a-fixe').element as HTMLInputElement).value).toBe('2')
    await p.get('#a-quantite').setValue('par_piece')
    expect(p.text()).toContain('4 proposés')
    await p.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ quantiteAuto: 'par_piece', quantiteFixe: 0, modeles: ['couvertine'] })
  })

  it('affiche l’erreur des modèles sous les cases', async () => {
    const { p } = await open({ 'POST /catalog/accessories': [400, { error: 'Choisissez au moins un modèle.', field: 'modeles' }] })
    await add(p).trigger('click')
    await p.get('form').trigger('submit')
    await flushPromises()
    expect(p.get('fieldset').classes()).toContain('invalid')
    expect(p.get('#a-modeles-error').text()).toBe('Choisissez au moins un modèle.')
  })

  it('désactive un accessoire', async () => {
    const { p, calls } = await open({ 'PATCH /catalog/accessories/a2': [200, { accessory: { ...ACCS[1], actif: false } }] })
    await p
      .findAll('tbody tr')[1]!
      .findAll('button')
      .find((b) => b.text() === 'Désactiver')!
      .trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ actif: false })
    expect(p.text()).toContain('Éclisse de jonction désactivé')
  })

  it('décrit les changements d’accessoire dans le journal', () => {
    const e = {
      action: 'catalog.accessory_updated',
      details: { nom: 'Bouchon de couvertine', changements: { prix: { avant: 6.9, apres: 7.2 }, quantiteAuto: { avant: 'fixe', apres: 'par_piece' } } },
    } as unknown as AuditEntry
    expect(n(describeEntry(e).text)).toBe('A modifié l’accessoire Bouchon de couvertine : prix 6,90 € → 7,20 €, quantité proposée nombre fixe → une par pièce')
    const c = { action: 'catalog.accessory_created', details: { nom: 'Embouts de bavette', prix: 9.6, unite: 'paire' } } as unknown as AuditEntry
    expect(n(describeEntry(c).text)).toBe('A ajouté l’accessoire Embouts de bavette (9,60 € la paire)')
  })
})

describe('Livraison', () => {
  const open = async (extra: Parameters<typeof mockApi>[0] = {}) => {
    const r = await setup('/catalogue?onglet=livraison', extra)
    return { ...r, p: r.panel('livraison') }
  }
  type P = Awaited<ReturnType<typeof open>>['p']
  const btn = (p: P, text: string) => p.findAll('button').find((b) => b.text().includes(text))!
  const val = (p: P, sel: string) => (p.get(sel).element as HTMLInputElement).value

  it('affiche le retrait, l’adresse localisée et les zones à la française', async () => {
    const { p } = await open()
    expect((p.get('#d-retrait').element as HTMLInputElement).checked).toBe(true)
    expect(val(p, '#d-retrait-info')).toBe('Du lundi au jeudi, 7h30-16h.')
    expect(p.text()).toContain('Localisée : Fraisses 42490')
    expect(p.findAll('.zones li')).toHaveLength(2)
    expect(val(p, '#d-prix-0')).toBe('39,00')
    expect(val(p, '#d-franco-0')).toBe('500,00')
    expect(val(p, '#d-franco-1')).toBe('')
    expect(p.find('#d-seuil').exists()).toBe(false)
    expect(km(14.66)).toBe('14,7 km')
  })

  it('n’active l’enregistrement qu’après une modification, et sait annuler', async () => {
    const { p } = await open()
    expect(btn(p, 'Enregistrer').attributes('disabled')).toBeDefined()
    await p.get('#d-retrait').setValue(false)
    expect(p.find('#d-retrait-info').exists()).toBe(false)
    expect(p.text()).toContain('Modifications non enregistrées')
    await btn(p, 'Annuler les modifications').trigger('click')
    expect((p.get('#d-retrait').element as HTMLInputElement).checked).toBe(true)
    expect(btn(p, 'Enregistrer').attributes('disabled')).toBeDefined()
  })

  it('ajoute une zone, active le supplément pièces longues et envoie tout', async () => {
    const { p, calls } = await open({ 'PATCH /catalog/delivery': [200, { delivery: { ...DELIVERY, longueurSeuil: 2500, longueurPrix: 20 } }] })
    await btn(p, 'Ajouter une zone').trigger('click')
    expect(val(p, '#d-km-2')).toBe('130')
    expect(val(p, '#d-prix-2')).toBe('99,00')
    await p.get('button[aria-label="Supprimer la zone 3"]').trigger('click')
    await p.get('#d-longueur').setValue(true)
    expect(val(p, '#d-seuil')).toBe('2500')
    expect(val(p, '#d-supplement')).toBe('20,00')
    await p.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      retraitActif: true,
      retraitInfo: 'Du lundi au jeudi, 7h30-16h.',
      atelierAdresse: '42490 Fraisses',
      zones: [
        { distanceMax: '30', prix: '39,00', franco: '500,00' },
        { distanceMax: '80', prix: '69,00', franco: '' },
      ],
      longueurSeuil: '2500',
      longueurPrix: '20,00',
    })
    expect(p.text()).toContain('Réglages de livraison enregistrés')
  })

  it('désactiver le supplément envoie un seuil vide', async () => {
    const { p, calls } = await open({
      'GET /catalog/delivery': [200, { delivery: { ...DELIVERY, longueurSeuil: 2500, longueurPrix: 20 } }],
      'PATCH /catalog/delivery': [200, { delivery: DELIVERY }],
    })
    await p.get('#d-longueur').setValue(false)
    await p.get('form').trigger('submit')
    await flushPromises()
    const body = calls.find((c) => c.method === 'PATCH')!.body
    expect(body.longueurSeuil).toBe('')
    expect(body).not.toHaveProperty('longueurPrix')
  })

  it('affiche l’erreur des zones et celle de l’adresse sous leur champ', async () => {
    const { p } = await open({ 'PATCH /catalog/delivery': [400, { error: 'Adresse introuvable : précisez la rue, le code postal et la commune.', field: 'atelierAdresse' }] })
    await p.get('#d-adresse').setValue('Nulle part')
    await p.get('form').trigger('submit')
    await flushPromises()
    expect(p.get('#d-adresse').attributes('aria-invalid')).toBe('true')
    expect(p.text()).toContain('Adresse introuvable')
  })

  it('teste une adresse : distance, zone, livraison offerte et supplément', async () => {
    const result: DeliveryEstimate = {
      adresse: 'Saint-Étienne 42000',
      distanceKm: 14.7,
      methode: 'route',
      retrait: { actif: true, info: '' },
      zone: DELIVERY.zones[0]!,
      offerte: true,
      supplement: 20,
      total: 20,
    }
    const { p, calls } = await open({ 'POST /catalog/delivery/estimate': [200, result] })
    await p.get('#sim-adresse').setValue('42000 Saint-Étienne')
    await p.get('#sim-montant').setValue('650')
    await p.get('#sim-longueur').setValue('2800')
    await p.get('form[aria-label="Tester une adresse"]').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ adresse: '42000 Saint-Étienne', montant: '650', longueurMax: '2800' })
    const r = n(p.get('.result').text())
    expect(r).toContain('Saint-Étienne 42000')
    expect(r).toContain('14,7 km par la route')
    expect(r).toContain('Livraison offerte : la commande atteint 500,00 € HT.')
    expect(r).toContain('+20,00 €')
    expect(r).toContain('Livraison : 20,00 € HT')
  })

  it('annonce « hors zone » et le retrait possible', async () => {
    const out: DeliveryEstimate = { adresse: 'Paris 75001', distanceKm: 512, methode: 'estimation', retrait: { actif: true, info: '' }, zone: null, offerte: false, supplement: 0, total: null }
    const { p } = await open({ 'POST /catalog/delivery/estimate': [200, out] })
    await p.get('#sim-adresse').setValue('Paris')
    await p.get('form[aria-label="Tester une adresse"]').trigger('submit')
    await flushPromises()
    expect(p.get('.result').text()).toContain('Hors zone : pas de livraison au-delà de 80 km.')
    expect(p.get('.result').text()).toContain('estimation à vol d’oiseau')
    expect(p.get('.result').text()).toContain('Retrait à l’atelier possible')
  })

  it('affiche l’erreur du service d’adresses', async () => {
    const { p } = await open({ 'POST /catalog/delivery/estimate': [503, { error: 'Le service de localisation des adresses ne répond pas. Réessayez dans quelques minutes.' }] })
    await p.get('#sim-adresse').setValue('42000')
    await p.get('form[aria-label="Tester une adresse"]').trigger('submit')
    await flushPromises()
    expect(p.text()).toContain('ne répond pas')
  })

  it('décrit les changements de livraison dans le journal', () => {
    const e = {
      action: 'catalog.delivery_updated',
      details: {
        changements: {
          zones: { avant: [{ distanceMax: 30, prix: 39, franco: null }], apres: [{ distanceMax: 30, prix: 39, franco: 500 }] },
          longueurSeuil: { avant: null, apres: 2500 },
          retraitActif: { avant: true, apres: false },
        },
      },
    } as unknown as AuditEntry
    expect(n(describeEntry(e).text)).toBe(
      'A modifié la livraison : zones de livraison 30 km : 39,00 € → 30 km : 39,00 € (offerte dès 500,00 €), seuil des pièces longues aucun → 2500 mm, retrait à l’atelier proposé → désactivé',
    )
  })
})

describe('Fermetures de l’atelier', () => {
  const CL = [
    { id: 'f1', debut: '2026-12-24', fin: '2027-01-03', motif: 'Congés de fin d’année' },
    { id: 'f0', debut: '2026-05-01', fin: '2026-05-01', motif: 'Jour férié' },
  ]

  it('liste les fermetures à venir, les passées sur demande', async () => {
    const { panel, wrapper } = await setup('/catalogue?onglet=fermetures', { 'GET /catalog/closures': [200, { closures: CL, today: '2026-10-30' }] })
    const p = panel('fermetures')
    expect(p.findAll('tbody tr')).toHaveLength(1)
    expect(p.text()).toContain('Congés de fin d’année')
    expect(wrapper.get('#tab-fermetures').text()).toContain('1')
    await p.get('#closures-past').setValue(true)
    expect(p.findAll('tbody tr')).toHaveLength(2)
    expect(p.text()).toContain('passée')
  })

  it('ajoute une fermeture d’un seul jour : le dernier jour reprend le premier', async () => {
    const { panel, calls } = await setup('/catalogue?onglet=fermetures', { 'POST /catalog/closures': [201, { closure: CL[0] }] })
    const p = panel('fermetures')
    await p
      .findAll('button')
      .find((b) => b.text().includes('Ajouter une fermeture'))!
      .trigger('click')
    await p.get('#f-debut').setValue('2026-11-11')
    await p.get('#f-motif').setValue('Jour férié')
    await p.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ debut: '2026-11-11', fin: '2026-11-11', motif: 'Jour férié' })
    expect(p.text()).toContain('Fermeture ajoutée')
  })

  it('affiche l’erreur de l’API à côté du champ', async () => {
    const { panel } = await setup('/catalogue?onglet=fermetures', { 'POST /catalog/closures': [400, { error: 'Indiquez le motif (congés, jour férié, panne…).', field: 'motif' }] })
    const p = panel('fermetures')
    await p
      .findAll('button')
      .find((b) => b.text().includes('Ajouter une fermeture'))!
      .trigger('click')
    await p.get('#f-debut').setValue('2026-11-11')
    await p.get('form').trigger('submit')
    await flushPromises()
    expect(p.get('.field-error').text()).toContain('Indiquez le motif')
  })

  it('supprime une fermeture', async () => {
    const { panel, calls } = await setup('/catalogue?onglet=fermetures', {
      'GET /catalog/closures': [200, { closures: CL, today: '2026-10-30' }],
      'DELETE /catalog/closures/f1': [200, { ok: true }],
    })
    await panel('fermetures').get('button[aria-label^="Supprimer la fermeture"]').trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/catalog/closures/f1')).toBe(true)
  })

  it('décrit les fermetures dans le journal', () => {
    const e = { action: 'closure.created', details: { debut: '2026-12-24', fin: '2027-01-03', motif: 'Congés' } } as unknown as AuditEntry
    expect(describeEntry(e).text).toBe('A déclaré une fermeture de l’atelier du 24 décembre 2026 au 3 janvier 2027 (Congés)')
    const j = { action: 'closure.deleted', details: { debut: '2026-11-11', fin: '2026-11-11', motif: 'Férié' } } as unknown as AuditEntry
    expect(describeEntry(j).text).toBe('A supprimé la fermeture de l’atelier le 11 novembre 2026 (Férié)')
  })
})
