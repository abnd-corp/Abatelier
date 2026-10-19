import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import OrdersView from '@/views/OrdersView.vue'
import OrderNewView from '@/views/OrderNewView.vue'
import OrderView from '@/views/OrderView.vue'
import ProductionView from '@/views/ProductionView.vue'
import ProductionOrderView from '@/views/ProductionOrderView.vue'
import ClientView from '@/views/ClientView.vue'
import ProfileSketch from '@/components/orders/ProfileSketch.vue'
import { accessoriesFor, newLine, profilePoints, suggestedQuantity, type OrderCatalog, type OrderDetail, type OrderSummary, type Totals } from '@/lib/orders'
import { describe as describeEntry, type AuditEntry } from '@/lib/audit-labels'
import { useAuthStore, type User } from '@/stores/auth'
import { ADMIN, ATELIER, RH, freshPinia, makeRouter, mockApi } from './helpers'

// Les montants et les milliers utilisent des espaces insécables
const norm = (t: string) => t.replace(/[\u202f\u00a0]/g, ' ')
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms))

const CATALOG: OrderCatalog = {
  materials: [{ id: 'm1', label: 'Aluminium 1,5 mm', retourMin: 10 }],
  colors: [
    { id: 'k1', label: 'Gris anthracite (RAL 7016)', hex: '#383e42' },
    { id: 'k2', label: 'Noir sablé (2100 Sablé)', hex: '#27282b' },
  ],
  accessories: [
    { id: 'a1', nom: 'Bouchon de couvertine', prix: 6.9, unite: 'piece', modeles: ['couvertine'], quantiteAuto: 'fixe', quantiteFixe: 2 },
    { id: 'a2', nom: 'Éclisse de jonction', prix: 7.8, unite: 'piece', modeles: ['couvertine'], quantiteAuto: 'jonctions', quantiteFixe: 0 },
    { id: 'a3', nom: 'Angle de bandeau', prix: 14.5, unite: 'piece', modeles: ['bandeau'], quantiteAuto: 'aucune', quantiteFixe: 0 },
  ],
  limits: { largeurTole: 1250, longueurMin: 200, longueurMax: 3000, plisMax: 8 },
  retrait: true,
}
const TOTALS: Totals = { brut: 432.12, tauxRemisePro: 0, remisePro: 0, complementMinimum: 0, livraisonPrix: 0, ht: 432.12, tauxTva: 20, tva: 86.42, ttc: 518.54, delaiJours: 5 }
const LINE = {
  repere: 'Mur sud',
  modele: 'couvertine' as const,
  materialLabel: 'Aluminium 1,5 mm',
  colorLabel: 'Gris anthracite (RAL 7016)',
  colorHex: '#383e42',
  cotes: [20, 70, 300, 70, 20],
  angles: [-135, 90, 90, -135],
  longueur: 3000,
  quantite: 4,
  accessoires: [{ accessoryId: 'a1', nom: 'Bouchon de couvertine', unite: 'piece' as const, prix: 6.9, quantite: 2 }],
  prixUnitaire: 100.08,
  remiseQuantite: 0,
  montantPieces: 400.32,
  montantAccessoires: 13.8,
  miseEnRoute: 18,
  total: 432.12,
}
const QUOTE = { lignes: [LINE], totals: TOTALS, distanceKm: null }
const CLIENT = {
  id: 'c1',
  type: 'particulier',
  raisonSociale: null,
  siret: null,
  tvaIntra: null,
  prenom: 'Jean',
  nom: 'Dupont',
  email: null,
  telephone: '06 12 34 56 78',
  adresse: '3 rue des Lilas',
  codePostal: '42490',
  ville: 'Fraisses',
  origine: 'atelier',
  notes: null,
  archivedAt: null,
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-01T08:00:00Z',
}
const SITES = [{ id: 's1', libelle: 'Maison Rivière', adresse: '12 chemin du Bois', codePostal: '42700', ville: 'Firminy' }]
const ORDER: OrderDetail = {
  order: {
    ...TOTALS,
    id: 'o1',
    numero: 'C-2026-0001',
    statut: 'recue',
    statutLabel: 'Reçue',
    next: ['validee', 'annulee'],
    clientId: 'c1',
    livraisonMode: 'retrait',
    livraisonAdresse: null,
    livraisonCodePostal: null,
    livraisonVille: null,
    distanceKm: null,
    notes: 'Rappeler avant',
    datePrevue: null,
    createdAt: '2026-10-19T08:00:00Z',
  },
  client: { id: 'c1', nom: 'Jean Dupont', type: 'particulier', telephone: '06 12 34 56 78', email: null },
  lignes: [{ ...LINE, id: 'l1', materialId: 'm1', colorId: 'k1' }],
  events: [{ statut: 'recue', at: '2026-10-19T08:00:00Z', note: null, nom: 'Le Chef' }],
}

