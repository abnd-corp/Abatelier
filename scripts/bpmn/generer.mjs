// Génère docs/bpmn/*.bpmn et docs/bpmn/couverture.md à partir de processus.mjs.
//   node scripts/bpmn/generer.mjs
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { GROUPES, PROCESSUS as PROCESSUS_SOURCE, VOIES } from './processus.mjs'

/**
 * Mise en conformité BPMN : les schémas sont écrits avec des flux simples, et les passerelles que la norme demande sont ajoutées ici.
 *  - une étape qui reçoit plusieurs flux est précédée d'une passerelle de fusion (exclusive) ;
 *  - une étape qui en envoie plusieurs est suivie d'une passerelle de décision (exclusive si un flux porte un libellé, sinon parallèle). La question du losange vient du champ `questions` du processus.
 * Les colonnes suivantes sont décalées d'un cran pour faire de la place.
 */
function normaliser(p) {
  const noeuds = p.noeuds.map((n) => [...n])
  let flux = p.flux.map((f) => [...f])
  const decaler = (colonne) => noeuds.forEach((n) => n[3] >= colonne && (n[3] += 1))
  let k = 0
  // Décisions : une étape (ni passerelle ni début) qui a plusieurs sorties
  for (const n of [...noeuds]) {
    const sorties = flux.filter((f) => f[0] === n[0])
    if (sorties.length < 2 || genre(n[1]) === 'gateway') continue
    const id = `gs${++k}`
    const exclusive = sorties.some((f) => f[2])
    decaler(n[3] + 1)
    noeuds.push([id, exclusive ? 'choix' : 'parallele', n[2], n[3] + 1, n[4], p.questions?.[n[0]] ?? ''])
    flux = flux.filter((f) => f[0] !== n[0])
    flux.push([n[0], id])
    for (const f of sorties) flux.push([id, f[1], exclusive ? f[2] || 'Sinon' : f[2]].filter((x) => x !== undefined))
  }
  // Fusions : une étape (ni passerelle ni début) qui reçoit plusieurs flux
  const typeDe = (id) => noeuds.find((x) => x[0] === id)[1]
  // La première passerelle rencontrée en remontant : si tous les flux entrants en viennent, c'est elle qui décide du type de fusion
  const origine = (id) => {
    let courant = id
    for (let i = 0; i < noeuds.length; i++) {
      if (genre(typeDe(courant)) === 'gateway') return courant
      const prev = flux.find((f) => f[1] === courant)
      if (!prev) return null
      courant = prev[0]
    }
    return null
  }
  for (const n of [...noeuds]) {
    const entrees = flux.filter((f) => f[1] === n[0])
    if (entrees.length < 2 || genre(n[1]) === 'gateway') continue
    const id = `gj${++k}`
    const origines = new Set(entrees.map((f) => origine(f[0])))
    const parallele = origines.size === 1 && [...origines][0] !== null && typeDe([...origines][0]) === 'parallele'
    // La fusion se place juste après le dernier élément qui la précède, pour que le détour d'une étape facultative tienne entre les deux losanges.
    // Une boucle (un flux qui revient en arrière) garde la fusion devant l'étape.
    const colonnes = entrees.map((f) => noeuds.find((x) => x[0] === f[0])[3])
    const dernier = Math.max(...colonnes)
    let colonne
    if (dernier <= n[3]) {
      colonne = dernier + 1
      const avant = n[3]
      // Entrées dans la même colonne que l'étape : elle passe après la fusion, et ce qui la suit recule de deux colonnes
      const recul = avant <= dernier ? 2 : 1
      for (const x of noeuds) if (x[3] > dernier) x[3] += recul
      if (avant <= dernier) n[3] = dernier + 2
    } else {
      colonne = n[3]
      decaler(colonne)
    }
    noeuds.push([id, parallele ? 'parallele' : 'choix', n[2], colonne, n[4], ''])
    flux = flux.map((f) => (f[1] === n[0] ? [f[0], id, ...f.slice(2)] : f))
    flux.push([id, n[0]])
  }
  // Garde-fou : après la mise en conformité, seule une passerelle a plusieurs entrées ou plusieurs sorties
  for (const n of noeuds) {
    if (genre(n[1]) === 'gateway') continue
    if (flux.filter((f) => f[1] === n[0]).length > 1 || flux.filter((f) => f[0] === n[0]).length > 1) throw new Error(`${p.id} : « ${n[0]} » a plusieurs flux sans passerelle`)
  }
  return { ...p, noeuds, flux }
}
// BPMN_SORTIE : dossier de sortie à la place de docs/bpmn/ (la CI y génère les schémas pour les contrôler sans toucher au dépôt)
const SORTIE = process.env.BPMN_SORTIE ? pathToFileURL(`${resolve(process.env.BPMN_SORTIE)}/`) : new URL('../../docs/bpmn/', import.meta.url)
mkdirSync(SORTIE, { recursive: true })
// Les fichiers sont renumérotés à chaque génération : on retire les anciens pour qu'aucun schéma périmé ne reste
for (const f of readdirSync(SORTIE)) if (/^\d+-.*\.(bpmn|svg|png)$/.test(f)) rmSync(new URL(f, SORTIE))

