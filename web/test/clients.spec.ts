import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ClientsView from '@/views/ClientsView.vue'
import ClientNewView from '@/views/ClientNewView.vue'
import ClientView from '@/views/ClientView.vue'
import { clientName, contactName, hasIdentity, place, toFields, emptyClient, type Client, type ClientSite, type ClientSummary } from '@/lib/clients'
import { describe as describeEntry, type AuditEntry } from '@/lib/audit-labels'
import { useAuthStore, type User } from '@/stores/auth'
import { ADMIN, RH, freshPinia, makeRouter, mockApi } from './helpers'

const DUPONT: Client = {
  id: 'c1',
  type: 'particulier',
  raisonSociale: null,
  siret: null,
  tvaIntra: null,
  prenom: 'Jean',
  nom: 'Dupont',
  email: 'jean.dupont@exemple.fr',
  telephone: '06 12 34 56 78',
  adresse: '3 rue des Lilas',
  codePostal: '42490',
  ville: 'Fraisses',
  origine: 'telephone',
  notes: 'Code portail 1234',
  archivedAt: null,
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-01T08:00:00Z',
}
const TOITURES: Client = {
  ...DUPONT,
  id: 'c2',
  type: 'professionnel',
  raisonSociale: 'Toitures du Forez',
  siret: '732 829 320 00074',
  tvaIntra: 'FR12345678901',
  prenom: 'Luc',
  nom: 'Morel',
  ville: 'Firminy',
  codePostal: '42700',
  origine: 'atelier',
  email: null,
}
const CHANTIER: ClientSite = { id: 's1', libelle: 'Maison Rivière', adresse: '12 chemin du Bois', codePostal: '42700', ville: 'Firminy' }

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

describe('Outils clients', () => {
  it('nomme un client selon son type', () => {
    expect(clientName(DUPONT)).toBe('Jean Dupont')
    expect(clientName({ ...DUPONT, prenom: null })).toBe('Dupont')
    expect(clientName(TOITURES)).toBe('Toitures du Forez')
    expect(contactName(TOITURES)).toBe('Luc Morel')
    expect(contactName(DUPONT)).toBe('')
    expect(place(DUPONT)).toBe('42490 Fraisses')
    expect(place({ codePostal: null, ville: null })).toBe('')
  })

  it('exige le nom d’un particulier ou la raison sociale d’un professionnel', () => {
    expect(hasIdentity({ ...emptyClient(), nom: 'Dupont' })).toBe(true)
    expect(hasIdentity({ ...emptyClient(), type: 'professionnel', nom: 'Dupont' })).toBe(false)
    expect(hasIdentity({ ...emptyClient(), type: 'professionnel', raisonSociale: ' ' })).toBe(false)
    expect(toFields(TOITURES).email).toBe('')
  })

  it('décrit les actions sur les clients dans le journal', () => {
    const e = (action: string, details: object) => describeEntry({ action, details } as unknown as AuditEntry).text
    expect(e('client.created', { nom: 'Toitures du Forez', type: 'professionnel' })).toBe('A ajouté le client Toitures du Forez (professionnel)')
    expect(e('client.updated', { nom: 'Jean Dupont', champs: ['ville', 'notes'] })).toBe('A modifié la fiche de Jean Dupont (ville, notes)')
    expect(e('client.archived', { nom: 'Jean Dupont' })).toBe('A archivé le client Jean Dupont')
    expect(e('client.site_added', { nom: 'Jean Dupont', chantier: 'Maison Rivière', ville: 'Firminy' })).toBe('A ajouté le chantier « Maison Rivière » (Firminy) à Jean Dupont')
    expect(e('client.site_removed', { nom: 'Jean Dupont', chantier: 'Maison Rivière' })).toBe('A retiré le chantier « Maison Rivière » de Jean Dupont')
  })
})

