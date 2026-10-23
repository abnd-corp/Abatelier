// Affichage d'un PDF dans la page avec pdf.js : chaque page devient une image (canvas).
// Chargé à la demande, seulement sur les pages qui montrent un aperçu.

/** Dessine toutes les pages de `data` dans `container`, à sa largeur. Renvoie le nombre de pages. */
export async function renderPdf(data: ArrayBuffer, container: HTMLElement, label: string): Promise<number> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  // pdf.js n'évalue pas de code : compatible avec la politique de sécurité du site (script-src 'self')
  const task = pdfjs.getDocument({ data })
  const doc = await task.promise
  try {
    const width = container.clientWidth || 600
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const pages: HTMLCanvasElement[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * ratio })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.setAttribute('role', 'img')
      canvas.setAttribute('aria-label', `${label}, page ${i} sur ${doc.numPages}`)
      await page.render({ canvas, viewport }).promise
      pages.push(canvas)
    }
    container.replaceChildren(...pages)
    return doc.numPages
  } finally {
    await task.destroy()
  }
}
