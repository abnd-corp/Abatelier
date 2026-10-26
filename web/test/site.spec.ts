import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PublicLayout from '@/components/site/PublicLayout.vue'
import SiteReviews from '@/components/site/SiteReviews.vue'
import HomeView from '@/views/site/HomeView.vue'
import PliageView from '@/views/site/PliageView.vue'
import ContactView from '@/views/site/ContactView.vue'
import LegalView from '@/views/site/LegalView.vue'
import SiteAdminView from '@/views/SiteAdminView.vue'
import MailSettings from '@/components/site-admin/MailSettings.vue'
import ConfiguratorView from '@/views/site/ConfiguratorView.vue'
import ContactRequests from '@/components/site-admin/ContactRequests.vue'
import type { OrderCatalog, Totals } from '@/lib/orders'
import { legalBlocks, lines, loadSite, site, splitAddress, telHref, type AvisGoogle, type SiteData } from '@/lib/site'
import { describe as describeEntry, type AuditEntry } from '@/lib/audit-labels'
import { useAuthStore } from '@/stores/auth'
import { ADMIN, freshPinia, makeRouter, mockApi } from './helpers'

vi.mock('@/lib/image', () => ({ resizePhoto: vi.fn(async () => new Blob(['jpeg'], { type: 'image/jpeg' })) }))

const SITE: SiteData = {
  entreprise: {
    nom: 'Alu Pliage Service',
    adresse: 'ZA du Parc\n42490 Fraisses',
    telephone: '06 10 74 86 83',
    email: 'contact@aps.test',
    siret: '503 622 433 00061',
    logo: false,
    itineraire: 'https://www.google.com/maps/place/?q=place_id:X',
  },
  contenu: {
    'accueil.titre': 'Pliage d’aluminium sur mesure',
    'accueil.accroche': 'Fabriqué à vos dimensions.',
    'accueil.presentation': 'Nous fabriquons vos pièces.',
    'accueil.pourquoi': 'Rapidité\nDevis sur mesure',
    'pliage.intro': 'Pliage sur mesure.',
    'produit.couvertine': 'Texte couvertine.',
    'produit.bavette': 'Texte bavette.',
    'produit.bandeau': 'Texte bandeau.',
    'pliage.formes': 'Z, L, U\nSur plan',
    'contact.intro': 'Décrivez votre projet.',
    'site.horaires': 'Du lundi au jeudi : 7h30–12h\nLe vendredi : 7h30–12h',
    'site.description': 'Description',
    'legal.mentions': '# Éditeur\nAlu Pliage Service\nZA du Parc\n\n# Hébergement\nÀ COMPLÉTER',
    'legal.cgv': 'Texte',
  },
  photos: [
    { id: 'p1', emplacement: 'accueil', alt: 'Atelier', largeur: 1200, hauteur: 800 },
    { id: 'p2', emplacement: 'realisation', alt: 'Chantier Firminy', largeur: 800, hauteur: 600 },
    { id: 'p3', emplacement: 'couvertine', alt: 'Couvertine blanche', largeur: 800, hauteur: 600 },
  ],
}
const AVIS: AvisGoogle = {
  configure: true,
  indisponible: false,
  note: 4.9,
  total: 23,
  lien: 'https://maps.google.com/?cid=1',
  lienAvis: 'https://search.google.com/local/writereview?placeid=X',
  avis: [{ auteur: 'Marie L.', note: 5, texte: 'Très bon travail.', quand: 'il y a 2 mois' }],
}
const ROUTES = { 'GET /public/site': [200, SITE], 'GET /public/avis': [200, AVIS] } as const

beforeEach(() => {
  site.value = null
})

