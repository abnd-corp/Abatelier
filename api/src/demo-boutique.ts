// Boutique et stock de démonstration : « make demo-boutique ».
// Ajoute à la base de DÉVELOPPEMENT quelques produits en ligne (avec photo et déclinaisons) et du stock de feuilles, pour voir la
// boutique et la gestion du stock remplies. Rien n'est supprimé ni modifié : on n'ajoute que ce qui manque (rejouable).
// Pour reprendre le vrai catalogue, utilisez plutôt « Importer un catalogue » dans Direction → Boutique.
import { and, eq, isNull } from 'drizzle-orm'
import { crc32, deflateSync } from 'node:zlib'
import { db, pool, runMigrations } from './db/index.js'
import { colors, materials, productVariants, products, sheetMovements, sheetStock } from './db/schema.js'
import { env } from './env.js'
import { getPricingSettings } from './pricing.js'
import { htFromTtc } from './shop.js'

await runMigrations()
if (env.NODE_ENV === 'production') throw new Error('Données de démonstration refusées en production.')

/** Photo de démonstration : un aplat de la teinte avec un léger dégradé vertical, comme une tôle laquée. */
function png(width: number, height: number, [r, g, b]: [number, number, number]) {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const rows = Array.from({ length: height }, (_, y) => {
    const k = 0.82 + 0.3 * (y / height)
    const px = Buffer.from([Math.min(255, r * k), Math.min(255, g * k), Math.min(255, b * k)])
    return Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: width }, () => px))])
  })
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))])
}

const COLORIS: { nom: string; ral: string; rgb: [number, number, number] }[] = [
  { nom: 'blanc', ral: 'RAL 9010', rgb: [236, 236, 228] },
  { nom: 'gris anthracite', ral: 'RAL 7016', rgb: [56, 62, 66] },
  { nom: 'gris clair', ral: 'RAL 9006', rgb: [166, 168, 168] },
  { nom: 'noir sablé', ral: 'RAL 2100', rgb: [40, 40, 42] },
  { nom: 'sable / ivoire', ral: 'RAL 1015', rgb: [226, 214, 187] },
]
const FAMILLES: { nom: string; categorie: string; description: string; variantes: [string, number][] }[] = [
  {
    nom: 'Couvertine',
    categorie: 'Couvertine',
    description: 'Protège le dessus des murs et des acrotères. Aluminium laqué, avec larmiers.',
    variantes: [
      ['270 mm · 1 mm · 1 m', 21],
      ['270 mm · 1 mm · 3 m', 55],
      ['320 mm · 1,5 mm · 3 m', 84],
      ['320 mm · 1,5 mm · 2 m', 61],
    ],
  },
  {
    nom: 'Bavette simple',
    categorie: 'Bavette',
    description: 'Appui de fenêtre avec pente et larmier. Aluminium laqué.',
    variantes: [
      ['150 mm · 1 mm · 1 m', 15],
      ['200 mm · 1 mm · 2 m', 38],
      ['300 mm · 1,5 mm · 3 m', 81],
    ],
  },
  {
    nom: 'Bandeau en « L »',
    categorie: 'Bandeau',
    description: 'Habille et protège les rives de toiture et les débords de façade.',
    variantes: [
      ['200 mm · 1 mm · 1,50 m', 26.5],
      ['250 mm · 1 mm · 3 m', 59],
      ['300 mm · 1,5 mm · 3 m', 68.5],
    ],
  },
]

const taux = (await getPricingSettings()).tva
const [{ n: dejaProduits }] = [{ n: (await db.select({ id: products.id }).from(products)).length }]
let cree = 0
let position = dejaProduits
for (const f of FAMILLES) {
  for (const c of COLORIS) {
    const nom = `${f.nom} ${c.nom} ${c.ral}`
    const [existe] = await db.select({ id: products.id }).from(products).where(eq(products.nom, nom))
    if (existe) continue
    const [p] = await db
      .insert(products)
      .values({
        nom,
        categorie: f.categorie,
        description: f.description,
        image: png(640, 480, c.rgb),
        imageType: 'image/png',
        imageLargeur: 640,
        imageHauteur: 480,
        imageAlt: `${f.nom} ${c.nom}`,
        actif: true,
        position: ++position,
      })
      .returning({ id: products.id })
    await db.insert(productVariants).values(f.variantes.map(([libelle, prix], i) => ({ productId: p!.id, libelle, prixHt: htFromTtc(prix, taux), position: i + 1 })))
    cree++
  }
}
console.log(`Boutique : ${cree} produit${cree > 1 ? 's' : ''} ajouté${cree > 1 ? 's' : ''} (déjà présents : ${FAMILLES.length * COLORIS.length - cree}).`)

// Stock de feuilles : deux formats par matière du catalogue, une chute et une feuille en stock bas
const mats = await db.select().from(materials).where(eq(materials.actif, true))
const cols = await db.select().from(colors).where(eq(colors.actif, true))
let feuilles = 0
for (const [i, m] of mats.slice(0, 3).entries()) {
  const col = cols[i % Math.max(1, cols.length)]
  const lignes = [
    { largeur: 1250, longueur: 3000, quantite: 24 - i * 6, seuil: 8, chute: false, note: 'Rack A' },
    { largeur: 1000, longueur: 2000, quantite: 3, seuil: 6, chute: false, note: 'Stock bas : à recommander' },
    { largeur: 450, longueur: 3000, quantite: 4, seuil: 0, chute: true, note: 'Chutes de couvertine' },
  ]
  for (const l of lignes) {
    const colorId = col?.id ?? null
    const [existe] = await db
      .select({ id: sheetStock.id })
      .from(sheetStock)
      .where(
        and(
          eq(sheetStock.materialId, m.id),
          colorId ? eq(sheetStock.colorId, colorId) : isNull(sheetStock.colorId),
          eq(sheetStock.largeur, l.largeur),
          eq(sheetStock.longueur, l.longueur),
          eq(sheetStock.chute, l.chute),
        ),
      )
    if (existe) continue
    const [s] = await db
      .insert(sheetStock)
      .values({ materialId: m.id, colorId, ...l })
      .returning({ id: sheetStock.id })
    await db.insert(sheetMovements).values({
      sheetId: s!.id,
      libelle: `${m.nom} ${m.epaisseur} mm · ${col ? col.reference : 'brut'} · ${l.largeur} × ${l.longueur} mm${l.chute ? ' (chute)' : ''}`,
      delta: l.quantite,
      apres: l.quantite,
      motif: 'reception',
      note: 'Démonstration',
    })
    feuilles++
  }
}
console.log(`Stock de feuilles : ${feuilles} référence${feuilles > 1 ? 's' : ''} ajoutée${feuilles > 1 ? 's' : ''}.`)
await pool.end()
