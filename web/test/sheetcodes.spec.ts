import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import SheetCodes from '@/components/SheetCodes.vue'
import { startScan } from '@/lib/scan'
import { freshPinia, mockApi } from './helpers'

// La caméra est simulée : on garde la fonction appelée à la lecture d'un code
vi.mock('@/lib/scan', () => ({ startScan: vi.fn() }))
let onCode: (code: string) => void = () => {}
const stopCamera = vi.fn()

const FEUILLE = { id: 'f1', libelle: 'Aluminium 1,5 mm · brut · 1 250 × 3 000 mm', codes: ['3760123456789'] }

function setup(routes: Parameters<typeof mockApi>[0], feuille = FEUILLE) {
  const calls = mockApi(routes)
  const wrapper = mount(SheetCodes, { props: { feuille }, global: { plugins: [freshPinia()] } })
  return { wrapper, calls }
}

beforeEach(() => {
  document.body.replaceChildren()
  vi.mocked(startScan).mockReset()
  stopCamera.mockReset()
  vi.mocked(startScan).mockImplementation(async (_video, cb) => ((onCode = cb), stopCamera))
})

describe('Codes-barres d’une référence', () => {
  it('liste les codes de la référence, ou dit qu’il n’y en a pas', () => {
    const { wrapper } = setup({})
    expect(wrapper.text()).toContain('3760123456789')
    expect(wrapper.find('button[aria-label^="Retirer le code 3760123456789"]').exists()).toBe(true)
    wrapper.unmount()
    const vide = setup({}, { ...FEUILLE, codes: [] })
    expect(vide.wrapper.text()).toContain('Aucun code-barres')
  })

  it('associe un code saisi à la référence puis prévient le parent', async () => {
    const { wrapper, calls } = setup({ 'POST /stock/codes': [201, { ok: true }] })
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.get('input').setValue('ab-1234')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ code: 'ab-1234', sheetId: 'f1' })
    expect(wrapper.emitted('changed')).toHaveLength(1)
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('')
  })

  it('montre l’erreur quand le code est déjà pris par une autre référence', async () => {
    const { wrapper } = setup({ 'POST /stock/codes': [409, { error: 'Ce code-barres est déjà associé à « Autre ».', field: 'code' }] })
    await wrapper.get('input').setValue('3760999999999')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('déjà associé')
    expect(wrapper.emitted('changed')).toBeUndefined()
  })

  it('retire un code', async () => {
    const { wrapper, calls } = setup({ 'DELETE /stock/codes/3760123456789': [200, { ok: true }] })
    await wrapper.get('button[aria-label^="Retirer le code"]').trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/stock/codes/3760123456789')).toBe(true)
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('remplit le champ avec le code lu par la caméra', async () => {
    const { wrapper } = setup({})
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Scanner'))!
      .trigger('click')
    await flushPromises()
    expect(startScan).toHaveBeenCalledOnce()
    onCode('3760111122223')
    await flushPromises()
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('3760111122223')
  })

  it('explique pourquoi la caméra ne démarre pas, la saisie reste possible', async () => {
    vi.mocked(startScan).mockRejectedValue(new Error('Caméra refusée : autorisez-la pour ce site.'))
    const { wrapper } = setup({})
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Scanner'))!
      .trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Caméra refusée')
    expect(wrapper.get('input').attributes('disabled')).toBeUndefined()
  })

  it('coupe la caméra quand on quitte l’écran', async () => {
    const { wrapper } = setup({})
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Scanner'))!
      .trigger('click')
    await flushPromises()
    wrapper.unmount()
    expect(stopCamera).toHaveBeenCalled()
  })
})