async function mountAt(component: object, path: string, routes: Parameters<typeof mockApi>[0], user: User = ADMIN) {
  const calls = mockApi(routes)
  const pinia = freshPinia()
  useAuthStore().user = user
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(component, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, calls }
}
const button = (w: ReturnType<typeof mount>, text: string) => w.findAll('button').find((b) => b.text().includes(text))!

describe('Outils commandes', () => {
  it('propose la quantité d’accessoires selon la règle', () => {
    const [bouchon, eclisse, angle] = CATALOG.accessories
    expect(suggestedQuantity(bouchon!, 4)).toBe(2)
    expect(suggestedQuantity(eclisse!, 4)).toBe(3)
    expect(suggestedQuantity(eclisse!, 0)).toBe(0)
    expect(suggestedQuantity(angle!, 4)).toBe(0)
    expect(accessoriesFor(CATALOG, 'bandeau').map((a) => a.id)).toEqual(['a3'])
    expect(accessoriesFor(CATALOG, 'autre')).toHaveLength(3)
  })

  it('prépare une pièce du modèle avec ses accessoires', () => {
    const l = newLine(CATALOG, 'couvertine')
    expect(l).toMatchObject({ materialId: 'm1', colorId: 'k1', cotes: [20, 70, 300, 70, 20], quantite: 4 })
    expect(l.accessoires).toEqual([
      { accessoryId: 'a1', quantite: 2 },
      { accessoryId: 'a2', quantite: 3 },
    ])
    // Garde la matière et le coloris de la pièce précédente
    expect(newLine(CATALOG, 'bandeau', { materialId: 'm1', colorId: 'k2' }).colorId).toBe('k2')
  })

  it('dessine le profil à partir des cotes et du sens des plis', () => {
    const { pts } = profilePoints([100, 50], [90], 0)
    expect(pts[1]).toEqual([100, 0])
    expect(pts[2]![0]).toBeCloseTo(100)
    expect(pts[2]![1]).toBeCloseTo(50)
    expect(profilePoints([100, 50], [-90], 0).pts[2]![1]).toBeCloseTo(-50)
    const w = mount(ProfileSketch, { props: { cotes: [20, 70, 300], angles: [90, -90] } })
    expect(w.findAll('text.cote').map((t) => t.text())).toEqual(['A 20', 'B 70', 'C 300'])
    expect(w.findAll('text.angle').map((t) => t.text())).toEqual(['90°', '90°'])
    expect(w.get('svg').attributes('aria-label')).toBe('Profil, développé 390 mm')
  })

  it('décrit les commandes dans le journal', () => {
    const e = (action: string, details: object) => describeEntry({ action, details } as unknown as AuditEntry).text
    expect(norm(e('order.created', { numero: 'C-2026-0001', client: 'Jean Dupont', ht: 432.12 }))).toBe('A enregistré la commande C-2026-0001 de Jean Dupont (432,12 € HT)')
    expect(norm(e('order.status_changed', { numero: 'C-2026-0001', avant: 'recue', apres: 'validee' }))).toBe('A passé la commande C-2026-0001 à « Validée »')
    expect(norm(e('order.status_changed', { numero: 'C-2026-0001', apres: 'annulee', note: 'Doublon' }))).toBe('A annulé la commande C-2026-0001 : Doublon')
  })
})

