/* global document, window -- le code de page.evaluate tourne dans le navigateur */
// Dessine chaque docs/bpmn/*.bpmn en image SVG (à montrer sans logiciel), avec bpmn-js chargé depuis un CDN.
//   node scripts/bpmn/rendre.mjs     (Playwright vient du dossier e2e : « make setup »)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '../../e2e/node_modules/@playwright/test/index.mjs'

const DOSSIER = new URL('../../docs/bpmn/', import.meta.url)
const VERSION = '17.11.1'
const CDN = `https://unpkg.com/bpmn-js@${VERSION}/dist`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 2400, height: 900 } })
await page.setContent('<html><body><div id="c" style="width:2400px;height:900px"></div></body></html>')
await page.addStyleTag({ url: `${CDN}/assets/diagram-js.css` })
await page.addStyleTag({ url: `${CDN}/assets/bpmn-js.css` })
await page.addScriptTag({ url: `${CDN}/bpmn-navigated-viewer.production.min.js` })
for (const f of readdirSync(DOSSIER).filter((n) => n.endsWith('.bpmn'))) {
  const xml = readFileSync(new URL(f, DOSSIER), 'utf8')
  const svg = await page.evaluate(async (xml) => {
    document.getElementById('c').innerHTML = ''
    const viewer = new window.BpmnJS({ container: '#c' })
    const { warnings } = await viewer.importXML(xml)
    if (warnings.length) throw new Error(warnings.map((w) => w.message).join('\n'))
    return (await viewer.saveSVG()).svg
  }, xml)
  writeFileSync(new URL(f.replace('.bpmn', '.svg'), DOSSIER), svg)
  console.log(f)
}
await browser.close()