const COUVERTURE = {
  ok: { libelle: 'Dans l’application', fill: '#d8f0dc', stroke: '#2e7d32' },
  partiel: { libelle: 'En partie', fill: '#ffeccc', stroke: '#b26a00' },
  manque: { libelle: 'Pas encore', fill: '#f9d3cf', stroke: '#c62828' },
  hors: { libelle: 'Hors application', fill: '#e8e8e8', stroke: '#616161' },
}
const TYPES = { saisie: 'userTask', auto: 'serviceTask', manuel: 'manualTask', debut: 'startEvent', fin: 'endEvent', choix: 'exclusiveGateway', parallele: 'parallelGateway' }
const TAILLE = { task: [150, 80], event: [36, 36], gateway: [50, 50] }
const LARGEUR_COL = 190
const HAUTEUR_LIGNE = 120
const X0 = 70 // bord gauche des voies
const ENTETE = 30 // largeur du titre vertical d'une voie
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const genre = (type) => (type === 'debut' || type === 'fin' ? 'event' : type === 'choix' || type === 'parallele' ? 'gateway' : 'task')

const PROCESSUS = PROCESSUS_SOURCE.map(normaliser)
const PROBLEMES = []

function dispose(p) {
  const lignesParVoie = Object.fromEntries(p.voies.map((v) => [v, 1 + Math.max(0, ...p.noeuds.filter((n) => n[2] === v).map((n) => n[4]))]))
  const hautVoie = {}
  const topVoie = {}
  let y = 40
  for (const v of p.voies) {
    topVoie[v] = y
    hautVoie[v] = lignesParVoie[v] * HAUTEUR_LIGNE
    y += hautVoie[v]
  }
  const colMax = Math.max(...p.noeuds.map((n) => n[3]))
  const largeur = ENTETE + 30 + (colMax + 1) * LARGEUR_COL + 20
  const forme = new Map()
  for (const [id, type, voie, col, ligne] of p.noeuds) {
    const [w, h] = TAILLE[genre(type)]
    const cx = X0 + ENTETE + 20 + LARGEUR_COL / 2 + col * LARGEUR_COL
    const cy = topVoie[voie] + ligne * HAUTEUR_LIGNE + HAUTEUR_LIGNE / 2
    forme.set(id, { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy, col })
  }
  return { topVoie, hautVoie, largeur, forme, bas: y }
}

/**
 * Trace toutes les flèches d'un processus et contrôle la disposition : une flèche ne doit ni se superposer à une autre ni traverser une étape
 * qui n'est pas la sienne. Pour chaque flèche on garde le premier tracé possible qui respecte cela ; s'il n'y en a aucun, le problème est signalé.
 * Deux flèches qui partent du même élément (ou arrivent au même) peuvent partager leur départ (ou leur arrivée) : c'est le dessin normal d'une décision.
 */