describe('Liste des commandes', () => {
  const SUMMARY: OrderSummary = { id: 'o1', numero: 'C-2026-0001', statut: 'fabrication', clientId: 'c1', client: 'Jean Dupont', livraisonMode: 'livraison', livraisonVille: 'Firminy', ht: 432.12, ttc: 518.54, datePrevue: '2026-10-26', createdAt: '2026-10-19T08:00:00Z', pieces: 4 }
  const LIST = { orders: [SUMMARY], totals: { recue: 1, validee: 2, fabrication: 1, prete: 0, livree: 5, annulee: 1 } }

  it('affiche numéro, client, étape, date prévue et montant, avec les totaux par étape', async () => {
    const { wrapper } = await mountAt(OrdersView, '/commandes', { 'GET /orders': [200, LIST] })
    const row = wrapper.get('tbody tr').text()
    for (const t of ['C-2026-0001', 'Jean Dupont', 'En fabrication', 'Firminy', 'lun. 26 oct.', '518,54', '4 pièces']) expect(row).toContain(t)
    expect(wrapper.findAll('.chip').map((c) => c.text())).toEqual(['En cours 4', 'Reçue 1', 'Validée 2', 'En fabrication 1', 'Prête 0', 'Livrée / retirée 5', 'Annulée 1', 'Toutes 10'])
  })

  it('filtre par étape et ouvre la commande', async () => {
    const { wrapper, router, calls } = await mountAt(OrdersView, '/commandes', { 'GET /orders': [200, LIST] })
    await button(wrapper, 'Livrée').trigger('click')
    await flushPromises()
    expect(calls.at(-1)!.path).toBe('/orders?filtre=livree')
    await wrapper.get('tbody tr').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/commandes/o1')
  })
})

describe('Nouvelle commande', () => {
  const routes = (extra: Parameters<typeof mockApi>[0] = {}) => ({
    'GET /orders/catalog': [200, CATALOG] as [number, unknown],
    'GET /clients/c1': [200, { client: CLIENT, sites: SITES, activity: [], commandes: null }] as [number, unknown],
    'POST /orders/quote': [200, QUOTE] as [number, unknown],
    ...extra,
  })

  it('cherche puis choisit le client', async () => {
    const { wrapper, router } = await mountAt(OrderNewView, '/commandes/nouvelle', routes({ 'GET /clients': [200, { clients: [CLIENT], totals: {} }] }))
    await wrapper.get('#order-client-search').setValue('dup')
    await wait(300)
    await flushPromises()
    await button(wrapper, 'Jean Dupont').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.client).toBe('c1')
    expect(norm(wrapper.text())).toContain('Client : Jean Dupont')
    expect(wrapper.find('#l0-modele').exists()).toBe(true)
  })

  it('chiffre en direct, fait suivre les accessoires et enregistre la commande', async () => {
    const { wrapper, router, calls } = await mountAt(OrderNewView, '/commandes/nouvelle?client=c1', routes({ 'POST /orders': [201, { id: 'o9' }] }))
    await wait()
    await flushPromises()
    expect(calls.some((c) => c.path === '/orders/quote')).toBe(true)
    expect(norm(wrapper.get('[aria-label="Montant de la commande"]').text())).toContain('518,54')
    expect(norm(wrapper.text())).toContain('100,08 € la pièce')

    // 6 pièces : les éclisses suivent (5), les bouchons restent à 2
    await wrapper.get('#l0-quantite').setValue('6')
    expect((wrapper.get('#l0-acc1').element as HTMLInputElement).value).toBe('5')
    expect((wrapper.get('#l0-acc0').element as HTMLInputElement).value).toBe('2')
    // Un pli de plus, puis le premier pli dans l'autre sens
    await button(wrapper, 'Ajouter un pli').trigger('click')
    expect(wrapper.find('#l0-cote5').exists()).toBe(true)
    await wrapper.get('button[aria-label="Inverser le sens du pli 1"]').trigger('click')
    // Livraison sur un chantier connu
    await wrapper.findAll('input[name="livraison-mode"]')[1]!.setValue(true)
    await wrapper.get('#o-adresse-choix').setValue('1')
    await wait()
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const body = calls.find((c) => c.method === 'POST' && c.path === '/orders')!.body
    expect(body.clientId).toBe('c1')
    expect(body.lignes[0]).toMatchObject({ quantite: 6, cotes: [20, 70, 300, 70, 20, 20], angles: [135, 90, 90, -135, 90] })
    expect(body.lignes[0].accessoires).toEqual([
      { accessoryId: 'a1', quantite: 2 },
      { accessoryId: 'a2', quantite: 5 },
    ])
    expect(body.livraison).toEqual({ mode: 'livraison', adresse: '12 chemin du Bois', codePostal: '42700', ville: 'Firminy' })
    expect(router.currentRoute.value.fullPath).toBe('/commandes/o9')
  })

  it('signale le champ fautif renvoyé par le chiffrage et bloque l’enregistrement', async () => {
    const { wrapper } = await mountAt(
      OrderNewView,
      '/commandes/nouvelle?client=c1',
      routes({ 'POST /orders/quote': [400, { error: 'Cote A : 10 mm minimum en Aluminium 1,5 mm.', field: 'lignes.0.cotes.0' }] }),
    )
    await wait()
    await flushPromises()
    expect(wrapper.get('#l0-cote0').attributes('aria-invalid')).toBe('true')
    expect(norm(wrapper.get('[aria-label="Pièce 1"]').text())).toContain('Cote A : 10 mm minimum')
    expect(button(wrapper, 'Enregistrer la commande').attributes('disabled')).toBeDefined()
  })

  it('ajoute, duplique et retire des pièces', async () => {
    const { wrapper } = await mountAt(OrderNewView, '/commandes/nouvelle?client=c1', routes())
    await button(wrapper, 'Ajouter une pièce').trigger('click')
    await wrapper.get('#l1-modele').setValue('bandeau')
    expect(wrapper.find('#l1-cote2').exists()).toBe(false)
    expect(wrapper.find('#l1-acc0').exists()).toBe(true)
    await wrapper.get('button[aria-label="Dupliquer la pièce 2"]').trigger('click')
    expect(wrapper.findAll('[aria-label^="Pièce "]')).toHaveLength(3)
    await wrapper.get('button[aria-label="Retirer la pièce 1"]').trigger('click')
    expect((wrapper.get('#l0-modele').element as HTMLSelectElement).value).toBe('bandeau')
  })

  it('prévient quand le catalogue est vide', async () => {
    const { wrapper } = await mountAt(OrderNewView, '/commandes/nouvelle', routes({ 'GET /orders/catalog': [200, { ...CATALOG, materials: [] }] }))
    expect(norm(wrapper.text())).toContain('Ajoutez d’abord au moins une matière et un coloris')
  })
})

