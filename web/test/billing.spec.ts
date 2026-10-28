import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import BillingView from '@/views/BillingView.vue'
import BillingDocView from '@/views/BillingDocView.vue'
import OrderView from '@/views/OrderView.vue'
import type { BillingDetail, BillingDoc, BillingSummary } from '@/lib/billing'
import type { OrderDetail } from '@/lib/orders'
import { describe as describeEntry, type AuditEntry } from '@/lib/audit-labels'
import { useAuthStore, type User } from '@/stores/auth'
import { ADMIN, freshPinia, makeRouter, mockApi } from './helpers'

// Les montants utilisent des espaces insécables
const norm = (t: string) => t.replace(/[  ]/g, ' ')

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
const button = (w: ReturnType<typeof mount>, text: string) => w.findAll('button').find((b) => b.text().includes(text))
const sent = (calls: ReturnType<typeof mockApi>) => calls.filter((c) => c.method !== 'GET').map((c) => ({ method: c.method, path: c.path, body: c.body }))

const SUMMARY: BillingSummary = {
  id: 'f1',
  type: 'facture',
  numero: 'F-2026-0001',
  orderId: 'o1',
  orderNumero: 'C-2026-0001',
  clientId: 'c1',
  client: 'Toitures du Forez',
  emisLe: '2026-10-20T08:00:00Z',
  echeance: '2026-11-19',
  ht: 400,
  ttc: 480,
  payeLe: null,
  statut: 'en_retard',
}
const LIST = {
  documents: [SUMMARY, { ...SUMMARY, id: 'f2', numero: 'F-2026-0002', client: 'Jean Dupont', statut: 'payee', payeLe: '2026-10-20', ttc: 120 }],
  totals: { en_retard: { n: 1, ttc: 480 }, payee: { n: 1, ttc: 120 } },
}

const DOC: BillingDoc = {
  id: 'f1',
  type: 'facture',
  numero: 'F-2026-0001',
  orderId: 'o1',
  clientId: 'c1',
  factureId: null,
  emisLe: '2026-10-20T08:00:00Z',
  echeance: '2026-11-19',
  clientNom: 'Toitures du Forez',
  clientAdresse: '8 avenue de la Gare\n42700 Firminy\nSIRET 732 829 320 00074',
  lignes: [
    { designation: 'Couvertine · Mur sud', detail: 'Aluminium 1,5 mm · Gris anthracite (RAL 7016)', quantite: 4, prixUnitaire: 100.08 },
    { designation: 'Remise professionnelle', quantite: 1, prixUnitaire: -40.03 },
  ],
  ht: 360.29,
  tauxTva: 20,
  tva: 72.06,
  ttc: 432.35,
  motif: null,
  envoyeLe: null,
  reponse: null,
  reponseLe: null,
  payeLe: null,
  modePaiement: null,
  createdByNom: 'Le Chef',
  facturx: true,
  statut: 'emise',
}
const detail = (over: Partial<BillingDoc> = {}, lie: BillingDetail['lie'] = null, order: Partial<BillingDetail['order']> = {}): BillingDetail => ({
  document: { ...DOC, ...over },
  order: { id: 'o1', numero: 'C-2026-0001', statut: 'livree', statutLabel: 'Livrée / retirée', ...order },
  lie,
})

