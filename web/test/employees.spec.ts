import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import EmployeesView from '@/views/EmployeesView.vue'
import EmployeeNewView from '@/views/EmployeeNewView.vue'
import EmployeeView from '@/views/EmployeeView.vue'
import { accountStatus, employmentStatus, formatDay, suggestIdentifiant, type Employee } from '@/lib/employees'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { ADMIN, RH, freshPinia, makeRouter, mockApi } from './helpers'

const PAUL: Employee = {
  id: 'e1',
  prenom: 'Paul',
  nom: 'Martin',
  poste: 'Plieur',
  contrat: 'cdi',
  dateEntree: '2024-03-01',
  dateSortie: null,
  telephone: '06 12 34 56 78',
  email: 'paul@exemple.fr',
  notes: 'Permis cariste',
  account: { id: 'u1', identifiant: 'paul', role: 'atelier', disabledAt: null, mustChangePassword: false, lastLoginAt: null, activeSessions: 2 },
}
const MARIE: Employee = { ...PAUL, id: 'e2', prenom: 'Marie', nom: 'Durand', poste: null, contrat: null, telephone: null, account: null }

async function mountAt(component: object, path: string, routes: Parameters<typeof mockApi>[0]) {
  const calls = mockApi(routes)
  const pinia = freshPinia()
  useAuthStore().user = ADMIN
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(component, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, calls }
}

describe('Outils salariés', () => {
  it('propose un identifiant sans accents ni espaces', () => {
    expect(suggestIdentifiant('Léa-Marie', 'Durand')).toBe('lea-marie')
    expect(suggestIdentifiant('Jean François')).toBe('jean-francois')
    expect(suggestIdentifiant('Al', 'Roux')).toBe('al.roux')
  })

  it('décrit la situation par rapport à aujourd’hui', () => {
    expect(employmentStatus({ dateSortie: null }, '2026-10-19')).toEqual({ label: 'En poste', tone: 'ok' })
    expect(employmentStatus({ dateSortie: '2026-11-30' }, '2026-10-19')).toEqual({ label: 'Départ prévu le 30 novembre 2026', tone: 'warn' })
    expect(employmentStatus({ dateSortie: '2026-10-19' }, '2026-10-19').label).toBe('Parti le 19 octobre 2026')
  })

  it('formate les dates en français et sans décalage de fuseau', () => {
    expect(formatDay('2024-03-01')).toBe('1er mars 2024')
    expect(formatDay('2024-03-12')).toBe('12 mars 2024')
    expect(formatDay(null)).toBe('—')
  })

  it('résume l’état du compte', () => {
    expect(accountStatus(null).label).toBe('Pas de compte')
    expect(accountStatus({ ...PAUL.account!, mustChangePassword: true }).label).toBe('Mot de passe à changer')
    expect(accountStatus({ ...PAUL.account!, disabledAt: '2026-01-01' }).label).toBe('Désactivé')
  })
})

