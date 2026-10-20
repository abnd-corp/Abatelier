import { eq, sql } from 'drizzle-orm'
import { db } from './db/index.js'
import { siteContent } from './db/schema.js'
import { getCompany } from './documents.js'

// Textes du site vitrine. La direction les modifie dans « Site vitrine » ; sans modification on affiche la valeur par défaut.
// Dans les textes juridiques, {raisonSociale}, {adresse}, {siret}, {telephone} et {email} viennent de « Modèles de documents ».

export interface Field {
  key: string
  groupe: string
  label: string
  // Zone de texte sur plusieurs lignes
  long?: boolean
  max: number
  defaut: string
}

const MENTIONS = `# Éditeur du site
{raisonSociale}
{adresse}
Téléphone : {telephone}
E-mail : {email}
SIRET : {siret}

# Responsable de la publication
La direction de {raisonSociale}.

# Hébergement
À COMPLÉTER : nom, adresse et téléphone de l’hébergeur du site.

# Propriété intellectuelle
Les textes, photos et schémas de ce site sont la propriété de {raisonSociale}. Toute reproduction sans autorisation est interdite.

# Données personnelles
Voir la politique de confidentialité.`

const CONFIDENTIALITE = `# Qui est responsable de vos données ?
{raisonSociale}, {adresse}. Pour toute question : {email}.

# Quelles données, et pourquoi ?
Quand vous nous écrivez par le formulaire de contact, nous recevons votre nom, votre adresse e-mail, votre message, et ce que vous choisissez d’ajouter : téléphone, adresse, plan joint. Nous les utilisons uniquement pour répondre à votre demande et, si vous passez commande, pour établir votre devis, votre commande et votre facture.

# Combien de temps ?
Une demande restée sans suite est supprimée au bout de 12 mois. Les devis, commandes et factures sont conservés le temps imposé par la loi (10 ans pour les factures).

# Qui y a accès ?
Seule l’équipe de {raisonSociale}. Vos données ne sont ni vendues ni transmises à des tiers à des fins commerciales.

# Vos droits
Vous pouvez demander l’accès à vos données, leur correction ou leur suppression en écrivant à {email}. Vous pouvez aussi saisir la CNIL (www.cnil.fr).

# Cookies et suivi
Ce site n’utilise aucun cookie de suivi ni outil de mesure d’audience. Voir la page « Cookies ».`

const COOKIES = `# Aucun cookie de suivi
En tant que visiteur, vous ne recevez aucun cookie : ce site ne contient ni publicité, ni outil de mesure d’audience, ni vidéo ou carte intégrée venant d’un autre site. C’est pourquoi il n’affiche pas de bandeau de consentement.

# Espace réservé à l’équipe
Seule l’équipe de {raisonSociale}, une fois connectée à l’atelier, reçoit un cookie de session, strictement nécessaire à son fonctionnement.

# Liens vers d’autres sites
Le bouton « Voir sur Google » et le lien d’itinéraire vous envoient sur le site de Google, qui a ses propres règles.`

const CGV = `# Objet
Les présentes conditions s’appliquent à toute commande de pièces de tôlerie (pliage d’aluminium ou d’acier) passée auprès de {raisonSociale}, {adresse}.

# Devis et commande
Les pièces sont fabriquées sur mesure, d’après les dimensions, la matière et le coloris que vous indiquez. Un devis gratuit vous est remis avant toute fabrication ; il est valable pendant la durée qui y est indiquée. La commande est ferme une fois le devis accepté. Vous êtes responsable des cotes que vous nous transmettez.

# Prix
Les prix sont indiqués en euros, hors taxes et toutes taxes comprises. Ils comprennent le façonnage ; la livraison est facturée à part, sauf mention contraire sur le devis.

# Paiement
Les conditions de paiement figurent sur le devis et sur la facture. En cas de retard, des pénalités de retard et l’indemnité forfaitaire de recouvrement de 40 € sont dues entre professionnels.

# Délais
Les délais sont donnés à titre indicatif et courent à partir de la validation de la commande. Un retard ne donne pas droit à annulation ni à indemnité, sauf accord écrit.

# Retrait et livraison
Les pièces sont à retirer à l’atelier ou livrées sur le chantier. Vérifiez les pièces à la réception et signalez toute anomalie sous 48 heures.

# Droit de rétractation
Les pièces étant fabriquées selon vos spécifications, le droit de rétractation de 14 jours ne s’applique pas aux particuliers (article L221-28 du Code de la consommation).

# Garanties
Les garanties légales de conformité et des vices cachés s’appliquent. La garantie ne couvre pas une pièce conforme à la commande mais mal dimensionnée, ni une mauvaise pose.

# Litiges
Droit français. Un consommateur peut recourir gratuitement à un médiateur de la consommation. À COMPLÉTER : nom et coordonnées du médiateur.`

