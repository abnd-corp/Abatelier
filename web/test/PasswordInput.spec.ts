import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PasswordInput from '@/components/PasswordInput.vue'

describe('PasswordInput', () => {
  const make = () => mount(PasswordInput, { props: { id: 'pw', autocomplete: 'current-password', modelValue: 'secret' } })

  it('masque le mot de passe par défaut', () => {
    const w = make()
    expect(w.get('input').attributes('type')).toBe('password')
    expect(w.get('button').attributes('aria-label')).toBe('Afficher le mot de passe')
    expect(w.get('button').attributes('aria-pressed')).toBe('false')
  })

  it('l’œil affiche puis masque le mot de passe', async () => {
    const w = make()
    const eye = w.get('button')
    await eye.trigger('click')
    expect(w.get('input').attributes('type')).toBe('text')
    expect(eye.attributes('aria-label')).toBe('Masquer le mot de passe')
    expect(eye.attributes('aria-pressed')).toBe('true')
    await eye.trigger('click')
    expect(w.get('input').attributes('type')).toBe('password')
  })

  it('le bouton œil ne soumet pas le formulaire', () => {
    expect(make().get('button').attributes('type')).toBe('button')
  })

  it('met à jour la valeur (v-model)', async () => {
    const w = make()
    await w.get('input').setValue('nouveau')
    expect(w.emitted('update:modelValue')![0]).toEqual(['nouveau'])
  })

  it('signale une erreur aux lecteurs d’écran', () => {
    const w = mount(PasswordInput, { props: { id: 'pw', autocomplete: 'new-password', modelValue: '', invalid: true } })
    expect(w.get('input').attributes('aria-invalid')).toBe('true')
  })
})