describe('Liste des devis et factures', () => {
  it('affiche les factures avec leur statut, et les montants à encaisser et en retard', async () => {
    const { wrapper, calls } = await mountAt(BillingView, '/factures', { 'GET /billing': [200, LIST] })
    expect(calls[0]!.path).toBe('/billing?type=facture')
    const txt = norm(wrapper.text())
    expect(txt).toContain('F-2026-0001')
    expect(txt).toContain('Toitures du Forez')
    expect(txt).toContain('C-2026-0001')
    expect(txt).toContain('Payée le')
    const figures = wrapper.findAll('.figure').map((f) => norm(f.text()))
    expect(figures[0]).toContain('À encaisser480,00 €1 facture')
    expect(figures[1]).toContain('En retard480,00 €')
    expect(wrapper.find('[role="tab"][aria-selected="true"]').text()).toBe('Factures')
    expect(wrapper.find('.pill.bad').text()).toBe('En retard')
  })

  it('filtre par statut, change de type et ouvre un document', async () => {
    const { wrapper, router, calls } = await mountAt(BillingView, '/factures', { 'GET /billing': [200, LIST] })
    await button(wrapper, 'En retard')!.trigger('click')
    await flushPromises()
    expect(calls.at(-1)!.path).toBe('/billing?type=facture&statut=en_retard')
    expect(router.currentRoute.value.query).toEqual({ statut: 'en_retard' })
    await wrapper.findAll('[role="tab"]')[0]!.trigger('click')
    await flushPromises()
    expect(calls.at(-1)!.path).toBe('/billing?type=devis')
    expect(router.currentRoute.value.query).toEqual({ type: 'devis' })
    expect(button(wrapper, 'Accepté')).toBeTruthy()
    await wrapper.find('tbody tr').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('billing-doc')
  })

  it('explique où se font les documents quand il n’y en a pas', async () => {
    const { wrapper } = await mountAt(BillingView, '/factures?type=avoir', { 'GET /billing': [200, { documents: [], totals: {} }] })
    expect(wrapper.text()).toContain('Aucun avoir pour l’instant.')
    expect(wrapper.text()).toContain('Un avoir s’établit depuis une facture')
  })
})