describe('Liste des salariés', () => {
  const LIST = { employees: [MARIE, PAUL], totals: { actifs: 2, partis: 1 } }

  it('affiche les salariés, leur poste, leur compte et les totaux', async () => {
    const { wrapper } = await mountAt(EmployeesView, '/salaries', { 'GET /employees': [200, LIST] })
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[1]!.text()).toContain('Paul Martin')
    expect(rows[1]!.text()).toContain('Plieur')
    expect(rows[1]!.text()).toContain('CDI')
    expect(rows[1]!.text()).toContain('paul')
    expect(rows[0]!.text()).toContain('Pas de compte')
    expect(wrapper.findAll('.chip').map((c) => c.text())).toEqual(['En poste 2', 'Partis 1', 'Tous 3'])
  })

  it('ouvre la fiche au clic sur une ligne', async () => {
    const { wrapper, router } = await mountAt(EmployeesView, '/salaries', { 'GET /employees': [200, LIST] })
    await wrapper.findAll('tbody tr')[1]!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/salaries/e1')
  })

  it('filtre par situation et garde le filtre dans l’adresse', async () => {
    const { wrapper, router, calls } = await mountAt(EmployeesView, '/salaries', { 'GET /employees': [200, LIST] })
    await wrapper.findAll('.chip')[1]!.trigger('click')
    await flushPromises()
    expect(calls.at(-1)!.path).toBe('/employees?statut=partis')
    expect(router.currentRoute.value.query.statut).toBe('partis')
  })

  it('cherche après une courte pause de saisie', async () => {
    vi.useFakeTimers()
    const { wrapper, calls } = await mountAt(EmployeesView, '/salaries', { 'GET /employees': [200, LIST] })
    await wrapper.get('#employee-search').setValue('mart')
    expect(calls).toHaveLength(1)
    vi.advanceTimersByTime(300)
    vi.useRealTimers()
    await flushPromises()
    expect(calls.at(-1)!.path).toBe('/employees?statut=actifs&q=mart')
  })

  it('invite à ajouter le premier salarié quand la liste est vide', async () => {
    const { wrapper } = await mountAt(EmployeesView, '/salaries', { 'GET /employees': [200, { employees: [], totals: { actifs: 0, partis: 0 } }] })
    expect(wrapper.text()).toContain('Aucun salarié pour l’instant')
    expect(wrapper.find('a[href="/salaries/nouveau"]').exists()).toBe(true)
  })
})

describe('Ajout d’un salarié', () => {
  it('propose l’identifiant à partir du prénom, puis respecte la saisie de l’admin', async () => {
    const { wrapper } = await mountAt(EmployeeNewView, '/salaries/nouveau', {})
    await wrapper.get('#f-prenom').setValue('Léa')
    expect((wrapper.get('#f-identifiant').element as HTMLInputElement).value).toBe('lea')
    await wrapper.get('#f-identifiant').setValue('lmartin')
    await wrapper.get('#f-prenom').setValue('Léane')
    expect((wrapper.get('#f-identifiant').element as HTMLInputElement).value).toBe('lmartin')
  })

  it('envoie la fiche et le compte, puis ouvre la fiche avec le mot de passe temporaire', async () => {
    const { wrapper, router, calls } = await mountAt(EmployeeNewView, '/salaries/nouveau', {
      'POST /employees': [201, { id: 'e9', tempPassword: 'aaaa-bbbb-cccc-dddd' }],
    })
    await wrapper.get('#f-prenom').setValue('Paul')
    await wrapper.get('#f-nom').setValue('Martin')
    await wrapper.get('#f-poste').setValue('Plieur')
    await wrapper.get('#f-contrat').setValue('cdi')
    await wrapper.get('#f-role').setValue('direction')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls[0]!.body).toMatchObject({ prenom: 'Paul', nom: 'Martin', poste: 'Plieur', contrat: 'cdi', compte: { identifiant: 'paul', role: 'direction' } })
    expect(router.currentRoute.value.fullPath).toBe('/salaries/e9')
    expect(useUiStore().tempPassword).toEqual({ for: '/salaries/e9', nom: 'Paul Martin', identifiant: 'paul', password: 'aaaa-bbbb-cccc-dddd' })
  })

  it('sans compte, n’envoie pas de compte', async () => {
    const { wrapper, calls } = await mountAt(EmployeeNewView, '/salaries/nouveau', { 'POST /employees': [201, { id: 'e9', tempPassword: null }] })
    await wrapper.get('#f-prenom').setValue('Marie')
    await wrapper.get('#f-nom').setValue('Durand')
    await wrapper.get('#f-with-account').setValue(false)
    expect(wrapper.find('#f-identifiant').exists()).toBe(false)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls[0]!.body.compte).toBeNull()
    expect(useUiStore().tempPassword).toBeNull()
  })

  it('affiche l’erreur sous le champ concerné', async () => {
    const { wrapper } = await mountAt(EmployeeNewView, '/salaries/nouveau', {
      'POST /employees': [400, { error: 'Adresse e-mail invalide.', field: 'email' }],
    })
    await wrapper.get('#f-prenom').setValue('Paul')
    await wrapper.get('#f-nom').setValue('Martin')
    await wrapper.get('#f-email').setValue('nimporte')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#f-email').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#f-email').element.parentElement!.textContent).toContain('Adresse e-mail invalide.')
  })
})

