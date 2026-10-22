import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AppLayout from '@/components/AppLayout.vue'
import { useAuthStore, type User } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { ADMIN, ATELIER, RH, freshPinia, makeRouter, mockApi } from './helpers'

async function setup(user: User, path = '/') {
  const pinia = freshPinia()
  useAuthStore().user = user
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(AppLayout, { global: { plugins: [pinia, router] } })
  const nav = () => wrapper.get('nav[aria-label="Navigation principale"]')
  const links = () =>
    nav()
      .findAll('a')
      .map((a) => a.text())
  const sections = () =>
    nav()
      .findAll('.section-title')
      .map((t) => t.text())
  return { wrapper, router, links, sections, nav }
}

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {
    // jsdom sans stockage
  }
})

describe('Menu latéral', () => {
  it('montre toutes les sections à la direction', async () => {
    const { links, sections } = await setup(ADMIN)
    expect(links()).toEqual([
      'Tableau de bord',
      'Commandes',
      'Devis et factures',
      'Clients',
      'Fabrication',
      'Tarifs et catalogue',
      'Modèles de documents',
      'Boutique',
      'Site vitrine',
      'Salariés',
      'Comptes',
      'Journal d’activité',
    ])
    expect(sections()).toEqual(['Ventes', 'Atelier', 'Direction', 'Équipe', 'Administration'])
  })

  it('montre les clients, les salariés et le journal à la RH, sans les comptes', async () => {
    const { links } = await setup(RH)
    expect(links()).toEqual(['Tableau de bord', 'Clients', 'Salariés', 'Journal d’activité'])
  })

  it('ne montre que la fabrication au rôle atelier', async () => {
    const { links, sections } = await setup(ATELIER)
    expect(links()).toEqual(['Tableau de bord', 'Fabrication'])
    expect(sections()).toEqual(['Atelier'])
  })

  it('cache toute la navigation tant que le mot de passe est temporaire', async () => {
    const { links } = await setup({ ...ADMIN, mustChangePassword: true })
    expect(links()).toEqual([])
  })

  it('met en avant « Salariés » sur une fiche salarié', async () => {
    const { nav } = await setup(ADMIN, '/salaries/abc')
    const active = nav().get('[aria-current="page"]')
    expect(active.text()).toBe('Salariés')
  })

  it('se réduit en icônes et retient ce choix', async () => {
    const { wrapper } = await setup(ADMIN)
    const toggle = wrapper.get('button[aria-controls="menu"].collapse-btn')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    await toggle.trigger('click')
    expect(wrapper.get('.shell').classes()).toContain('collapsed')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    // Les libellés restent lisibles par les lecteurs d'écran et en infobulle
    expect(wrapper.get('nav a[title="Salariés"]').text()).toBe('Salariés')
    // Une nouvelle visite retrouve le menu réduit
    const again = await setup(ADMIN)
    expect(again.wrapper.get('.shell').classes()).toContain('collapsed')
  })

  it('le bouton menu ouvre et ferme le tiroir (mobile)', async () => {
    const { wrapper, router } = await setup(ADMIN)
    const burger = wrapper.get('button[aria-label="Ouvrir le menu"]')
    await burger.trigger('click')
    expect(wrapper.get('.shell').classes()).toContain('drawer-open')
    expect(burger.attributes('aria-expanded')).toBe('true')
    // Choisir une page referme le tiroir
    await router.push('/salaries')
    await flushPromises()
    expect(wrapper.get('.shell').classes()).not.toContain('drawer-open')
  })
})

describe('Fil d’Ariane', () => {
  const crumbs = (w: Awaited<ReturnType<typeof setup>>['wrapper']) => w.findAll('nav[aria-label="Fil d’Ariane"] li').map((li) => li.text())

  it('affiche la section et la page', async () => {
    const { wrapper } = await setup(ADMIN, '/utilisateurs')
    expect(crumbs(wrapper)).toEqual(['Équipe', 'Comptes'])
  })

  it('affiche le nom du salarié donné par la page, avec un lien vers la liste', async () => {
    const { wrapper } = await setup(ADMIN, '/salaries/abc')
    expect(crumbs(wrapper)).toEqual(['Équipe', 'Salariés', 'Fiche salarié'])
    useUiStore().crumb = { for: '/salaries/abc', label: 'Paul Martin' }
    await flushPromises()
    expect(crumbs(wrapper)).toEqual(['Équipe', 'Salariés', 'Paul Martin'])
    expect(wrapper.get('nav[aria-label="Fil d’Ariane"] a').attributes('href')).toBe('/salaries')
  })
})

describe('Compte et déconnexion', () => {
  it('montre le nom de la personne connectée', async () => {
    const { wrapper } = await setup(ADMIN)
    expect(wrapper.get('a[aria-label="Mon compte : Le Chef"]').text()).toContain('Le Chef')
  })

  it('déconnecte et renvoie à la page de connexion', async () => {
    const calls = mockApi({ 'POST /auth/logout': [204] })
    const { wrapper, router } = await setup(ADMIN)
    await wrapper.get('button[aria-label="Se déconnecter"]').trigger('click')
    await flushPromises()
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /auth/logout'])
    expect(useAuthStore().user).toBeNull()
    expect(router.currentRoute.value.name).toBe('login')
  })
})