describe('Fiche d’un document', () => {
  it('montre le détail, le client imprimé et le PDF émis', async () => {
    const { wrapper } = await mountAt(BillingDocView, '/factures/f1', { 'GET /billing/f1': [200, detail()] })
    const txt = norm(wrapper.text())
    expect(wrapper.find('h1').text()).toBe('F-2026-0001')
    expect(txt).toContain('Couvertine · Mur sud')
    expect(txt).toContain('400,32 €')
    expect(txt).toContain('-40,03 €')
    expect(txt).toContain('432,35 €')
    expect(txt).toContain('SIRET 732 829 320 00074')
    expect(wrapper.find('a[href="/api/billing/f1/pdf"]').attributes('target')).toBe('_blank')
    expect(wrapper.find('.pill').text()).toBe('À envoyer')
  })

  it('marque la facture envoyée puis enregistre le paiement', async () => {
    const { wrapper, calls } = await mountAt(BillingDocView, '/factures/f1', {
      'GET /billing/f1': [200, detail()],
      'POST /billing/f1/envoi': [200, { envoyeLe: '2026-10-20T09:00:00Z' }],
      'POST /billing/f1/paiement': [200, { statut: 'payee' }],
    })
    await button(wrapper, 'Marquer envoyée')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Facture marquée comme envoyée.')
    await button(wrapper, 'Enregistrer le paiement')!.trigger('click')
    await wrapper.find('#pay-date').setValue('2026-10-20')
    await wrapper.find('#pay-mode').setValue('cheque')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(sent(calls)).toEqual([
      { method: 'POST', path: '/billing/f1/envoi', body: {} },
      { method: 'POST', path: '/billing/f1/paiement', body: { date: '2026-10-20', mode: 'cheque' } },
    ])
    expect(wrapper.text()).toContain('Paiement enregistré.')
  })

  it('affiche l’erreur de date sous le champ du paiement', async () => {
    const { wrapper } = await mountAt(BillingDocView, '/factures/f1', {
      'GET /billing/f1': [200, detail()],
      'POST /billing/f1/paiement': [400, { error: 'La date de paiement ne peut pas être dans le futur.', field: 'date' }],
    })
    await button(wrapper, 'Enregistrer le paiement')!.trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('#pay-error').text()).toBe('La date de paiement ne peut pas être dans le futur.')
    expect(wrapper.find('#pay-date').attributes('aria-invalid')).toBe('true')
  })

  it('émet un avoir avec son motif, puis ouvre l’avoir', async () => {
    const { wrapper, router, calls } = await mountAt(BillingDocView, '/factures/f1', {
      'GET /billing/f1': [200, detail({ payeLe: '2026-10-20', modePaiement: 'virement', statut: 'payee' })],
      'POST /billing/f1/avoir': [201, { id: 'a1', numero: 'A-2026-0001' }],
      'GET /billing/a1': [200, detail({ id: 'a1', type: 'avoir', numero: 'A-2026-0001', statut: 'emis', motif: 'Erreur de coloris', echeance: null }, { id: 'f1', numero: 'F-2026-0001' })],
    })
    expect(button(wrapper, 'Enregistrer le paiement')).toBeUndefined()
    expect(button(wrapper, 'Annuler le paiement')).toBeTruthy()
    await button(wrapper, 'Faire un avoir')!.trigger('click')
    expect(wrapper.text()).toContain('pensez à rembourser le client')
    expect(button(wrapper, 'Émettre l’avoir')!.attributes('disabled')).toBeDefined()
    await wrapper.find('#avoir-motif').setValue('Erreur de coloris')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(sent(calls)).toEqual([{ method: 'POST', path: '/billing/f1/avoir', body: { motif: 'Erreur de coloris' } }])
    expect(router.currentRoute.value.params.id).toBe('a1')
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('A-2026-0001')
    expect(wrapper.text()).toContain('Annule la facture')
    expect(wrapper.text()).toContain('Erreur de coloris')
    expect(button(wrapper, 'Faire un avoir')).toBeUndefined()
  })

  it('devis : accepté ou refusé, mais plus accepté une fois expiré', async () => {
    const devis = { type: 'devis' as const, numero: 'D-2026-0001' }
    const { wrapper, calls } = await mountAt(BillingDocView, '/factures/f1', {
      'GET /billing/f1': [200, detail({ ...devis, statut: 'envoye', envoyeLe: '2026-10-20T09:00:00Z' })],
      'POST /billing/f1/reponse': [200, { statut: 'accepte' }],
    })
    expect(button(wrapper, 'Marquer envoyé')).toBeUndefined()
    expect(button(wrapper, 'Enregistrer le paiement')).toBeUndefined()
    await button(wrapper, 'Accepté par le client')!.trigger('click')
    await flushPromises()
    expect(sent(calls)).toEqual([{ method: 'POST', path: '/billing/f1/reponse', body: { reponse: 'accepte' } }])

    const expired = await mountAt(BillingDocView, '/factures/f1', { 'GET /billing/f1': [200, detail({ ...devis, statut: 'expire' })] })
    expect(button(expired.wrapper, 'Accepté par le client')).toBeUndefined()
    expect(button(expired.wrapper, 'Refusé')).toBeTruthy()
    expect(expired.wrapper.text()).toContain('Ce devis a expiré')
  })
})

