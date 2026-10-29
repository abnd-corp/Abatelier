// Choisit les fichiers de tests e2e à lancer.
//   node select.mjs --groupes stock,auth     → les tests de ces groupes
//   node select.mjs --diff origin/dev        → les groupes touchés par les changements depuis cette base
//   node select.mjs --verifier               → échoue si un test n'est dans aucun groupe (ou l'inverse)
// Sortie : « tout », « rien », ou la liste des fichiers séparés par des espaces.
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { GROUPES, TRANSVERSE } from './groupes.mjs'

const fichiers = readdirSync(new URL('./tests/', import.meta.url))
  .filter((f) => f.endsWith('.spec.ts'))
  .map((f) => f.replace('.spec.ts', ''))
const affectes = Object.values(GROUPES).flatMap((g) => g.tests)

const arg = (nom) => {
  const i = process.argv.indexOf(nom)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const liste = (noms) => [...new Set(noms)].sort().map((t) => `tests/${t}.spec.ts`).join(' ')

if (process.argv.includes('--verifier')) {
  const sansGroupe = fichiers.filter((f) => !affectes.includes(f))
  const fantomes = affectes.filter((f) => !fichiers.includes(f))
  const doubles = affectes.filter((f, i) => affectes.indexOf(f) !== i)
  if (sansGroupe.length || fantomes.length || doubles.length) {
    if (sansGroupe.length) console.error(`Test sans groupe (à ajouter dans e2e/groupes.mjs) : ${sansGroupe.join(', ')}`)
    if (fantomes.length) console.error(`Groupe qui cite un test inexistant : ${fantomes.join(', ')}`)
    if (doubles.length) console.error(`Test dans plusieurs groupes : ${doubles.join(', ')}`)
    process.exit(1)
  }
} else if (arg('--groupes')) {
  const noms = arg('--groupes').split(',').filter(Boolean)
  const inconnus = noms.filter((n) => !GROUPES[n])
  if (inconnus.length) {
    console.error(`Groupe inconnu : ${inconnus.join(', ')}. Groupes : ${Object.keys(GROUPES).join(', ')}`)
    process.exit(1)
  }
  console.log(liste(noms.flatMap((n) => GROUPES[n].tests)))
} else if (arg('--diff')) {
  const modifies = execFileSync('git', ['diff', '--name-only', `${arg('--diff')}...HEAD`], { encoding: 'utf8' }).split('\n').filter(Boolean)
  const touche = new Set()
  let tout = false
  for (const f of modifies) {
    const test = f.match(/^e2e\/tests\/([^/]+)\.spec\.ts$/)
    if (test) {
      touche.add(test[1])
      continue
    }
    if (TRANSVERSE.some((re) => re.test(f))) tout = true
    for (const g of Object.values(GROUPES)) if (g.sources.some((re) => re.test(f))) g.tests.forEach((t) => touche.add(t))
  }
  // Un fichier de code non reconnu (api/src, web/src) : dans le doute, tout rejouer
  const inconnu = modifies.some(
    (f) => /^(api\/src|web\/src)\//.test(f) && !/\.(test|spec)\./.test(f) && !TRANSVERSE.some((re) => re.test(f)) && !Object.values(GROUPES).some((g) => g.sources.some((re) => re.test(f))),
  )
  console.log(tout || inconnu ? 'tout' : touche.size ? liste([...touche]) : 'rien')
} else {
  console.error('Usage : node select.mjs --groupes a,b | --diff <base> | --verifier')
  process.exit(1)
}