describe('Liste des clients', () => {
  const summary = (c: Client): ClientSummary => c
  const LIST = { clients: [summary(DUPONT), summary(TOITURES)], totals: { particulier: 1, professionnel: 1, archives: 3 } }

  it('affiche les clients, leur ville, leur type et les totaux', async () => {
    const { wrapper } = await mountAt(ClientsView, '/clients', { 'GET /clients': [200, LIST] })
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('Jean Dupont')
    expect(rows[0]!.text()).toContain('42490 Fraisses')
    expect(rows[0]!.text()).toContain('Par téléphone')
    expect(rows[1]!.text()).toContain('Toitures du Forez')
    expect(rows[1]!.text()).toContain('Pro')
    expect(rows[1]!.text()).toContain('Luc Morel')
    expect(wrapper.findAll('.chip').map((c) => c.text())).toEqual(['Tous 2', 'Particuliers 1', 'Professionnels 1', 'Archivés 3'])
  })

  it('filtre et cherche en gardant le filtre dans l’adresse', async () => {
    const { wrapper, router, calls } = await mountAt(ClientsView, '/clients', { 'GET /clients': [200, LIST] })
    await wrapper.findAll('.chip')[2]!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.filtre).toBe('professionnel')
    expect(calls.at(-1)!.path).toBe('/clients?filtre=professionnel')
    await wrapper.get('#client-search').setValue('forez')
    await new Promise((r) => setTimeout(r, 300))
    await flushPromises()
    expect(calls.at(-1)!.path).toBe('/clients?filtre=professionnel&q=forez')
  })

  it('ouvre la fiche au clic sur une ligne', async () => {
    const { wrapper, router } = await mountAt(ClientsView, '/clients', { 'GET /clients': [200, LIST] })
    await wrapper.findAll('tbody tr')[1]!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/clients/c2')
  })

  it('invite à ajouter le premier client, sauf à la RH', async () => {
    const empty = { clients: [], totals: { particulier: 0, professionnel: 0, archives: 0 } }
    const { wrapper } = await mountAt(ClientsView, '/clients', { 'GET /clients': [200, empty] })
    expect(wrapper.text()).toContain('Aucun client pour l’instant.')
    expect(wrapper.find('a[href="/clients/nouveau"]').exists()).toBe(true)
    const rh = await mountAt(ClientsView, '/clients', { 'GET /clients': [200, empty] }, RH)
    expect(rh.wrapper.find('a[href="/clients/nouveau"]').exists()).toBe(false)
  })
})

describe('Nouveau client', () => {
  it('montre les champs entreprise pour un professionnel et envoie la fiche', async () => {
    const { wrapper, router, calls } = await mountAt(ClientNewView, '/clients/nouveau', { 'POST /clients': [201, { id: 'c9' }] })
    const submit = wrapper.get('button[type="submit"]')
    expect(wrapper.find('#c-raison').exists()).toBe(false)
    await wrapper.get('#c-nom').setValue('Morel')
    expect(submit.attributes('disabled')).toBeUndefined()
    await wrapper.get('input[value="professionnel"]').setValue(true)
    expect(wrapper.find('#c-raison').exists()).toBe(true)
    // Il faut maintenant la raison sociale
    expect(submit.attributes('disabled')).toBeDefined()
    await wrapper.get('#c-raison').setValue('Toitures du Forez')
    await wrapper.get('#c-siret').setValue('73282932000074')
    await wrapper.get('#c-origine').setValue('telephone')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const body = calls.find((c) => c.method === 'POST')!.body
    expect(body).toMatchObject({ type: 'professionnel', raisonSociale: 'Toitures du Forez', nom: 'Morel', siret: '73282932000074', origine: 'telephone' })
    expect(router.currentRoute.value.fullPath).toBe('/clients/c9')
  })

  it('affiche l’erreur sous le champ, et propose la fiche existante pour un e-mail déjà pris', async () => {
    const { wrapper } = await mountAt(ClientNewView, '/clients/nouveau', {
      'POST /clients': [409, { error: 'Un client existe déjà avec cette adresse e-mail.', field: 'email', clientId: 'c1' }],
    })
    await wrapper.get('#c-nom').setValue('Dupont')
    await wrapper.get('#c-email').setValue('jean.dupont@exemple.fr')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#c-email').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('[role="alert"] a').attributes('href')).toBe('/clients/c1')
  })
})

