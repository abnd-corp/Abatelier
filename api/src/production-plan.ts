import { accessoryTotals, bendSteps, CHUTE_MIN, chutesOf, groupChutes, sheetGroups, type SheetLine } from './production-sheet.js'
import { isPince } from './profile.js'

// Le travail d'une commande, rangé feuille par feuille : ce que la fiche imprimée dit, mais en données, pour la version à cocher sur la plateforme.
// Chaque étape à cocher a une clé (« decoupe:<ligne> ») : c'est elle qui est enregistrée dans production_checks.

export interface PlanLigne extends SheetLine {
  id: string
}

export interface PlanGroupe {
  id: string
  numero: number
  label: string
  recuperer: { cle: string; ligneId: string; piece: number; texte: string }[]
  decoupes: {
    cle: string
    ligneId: string
    piece: number
    titre: string
    consigne: string
    pose: string | null
    quantite: number
    // De quoi dessiner le plan de découpe (vue de dessus de la feuille)
    plan: { feuilleLargeur: number; feuilleLongueur: number; parFeuille: number; sensLongueur: boolean; colonnes: number; rangees: number; developpe: number; longueur: number } | null
  }[]
  pliages: {
    cle: string
    ligneId: string
    piece: number
    titre: string
    consigne: string
    plis: { angle: number; pince: boolean }[]
    traits: number[]
    etapes: { pts: [number, number][]; plat: boolean }[]
    quantite: number
  }[]
  coteCle: string
  chutes: null | { garder: { nombre: number; largeur: number; longueur: number }[]; jeter: { nombre: number; largeur: number; longueur: number }[]; pourcent: number; m2: number; minimum: number }
  // Feuilles à sortir du stock : une par référence conseillée
  feuilles: { sheetId: string; nombre: number }[]
  stockCle: string
}

export interface Plan {
  groupes: PlanGroupe[]
  apreparer: { cle: string; texte: string }[]
}

const num = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
const titreDe = (l: SheetLine, i: number) => `Pièce ${i + 1} · ${l.modeleLabel}${l.repere ? ` · ${l.repere}` : ''}`

export function buildPlan(lignes: PlanLigne[]): Plan {
  const groupes = sheetGroups(lignes).map((g, gi): PlanGroupe => {
    const premiere = (g.lignes[0]!.l as PlanLigne).id
    const lignesPlan = g.lignes as { l: PlanLigne; i: number }[]
    const avecPlan = lignesPlan.filter(({ l }) => l.decoupe)
    let chutes: PlanGroupe['chutes'] = null
    if (avecPlan.length) {
      const toutes = avecPlan.flatMap(({ l }) => chutesOf(l, l.decoupe!))
      const surface = toutes.reduce((s, c) => s + c.largeur * c.longueur, 0)
      const feuilles = avecPlan.reduce((s, { l }) => s + l.decoupe!.feuilles * l.decoupe!.feuilleLargeur * l.decoupe!.feuilleLongueur, 0)
      const vue = (garder: boolean) => groupChutes(toutes.filter((c) => c.garder === garder)).map(({ nombre, largeur, longueur }) => ({ nombre, largeur, longueur }))
      chutes = { garder: vue(true), jeter: vue(false), pourcent: Math.round((surface / feuilles) * 1000) / 10, m2: Math.round(surface / 1e4) / 100, minimum: CHUTE_MIN }
    }
    // Une feuille conseillée par référence, tous les besoins de la ligne additionnés
    const parFeuille = new Map<string, number>()
    for (const { l } of avecPlan) parFeuille.set(l.decoupe!.sheetId, (parFeuille.get(l.decoupe!.sheetId) ?? 0) + l.decoupe!.feuilles)
    return {
      id: premiere,
      numero: gi + 1,
      label: g.label,
      recuperer: lignesPlan.map(({ l, i }) => {
        const d = l.decoupe
        return {
          cle: `recup:${l.id}`,
          ligneId: l.id,
          piece: i + 1,
          texte: d
            ? `${d.feuilles} × feuille ${num(d.feuilleLargeur)} × ${num(d.feuilleLongueur)} mm${d.chute ? ' (une chute du stock)' : ''}${d.feuilles > d.enStock ? ` · attention, ${d.enStock} seulement en stock` : ''}`
            : `Feuille à choisir : ${l.materialLabel}, ${l.colorLabel} (aucune feuille conseillée en stock)`,
        }
      }),
      decoupes: lignesPlan.map(({ l, i }) => {
        const d = l.decoupe
        const dev = l.cotes.reduce((s, v) => s + v, 0)
        return {
          cle: `decoupe:${l.id}`,
          ligneId: l.id,
          piece: i + 1,
          titre: titreDe(l, i),
          consigne: `${num(l.quantite)} bande${l.quantite > 1 ? 's' : ''} de ${num(dev)} mm de large × ${num(l.longueur)} mm de long`,
          pose: d
            ? `${d.parFeuille} bande${d.parFeuille > 1 ? 's' : ''} par feuille, ${d.disposition.sensLongueur ? 'dans le sens de la longueur de la feuille' : 'feuille tournée d’un quart de tour'}`
            : null,
          quantite: l.quantite,
          plan: d
            ? {
                feuilleLargeur: d.feuilleLargeur,
                feuilleLongueur: d.feuilleLongueur,
                parFeuille: d.parFeuille,
                sensLongueur: d.disposition.sensLongueur,
                colonnes: d.disposition.colonnes,
                rangees: d.disposition.rangees,
                developpe: dev,
                longueur: l.longueur,
              }
            : null,
        }
      }),
      pliages: lignesPlan
        .filter(({ l }) => l.angles.length)
        .map(({ l, i }) => {
          let cumul = 0
          return {
            cle: `pliage:${l.id}`,
            ligneId: l.id,
            piece: i + 1,
            titre: titreDe(l, i),
            consigne: `${l.angles.length} pli${l.angles.length > 1 ? 's' : ''} à la presse, dans l’ordre 1 à ${l.angles.length}`,
            plis: l.angles.map((a) => ({ angle: a, pince: isPince(a) })),
            traits: l.cotes.slice(0, -1).map((c) => (cumul += c)),
            etapes: bendSteps(l),
            quantite: l.quantite,
          }
        }),
      coteCle: `cote:${premiere}`,
      chutes,
      feuilles: [...parFeuille].map(([sheetId, nombre]) => ({ sheetId, nombre })),
      stockCle: `stock:${premiere}`,
    }
  })
  const apreparer = [
    ...accessoryTotals(lignes).map((a) => ({ cle: `prep:acc:${a.nom}|${a.unite}`, texte: `${num(a.quantite)} × ${a.nom}${a.unite === 'paire' ? ' (paires)' : ''}` })),
    ...lignes.filter((l) => !l.cotes.length).map((l) => ({ cle: `prep:art:${l.id}`, texte: `${num(l.quantite)} × ${l.modeleLabel}${l.repere ? ` · ${l.repere}` : ''} (article de la boutique)` })),
  ]
  return { groupes, apreparer }
}

/** Les étapes que l'on peut cocher, avec leur maximum (une case : 1 ; une pièce : sa quantité). Les clés « stock: » ne se cochent pas à la main. */
export function checkable(plan: Plan): Map<string, number> {
  const m = new Map<string, number>()
  for (const g of plan.groupes) {
    for (const r of g.recuperer) m.set(r.cle, 1)
    for (const d of g.decoupes) m.set(d.cle, d.quantite)
    for (const p of g.pliages) m.set(p.cle, p.quantite)
    m.set(g.coteCle, 1)
  }
  for (const a of plan.apreparer) m.set(a.cle, 1)
  return m
}