export const FIELDS: Field[] = [
  // Accueil
  { key: 'accueil.titre', groupe: 'Accueil', label: 'Titre principal', max: 120, defaut: 'Pliage d’aluminium et d’acier sur mesure' },
  { key: 'accueil.accroche', groupe: 'Accueil', label: 'Phrase sous le titre', long: true, max: 300, defaut: 'Couvertines, bavettes d’appui, bandeaux : fabriqués à vos dimensions dans notre atelier de Fraisses, près de Saint-Étienne.' },
  { key: 'accueil.presentation', groupe: 'Accueil', label: 'Présentation de l’atelier', long: true, max: 1200, defaut: 'Nous fabriquons toutes sortes de pièces de tôlerie pliée, pour les professionnels du bâtiment (façadiers, étancheurs, couvreurs, maçons, architectes) comme pour les particuliers. Équipés de cisailles et de plieuses numériques de dernière génération, nous façonnons à la demande vos pièces en aluminium jusqu’à 3 mètres, avec un suivi personnalisé, efficace et rapide.' },
  { key: 'accueil.etape1', groupe: 'Comment ça marche', label: 'Étape 1', long: true, max: 300, defaut: 'Envoyez votre plan par le formulaire de contact. Tout format est accepté : PDF, photo, croquis à main levée sur un bout de carton.' },
  { key: 'accueil.etape2', groupe: 'Comment ça marche', label: 'Étape 2', long: true, max: 300, defaut: 'Nous vérifions la faisabilité de la pièce avec nos machines. Une question ? Nous vous appelons pour proposer une solution.' },
  { key: 'accueil.etape3', groupe: 'Comment ça marche', label: 'Étape 3', long: true, max: 300, defaut: 'Vous recevez un devis précis pour calculer votre chantier au plus juste.' },
  { key: 'accueil.etape4', groupe: 'Comment ça marche', label: 'Étape 4', long: true, max: 300, defaut: 'C’est validé : la pièce part en fabrication. Retrait à l’atelier ou livraison sur votre chantier.' },
  { key: 'accueil.pourquoi', groupe: 'Accueil', label: 'Pourquoi nous choisir (un point par ligne)', long: true, max: 800, defaut: 'Disponibilité et rapidité\nConseils et partage de savoir-faire\nDevis sur mesure\nTarifs compétitifs\nUn interlocuteur à l’écoute' },
  // Pages produits
  { key: 'pliage.intro', groupe: 'Pliage aluminium', label: 'Introduction', long: true, max: 1200, defaut: 'Pliage sur mesure d’aluminium, d’acier et d’acier galvanisé, pour protéger et habiller vos constructions : couvertines, bavettes d’appui de fenêtre, bandeaux, encadrements de porte.' },
  { key: 'produit.couvertine', groupe: 'Pliage aluminium', label: 'Couvertine', long: true, max: 1200, defaut: 'La couvertine protège le dessus des murs de clôture, des acrotères et des toits-terrasses. Elle assure l’étanchéité et préserve la maçonnerie de la saleté, des intempéries et de la pollution. Fabriquée à vos dimensions jusqu’à 3 mètres, avec larmiers, elle se fixe par pattes ou par mastic-colle. Des accessoires complètent la finition : bouchons et éclisses de jonction.' },
  { key: 'produit.bavette', groupe: 'Pliage aluminium', label: 'Bavette d’appui de fenêtre', long: true, max: 1200, defaut: 'La bavette d’appui évacue l’eau de pluie et protège le bas de la fenêtre. Avec ou sans rejingot, avec pente et larmier, elle se termine par des embouts latéraux. Vous choisissez les dimensions et le coloris.' },
  { key: 'produit.bandeau', groupe: 'Pliage aluminium', label: 'Bandeau et planche de rive', long: true, max: 1200, defaut: 'Le bandeau habille et protège les rives de toiture et les débords de façade. Il se fait en L, en U ou avec retour, jusqu’à 3 mètres, avec des angles de bandeau assortis.' },
  { key: 'pliage.formes', groupe: 'Pliage aluminium', label: 'Autres pliages (un par ligne)', long: true, max: 600, defaut: 'Z, L, U, oméga\nAngles et profils à plusieurs plis\nTôle plate découpée à la cisaille\nPièces personnalisées sur plan' },
  // Contact et pied de page
  { key: 'contact.intro', groupe: 'Contact', label: 'Introduction de la page Contact', long: true, max: 600, defaut: 'Un devis, une couleur, une dimension ou un pliage particulier ? Décrivez votre projet et joignez votre plan si vous en avez un : nous vous répondons rapidement.' },
  { key: 'site.horaires', groupe: 'Contact', label: 'Horaires (une ligne par jour ou groupe de jours)', long: true, max: 400, defaut: 'Du lundi au jeudi : 7h30–12h et 13h30–16h\nLe vendredi : 7h30–12h' },
  { key: 'site.description', groupe: 'Référencement', label: 'Description pour les moteurs de recherche', long: true, max: 200, defaut: 'Alu Pliage Service, pliage de tôle aluminium sur mesure à Fraisses, près de Saint-Étienne : couvertines, bavettes, bandeaux. Devis gratuit.' },
  // Pages légales
  { key: 'legal.mentions', groupe: 'Pages légales', label: 'Mentions légales', long: true, max: 6000, defaut: MENTIONS },
  { key: 'legal.confidentialite', groupe: 'Pages légales', label: 'Politique de confidentialité', long: true, max: 8000, defaut: CONFIDENTIALITE },
  { key: 'legal.cookies', groupe: 'Pages légales', label: 'Cookies', long: true, max: 4000, defaut: COOKIES },
  { key: 'legal.cgv', groupe: 'Pages légales', label: 'Conditions générales de vente', long: true, max: 12000, defaut: CGV },
]