const segmentsDe = (pts) => pts.slice(1).map((q, k) => ({ x1: pts[k].x, y1: pts[k].y, x2: q.x, y2: q.y }))
function recouvre(s, t) {
  if (s.y1 === s.y2 && t.y1 === t.y2 && s.y1 === t.y1) return Math.min(Math.max(s.x1, s.x2), Math.max(t.x1, t.x2)) - Math.max(Math.min(s.x1, s.x2), Math.min(t.x1, t.x2)) > 2
  if (s.x1 === s.x2 && t.x1 === t.x2 && s.x1 === t.x1) return Math.min(Math.max(s.y1, s.y2), Math.max(t.y1, t.y2)) - Math.max(Math.min(s.y1, s.y2), Math.min(t.y1, t.y2)) > 2
  return false
}
function traverse(pts, f) {
  return segmentsDe(pts).some((s) => {
    const x1 = Math.min(s.x1, s.x2)
    const x2 = Math.max(s.x1, s.x2)
    const y1 = Math.min(s.y1, s.y2)
    const y2 = Math.max(s.y1, s.y2)
    return x1 < f.x + f.w && x2 > f.x && y1 < f.y + f.h && y2 > f.y
  })
}
function acheminer(p, forme) {
  const problemes = []
  const choisies = []
  p.flux.forEach(([de, vers]) => {
    const liste = candidats(forme.get(de), forme.get(vers))
    const gene = (pts) => {
      const croise = [...forme].find(([id, f]) => id !== de && id !== vers && traverse(pts, f))
      if (croise) return `traverse « ${croise[0]} »`
      const autre = choisies.find((c) => c.de !== de && c.vers !== vers && segmentsDe(c.pts).some((s) => segmentsDe(pts).some((t) => recouvre(s, t))))
      return autre ? `se superpose à ${autre.de}→${autre.vers}` : null
    }
    const ok = liste.find((pts) => !gene(pts))
    const pts = ok ?? liste[0]
    if (!ok) problemes.push(`la flèche ${de}→${vers} ${gene(pts)}`)
    choisies.push({ de, vers, pts })
  })
  return { routes: choisies.map((c) => c.pts), problemes }
}

/** Les tracés possibles d'une flèche, du plus simple au plus détourné ; `acheminer` garde le premier qui ne gêne rien. */
function candidats(a, b) {
  const sortie = { x: a.x + a.w, y: a.cy }
  const entree = { x: b.x, y: b.cy }
  const out = []
  if (b.col > a.col) {
    if (a.cy === b.cy) out.push([sortie, entree])
    for (const d of [25, 33, 41, 17, 49]) {
      const vx = b.x - d
      out.push([sortie, { x: vx, y: sortie.y }, { x: vx, y: entree.y }, entree])
    }
    // Virage près de la source, puis ligne droite le long de la rangée de la cible
    for (const d of [25, 33, 41]) {
      const vx = sortie.x + d
      out.push([sortie, { x: vx, y: sortie.y }, { x: vx, y: entree.y }, entree])
    }
    // Virage dans l'une des colonnes intermédiaires
    for (let c = a.col; c < b.col; c++) {
      const vx = X0 + ENTETE + 20 + (c + 1) * LARGEUR_COL
      for (const d of [0, 10, -10]) out.push([sortie, { x: vx + d, y: sortie.y }, { x: vx + d, y: entree.y }, entree])
    }
    return out
  }
  // Retour en arrière : on contourne par le dessus ou le dessous de la cible, ou par la gauche de la source
  if (b.cy < a.cy) {
    for (const d of [22, 30, 38]) {
      const ym = b.y + b.h + d
      out.push([{ x: a.cx, y: a.y }, { x: a.cx, y: ym }, { x: b.cx, y: ym }, { x: b.cx, y: b.y + b.h }])
    }
    out.push([{ x: a.x, y: a.cy }, { x: b.cx, y: a.cy }, { x: b.cx, y: b.y + b.h }])
    // Par le dessous de la source, puis vers la gauche : la sortie ne gêne ni ce qui est au-dessus ni l'arrivée par la gauche
    for (const d of [12, 20, 28]) out.push([{ x: a.cx, y: a.y + a.h }, { x: a.cx, y: a.y + a.h + d }, { x: b.cx, y: a.y + a.h + d }, { x: b.cx, y: b.y + b.h }])
    return out
  }
  for (const d of [22, 30, 38]) {
    const ym = b.y - d
    out.push([{ x: a.cx, y: a.y + a.h }, { x: a.cx, y: ym }, { x: b.cx, y: ym }, { x: b.cx, y: b.y }])
  }
  out.push([{ x: a.x, y: a.cy }, { x: b.cx, y: a.cy }, { x: b.cx, y: b.y }])
  for (const d of [12, 20, 28]) out.push([{ x: a.cx, y: a.y }, { x: a.cx, y: a.y - d }, { x: b.cx, y: a.y - d }, { x: b.cx, y: b.y }])
  return out
}

