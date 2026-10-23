import type { SiteData } from './site'

// Référencement : titre, description et robots de chaque page, plus les données « entreprise locale » pour Google.
// Le site est une application Vue : Google l'exécute, et robots.txt (généré par l'API) garde l'atelier hors de l'index.

function setMeta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.name = name
    document.head.appendChild(el)
  }
  el.content = content
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    document.head.appendChild(el)
  }
  el.href = href
}

/** Remplace la description de la page (texte modifié par la direction). */
export const setDescription = (text: string) => setMeta('description', text)

/** Pages publiques : indexables. Pages de l'atelier : jamais. */
export function applySeo(opts: { site: boolean; title?: string; description?: string; path: string }) {
  setMeta('robots', opts.site ? 'index,follow' : 'noindex,nofollow')
  if (opts.site) {
    if (opts.description) setMeta('description', opts.description)
    setCanonical(`${location.origin}${opts.path === '/' ? '/' : opts.path.replace(/\/$/, '')}`)
  } else {
    document.head.querySelector('link[rel="canonical"]')?.remove()
    document.head.querySelector('meta[name="description"]')?.remove()
  }
}

/** Données structurées « entreprise locale » (LocalBusiness) pour les résultats Google. */
export function applyJsonLd(e: SiteData['entreprise'], addr: { rue: string; codePostal: string; ville: string }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: e.nom,
    url: location.origin,
    ...(e.telephone ? { telephone: e.telephone } : {}),
    ...(e.email ? { email: e.email } : {}),
    address: { '@type': 'PostalAddress', streetAddress: addr.rue, postalCode: addr.codePostal, addressLocality: addr.ville, addressCountry: 'FR' },
  }
  let el = document.head.querySelector<HTMLScriptElement>('script#ld-entreprise')
  if (!el) {
    el = document.createElement('script')
    el.id = 'ld-entreprise'
    el.type = 'application/ld+json'
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(data)
}