describe('Fiche client', () => {
  const DETAIL = { client: TOITURES, sites: [CHANTIER], activity: [] }

  it('affiche coordonnées, entreprise, notes et chantiers', async () => {
    const { wrapper } = await mountAt(ClientView, '/clients/c2', { 'GET /clients/c2': [200, DETAIL] })
    expect(wrapper.get('h1').text()).toBe('Toitures du Forez')
    expect(wrapper.text()).toContain('Professionnel · Luc Morel')
    expect(wrapper.text()).toContain('732 829 320 00074')
    expect(wrapper.text()).toContain('Code portail 1234')
    expect(wrapper.text()).toContain('Maison Rivière')
    expect(wrapper.text()).toContain('12 chemin du Bois, 42700 Firminy')
    expect(wrapper.get('a[href^="tel:"]').attributes('href')).toBe('tel:0612345678')
  })

  it('modifie la fiche puis la recharge', async () => {
    const { wrapper, calls } = await mountAt(ClientView, '/clients/c2', { 'GET /clients/c2': [200, DETAIL], 'PATCH /clients/c2': [200, { ok: true }] })
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Modifier la fiche'))!
      .trigger('click')
    expect((wrapper.get('#c-raison').element as HTMLInputElement).value).toBe('Toitures du Forez')
    await wrapper.get('#c-ville').setValue('Unieux')
    await wrapper.get('form.edit-form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ ville: 'Unieux', email: '' })
    expect(wrapper.text()).toContain('Fiche enregistrée.')
  })

  it('ajoute une adresse de chantier et affiche l’erreur sous le bon champ', async () => {
    let fail = true
    const { wrapper, calls } = await mountAt(ClientView, '/clients/c2', {
      'GET /clients/c2': [200, DETAIL],
      'POST /clients/c2/sites': () => (fail ? [400, { error: 'Code postal : 5 chiffres.', field: 'codePostal' }] : [201, { id: 's2' }]),
    })
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Ajouter')!
      .trigger('click')
    await wrapper.get('#s-libelle').setValue('Garage')
    await wrapper.get('#s-adresse').setValue('1 rue Haute')
    await wrapper.get('#s-cp').setValue('427')
    await wrapper.get('#s-ville').setValue('Firminy')
    await wrapper.get('form.site-form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#s-cp').attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('Code postal : 5 chiffres.')
    fail = false
    await wrapper.get('#s-cp').setValue('42700')
    await wrapper.get('form.site-form').trigger('submit')
    await flushPromises()
    expect(calls.filter((c) => c.method === 'POST').at(-1)!.body).toEqual({ libelle: 'Garage', adresse: '1 rue Haute', codePostal: '42700', ville: 'Firminy' })
    expect(wrapper.find('form.site-form').exists()).toBe(false)
  })

  it('retire une adresse après confirmation', async () => {
    const { wrapper, calls } = await mountAt(ClientView, '/clients/c2', { 'GET /clients/c2': [200, DETAIL], 'DELETE /clients/c2/sites/s1': [200, { ok: true }] })
    await wrapper.get('button[aria-label="Retirer Maison Rivière"]').trigger('click')
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Retirer')!
      .trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/clients/c2/sites/s1')).toBe(true)
  })

  it('archive le client après confirmation', async () => {
    const { wrapper, calls } = await mountAt(ClientView, '/clients/c2', { 'GET /clients/c2': [200, DETAIL], 'POST /clients/c2/archive': [200, { ok: true }] })
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Archiver le client')!
      .trigger('click')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Confirmer')!
      .trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.method === 'POST' && c.path === '/clients/c2/archive')).toBe(true)
    expect(wrapper.text()).toContain('Client archivé')
  })

  it('laisse la RH consulter sans rien modifier', async () => {
    const { wrapper } = await mountAt(ClientView, '/clients/c2', { 'GET /clients/c2': [200, DETAIL] }, RH)
    expect(wrapper.text()).toContain('Maison Rivière')
    const labels = wrapper.findAll('button').map((b) => b.text() || b.attributes('aria-label'))
    expect(labels).toEqual([])
  })

  it('affiche l’erreur de chargement', async () => {
    const { wrapper } = await mountAt(ClientView, '/clients/zz', { 'GET /clients/zz': [404, { error: 'Client introuvable.' }] })
    expect(wrapper.get('[role="alert"]').text()).toBe('Client introuvable.')
  })
})