async function mountAt(component: object, path: string, routes: Parameters<typeof mockApi>[0] = ROUTES as never, props: Record<string, unknown> = {}) {
  const calls = mockApi(routes)
  const pinia = freshPinia()
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  await loadSite(true)
  const wrapper = mount(component, { props, global: { plugins: [pinia, router], stubs: { RouterView: true } }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router, calls }
}

describe('Aides du site', () => {
  it('découpe un texte juridique en sections et paragraphes', () => {
    expect(legalBlocks('Intro\n\n# Titre A\nLigne 1\nLigne 2\n\nParagraphe 2\n# Titre B\nX')).toEqual([
      { lignes: ['Intro'] },
      { titre: 'Titre A', lignes: ['Ligne 1\nLigne 2', 'Paragraphe 2'] },
      { titre: 'Titre B', lignes: ['X'] },
    ])
  })
  it('met en forme téléphone, adresse et listes', () => {
    expect(telHref('06 10 74 86 83')).toBe('+33610748683')
    expect(splitAddress('ZA du Parc\nRue de l’Ondaine\n42490 Fraisses')).toEqual({ rue: 'ZA du Parc, Rue de l’Ondaine', codePostal: '42490', ville: 'Fraisses' })
    expect(lines(' a \n\n b ')).toEqual(['a', 'b'])
  })
})

describe('Accueil', () => {
  it('affiche le titre, les étapes, les réalisations et un appel au devis, sans connexion', async () => {
    const { wrapper, calls } = await mountAt(HomeView, '/')
    expect(wrapper.get('h1').text()).toBe('Pliage d’aluminium sur mesure')
    // « Comment ça marche » présente les trois parcours, chacun avec ses étapes et son bouton, puis le suivi commun
    const parcours = wrapper.findAll('.parcours-card')
    expect(parcours.map((p) => p.get('h3').text())).toEqual(['Sur mesure', 'Boutique'])
    expect(parcours.map((p) => p.findAll('.p-steps li').length)).toEqual([4, 4])
    expect(parcours.map((p) => p.get('a').attributes('href'))).toEqual(['/configurateur', '/boutique'])
    expect(wrapper.findAll('.suivi-steps li').map((l) => l.get('b').text())).toEqual(['Reçue', 'Validée', 'En fabrication', 'Prête', 'Livrée / retirée'])
    // Chaque étape a la couleur de sa pastille
    expect(wrapper.findAll('.suivi-steps li').map((l) => l.classes().filter((c) => ['warn', 'info', 'accent', 'ok', 'done'].includes(c))[0])).toEqual(['warn', 'info', 'accent', 'ok', 'done'])
    // Les étapes sont sous le texte explicatif
    const suivi = wrapper.get('.suivi')
    expect(suivi.element.children[0]!.classList.contains('suivi-text')).toBe(true)
    expect(suivi.element.children[1]!.classList.contains('suivi-steps')).toBe(true)
    expect(wrapper.get('.steps-band').text()).not.toContain('faisabilité')
    // L'envoi d'un plan n'est plus mis en avant : tout passe par le configurateur ou la boutique
    expect(wrapper.text()).not.toMatch(/Envoyer mon plan|Envoyez-nous votre plan/)
    expect(wrapper.find('img[src="/api/public/photos/p2"]').attributes('alt')).toBe('Chantier Firminy')
    expect(wrapper.find('.hero-photo img').attributes('src')).toBe('/api/public/photos/p1')
    expect(wrapper.text()).toContain('Rapidité')
    expect(wrapper.find('a[href="tel:+33610748683"]').exists()).toBe(true)
    // Les visiteurs n'appellent jamais la session
    expect(calls.map((c) => c.path)).not.toContain('/auth/session')
  })

  it('met le configurateur au cœur de l’accueil : une section dédiée qui y mène, avec les trois étapes', async () => {
    const { wrapper } = await mountAt(HomeView, '/')
    const section = wrapper.get('section[aria-labelledby="configurateur"]')
    expect(section.get('h2').text()).toBe('Configurez votre pièce en ligne')
    expect(section.findAll('.cfg-steps li')).toHaveLength(3)
    const links = section.findAll('a').map((a) => a.attributes('href'))
    expect(links.filter((h) => h === '/configurateur')).toHaveLength(2)
    expect(section.get('a.s-btn.primary').text()).toBe('Ouvrir le configurateur')
    // Le bouton principal du haut de page mène aussi au configurateur
    expect(wrapper.get('.hero a.s-btn.primary').attributes('href')).toBe('/configurateur')
    // Un exemple de profil est dessiné pour donner envie
    expect(section.find('svg').exists()).toBe(true)
  })

  it('remplace une photo absente par un dessin', async () => {
    mockApi({ 'GET /public/site': [200, { ...SITE, photos: [] }], 'GET /public/avis': [200, AVIS] })
    const { wrapper } = await mountAt(HomeView, '/', { 'GET /public/site': [200, { ...SITE, photos: [] }], 'GET /public/avis': [200, AVIS] })
    expect(wrapper.find('.hero-photo .placeholder').exists()).toBe(true)
    expect(wrapper.find('.gallery').exists()).toBe(false)
  })
})

describe('Avis Google', () => {
  it('affiche la note, les avis, et les liens vers Google', async () => {
    const { wrapper } = await mountAt(SiteReviews, '/')
    expect(wrapper.text()).toContain('4,9')
    expect(wrapper.text()).toContain('23 avis sur Google')
    expect(wrapper.text()).toContain('Très bon travail.')
    expect(wrapper.text()).toContain('Marie L.')
    expect(wrapper.find('[aria-label="5 étoiles sur 5"]').exists()).toBe(true)
    const links = wrapper.findAll('a').map((a) => a.attributes('href'))
    expect(links).toEqual(['https://maps.google.com/?cid=1', 'https://search.google.com/local/writereview?placeid=X'])
    expect(wrapper.findAll('a').every((a) => a.attributes('rel')?.includes('noopener'))).toBe(true)
  })

  it('sans clé ou sans réponse de Google : seulement le lien vers la fiche, aucun faux avis', async () => {
    for (const data of [
      { ...AVIS, configure: false, avis: [], note: null, total: 0 },
      { ...AVIS, indisponible: true, avis: [], note: null, total: 0 },
    ]) {
      const { wrapper } = await mountAt(SiteReviews, '/', { 'GET /public/avis': [200, data] })
      expect(wrapper.find('.review').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('4,9')
      expect(wrapper.text()).toContain('Voir tous les avis sur Google')
    }
  })

  it('disparaît quand il n’y a ni avis ni lien', async () => {
    const { wrapper } = await mountAt(SiteReviews, '/', { 'GET /public/avis': [200, { ...AVIS, configure: false, avis: [], lien: null, lienAvis: null }] })
    expect(wrapper.find('section').exists()).toBe(false)
  })
})

describe('Pages Pliage et légales', () => {
  it('présente chaque produit avec sa photo et son texte', async () => {
    const { wrapper } = await mountAt(PliageView, '/pliage-aluminium')
    expect(wrapper.get('#couvertine').text()).toContain('Texte couvertine.')
    expect(wrapper.find('#couvertine img').attributes('src')).toBe('/api/public/photos/p3')
    expect(wrapper.get('#bavette .photos').classes()).toContain('vide')
    expect(wrapper.findAll('.autres li').map((l) => l.text())).toEqual(['Z, L, U', 'Sur plan'])
  })

  it('affiche un texte légal par sections, et laisse visible ce qui reste à compléter', async () => {
    const { wrapper } = await mountAt(LegalView, '/mentions-legales', ROUTES as never, { cle: 'legal.mentions', titre: 'Mentions légales' })
    expect(wrapper.get('h1').text()).toBe('Mentions légales')
    expect(wrapper.findAll('h2').map((h) => h.text())).toEqual(['Éditeur', 'Hébergement'])
    expect(wrapper.text()).toContain('À COMPLÉTER')
  })
})

describe('Mise en page publique', () => {
  it('montre le menu, les horaires, les pages légales et le lien vers l’atelier', async () => {
    const { wrapper } = await mountAt(PublicLayout, '/')
    expect(wrapper.findAll('nav[aria-label="Navigation principale"] a').map((a) => a.text())).toContain('Pliage aluminium')
    expect(wrapper.text()).toContain('Le vendredi : 7h30–12h')
    for (const t of ['Mentions légales', 'Confidentialité', 'Cookies', 'Conditions générales de vente', 'Contact']) expect(wrapper.text()).toContain(t)
    expect(wrapper.text()).not.toContain('Espace atelier')
    // En-tête : pas de Contact ni de « Mon espace » en libellé ; une icône de profil à côté du panier
    const menu = wrapper.findAll('nav[aria-label="Navigation principale"] a').map((a) => a.text())
    expect(menu).not.toContain('Contact')
    expect(menu).not.toContain('Mon espace')
    const head = wrapper.get('header')
    expect(head.get('a[aria-label="Mon espace client"]').attributes('href')).toBe('/espace')
    expect(head.find('a[aria-label="Mon espace client"] svg').exists()).toBe(true)
    expect(head.get('a[aria-label="Mon espace client"]').text()).toBe('')
    expect(head.findAll('a.s-cart').map((a) => a.attributes('aria-label'))).toEqual(['Mon espace client', 'Mon panier, vide'])
    expect(wrapper.get('footer a[href="/contact"]').text()).toBe('Contact')
    expect(wrapper.get('a.skip').attributes('href')).toBe('#contenu')
    const ld = JSON.parse(document.head.querySelector('script#ld-entreprise')!.textContent!)
    expect(ld).toMatchObject({ '@type': 'LocalBusiness', address: { postalCode: '42490', addressLocality: 'Fraisses' } })
  })

  it('ouvre et ferme le menu sur téléphone', async () => {
    const { wrapper } = await mountAt(PublicLayout, '/')
    const burger = wrapper.get('.s-burger')
    expect(burger.attributes('aria-expanded')).toBe('false')
    await burger.trigger('click')
    expect(burger.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('#s-menu').classes()).toContain('open')
  })
})

describe('Formulaire de contact', () => {
  const fill = async (wrapper: ReturnType<typeof mount>) => {
    await wrapper.get('#c-nom').setValue('Jean Dupont')
    await wrapper.get('#c-email').setValue('jean@example.com')
    await wrapper.get('#c-objet').setValue('Couvertine')
    await wrapper.get('#c-message').setValue('Bonjour')
  }

  it('envoie la demande avec le consentement, puis confirme', async () => {
    const { wrapper, calls } = await mountAt(ContactView, '/contact', { ...ROUTES, 'POST /public/contact': [201, { ok: true }] } as never)
    await fill(wrapper)
    await wrapper.get('#c-consentement').setValue(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.path).toBe('/public/contact')
    expect(post.body).toMatchObject({ nom: 'Jean Dupont', email: 'jean@example.com', objet: 'Couvertine', consentement: true, fichier: null, site: '' })
    expect(wrapper.text()).toContain('Message envoyé')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('affiche l’erreur du serveur sous le bon champ et garde la saisie', async () => {
    const { wrapper } = await mountAt(ContactView, '/contact', { ...ROUTES, 'POST /public/contact': [400, { error: 'Adresse e-mail invalide.', field: 'email' }] } as never)
    await fill(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#e-email').text()).toBe('Adresse e-mail invalide.')
    expect(wrapper.get('#c-email').attributes('aria-invalid')).toBe('true')
    expect((wrapper.get('#c-nom').element as HTMLInputElement).value).toBe('Jean Dupont')
    expect(wrapper.text()).not.toContain('Message envoyé')
  })

  it('joint un plan en base64, et refuse un format ou un poids interdit avant l’envoi', async () => {
    const { wrapper, calls } = await mountAt(ContactView, '/contact', { ...ROUTES, 'POST /public/contact': [201, { ok: true }] } as never)
    const input = wrapper.get('#c-fichier')
    const set = async (file: File) => {
      Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
      await input.trigger('change')
    }
    await set(new File(['x'], 'virus.exe', { type: 'application/x-msdownload' }))
    expect(wrapper.get('#e-fichier').text()).toMatch(/Format non accepté/)
    await set(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'gros.pdf', { type: 'application/pdf' }))
    expect(wrapper.get('#e-fichier').text()).toMatch(/5 Mo maximum/)

    await set(new File(['%PDF-1.4'], 'plan.pdf', { type: 'application/pdf' }))
    expect(wrapper.find('#e-fichier').exists()).toBe(false)
    expect(wrapper.text()).toContain('plan.pdf')
    await fill(wrapper)
    await wrapper.get('#c-consentement').setValue(true)
    await wrapper.get('form').trigger('submit')
    // La lecture du fichier (FileReader) est asynchrone : on attend l'envoi
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(calls.find((c) => c.method === 'POST')!.body.fichier).toEqual({ nom: 'plan.pdf', contenu: btoa('%PDF-1.4') })
  })

  it('cache le piège à robots aux personnes et aux lecteurs d’écran', async () => {
    const { wrapper } = await mountAt(ContactView, '/contact')
    const trap = wrapper.get('.trap')
    expect(trap.attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('#c-site').attributes('tabindex')).toBe('-1')
  })
})

describe('Administration du site', () => {
  const DEMANDE = {
    id: 'd1',
    createdAt: '2026-10-20T08:00:00Z',
    nom: 'Jean Dupont',
    email: 'jean@example.com',
    telephone: '06 12 34 56 78',
    adresse: null,
    codePostal: '42490',
    ville: 'Fraisses',
    objet: 'Couvertine 3 m',
    message: 'Bonjour, un devis svp.',
    fichierNom: 'plan.pdf',
    fichierType: 'application/pdf',
    traiteAt: null,
  }
  const CHAMPS = [
    { key: 'accueil.titre', groupe: 'Accueil', label: 'Titre principal', max: 120, defaut: 'Pliage', valeur: 'Pliage', modifie: false },
    { key: 'legal.cgv', groupe: 'Pages légales', label: 'Conditions générales de vente', long: true, max: 12000, defaut: 'CGV À COMPLÉTER', valeur: 'CGV À COMPLÉTER', modifie: false },
  ]
  const PHOTOS = [
    { id: 'a', emplacement: 'realisation', alt: 'Une', largeur: 800, hauteur: 600, position: 1 },
    { id: 'b', emplacement: 'realisation', alt: 'Deux', largeur: 800, hauteur: 600, position: 2 },
  ]
  const mountAdmin = async (path: string, routes: Parameters<typeof mockApi>[0]) => {
    const calls = mockApi(routes)
    const pinia = freshPinia()
    useAuthStore().user = ADMIN
    const router = makeRouter()
    await router.push(path)
    await router.isReady()
    const wrapper = mount(SiteAdminView, { global: { plugins: [pinia, router] } })
    await flushPromises()
    return { wrapper, router, calls }
  }
  const sent = (calls: ReturnType<typeof mockApi>) => calls.filter((c) => c.method !== 'GET').map((c) => ({ method: c.method, path: c.path, body: c.body }))
  const btn = (w: ReturnType<typeof mount>, text: string) => w.findAll('button').find((b) => b.text().includes(text))

  it('liste les demandes à traiter, montre le détail et le plan joint, puis marque comme traitée', async () => {
    const { wrapper, calls } = await mountAdmin('/site-vitrine', {
      'GET /site/contacts?filtre=a_traiter': [200, { demandes: [DEMANDE], aTraiter: 1 }],
      'POST /site/contacts/d1/traite': [200, { ok: true }],
    })
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toContain('Demandes reçues')
    expect(wrapper.get('.badge').text()).toBe('1')
    await wrapper.get('.summary').trigger('click')
    expect(wrapper.text()).toContain('Bonjour, un devis svp.')
    expect(wrapper.get('a[href="/api/site/contacts/d1/fichier"]').text()).toBe('plan.pdf')
    expect(wrapper.find('a[href^="mailto:jean@example.com"]').exists()).toBe(true)
    await btn(wrapper, 'Marquer comme traitée')!.trigger('click')
    await flushPromises()
    expect(sent(calls)).toEqual([{ method: 'POST', path: '/site/contacts/d1/traite', body: { traite: true } }])
  })

  it('demande confirmation avant de supprimer une demande', async () => {
    const { wrapper, calls } = await mountAdmin('/site-vitrine', {
      'GET /site/contacts?filtre=a_traiter': [200, { demandes: [DEMANDE], aTraiter: 1 }],
      'DELETE /site/contacts/d1': [200, { ok: true }],
    })
    await wrapper.get('.summary').trigger('click')
    await btn(wrapper, 'Supprimer')!.trigger('click')
    expect(sent(calls)).toEqual([])
    await btn(wrapper, 'Oui, supprimer')!.trigger('click')
    await flushPromises()
    expect(sent(calls)).toEqual([{ method: 'DELETE', path: '/site/contacts/d1', body: undefined }])
  })

  it('modifie un texte et enregistre seulement ce qui a changé', async () => {
    const { wrapper, calls } = await mountAdmin('/site-vitrine?onglet=textes', {
      'GET /site/content': [200, { champs: CHAMPS }],
      'PATCH /site/content': (body) => [200, { champs: CHAMPS.map((c) => (c.key in body.valeurs ? { ...c, valeur: body.valeurs[c.key], modifie: true } : c)) }],
    })
    expect(wrapper.get('.bar .btn.primary').attributes('disabled')).toBeDefined()
    await wrapper.get('#f-accueil\\.titre').setValue('Nouveau titre')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(sent(calls)).toEqual([{ method: 'PATCH', path: '/site/content', body: { valeurs: { 'accueil.titre': 'Nouveau titre' } } }])
    expect(wrapper.text()).toContain('Textes enregistrés')
    expect(wrapper.text()).toContain('Rétablir le texte d’origine')
  })

  it('sépare les pages légales des textes du site', async () => {
    const textes = await mountAdmin('/site-vitrine?onglet=textes', { 'GET /site/content': [200, { champs: CHAMPS }] })
    expect(textes.wrapper.find('#f-accueil\\.titre').exists()).toBe(true)
    expect(textes.wrapper.find('#f-legal\\.cgv').exists()).toBe(false)
    expect(textes.wrapper.text()).not.toContain('À compléter avant la mise en ligne')

    const legal = await mountAdmin('/site-vitrine?onglet=legal', {
      'GET /site/content': [200, { champs: CHAMPS }],
      'PATCH /site/content': (body) => [200, { champs: CHAMPS.map((c) => (c.key in body.valeurs ? { ...c, valeur: body.valeurs[c.key], modifie: true } : c)) }],
    })
    expect(legal.wrapper.find('#f-accueil\\.titre').exists()).toBe(false)
    expect(legal.wrapper.find('#f-legal\\.cgv').exists()).toBe(true)
    expect(legal.wrapper.text()).toContain('À compléter avant la mise en ligne')
    await legal.wrapper.get('#f-legal\\.cgv').setValue('Nouvelles conditions')
    await legal.wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(sent(legal.calls)).toEqual([{ method: 'PATCH', path: '/site/content', body: { valeurs: { 'legal.cgv': 'Nouvelles conditions' } } }])
    expect(legal.wrapper.text()).toContain('Pages légales enregistrées')
  })

  it('affiche l’erreur du serveur sur un texte refusé', async () => {
    const { wrapper } = await mountAdmin('/site-vitrine?onglet=textes', {
      'GET /site/content': [200, { champs: CHAMPS }],
      'PATCH /site/content': [400, { error: '« Titre principal » : 120 caractères maximum.', field: 'accueil.titre' }],
    })
    await wrapper.get('#f-accueil\\.titre').setValue('x')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('120 caractères')
    expect(wrapper.get('#f-accueil\\.titre').classes()).toContain('invalid')
  })

  it('envoie les photos réduites à l’emplacement choisi, avec leur description', async () => {
    const { wrapper, calls } = await mountAdmin('/site-vitrine?onglet=photos', {
      'GET /site/photos': [200, { photos: PHOTOS }],
      'POST /site/photos?emplacement=couvertine&alt=Couvertine%20blanche': [201, { id: 'z' }],
    })
    await wrapper.get('#p-place').setValue('couvertine')
    await wrapper.get('#p-alt').setValue('Couvertine blanche')
    Object.defineProperty(wrapper.get('#p-file').element, 'files', { value: [new File(['x'], 'IMG_1.png', { type: 'image/png' })], configurable: true })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.path).toBe('/site/photos?emplacement=couvertine&alt=Couvertine%20blanche')
    expect((post.body as Blob).type).toBe('image/jpeg')
    expect(wrapper.text()).toContain('1 photo ajoutée')
  })

  it('décrit, déplace et supprime une photo', async () => {
    const { wrapper, calls } = await mountAdmin('/site-vitrine?onglet=photos', {
      'GET /site/photos': [200, { photos: PHOTOS }],
      'PATCH /site/photos/a': [200, { ok: true }],
      'POST /site/photos/b/deplacer': [200, { ok: true }],
      'DELETE /site/photos/a': [200, { ok: true }],
    })
    const alt = wrapper.get('#alt-a')
    await alt.setValue('Nouvelle description')
    await wrapper.get('[aria-label="Monter la photo 2"]').trigger('click')
    expect(wrapper.get('[aria-label="Monter la photo 1"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[aria-label="Supprimer la photo 1"]').trigger('click')
    await btn(wrapper, 'Supprimer')!.trigger('click')
    await flushPromises()
    expect(sent(calls)).toEqual([
      { method: 'PATCH', path: '/site/photos/a', body: { alt: 'Nouvelle description' } },
      { method: 'POST', path: '/site/photos/b/deplacer', body: { sens: 'haut' } },
      { method: 'DELETE', path: '/site/photos/a', body: undefined },
    ])
  })
})

describe('Journal : actions du site', () => {
  const entry = (action: string, details: Record<string, unknown> = {}): AuditEntry => ({
    id: 1,
    at: '2026-10-20T08:00:00Z',
    action,
    identifiant: null,
    nom: null,
    userId: null,
    targetType: null,
    targetId: null,
    targetName: null,
    ip: null,
    device: '',
    details,
  })
  it.each([
    ['site.content_updated', { champs: ['Titre principal', 'Horaires'] }, /Titre principal, Horaires/],
    ['site.content_reset', { champ: 'Titre principal' }, /rétabli/],
    ['site.photo_added', { emplacement: 'couvertine', largeur: 800, hauteur: 600 }, /couvertine, 800 × 600/],
    ['site.photo_updated', { champs: ['description'] }, /description/],
    ['site.photo_deleted', { emplacement: 'realisation' }, /réalisations/],
    ['contact.received', { objet: 'Couvertine', fichier: true }, /« Couvertine ».*plan joint/],
    ['contact.file_downloaded', { objet: 'Couvertine' }, /plan joint/],
    ['contact.handled', { objet: 'Couvertine' }, /traitée/],
    ['contact.reopened', { objet: 'Couvertine' }, /à traiter/],
    ['contact.deleted', { objet: 'Couvertine' }, /supprimé/],
  ])('décrit %s', (action, details, expected) => {
    const d = describeEntry(entry(action, details))
    expect(d.text).toMatch(expected)
    expect(d.text).not.toBe(action)
  })
})

describe('Onglet E-mails', () => {
  const STATUS = {
    configure: true,
    expediteur: 'Alu Pliage Service <contact@aps.test>',
    alertes: ['direction@aps.test'],
    journal: [
      { id: 'l1', at: '2026-10-20T08:00:00Z', kind: 'contact', destinataires: 'direction@aps.test', objet: 'Nouvelle demande de contact : Couvertine', statut: 'envoye', erreur: null },
      { id: 'l2', at: '2026-10-20T08:05:00Z', kind: 'document', destinataires: 'jean@example.com', objet: 'Facture F-2026-0001', statut: 'echec', erreur: 'serveur de messagerie injoignable' },
    ],
  }
  const mountMail = async (routes: Parameters<typeof mockApi>[0]) => {
    const calls = mockApi(routes)
    const pinia = freshPinia()
    useAuthStore().user = ADMIN
    const router = makeRouter()
    await router.push('/site-vitrine?onglet=emails')
    await router.isReady()
    const wrapper = mount(MailSettings, { global: { plugins: [pinia, router] } })
    await flushPromises()
    return { wrapper, calls }
  }

  it('montre l’expéditeur, les destinataires des alertes et les derniers envois, échecs compris', async () => {
    const { wrapper } = await mountMail({ 'GET /mail/status': [200, STATUS] })
    expect(wrapper.text()).toContain('contact@aps.test')
    expect(wrapper.text()).toContain('direction@aps.test')
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('Envoyé')
    expect(rows[1]!.text()).toContain('Échec')
    expect(rows[1]!.text()).toContain('serveur de messagerie injoignable')
  })

  it('envoie un message d’essai et rafraîchit l’historique', async () => {
    const { wrapper, calls } = await mountMail({ 'GET /mail/status': [200, STATUS], 'POST /mail/test': [200, { ok: true }] })
    await wrapper.get('#mail-test').setValue('moi@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({ path: '/mail/test', body: { to: 'moi@example.com' } })
    expect(wrapper.text()).toContain('Message d’essai envoyé')
    expect(calls.filter((c) => c.path === '/mail/status')).toHaveLength(2)
  })

  it('montre l’erreur quand l’essai échoue', async () => {
    const { wrapper } = await mountMail({
      'GET /mail/status': [200, STATUS],
      'POST /mail/test': [502, { error: 'Le message d’essai n’est pas parti : identifiants refusés par le serveur de messagerie.' }],
    })
    await wrapper.get('#mail-test').setValue('moi@example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('identifiants refusés')
  })

  it('explique clairement que rien n’est envoyé tant que ce n’est pas configuré, sans proposer d’essai', async () => {
    const { wrapper } = await mountMail({ 'GET /mail/status': [200, { ...STATUS, configure: false, expediteur: null, alertes: [], journal: [] }] })
    expect(wrapper.text()).toContain('Pas encore configuré')
    expect(wrapper.find('#mail-test').exists()).toBe(false)
    expect(wrapper.text()).toContain('Aucun e-mail envoyé')
  })
})

describe('Configurateur public', () => {
  const CATALOG: OrderCatalog = {
    models: [
      {
        id: 'couvertine',
        nom: 'Couvertine',
        cotes: [20, 70, 300, 70, 20],
        angles: [-135, 90, 90, -135],
        noms: ['Larmier', 'Retombée', 'Dessus', 'Retombée', 'Larmier'],
        cap: -45,
        longueur: 3000,
        quantite: 4,
      },
    ],
    materials: [{ id: 'm1', label: 'Aluminium 1,5 mm', epaisseur: 1.5, retourMin: 10 }],
    colors: [{ id: 'k1', label: 'Gris anthracite (RAL 7016)', hex: '#383e42' }],
    accessories: [],
    limits: { largeurTole: 1250, longueurMin: 200, longueurMax: 3000, plisMax: 8, angleMin: 30, angleMax: 175, pince: true },
    retrait: true,
  }
  const TOTALS: Totals = {
    brut: 432.12,
    tauxRemisePro: 0,
    remisePro: 0,
    complementMinimum: 0,
    livraisonPrix: 0,
    livraisonOfferte: false,
    ht: 432.12,
    tauxTva: 20,
    tva: 86.42,
    ttc: 518.54,
    delaiJours: 5,
  } as Totals
  const LINE = {
    repere: null,
    modelId: 'couvertine',
    modeleLabel: 'Couvertine',
    cap: -45,
    materialLabel: 'Aluminium 1,5 mm',
    colorLabel: 'Gris anthracite (RAL 7016)',
    colorHex: '#383e42',
    cotes: [20, 70, 300, 70, 20],
    angles: [-135, 90, 90, -135],
    longueur: 3000,
    quantite: 4,
    accessoires: [],
    prixUnitaire: 100.08,
    remiseQuantite: 0,
    montantPieces: 400.32,
    montantAccessoires: 0,
    miseEnRoute: 18,
    total: 432.12,
  }
  const QUOTE = { lignes: [LINE], totals: TOTALS, distanceKm: null }
  const routes = (extra: Parameters<typeof mockApi>[0] = {}) =>
    ({ 'GET /public/configurateur': [200, CATALOG], 'POST /public/configurateur/chiffrage': [200, QUOTE], ...extra }) as Parameters<typeof mockApi>[0]

  const mountConfig = async (extra: Parameters<typeof mockApi>[0] = {}) => {
    const calls = mockApi(routes(extra))
    const pinia = freshPinia()
    const router = makeRouter()
    await router.push('/configurateur')
    await router.isReady()
    const wrapper = mount(ConfiguratorView, { global: { plugins: [pinia, router] }, attachTo: document.body })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 450))
    await flushPromises()
    return { wrapper, calls }
  }
  it('charge le catalogue public, chiffre avec la route publique et affiche le prix, sans appeler la session', async () => {
    const { wrapper, calls } = await mountConfig()
    expect(wrapper.get('h1').text()).toContain('Dessinez votre pièce')
    expect(calls.map((c) => c.path)).toContain('/public/configurateur')
    const quote = calls.find((c) => c.path === '/public/configurateur/chiffrage')!
    expect(quote.method).toBe('POST')
    expect(quote.body.lignes).toHaveLength(1)
    expect(quote.body.livraison).toEqual({ mode: 'retrait' })
    expect(wrapper.text().replace(/[\u202f\u00a0]/g, ' ')).toContain('518,54 €')
    expect(calls.map((c) => c.path)).not.toContain('/auth/session')
    expect(calls.map((c) => c.path)).not.toContain('/orders/quote')
    // Pas de notes internes pour un visiteur
    expect(wrapper.find('#o-notes').exists()).toBe(false)
  })

  const COMPTE = { prenom: 'Jean', nom: 'Dupont', email: 'jean@example.com', telephone: null, type: 'particulier' as const, proVerifie: false }
  const mountSite = (extra: Parameters<typeof mockApi>[0] = {}) => mountConfig({ 'GET /espace/session': [200, { compte: null }], ...extra })
  const mountLogged = (extra: Parameters<typeof mockApi>[0] = {}) => mountConfig({ 'GET /espace/session': [200, { compte: COMPTE }], ...extra })
  const bouton = (w: ReturnType<typeof mount>, texte: string) => w.findAll('button').find((b) => b.text().includes(texte))!

  it('vérifie la session de l’espace client, jamais celle de l’atelier', async () => {
    const { calls } = await mountSite()
    expect(calls.map((c) => c.path)).toContain('/espace/session')
    expect(calls.map((c) => c.path)).not.toContain('/auth/session')
  })

  it('n’a plus de section « Obtenir mon devis » : ni explications, ni formulaire de compte, ni renvoi vers le contact', async () => {
    const { wrapper } = await mountSite()
    expect(wrapper.find('#devis').exists()).toBe(false)
    expect(wrapper.find('form.auth').exists()).toBe(false)
    for (const t of ['Pourquoi un espace client ?', 'Ce que nous faisons de vos données', 'nous envoyer votre plan', 'Obtenir mon devis']) expect(wrapper.text()).not.toContain(t)
  })

  it('sans compte : seul « Télécharger le devis » est possible, les deux autres sont grisés avec la raison et le chemin pour se connecter', async () => {
    const { wrapper } = await mountSite()
    expect(bouton(wrapper, 'Télécharger le devis').attributes('disabled')).toBeUndefined()
    for (const t of ['Enregistrer le devis', 'Passer la commande']) {
      const b = bouton(wrapper, t)
      expect(b.attributes('disabled')).toBeDefined()
      expect(b.attributes('aria-describedby')).toBe('cfg-why')
    }
    const why = wrapper.get('#cfg-why')
    expect(why.text()).toContain('il faut être connecté à votre espace client')
    expect(why.findAll('a').map((a) => a.attributes('href'))).toEqual(['/espace/connexion?redirect=/configurateur', '/espace/inscription?redirect=/configurateur'])
  })

  it('télécharge le devis en PDF sans compte, sans rien créer', async () => {
    const created = vi.fn(() => 'blob:devis')
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { wrapper, calls } = await mountSite({ 'POST /public/configurateur/estimation.pdf': [200, { pdf: true }] })
    await bouton(wrapper, 'Télécharger le devis').trigger('click')
    await flushPromises()
    const dl = calls.filter((c) => c.path === '/public/configurateur/estimation.pdf')
    expect(dl).toHaveLength(1)
    expect(dl[0]!.body.lignes[0]).toMatchObject({ modelId: 'couvertine', longueur: 3000, quantite: 4 })
    expect(created).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    expect(calls.map((c) => c.path)).not.toContain('/espace/devis')
    click.mockRestore()
  })

  it('connecté : les trois boutons sont actifs, sans message de connexion', async () => {
    const { wrapper } = await mountLogged()
    for (const t of ['Télécharger le devis', 'Enregistrer le devis', 'Passer la commande']) expect(bouton(wrapper, t).attributes('disabled')).toBeUndefined()
    expect(wrapper.get('#cfg-why').text()).not.toContain('il faut être connecté')
    expect(wrapper.get('#cfg-why').text()).toContain('votre espace client')
  })

  it('enregistre le devis avec les pièces et la précision, sans jamais envoyer de prix, puis ouvre la commande', async () => {
    const { wrapper, calls } = await mountLogged({ 'POST /espace/devis': [201, { id: 'o9', numero: 'C-2026-0009', devis: { id: 'd9', numero: 'D-2026-0009' } }] })
    await wrapper.get('#d-precision').setValue('Pour un muret.')
    await bouton(wrapper, 'Enregistrer le devis').trigger('click')
    await flushPromises()
    const devis = calls.find((c) => c.path === '/espace/devis')!
    expect(devis.method).toBe('POST')
    expect(devis.body).toMatchObject({ livraison: { mode: 'retrait' }, notes: 'Pour un muret.' })
    expect(devis.body.lignes[0]).toMatchObject({ modelId: 'couvertine', materialId: 'm1', colorId: 'k1', longueur: 3000, quantite: 4 })
    expect(JSON.stringify(devis.body)).not.toMatch(/ttc|518/)
    expect(calls.map((c) => c.path)).not.toContain('/espace/commande')
  })

  it('passe la commande : ouvre le paiement en ligne avec les pièces, sans prix', async () => {
    const { wrapper, calls } = await mountLogged({ 'POST /espace/commande': [201, { id: 'p1', url: '/paiement-simulation/p1' }] })
    await bouton(wrapper, 'Passer la commande').trigger('click')
    await flushPromises()
    const cmd = calls.find((c) => c.path === '/espace/commande')!
    expect(cmd.method).toBe('POST')
    expect(cmd.body.lignes).toHaveLength(1)
    expect(JSON.stringify(cmd.body)).not.toMatch(/ttc|518/)
    expect(calls.map((c) => c.path)).not.toContain('/espace/devis')
  })

  it('montre l’erreur du serveur (paiement fermé, limite de devis) et garde le client connecté', async () => {
    const closed = await mountLogged({ 'POST /espace/commande': [503, { error: 'Le paiement en ligne n’est pas encore ouvert.' }] })
    await bouton(closed.wrapper, 'Passer la commande').trigger('click')
    await flushPromises()
    expect(closed.wrapper.get('[role="alert"]').text()).toContain('pas encore ouvert')
    const limit = await mountLogged({ 'POST /espace/devis': [429, { error: 'Vous avez déjà demandé 10 devis aujourd’hui.' }] })
    await bouton(limit.wrapper, 'Enregistrer le devis').trigger('click')
    await flushPromises()
    expect(limit.wrapper.get('[role="alert"]').text()).toContain('10 devis')
    expect(bouton(limit.wrapper, 'Enregistrer le devis').attributes('disabled')).toBeUndefined()
  })

  it('grise les trois boutons quand le prix ne s’affiche pas, et dit pourquoi', async () => {
    const { wrapper } = await mountLogged({ 'POST /public/configurateur/chiffrage': [400, { error: 'Longueur : 3000 mm maximum.', field: 'lignes.0.longueur' }] })
    expect(wrapper.text()).toContain('Longueur : 3000 mm maximum.')
    for (const t of ['Télécharger le devis', 'Enregistrer le devis', 'Passer la commande']) expect(bouton(wrapper, t).attributes('disabled')).toBeDefined()
    expect(wrapper.get('#cfg-why').text()).toContain('Corrigez d’abord les pièces signalées')
  })

  it('garde la saisie quand on part se connecter, et dit quand le catalogue est vide', async () => {
    sessionStorage.clear()
    const first = await mountSite()
    await first.wrapper.get('#l0-repere').setValue('Mur nord')
    await flushPromises()
    first.wrapper.unmount()
    const back = await mountSite()
    expect((back.wrapper.get('#l0-repere').element as HTMLInputElement).value).toBe('Mur nord')
    sessionStorage.clear()
    const empty = await mountSite({ 'GET /public/configurateur': [200, { ...CATALOG, models: [] }] })
    expect(empty.wrapper.text()).toContain('pas disponible pour l’instant')
    const down = await mountSite({ 'GET /public/configurateur': [500, { error: 'Le serveur a rencontré un problème.' }] })
    expect(down.wrapper.find('[role="alert"]').exists()).toBe(true)
  })

  it('réduit une pièce, ou toutes, en gardant un résumé et la possibilité de les rouvrir', async () => {
    sessionStorage.clear()
    const { wrapper } = await mountSite()
    const bodies = () => wrapper.findAll('.line-body')
    expect(wrapper.find('.fold-all').exists()).toBe(false)
    await wrapper.get('button[aria-label="Dupliquer la pièce 1"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('section.line')).toHaveLength(2)
    expect(wrapper.find('.fold-all').exists()).toBe(true)
    const reduire1 = wrapper.get('button[aria-label="Réduire la pièce 1"]')
    expect(reduire1.attributes('aria-expanded')).toBe('true')
    await reduire1.trigger('click')
    expect(bodies()[0]!.attributes('style')).toContain('display: none')
    expect(bodies()[1]!.attributes('style') ?? '').not.toContain('display: none')
    expect(wrapper.get('section.line.reduced .resume').text()).toContain('Couvertine')
    expect(wrapper.get('section.line.reduced .resume').text()).toContain('4 pièces')
    expect(wrapper.get('button[aria-label="Développer la pièce 1"]').attributes('aria-expanded')).toBe('false')
    await bouton(wrapper, 'Tout réduire').trigger('click')
    expect(bodies().every((b) => (b.attributes('style') ?? '').includes('display: none'))).toBe(true)
    expect(bouton(wrapper, 'Tout réduire').attributes('disabled')).toBeDefined()
    await bouton(wrapper, 'Tout développer').trigger('click')
    expect(bodies().every((b) => !(b.attributes('style') ?? '').includes('display: none'))).toBe(true)
    sessionStorage.clear()
  })

  describe('côté direction', () => {
    const DEMANDE = {
      id: 'd1',
      createdAt: '2026-10-20T08:00:00Z',
      nom: 'Jean Dupont',
      email: 'jean@example.com',
      telephone: null,
      adresse: null,
      codePostal: '42490',
      ville: 'Fraisses',
      objet: 'Demande de devis : 4 pièces, 518,54 € TTC',
      message: 'Pour un muret.',
      fichierNom: null,
      fichierType: null,
      configuration: { resume: ['4 × Couvertine · Aluminium 1,5 mm · Gris anthracite (RAL 7016) · longueur 3 000 mm'], ht: 432.12, ttc: 518.54 },
      commandeId: null,
      traiteAt: null,
    }
    const mountList = async (demande: object, extra: Parameters<typeof mockApi>[0] = {}) => {
      const calls = mockApi({ 'GET /site/contacts?filtre=a_traiter': [200, { demandes: [demande], aTraiter: 1 }], ...extra })
      const pinia = freshPinia()
      useAuthStore().user = ADMIN
      const router = makeRouter()
      await router.push('/site-vitrine')
      await router.isReady()
      const wrapper = mount(ContactRequests, { global: { plugins: [pinia, router] } })
      await flushPromises()
      await wrapper.get('.summary').trigger('click')
      return { wrapper, router, calls }
    }

    it('montre les pièces et le prix des anciennes demandes, sans proposer de créer une commande', async () => {
      const { wrapper } = await mountList(DEMANDE)
      expect(wrapper.text()).toContain('Pièces choisies dans le configurateur')
      expect(wrapper.text()).toContain('4 × Couvertine')
      expect(wrapper.text().replace(/[\u202f\u00a0]/g, ' ')).toContain('518,54 € TTC')
      expect(wrapper.text()).not.toContain('Créer la commande')
    })

    it('propose de voir la commande déjà créée', async () => {
      const done = await mountList({ ...DEMANDE, commandeId: 'o9', traiteAt: '2026-10-20T09:00:00Z' })
      expect(done.wrapper.find('a[href="/commandes/o9"]').text()).toContain('Voir la commande')
    })

    it('décrit la création de commande dans le journal', () => {
      const d = describeEntry({
        id: 1,
        at: '2026-10-20T08:00:00Z',
        action: 'contact.order_created',
        identifiant: 'chef',
        nom: 'Le Chef',
        userId: 'u',
        targetType: null,
        targetId: null,
        targetName: null,
        ip: null,
        device: '',
        details: { objet: 'Demande de devis', commande: 'C-2026-0009', clientCree: true },
      })
      expect(d.text).toBe('A créé la commande C-2026-0009 à partir de la demande « Demande de devis » (nouvelle fiche client)')
    })
  })
})