function bpmn(p, num) {
  const { topVoie, hautVoie, largeur, forme, bas } = dispose(p)
  const { routes, problemes } = acheminer(p, forme)
  for (const probleme of problemes) PROBLEMES.push(`${p.id} : ${probleme}`)
  const pid = `P${num}_${p.id.replace(/-/g, '_')}`
  const nid = (id) => `${pid}_${id}`
  const entrants = new Map()
  const sortants = new Map()
  p.flux.forEach(([de, vers], i) => {
    const f = `${pid}_flux${i + 1}`
    sortants.set(de, [...(sortants.get(de) ?? []), f])
    entrants.set(vers, [...(entrants.get(vers) ?? []), f])
  })
  const noeudsXml = p.noeuds
    .map(([id, type, , , , nom, couv, ou]) => {
      const doc = couv ? `<bpmn:documentation>${esc(`${COUVERTURE[couv].libelle}${ou ? ` : ${ou}` : ''}`)}</bpmn:documentation>` : ''
      const inc = (entrants.get(id) ?? []).map((f) => `<bpmn:incoming>${f}</bpmn:incoming>`).join('')
      const out = (sortants.get(id) ?? []).map((f) => `<bpmn:outgoing>${f}</bpmn:outgoing>`).join('')
      return `    <bpmn:${TYPES[type]} id="${nid(id)}" name="${esc(nom)}">${doc}${inc}${out}</bpmn:${TYPES[type]}>`
    })
    .join('\n')
  const fluxXml = p.flux.map(([de, vers, nom], i) => `    <bpmn:sequenceFlow id="${pid}_flux${i + 1}" ${nom ? `name="${esc(nom)}" ` : ''}sourceRef="${nid(de)}" targetRef="${nid(vers)}" />`).join('\n')
  const voiesXml = p.voies
    .map(
      (v) =>
        `      <bpmn:lane id="${pid}_voie_${v}" name="${esc(VOIES[v])}">\n${p.noeuds
          .filter((n) => n[2] === v)
          .map((n) => `        <bpmn:flowNodeRef>${nid(n[0])}</bpmn:flowNodeRef>`)
          .join('\n')}\n      </bpmn:lane>`,
    )
    .join('\n')
  const legende = `Légende : vert = dans l’application · orange = en partie · rouge = pas encore · gris = hors application (geste manuel)`
  const formes = p.noeuds
    .map(([id, type, , , , , couv]) => {
      const f = forme.get(id)
      const couleur = couv && genre(type) === 'task' ? ` bioc:stroke="${COUVERTURE[couv].stroke}" bioc:fill="${COUVERTURE[couv].fill}"` : couv ? ` bioc:stroke="${COUVERTURE[couv].stroke}"` : ''
      const marque = type === 'choix' ? ' isMarkerVisible="true"' : ''
      // Le titre d'une décision se place au-dessus à gauche : les flèches partent à droite, en haut ou en bas
      const etiquette = type === 'choix' ? `\n        <bpmndi:BPMNLabel>\n          <dc:Bounds x="${f.cx - 105}" y="${f.y - 32}" width="110" height="30" />\n        </bpmndi:BPMNLabel>` : ''
      return `      <bpmndi:BPMNShape id="${nid(id)}_di" bpmnElement="${nid(id)}"${marque}${couleur}>\n        <dc:Bounds x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" />${etiquette}\n      </bpmndi:BPMNShape>`
    })
    .join('\n')
  const aretes = p.flux
    .map((_flux, i) => {
      const pts = routes[i]
      return `      <bpmndi:BPMNEdge id="${pid}_flux${i + 1}_di" bpmnElement="${pid}_flux${i + 1}">\n${pts.map((q) => `        <di:waypoint x="${q.x}" y="${q.y}" />`).join('\n')}\n      </bpmndi:BPMNEdge>`
    })
    .join('\n')
  const voiesDi = p.voies
    .map(
      (v) =>
        `      <bpmndi:BPMNShape id="${pid}_voie_${v}_di" bpmnElement="${pid}_voie_${v}" isHorizontal="true">\n        <dc:Bounds x="${X0}" y="${topVoie[v]}" width="${largeur}" height="${hautVoie[v]}" />\n      </bpmndi:BPMNShape>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Généré par scripts/bpmn/generer.mjs : modifier scripts/bpmn/processus.mjs, pas ce fichier. -->
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0" id="${pid}_defs" targetNamespace="http://abatelier.local/bpmn">
  <bpmn:collaboration id="${pid}_collab">
    <bpmn:participant id="${pid}_pool" name="${esc(p.titre)}" processRef="${pid}" />
  </bpmn:collaboration>
  <bpmn:process id="${pid}" name="${esc(p.titre)}" isExecutable="false">
    <bpmn:documentation>${esc(p.resume)}</bpmn:documentation>
    <bpmn:laneSet id="${pid}_voies">
${voiesXml}
    </bpmn:laneSet>
${noeudsXml}
${fluxXml}
    <bpmn:textAnnotation id="${pid}_legende"><bpmn:text>${esc(legende)}</bpmn:text></bpmn:textAnnotation>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="${pid}_diagram">
    <bpmndi:BPMNPlane id="${pid}_plane" bpmnElement="${pid}_collab">
      <bpmndi:BPMNShape id="${pid}_pool_di" bpmnElement="${pid}_pool" isHorizontal="true">
        <dc:Bounds x="${X0 - ENTETE}" y="40" width="${largeur + ENTETE}" height="${bas - 40}" />
      </bpmndi:BPMNShape>
${voiesDi}
${formes}
${aretes}
      <bpmndi:BPMNShape id="${pid}_legende_di" bpmnElement="${pid}_legende">
        <dc:Bounds x="${X0}" y="${bas + 20}" width="${Math.min(largeur, 760)}" height="30" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`
}

const nomFichier = (p, i) => `${String(i + 1).padStart(2, '0')}-${p.id}.bpmn`

PROCESSUS.forEach((p, i) => writeFileSync(new URL(nomFichier(p, i), SORTIE), bpmn(p, i + 1)))

// --- Tableau de couverture ---
const compte = { ok: 0, partiel: 0, manque: 0, hors: 0 }
const lignes = []
const aFaire = []
for (const [i, p] of PROCESSUS.entries()) {
  const etapes = p.noeuds.filter((n) => n[6])
  for (const n of etapes) compte[n[6]]++
  lignes.push(
    `## ${i + 1}. ${p.titre}`,
    '',
    p.resume,
    '',
    `Schéma : [image](${nomFichier(p, i).replace('.bpmn', '.svg')}) · [fichier BPMN](${nomFichier(p, i)})`,
    '',
    '| Étape | Qui | Couverture | Où dans l’application, ou précision |',
    '|---|---|---|---|',
  )
  for (const [, , voie, , , nom, couv, ou] of etapes) lignes.push(`| ${nom} | ${VOIES[voie]} | ${COUVERTURE[couv].libelle} | ${ou || ''} |`)
  lignes.push('')
  for (const [, , , , , nom, couv, ou] of etapes)
    if (couv === 'manque' || couv === 'partiel') aFaire.push(`- **${p.titre}** : ${nom} (${COUVERTURE[couv].libelle.toLowerCase()}) ${ou ? `: ${ou}` : ''}`)
}
const total = Object.values(compte).reduce((a, b) => a + b, 0)
const pct = (n) => `${Math.round((n / total) * 100)} %`
const entete = [
  '# Couverture des besoins métier',
  '',
  '> Généré par `node scripts/bpmn/generer.mjs` à partir de `scripts/bpmn/processus.mjs`. Ne pas modifier à la main.',
  '',
  `Les ${PROCESSUS.length} processus de l’atelier sont décrits en BPMN (voir [README](README.md)). Chaque étape est classée selon ce que fait l’application aujourd’hui.`,
  '',
  '| Couverture | Étapes | Part |',
  '|---|---|---|',
  ...Object.entries(COUVERTURE).map(([k, c]) => `| ${c.libelle} | ${compte[k]} | ${pct(compte[k])} |`),
  `| **Total** | **${total}** | |`,
  '',
  '## Ce qu’il reste à faire pour couvrir tout le besoin',
  '',
  ...aFaire,
  '',
]
// --- Tableur à remplir avec le client : une ligne par processus, ce que l'application couvre, et les colonnes du gain à chiffrer ---
// Séparateur « ; » et virgule décimale : s'ouvre directement dans un tableur en français. Les colonnes calculées sont des formules.
const csv = (l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')
const entetes = [
  'N°',
  'Groupe',
  'Processus',
  'Étapes',
  'Dans l’application',
  'En partie',
  'Pas encore',
  'Hors application',
  'Qui le fait aujourd’hui',
  'Outil ou papier utilisé',
  'Minutes par fois',
  'Fois par semaine',
  'Heures par semaine',
  'Coût horaire (€)',
  'Coût par an (€)',
  'Part prise en charge par l’application (%, à ajuster avec le client)',
  'Gain par an (€)',
  'Problèmes constatés (erreurs, retards, oublis)',
  'Commentaire',
]
const lignesCsv = [csv(entetes)]
PROCESSUS.forEach((p, i) => {
  const n = { ok: 0, partiel: 0, manque: 0, hors: 0 }
  for (const x of p.noeuds.filter((x) => x[6])) n[x[6]]++
  const r = i + 2 // ligne du tableur (l'entête est la ligne 1)
  const etapes = n.ok + n.partiel + n.manque + n.hors
  lignesCsv.push(
    [
      String(i + 1),
      GROUPES[p.id] ?? '',
      p.titre,
      etapes,
      n.ok,
      n.partiel,
      n.manque,
      n.hors,
      '',
      '',
      '',
      '',
      `=K${r}*L${r}/60`,
      '',
      `=M${r}*N${r}*52`,
      Math.round(((n.ok + n.partiel / 2) / Math.max(1, etapes - n.hors)) * 100),
      `=O${r}*P${r}/100`,
      '',
      '',
    ]
      .map((c) => (typeof c === 'string' && c.startsWith('=') ? `"${c}"` : csv([c])))
      .join(';'),
  )
})
writeFileSync(new URL('processus.csv', SORTIE), `\uFEFF${lignesCsv.join('\r\n')}\r\n`)

writeFileSync(new URL('couverture.md', SORTIE), [...entete, ...lignes].join('\n'))
console.log(
  `${PROCESSUS.length} processus, ${total} étapes : ${Object.entries(compte)
    .map(([k, n]) => `${k} ${n}`)
    .join(', ')}`,
)

// Les schémas sont générés quand même (pour les voir), mais la génération échoue si une flèche en recouvre une autre ou traverse une étape
if (PROBLEMES.length) {
  console.error(`\n${PROBLEMES.length} problème(s) de disposition :\n${PROBLEMES.map((x) => `  - ${x}`).join('\n')}`)
  process.exitCode = 1
}
