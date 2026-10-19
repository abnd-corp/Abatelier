// Même règles que l'API (api/src/auth/password-policy.ts). Ici, elles servent seulement à guider
// la saisie : c'est le serveur qui décide.
export const PASSWORD_MIN = 12

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

export interface PasswordCheck {
  rules: { label: string; ok: boolean }[]
  score: 0 | 1 | 2 | 3 | 4
  label: string
  valid: boolean
}

const LABELS = ['Trop faible', 'Faible', 'Correct', 'Bon', 'Excellent']

export function checkPassword(pw: string, ctx: { identifiant?: string; nom?: string } = {}): PasswordCheck {
  const n = normalize(pw)
  const root = n.replace(/\d+$/, '')
  const parts = [ctx.identifiant, ...(ctx.nom?.split(/\s+/) ?? [])].map((p) => (p ? normalize(p) : '')).filter((p) => p.length >= 4)

  const rules = [
    { label: `Au moins ${PASSWORD_MIN} caractères`, ok: pw.length >= PASSWORD_MIN },
    { label: 'Pas un mot de passe courant', ok: pw.length > 0 && !COMMON.includes(n) && !COMMON.includes(root) && new Set(pw).size >= 5 },
    { label: 'Ne contient pas votre identifiant ni votre nom', ok: pw.length > 0 && !parts.some((p) => n.includes(p)) },
  ]
  const valid = rules.every((r) => r.ok)

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((re) => re.test(pw)).length
  let score = pw.length >= 20 ? 3 : pw.length >= 16 ? 2 : pw.length >= PASSWORD_MIN ? 1 : 0
  if (classes >= 3) score += 1
  if (!valid) score = Math.min(score, pw.length >= PASSWORD_MIN ? 1 : 0)
  const s = Math.min(score, 4) as PasswordCheck['score']
  return { rules, score: s, label: LABELS[s]!, valid }
}