export const FIELD = new Map(FIELDS.map((f) => [f.key, f]))

/** Valeurs enregistrées (les champs jamais modifiés ne sont pas en base). */
async function stored() {
  const rows = await db.select().from(siteContent)
  return new Map(rows.map((r) => [r.key, r.value]))
}

/** Tous les textes, avec la valeur par défaut pour ceux qui n'ont pas été modifiés. */
export async function getContent() {
  const saved = await stored()
  return Object.fromEntries(FIELDS.map((f) => [f.key, saved.get(f.key) ?? f.defaut]))
}

/** Même chose, avec le détail utile à l'éditeur. */
export async function getEditableContent() {
  const saved = await stored()
  return FIELDS.map((f) => ({ ...f, valeur: saved.get(f.key) ?? f.defaut, modifie: saved.has(f.key) && saved.get(f.key) !== f.defaut }))
}

export async function setContent(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    const f = FIELD.get(key)!
    // Remettre le texte d'origine efface la ligne : on retrouve les futures améliorations des valeurs par défaut
    if (value === f.defaut) await db.delete(siteContent).where(eq(siteContent.key, key))
    else await db.insert(siteContent).values({ key, value }).onConflictDoUpdate({ target: siteContent.key, set: { value, updatedAt: sql`now()` } })
  }
}

/** Remplace {raisonSociale}, {adresse}… dans un texte juridique. */
export async function fillCompany(texts: Record<string, string>) {
  const c = await getCompany()
  const vars: Record<string, string> = {
    raisonSociale: c.raisonSociale,
    adresse: c.adresse.replace(/\n+/g, ', '),
    siret: c.siret || 'À COMPLÉTER',
    telephone: c.telephone || 'À COMPLÉTER',
    email: c.email || 'À COMPLÉTER',
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(texts)) out[k] = v.replace(/\{(\w+)\}/g, (m, name: string) => vars[name] ?? m)
  return out
}
