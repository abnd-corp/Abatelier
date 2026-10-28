import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MailPreview from '@/components/site-admin/MailPreview.vue'
import { freshPinia, mockApi } from './helpers'

const MODELES = [
  { id: 'commande-confirmee', titre: 'Commande confirmée (au client)', audience: 'client' },
  { id: 'alerte-commande', titre: 'Commande payée (alerte à l’équipe)', audience: 'equipe' },
]
const APERCU = (id: string) => ({
  id,
  titre: id === 'alerte-commande' ? 'Commande payée (alerte à l’équipe)' : 'Commande confirmée (au client)',
  sujet: id === 'alerte-commande' ? 'Commande boutique payée : C-2026-0042' : 'Votre commande C-2026-0042 est confirmée',
  texte: `Texte brut de ${id}`,
  html: `<html><body><p>Rendu de ${id}</p></body></html>`,
})

async function mountPreview(props: { configure: boolean; adresse?: string }, extra: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({
    'GET /mail/apercu': [200, { modeles: MODELES }],
    'GET /mail/apercu/commande-confirmee': [200, APERCU('commande-confirmee')],
    'GET /mail/apercu/alerte-commande': [200, APERCU('alerte-commande')],
    ...extra,
  })
  const wrapper = mount(MailPreview, { props, global: { plugins: [freshPinia()] } })
  await flushPromises()
  return { wrapper, calls }
}
const chip = (w: ReturnType<typeof mount>, text: string) => w.findAll('button.chip').find((b) => b.text().includes(text))!

beforeEach(() => document.body.replaceChildren())

describe('Aperçu des messages', () => {
  it('affiche le premier message dans un cadre isolé, avec son objet', async () => {
    const { wrapper } = await mountPreview({ configure: true })
    expect(
      wrapper
        .findAll('[role="group"]')[0]!
        .findAll('button')
        .map((b) => b.text()),
    ).toEqual(MODELES.map((m) => m.titre))
    expect(wrapper.text()).toContain('Votre commande C-2026-0042 est confirmée')
    const frame = wrapper.get('iframe')
    // Aucun script ni lien actif possible dans l'aperçu : cadre sans aucune permission
    expect(frame.attributes('sandbox')).toBe('')
    expect(frame.attributes('srcdoc')).toContain('Rendu de commande-confirmee')
    expect(frame.attributes('title')).toBe('Aperçu : Commande confirmée (au client)')
  })

  it('change de message d’un clic', async () => {
    const { wrapper, calls } = await mountPreview({ configure: true })
    await chip(wrapper, 'alerte à l’équipe').trigger('click')
    await flushPromises()
    expect(wrapper.get('iframe').attributes('srcdoc')).toContain('Rendu de alerte-commande')
    expect(wrapper.text()).toContain('Commande boutique payée : C-2026-0042')
    expect(calls.filter((c) => c.path.startsWith('/mail/apercu/')).map((c) => c.path)).toEqual(['/mail/apercu/commande-confirmee', '/mail/apercu/alerte-commande'])
  })

  it('montre le rendu sur téléphone, puis le texte brut', async () => {
    const { wrapper } = await mountPreview({ configure: true })
    expect(wrapper.get('.cadre').classes()).toContain('ordinateur')
    await chip(wrapper, 'Téléphone').trigger('click')
    expect(wrapper.get('.cadre').classes()).toContain('telephone')
    expect(chip(wrapper, 'Téléphone').attributes('aria-pressed')).toBe('true')
    await chip(wrapper, 'Texte brut').trigger('click')
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.get('pre').text()).toBe('Texte brut de commande-confirmee')
    await chip(wrapper, 'Ordinateur').trigger('click')
    expect(wrapper.find('iframe').exists()).toBe(true)
  })

  it('envoie l’exemple à l’adresse indiquée, préremplie avec celle des alertes', async () => {
    const { wrapper, calls } = await mountPreview({ configure: true, adresse: 'direction@aps.test' }, { 'POST /mail/apercu/commande-confirmee/envoyer': [200, { ok: true }] })
    expect((wrapper.get('#apercu-to').element as HTMLInputElement).value).toBe('direction@aps.test')
    await wrapper.get('#apercu-to').setValue('moi@exemple.fr')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({ path: '/mail/apercu/commande-confirmee/envoyer', body: { to: 'moi@exemple.fr' } })
    expect(wrapper.get('[role="status"]').text()).toContain('Exemple envoyé')
  })

  it('dit pourquoi l’envoi a échoué', async () => {
    const { wrapper } = await mountPreview(
      { configure: true },
      { 'POST /mail/apercu/commande-confirmee/envoyer': [502, { error: 'L’exemple n’est pas parti : identifiants refusés par le serveur de messagerie.' }] },
    )
    await wrapper.get('#apercu-to').setValue('moi@exemple.fr')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('identifiants refusés')
  })

  it('montre l’aperçu mais pas l’envoi quand la messagerie n’est pas configurée', async () => {
    const { wrapper } = await mountPreview({ configure: false })
    expect(wrapper.find('iframe').exists()).toBe(true)
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('doit d’abord être configuré')
  })

  it('affiche l’erreur de chargement', async () => {
    const calls = mockApi({ 'GET /mail/apercu': [500, { error: 'Le serveur a rencontré un problème.' }] })
    const wrapper = mount(MailPreview, { props: { configure: true }, global: { plugins: [freshPinia()] } })
    await flushPromises()
    expect(calls).toHaveLength(1)
    expect(wrapper.get('[role="alert"]').text()).toContain('problème')
    expect(wrapper.find('iframe').exists()).toBe(false)
  })
})