describe('Devis et factures sur la commande', () => {
  const ORDER = {
    order: {
      brut: 400,
      tauxRemisePro: 0,
      remisePro: 0,
      complementMinimum: 0,
      livraisonPrix: 0,
      ht: 400,
      tauxTva: 20,
      tva: 80,
      ttc: 480,
      delaiJours: 5,
      id: 'o1',
      numero: 'C-2026-0001',
      statut: 'validee',
      statutLabel: 'Validée',
      next: ['fabrication', 'annulee'],
      clientId: 'c1',
      livraisonMode: 'retrait',
      livraisonAdresse: null,
      livraisonCodePostal: null,
      livraisonVille: null,
      distanceKm: null,
      notes: null,
      datePrevue: '2026-10-27',
      createdAt: '2026-10-19T08:00:00Z',
    },
    client: { id: 'c1', nom: 'Jean Dupont', type: 'particulier', telephone: null, email: null },
    lignes: [],
    events: [{ statut: 'recue', at: '2026-10-19T08:00:00Z', note: null, nom: 'Le Chef' }],
  } as unknown as OrderDetail

  it('liste les documents et émet une facture', async () => {
    const { wrapper, router, calls } = await mountAt(OrderView, '/commandes/o1', {
      'GET /orders/o1': [200, ORDER],
      'GET /billing': [200, { documents: [{ ...SUMMARY, type: 'devis', numero: 'D-2026-0001', statut: 'accepte' }], totals: {} }],
      'POST /billing/orders/o1/facture': [201, { id: 'f9', numero: 'F-2026-0009' }],
    })
    expect(calls.find((c) => c.path.startsWith('/billing'))!.path).toBe('/billing?orderId=o1')
    const section = wrapper.find('[aria-labelledby="billing-title"]')
    expect(section.text()).toContain('D-2026-0001')
    expect(section.text()).toContain('Accepté')
    expect(button(wrapper, 'Faire un devis')).toBeTruthy()
    await button(wrapper, 'Facturer')!.trigger('click')
    await flushPromises()
    expect(sent(calls)).toEqual([{ method: 'POST', path: '/billing/orders/o1/facture', body: undefined }])
    expect(router.currentRoute.value).toMatchObject({ name: 'billing-doc', params: { id: 'f9' } })
  })

  it('ne propose pas de refacturer une commande déjà facturée', async () => {
    const { wrapper } = await mountAt(OrderView, '/commandes/o1', {
      'GET /orders/o1': [200, ORDER],
      'GET /billing': [200, { documents: [{ ...SUMMARY, statut: 'emise' }], totals: {} }],
    })
    expect(button(wrapper, 'Facturer')).toBeUndefined()
  })

  it('est absente sans le droit de facturer', async () => {
    const user: User = { ...ADMIN, permissions: ADMIN.permissions.filter((p) => p !== 'billing.manage') }
    const { wrapper, calls } = await mountAt(OrderView, '/commandes/o1', { 'GET /orders/o1': [200, ORDER] }, user)
    expect(wrapper.find('[aria-labelledby="billing-title"]').exists()).toBe(false)
    expect(calls.some((c) => c.path.startsWith('/billing'))).toBe(false)
  })
})

describe('Journal', () => {
  const entry = (action: string, details: Record<string, unknown>): AuditEntry => ({
    id: 1,
    at: '2026-10-20T08:00:00Z',
    action,
    identifiant: 'chef',
    nom: 'Le Chef',
    userId: 'u1',
    targetType: 'billing',
    targetId: 'f1',
    targetName: null,
    ip: null,
    device: '',
    details,
  })
  it('décrit les devis, factures, paiements et avoirs', () => {
    expect(norm(describeEntry(entry('billing.facture_created', { numero: 'F-2026-0001', client: 'Jean Dupont', commande: 'C-2026-0001', ttc: 480 })).text)).toBe(
      'A émis la facture F-2026-0001 pour Jean Dupont (commande C-2026-0001, 480,00 € TTC)',
    )
    expect(norm(describeEntry(entry('billing.paid', { numero: 'F-2026-0001', ttc: 480, mode: 'cheque', date: '2026-10-20' })).text)).toBe(
      'A enregistré le paiement de la facture F-2026-0001 (480,00 €, chèque, le 20/10/2026)',
    )
    expect(describeEntry(entry('billing.exported', { type: 'ventes', du: '2026-01-01', au: '2026-10-20', lignes: 12 })).text).toBe(
      'A exporté les ventes (factures et avoirs) du 01/01/2026 au 20/10/2026 pour le comptable (12 lignes)',
    )
    expect(describeEntry(entry('billing.exported', { type: 'encaissements', du: '2026-10-01', au: '2026-10-31', lignes: 1 })).text).toBe(
      'A exporté les encaissements du 01/10/2026 au 31/10/2026 pour le comptable (1 ligne)',
    )
    expect(describeEntry(entry('billing.avoir_created', { numero: 'A-2026-0001', facture: 'F-2026-0001', client: 'Jean Dupont', motif: 'Erreur' }))).toEqual({
      text: 'A émis l’avoir A-2026-0001 qui annule la facture F-2026-0001 de Jean Dupont : Erreur',
      tone: 'bad',
    })
    expect(describeEntry(entry('billing.sent', { numero: 'D-2026-0001', client: 'Jean Dupont' })).text).toBe('A marqué le devis D-2026-0001 comme envoyé à Jean Dupont')
    expect(describeEntry(entry('billing.devis_answered', { numero: 'D-2026-0001', client: 'Jean Dupont', reponse: 'refuse' })).text).toBe('A noté le devis D-2026-0001 comme refusé par Jean Dupont')
  })
})

