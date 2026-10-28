import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ADMIN, apiLogin, createUser, expect, NEW_PASSWORD, test } from './fixtures'

// Le vrai geste de la réception : la caméra lit le code-barres. Chromium offre une fausse caméra qui rejoue un fichier vidéo ;
// on lui donne une image d'un code EAN-13 fabriquée ici, que l'application doit lire toute seule (sans saisie).

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
const PARITE = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

/** EAN-13 valide à partir de 12 chiffres : ajoute la clé de contrôle. */
const ean13 = (d12: string) => d12 + ((10 - ([...d12].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0) % 10)) % 10)

/** Les 95 modules (1 = barre noire) d'un EAN-13. */
function modules(code: string) {
  const d = [...code].map(Number)
  const p = PARITE[d[0]!]!
  let m = '101'
  for (let i = 0; i < 6; i++) m += (p[i] === 'L' ? L : G)[d[i + 1]!]!
  m += '01010'
  for (let i = 7; i < 13; i++) m += R[d[i]!]!
  return m + '101'
}

/** Fichier vidéo y4m d'une seule image (le lecteur la rejoue en boucle) : code-barres noir sur fond blanc, 320 × 240. */
function fakeCamera(code: string) {
  const W = 320
  const H = 240
  const mod = modules(code)
  const scale = 3
  const left = Math.floor((W - mod.length * scale) / 2)
  const y = Buffer.alloc(W * H, 235)
  for (let row = 50; row < 190; row++) for (let i = 0; i < mod.length; i++) if (mod[i] === '1') for (let k = 0; k < scale; k++) y[row * W + left + i * scale + k] = 16
  const chroma = Buffer.alloc((W / 2) * (H / 2) * 2, 128)
  const dir = join(tmpdir(), 'abatelier-e2e')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `camera-${code}.y4m`)
  writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\nFRAME\n`), y, chroma]))
  return file
}

const code = ean13(`376${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`)

// Réglage de fichier (Playwright l'interdit dans un groupe) : la fausse caméra n'existe que sous Chromium
test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${fakeCamera(code)}`] },
})

test.describe('Réception : lecture du code par la caméra', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'La fausse caméra n’existe que sous Chromium')

  test('la caméra démarre seule, lit le code-barres et ouvre la référence, sans rien saisir', async ({ browser, baseURL, uid, page }) => {
    const h = { Origin: baseURL! }
    const admin = await (await browser.newContext()).newPage()
    await apiLogin(admin.request, baseURL!, ADMIN.identifiant, ADMIN.password)
    const options = await (await admin.request.get('/api/stock/options')).json()
    const largeur = 1100 + Math.floor(Math.random() * 900)
    const res = await admin.request.post('/api/stock/feuilles', {
      data: { materialId: options.materials[0].id, colorId: options.colors[0].id, largeur, longueur: 2500, quantite: 2, code },
      headers: h,
    })
    expect(res.status(), await res.text()).toBe(201)

    const identifiant = `${uid}-cam`
    const temp = await createUser(admin.request, baseURL!, { identifiant, nom: 'Marc Caméra', role: 'atelier' })
    await apiLogin(page.request, baseURL!, identifiant, temp)
    await page.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: h })

    await page.goto('/reception')
    // Aucun champ à remplir : la caméra démarre et le code est lu
    await expect(page.getByText('Placez le code-barres dans le cadre')).toBeVisible()
    await expect(page.getByText('Combien de feuilles reçues')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(`Code ${code}`)).toBeVisible()
    await page.getByRole('textbox', { name: 'Feuilles reçues' }).fill('5')
    await page.getByRole('button', { name: 'Valider l’entrée en stock' }).click()
    await expect(page.getByRole('status')).toContainText('5 feuilles reçues')
    const stock = ((await (await page.request.get('/api/stock/feuilles')).json()).feuilles as { codes: string[]; quantite: number }[]).find((f) => f.codes.includes(code))!
    expect(stock.quantite).toBe(7)
  })
})