describe('Fiche salarié', () => {
  const FICHE = (e: Employee = PAUL) => ({
    employee: e,
    activity: [{ id: 1, at: new Date().toISOString(), action: 'login.success', identifiant: 'paul', nom: 'Paul Martin', userId: 'u1', targetType: null, targetId: null, targetName: 'Paul Martin', ip: null, device: 'Firefox sur Linux', details: {} }],
  })

  it('affiche les informations, le compte et l’activité', async () => {
    const { wrapper } = await mountAt(EmployeeView, '/salaries/e1', { 'GET /employees/e1': [200, FICHE()] })
    expect(wrapper.get('h1').text()).toBe('Paul Martin')
    expect(wrapper.text()).toContain('En poste')
    expect(wrapper.text()).toContain('1er mars 2024')
    expect(wrapper.get('a[href="tel:0612345678"]').text()).toBe('06 12 34 56 78')
    expect(wrapper.text()).toContain('Permis cariste')
    expect(wrapper.text()).toContain('paul')
    expect(wrapper.text()).toContain('Connexion')
    expect(useUiStore().crumb).toEqual({ for: '/salaries/e1', label: 'Paul Martin' })
  })

  it('affiche une seule fois le mot de passe temporaire prévu pour cette fiche', async () => {
    const pinia = freshPinia()
    useAuthStore().user = ADMIN
    useUiStore().tempPassword = { for: '/salaries/e1', nom: 'Paul Martin', identifiant: 'paul', password: 'aaaa-bbbb-cccc-dddd' }
    mockApi({ 'GET /employees/e1': [200, FICHE()] })
    const router = makeRouter()
    await router.push('/salaries/e1')
    const wrapper = mount(EmployeeView, { global: { plugins: [pinia, router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('aaaa-bbbb-cccc-dddd')
    await wrapper.findAll('button').find((b) => b.text() === 'J’ai noté')!.trigger('click')
    expect(wrapper.text()).not.toContain('aaaa-bbbb-cccc-dddd')
    expect(useUiStore().tempPassword).toBeNull()
  })

  it('modifie la fiche sur place', async () => {
    const { wrapper, calls } = await mountAt(EmployeeView, '/salaries/e1', {
      'GET /employees/e1': [200, FICHE()],
      'PATCH /employees/e1': [200, { ok: true, accountDisabled: false }],
    })
    await wrapper.findAll('button').find((b) => b.text().includes('Modifier la fiche'))!.trigger('click')
    expect((wrapper.get('#f-poste').element as HTMLInputElement).value).toBe('Plieur')
    await wrapper.get('#f-poste').setValue('Chef d’atelier')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ poste: 'Chef d’atelier', prenom: 'Paul' })
    expect(wrapper.text()).toContain('Fiche enregistrée.')
  })

  it('prévient quand la date de sortie a désactivé le compte', async () => {
    const { wrapper } = await mountAt(EmployeeView, '/salaries/e1', {
      'GET /employees/e1': [200, FICHE()],
      'PATCH /employees/e1': [200, { ok: true, accountDisabled: true }],
    })
    await wrapper.findAll('button').find((b) => b.text().includes('Modifier la fiche'))!.trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('son compte a été désactivé')
  })

  it('crée un compte pour un salarié qui n’en a pas', async () => {
    const { wrapper, calls } = await mountAt(EmployeeView, '/salaries/e2', {
      'GET /employees/e2': [200, FICHE(MARIE)],
      'POST /employees/e2/account': [201, { id: 'u2', tempPassword: 'eeee-ffff-gggg-hhhh' }],
    })
    expect(wrapper.text()).toContain('n’a pas de compte')
    await wrapper.findAll('button').find((b) => b.text().includes('Créer un compte de connexion'))!.trigger('click')
    expect((wrapper.get('#new-identifiant').element as HTMLInputElement).value).toBe('marie')
    await wrapper.get('.account-form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ identifiant: 'marie', role: 'atelier' })
    expect(wrapper.text()).toContain('eeee-ffff-gggg-hhhh')
  })

  it('demande confirmation avant de désactiver le compte', async () => {
    const { wrapper, calls } = await mountAt(EmployeeView, '/salaries/e1', {
      'GET /employees/e1': [200, FICHE()],
      'POST /users/u1/disable': [200, { ok: true }],
    })
    await wrapper.findAll('button').find((b) => b.text() === 'Désactiver le compte')!.trigger('click')
    expect(calls.some((c) => c.path === '/users/u1/disable')).toBe(false)
    expect(wrapper.text()).toContain('déconnectée partout')
    await wrapper.findAll('button').find((b) => b.text() === 'Confirmer')!.trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.method === 'POST' && c.path === '/users/u1/disable')).toBe(true)
  })

  it('ne propose pas d’actions sur son propre compte', async () => {
    const mine = { ...PAUL, account: { ...PAUL.account!, id: ADMIN.id } }
    const { wrapper } = await mountAt(EmployeeView, '/salaries/e1', { 'GET /employees/e1': [200, FICHE(mine)] })
    expect(wrapper.text()).toContain('C’est votre compte')
    expect(wrapper.findAll('button').some((b) => b.text() === 'Désactiver le compte')).toBe(false)
    expect(wrapper.get('#account-role').attributes('disabled')).toBeDefined()
  })

  it('affiche une erreur si la fiche n’existe pas', async () => {
    const { wrapper } = await mountAt(EmployeeView, '/salaries/zz', { 'GET /employees/zz': [404, { error: 'Salarié introuvable.' }] })
    expect(wrapper.get('[role="alert"]').text()).toBe('Salarié introuvable.')
  })
})

describe('Rôle RH', () => {
  async function asRh(component: object, path: string, routes: Parameters<typeof mockApi>[0]) {
    const calls = mockApi(routes)
    const pinia = freshPinia()
    useAuthStore().user = RH
    const router = makeRouter()
    await router.push(path)
    await router.isReady()
    const wrapper = mount(component, { global: { plugins: [pinia, router] } })
    await flushPromises()
    return { wrapper, calls }
  }

  it('n’affiche pas la création de compte dans le formulaire d’ajout', async () => {
    const { wrapper, calls } = await asRh(EmployeeNewView, '/salaries/nouveau', { 'POST /employees': [201, { id: 'e9', tempPassword: null }] })
    expect(wrapper.find('#f-with-account').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Compte de connexion')
    await wrapper.get('#f-prenom').setValue('Paul')
    await wrapper.get('#f-nom').setValue('Martin')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls[0]!.body.compte).toBeNull()
  })

  it('voit le compte lié sur la fiche, sans pouvoir le gérer', async () => {
    const fiche = { employee: PAUL, activity: [] }
    const { wrapper } = await asRh(EmployeeView, '/salaries/e1', { 'GET /employees/e1': [200, fiche] })
    expect(wrapper.text()).toContain('paul')
    expect(wrapper.text()).toContain('réservée à la direction')
    expect(wrapper.find('#account-role').exists()).toBe(false)
    expect(wrapper.findAll('button').some((b) => ['Désactiver le compte', 'Nouveau mot de passe'].includes(b.text()))).toBe(false)
  })

  it('ne propose pas de créer un compte à un salarié qui n’en a pas', async () => {
    const { wrapper } = await asRh(EmployeeView, '/salaries/e2', { 'GET /employees/e2': [200, { employee: MARIE, activity: [] }] })
    expect(wrapper.text()).toContain('Seule la direction peut lui créer un compte')
    expect(wrapper.findAll('button').some((b) => b.text().includes('Créer un compte'))).toBe(false)
  })
})