describe('Export pour le comptable', () => {
  const open = async (routes: Parameters<typeof mockApi>[0] = {}) => {
    const created = vi.fn(() => 'blob:csv')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }))
    const clicks: string[] = []
    const realClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () {
      clicks.push(this.download)
    }
    const res = await mountAt(BillingView, '/factures', { 'GET /billing?type=facture': [200, LIST], ...routes })
    return { ...res, clicks, restore: () => (HTMLAnchorElement.prototype.click = realClick) }
  }

  it('télécharge le CSV des ventes de la période choisie', async () => {
    const { wrapper, calls, clicks, restore } = await open({ 'GET /billing/export?type=ventes&du=2026-01-01&au=2026-03-31': [200, 'Date;Type'] })
    await wrapper.get('#exp-du').setValue('2026-01-01')
    await wrapper.get('#exp-au').setValue('2026-03-31')
    await wrapper.get('.export form').trigger('submit')
    await flushPromises()
    restore()
    expect(calls.some((c) => c.path === '/billing/export?type=ventes&du=2026-01-01&au=2026-03-31')).toBe(true)
    expect(clicks).toEqual(['ventes-2026-01-01_2026-03-31.csv'])
    expect(wrapper.text()).toContain('Fichier téléchargé')
  })

  it('exporte les encaissements, et propose des périodes rapides', async () => {
    const { wrapper, calls, restore } = await open({ 'GET /billing/export?type=encaissements&du=2026-10-01&au=2026-10-31': [200, 'x'] })
    await wrapper.get('#exp-type').setValue('encaissements')
    await wrapper.get('#exp-du').setValue('2026-10-01')
    await wrapper.get('#exp-au').setValue('2026-10-31')
    await wrapper.get('.export form').trigger('submit')
    await flushPromises()
    restore()
    expect(calls.some((c) => c.path.startsWith('/billing/export?type=encaissements'))).toBe(true)
    const before = (wrapper.get('#exp-du').element as HTMLInputElement).value
    await wrapper
      .findAll('.presets .chip')
      .find((b) => b.text() === 'Mois précédent')!
      .trigger('click')
    expect((wrapper.get('#exp-du').element as HTMLInputElement).value).not.toBe(before)
    expect((wrapper.get('#exp-du').element as HTMLInputElement).value).toMatch(/-01$/)
  })

  it('affiche l’erreur du serveur sans télécharger', async () => {
    const { wrapper, clicks, restore } = await open({
      'GET /billing/export?type=ventes&du=2026-12-31&au=2026-01-01': [400, { error: 'La date de fin doit être après la date de début.', field: 'au' }],
    })
    await wrapper.get('#exp-du').setValue('2026-12-31')
    await wrapper.get('#exp-au').setValue('2026-01-01')
    await wrapper.get('.export form').trigger('submit')
    await flushPromises()
    restore()
    expect(wrapper.get('[role="alert"]').text()).toContain('après la date de début')
    expect(clicks).toEqual([])
  })
})

