import { randomInt } from 'node:crypto'

export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 128

// Mots de passe et racines parmi les plus utilisés (FR et EN). Le front a la même liste pour l'indicateur.
const COMMON = [
  'password', 'motdepasse', 'azerty', 'qwerty', 'azertyuiop', 'qwertyuiop', 'admin', 'administrateur', 'bonjour',
  'soleil', 'loulou', 'chouchou', 'doudou', 'marseille', 'paris', 'saintetienne', 'stephanois', 'asse', 'football',
  'iloveyou', 'jetaime', 'welcome', 'bienvenue', 'letmein', 'monkey', 'dragon', 'master', 'sunshine', 'princess',
  'aluminium', 'pliage', 'atelier', 'fraisses', 'changeme', 'changemoi', 'secret', 'motdepasse123', 'password123',
  '123456789', '1234567890', '123456789012', '000000000000', '111111111111', 'abcdefghijkl', 'aaaaaaaaaaaa',
]

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')

/** Renvoie un message d'erreur si le mot de passe est refusé, sinon null. */
export function checkPasswordPolicy(password: string, ctx: { identifiant?: string; nom?: string } = {}) {
  if (password.length < PASSWORD_MIN) return `Le mot de passe doit faire au moins ${PASSWORD_MIN} caractères.`
  if (password.length > PASSWORD_MAX) return `Le mot de passe doit faire au plus ${PASSWORD_MAX} caractères.`
  const n = normalize(password)
  if (new Set(password).size < 5) return 'Le mot de passe contient trop de caractères répétés.'
  // Retire les chiffres de fin (« azerty2024 » → « azerty ») avant de comparer à la liste
  const root = n.replace(/\d+$/, '')
  if (COMMON.includes(n) || COMMON.includes(root)) return 'Ce mot de passe est trop courant. Choisissez-en un autre.'
  for (const part of [ctx.identifiant, ...(ctx.nom?.split(/\s+/) ?? [])]) {
    const p = part ? normalize(part) : ''
    if (p.length >= 4 && n.includes(p)) return 'Le mot de passe ne doit pas contenir votre identifiant ou votre nom.'
  }
  return null
}

/** Mot de passe temporaire lisible, par exemple « Kx7q-Pm2r-Zt9w-Hb4n ». */
export function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const group = () => Array.from({ length: 4 }, () => chars[randomInt(chars.length)]).join('')
  return [group(), group(), group(), group()].join('-')
}