describe('Fiche commande', () => {
  it('affiche les étapes, les pièces, le montant et fait valider', async () => {
    const { wrapper, calls } = await mountAt(OrderView, '/commandes/o1', { 'GET /orders/o1': [200, ORDER], 'POST /orders/o1/status': [200, { statut: 'validee' }] })
    expect(norm(wrapper.get('h1').text())).toBe('C-2026-0001')
    expect(wrapper.findAll('.steps li.done')).toHaveLength(1)
    expect(norm(wrapper.text())).toContain('Mur sud')
    expect(norm(wrapper.text())).toContain('432,12 € HT')
    expect(norm(wrapper.text())).toContain('Rappeler avant')
    await button(wrapper, 'Valider la commande').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ statut: 'validee' })
    expect(norm(wrapper.text())).toContain('Commande passée à l’étape « Validée »')
  })

  it('demande la raison avant d’annuler', async () => {
    const { wrapper, calls } = await mountAt(OrderView, '/commandes/o1', { 'GET /orders/o1': [200, ORDER], 'POST /orders/o1/status': [200, { statut: 'annulee' }] })
    await button(wrapper, 'Annuler la commande').trigger('click')
    const confirm = button(wrapper, 'Confirmer l’annulation')
    expect(confirm.attributes('disabled')).toBeDefined()
    await wrapper.get('#cancel-reason').setValue('Doublon')
    await confirm.trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ statut: 'annulee', note: 'Doublon' })
  })

  it('modifie les pièces d’une commande reçue, sans renvoyer le client', async () => {
    const { wrapper, calls } = await mountAt(OrderView, '/commandes/o1', {
      'GET /orders/o1': [200, ORDER],
      'GET /orders/catalog': [200, CATALOG],
      'GET /clients/c1': [200, { client: CLIENT, sites: SITES, activity: [], commandes: null }],
      'POST /orders/quote': [200, QUOTE],
      'PATCH /orders/o1': [200, { ok: true }],
    })
    await button(wrapper, 'Modifier les pièces').trigger('click')
    await flushPromises()
    expect((wrapper.get('#l0-repere').element as HTMLInputElement).value).toBe('Mur sud')
    await wrapper.get('#l0-longueur').setValue('2500')
    await wait()
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const body = calls.find((c) => c.method === 'PATCH')!.body
    expect(body.clientId).toBeUndefined()
    expect(body.lignes[0]).toMatchObject({ longueur: 2500, angles: [-135, 90, 90, -135], accessoires: [{ accessoryId: 'a1', quantite: 2 }] })
    expect(norm(wrapper.text())).toContain('Commande modifiée.')
  })

  it('n’offre plus d’action sur une commande livrée', async () => {
    const livree = { ...ORDER, order: { ...ORDER.order, statut: 'livree' as const, statutLabel: 'Livrée / retirée', next: [] } }
    const { wrapper } = await mountAt(OrderView, '/commandes/o1', { 'GET /orders/o1': [200, livree] })
    expect(wrapper.findAll('.steps li.done')).toHaveLength(5)
    expect(wrapper.find('.actions').exists()).toBe(false)
  })
})