describe('Envoi par e-mail', () => {
  const PROPOSAL = { configure: true, to: 'jean@example.com', sujet: 'Facture F-2026-0001 — Alu Pliage Service', message: 'Bonjour Jean,\n\nVoici la facture.', fichier: 'F-2026-0001.pdf' }
  const open = async (routes: Parameters<typeof mockApi>[0] = {}, proposal: object = PROPOSAL) => {
    const res = await mountAt(BillingDocView, '/factures/f1', { 'GET /billing/f1': [200, detail()], 'GET /billing/f1/email': [200, proposal], ...routes })
    await button(res.wrapper, 'Envoyer par e-mail')!.trigger('click')
    await flushPromises()
    return res
  }

  it('n’annonce aucune pièce jointe quand le client a un espace client : le message renvoie vers cet espace', async () => {
    const { wrapper } = await open({}, { ...PROPOSAL, fichier: null, espace: true })
    expect(wrapper.text()).not.toContain('Pièce jointe')
    expect(wrapper.text()).toContain('Aucune pièce jointe : le message renvoie vers l’espace client')
  })

  it('propose le message prêt à envoyer, puis envoie avec les champs modifiés', async () => {
    const { wrapper, calls } = await open({ 'POST /billing/f1/email': [200, { ok: true, envoyeLe: '2026-10-20T09:00:00Z' }] })
    expect((wrapper.get('#mail-to').element as HTMLInputElement).value).toBe('jean@example.com')
    expect((wrapper.get('#mail-subject').element as HTMLInputElement).value).toBe(PROPOSAL.sujet)
    expect((wrapper.get('#mail-message').element as HTMLTextAreaElement).value).toContain('Voici la facture.')
    expect(wrapper.text()).toContain('Pièce jointe : F-2026-0001.pdf')
    expect(wrapper.text()).toContain('Ce client n’a pas d’espace client : le document est joint au message')
    await wrapper.get('#mail-to').setValue('jean@example.com, compta@example.com')
    await wrapper.get('#mail-message').setValue('Bonjour, voici la facture à régler.')
    await wrapper.get('form.inline-form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({
      path: '/billing/f1/email',
      body: { to: 'jean@example.com, compta@example.com', sujet: PROPOSAL.sujet, message: 'Bonjour, voici la facture à régler.' },
    })
    expect(wrapper.text()).toContain('E-mail envoyé avec le PDF en pièce jointe.')
    expect(wrapper.find('form.inline-form').exists()).toBe(false)
  })

  it('affiche l’erreur sous le bon champ, et celle du serveur de messagerie', async () => {
    const { wrapper } = await open({ 'POST /billing/f1/email': [400, { error: 'Adresse e-mail invalide.', field: 'to' }] })
    await wrapper.get('#mail-to').setValue('pas-un-mail')
    await wrapper.get('form.inline-form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#mail-error-to').text()).toBe('Adresse e-mail invalide.')
    expect(wrapper.get('#mail-to').attributes('aria-invalid')).toBe('true')
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1)
  })

  it('montre l’échec d’envoi sans perdre le message saisi', async () => {
    const { wrapper } = await open({ 'POST /billing/f1/email': [502, { error: 'Le message n’a pas été envoyé : serveur de messagerie injoignable.' }] })
    await wrapper.get('form.inline-form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('serveur de messagerie injoignable')
    expect((wrapper.get('#mail-message').element as HTMLTextAreaElement).value).toContain('Voici la facture.')
  })

  it('prévient quand la messagerie n’est pas configurée, et bloque l’envoi', async () => {
    const { wrapper } = await open({ 'GET /billing/f1/email': [200, { ...PROPOSAL, configure: false }] })
    expect(wrapper.text()).toContain('pas encore configuré')
    expect(wrapper.get('form.inline-form button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('invite à saisir l’adresse quand le client n’en a pas', async () => {
    const { wrapper } = await open({ 'GET /billing/f1/email': [200, { ...PROPOSAL, to: '' }] })
    expect(wrapper.text()).toContain('n’a pas d’adresse e-mail')
    expect(wrapper.get('form.inline-form button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('décrit l’envoi et l’essai dans le journal', () => {
    const e = (action: string, details: Record<string, unknown>): AuditEntry => ({
      id: 1,
      at: '2026-10-20T08:00:00Z',
      action,
      identifiant: 'chef',
      nom: 'Le Chef',
      userId: 'u1',
      targetType: 'billing',
      targetId: 'f1',
      targetName: null,
      ip: null,
      device: '',
      details,
    })
    expect(describeEntry(e('billing.emailed', { numero: 'F-2026-0001', client: 'Jean Dupont', destinataires: 2 })).text).toBe(
      'A envoyé par e-mail la facture F-2026-0001 à Jean Dupont (2 destinataires)',
    )
    expect(describeEntry(e('billing.emailed', { numero: 'D-2026-0001', client: 'Jean Dupont', destinataires: 1 })).text).toBe('A envoyé par e-mail le devis D-2026-0001 à Jean Dupont (1 destinataire)')
    expect(describeEntry(e('mail.test', {})).text).toMatch(/essai/)
  })
})

describe('Facture électronique : fichier Factur-X', () => {
  it('propose le XML sur une facture, pas sur un devis', async () => {
    const { wrapper } = await mountAt(BillingDocView, '/factures/f1', { 'GET /billing/f1': [200, detail()] })
    const link = wrapper.find('a[href="/api/billing/f1/facturx.xml"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('download')).toBeDefined()
    expect(link.text()).toContain('XML Factur-X')
    const devis = await mountAt(BillingDocView, '/factures/f1', { 'GET /billing/f1': [200, detail({ type: 'devis', numero: 'D-2026-0001', statut: 'emis', facturx: false })] })
    expect(devis.wrapper.find('a[href$="facturx.xml"]').exists()).toBe(false)
  })

  it('devis : accepte et valide la commande en un clic, ou valide seulement si déjà accepté', async () => {
    const devis = { type: 'devis' as const, numero: 'D-2026-0001' }
    const un = await mountAt(BillingDocView, '/factures/f1', {
      'GET /billing/f1': [200, detail({ ...devis, statut: 'envoye', envoyeLe: '2026-10-20T09:00:00Z' }, null, { statut: 'recue' })],
      'POST /billing/f1/reponse': [200, { statut: 'accepte' }],
      'POST /orders/o1/status': [200, { statut: 'validee' }],
    })
    await button(un.wrapper, 'Accepté : valider la commande')!.trigger('click')
    await flushPromises()
    expect(sent(un.calls)).toEqual([
      { method: 'POST', path: '/billing/f1/reponse', body: { reponse: 'accepte' } },
      { method: 'POST', path: '/orders/o1/status', body: { statut: 'validee' } },
    ])
    expect(un.wrapper.text()).toContain('Devis accepté et commande validée')

    const deja = await mountAt(BillingDocView, '/factures/f1', {
      'GET /billing/f1': [200, detail({ ...devis, statut: 'accepte', reponse: 'accepte' }, null, { statut: 'recue' })],
      'POST /orders/o1/status': [200, { statut: 'validee' }],
    })
    expect(button(deja.wrapper, 'Accepté : valider la commande')).toBeUndefined()
    await button(deja.wrapper, 'Valider la commande')!.trigger('click')
    await flushPromises()
    expect(sent(deja.calls)).toEqual([{ method: 'POST', path: '/orders/o1/status', body: { statut: 'validee' } }])

    const annule = await mountAt(BillingDocView, '/factures/f1', { 'GET /billing/f1': [200, detail({ ...devis, statut: 'expire' }, null, { statut: 'recue' })] })
    expect(button(annule.wrapper, 'Valider la commande')).toBeUndefined()
  })
})
