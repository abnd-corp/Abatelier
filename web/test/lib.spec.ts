import { describe, expect, it } from 'vitest'
import { checkPassword } from '@/lib/password'
import { HOME, safeRedirect } from '@/lib/redirect'
import { describe as describeEntry, type AuditEntry } from '@/lib/audit-labels'

describe('checkPassword', () => {
  const ctx = { identifiant: 'paul', nom: 'Paul Martin' }

  it('est invalide et « trop faible » quand c’est vide ou court', () => {
    expect(checkPassword('', ctx)).toMatchObject({ valid: false, score: 0 })
    expect(checkPassword('Court-1', ctx).valid).toBe(false)
  })

  it('refuse les mots de passe courants, même avec des chiffres', () => {
    const r = checkPassword('azerty123456', ctx)
    expect(r.valid).toBe(false)
    expect(r.rules.find((x) => x.label.startsWith('Pas un mot'))!.ok).toBe(false)
  })

  it('refuse un mot de passe qui contient le nom', () => {
    expect(checkPassword('martin-tole-2026', ctx).valid).toBe(false)
  })

  it('note mieux un mot de passe long et varié', () => {
    const ok = checkPassword('Tole-pliee-bleu-42', ctx)
    const great = checkPassword('Cintreuse-Rouge-Atelier-2026!', ctx)
    expect(ok.valid).toBe(true)
    expect(great.score).toBeGreaterThan(ok.score)
    expect(great.label).toBe('Excellent')
  })
})

describe('safeRedirect', () => {
  it.each([
    ['/utilisateurs', '/utilisateurs'],
    ['/journal?user=1', '/journal?user=1'],
    ['//site-pirate.example', HOME],
    ['/\\site-pirate.example', HOME],
    ['https://site-pirate.example', HOME],
    ['javascript:alert(1)', HOME],
    [undefined, HOME],
    [['/a', '/b'], HOME],
  ])('%s → %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected)
  })
})

describe('Libellés du journal', () => {
  const base: AuditEntry = {
    id: 1,
    at: '2026-10-19T10:00:00Z',
    action: '',
    identifiant: 'chef',
    nom: 'Le Chef',
    userId: 'u1',
    targetType: null,
    targetId: null,
    targetName: null,
    ip: '1.2.3.4',
    device: 'Firefox sur Linux',
    details: null,
  }

  it('affiche les échecs en rouge avec l’identifiant tapé', () => {
    const r = describeEntry({ ...base, action: 'login.failed', userId: null, identifiant: 'inconnu' })
    expect(r).toEqual({ text: 'Échec de connexion avec l’identifiant « inconnu »', tone: 'bad' })
  })

  it('décrit une création de compte', () => {
    const r = describeEntry({ ...base, action: 'user.created', details: { nom: 'Paul Martin', role: 'atelier' } })
    expect(r.text).toBe('A créé le compte de Paul Martin (atelier)')
  })

  it('décrit un changement de rôle', () => {
    const r = describeEntry({ ...base, action: 'user.updated', targetName: 'Paul', details: { role: { avant: 'atelier', apres: 'direction' } } })
    expect(r.text).toBe('A modifié le compte de Paul : rôle atelier → direction')
  })

  it('affiche l’action brute si elle est inconnue (nouvelle action non traduite)', () => {
    expect(describeEntry({ ...base, action: 'commande.validee' }).text).toBe('commande.validee')
  })
})