describe('Atelier', () => {
  const ROWS = [
    { id: 'o1', numero: 'C-2026-0001', statut: 'validee', livraisonMode: 'retrait', datePrevue: '2020-01-06', pieces: 4, lignes: 1, next: 'fabrication' },
    { id: 'o2', numero: 'C-2026-0002', statut: 'prete', livraisonMode: 'livraison', datePrevue: '2099-01-06', pieces: 1, lignes: 1, next: 'livree' },
  ]

  it('range les commandes par étape, signale le retard et fait avancer', async () => {
    const { wrapper, calls } = await mountAt(ProductionView, '/fabrication', { 'GET /production': [200, { orders: ROWS }], 'POST /production/o1/status': [200, {}] }, ATELIER)
    const groups = wrapper.findAll('section.group')
    expect(groups.map((g) => g.find('h2').text())).toEqual(['À lancer 1', 'En fabrication 0', 'Prêtes, à livrer ou à faire retirer 1'])
    expect(norm(groups[0]!.text())).toContain('en retard')
    expect(norm(groups[2]!.text())).not.toContain('en retard')
    await button(wrapper, 'Lancer la fabrication').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ statut: 'fabrication' })
  })

  it('montre la fiche de fabrication sans prix', async () => {
    const detail = {
      order: { id: 'o1', numero: 'C-2026-0001', statut: 'fabrication', statutLabel: 'En fabrication', livraisonMode: 'retrait', datePrevue: '2026-10-26', next: 'prete' },
      lignes: [{ ...LINE, id: 'l1', accessoires: [{ nom: 'Bouchon de couvertine', unite: 'piece', quantite: 2 }], prixUnitaire: undefined, total: undefined }],
      events: ORDER.events,
    }
    const { wrapper, calls } = await mountAt(ProductionOrderView, '/fabrication/o1', { 'GET /production/o1': [200, detail], 'POST /production/o1/status': [200, {}] }, ATELIER)
    expect(norm(wrapper.text())).toContain('4 × 3 000 mm')
    expect(norm(wrapper.text())).toContain('2 × Bouchon de couvertine')
    expect(norm(wrapper.text())).toContain('135° ↓')
    expect(norm(wrapper.text())).not.toContain('€')
    await button(wrapper, 'Marquer prête').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ statut: 'prete' })
  })
})

describe('Commandes sur la fiche client', () => {
  it('liste les commandes et le total dépensé, avec un lien pour en créer une', async () => {
    const commandes = { list: [{ id: 'o1', numero: 'C-2026-0001', statut: 'livree', ttc: 518.54, createdAt: '2026-10-19T08:00:00Z' }], totalTtc: 518.54 }
    const { wrapper } = await mountAt(ClientView, '/clients/c1', { 'GET /clients/c1': [200, { client: CLIENT, sites: [], activity: [], commandes }] })
    const block = wrapper.get('[aria-labelledby="orders-title"]')
    expect(norm(block.text())).toContain('C-2026-0001')
    expect(norm(block.text())).toContain('Total dépensé : 518,54 € TTC')
    expect(block.get('a.btn').attributes('href')).toBe('/commandes/nouvelle?client=c1')
  })

  it('ne montre pas les commandes à la RH', async () => {
    const { wrapper } = await mountAt(ClientView, '/clients/c1', { 'GET /clients/c1': [200, { client: CLIENT, sites: [], activity: [], commandes: null }] }, RH)
    expect(wrapper.find('[aria-labelledby="orders-title"]').exists()).toBe(false)
  })
})
