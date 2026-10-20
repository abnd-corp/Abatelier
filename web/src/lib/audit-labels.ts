export interface AuditEntry {
  id: number
  at: string
  action: string
  identifiant: string | null
  nom: string | null
  userId: string | null
  targetType: string | null
  targetId: string | null
  targetName: string | null
  ip: string | null
  device: string
  details: Record<string, unknown> | null
}

export type Tone = 'neutral' | 'bad' | 'accent'

const ROLE: Record<string, string> = { direction: 'direction', admin: 'direction', rh: 'RH', atelier: 'atelier' }

const eur = (n: unknown) => (typeof n === 'number' ? n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : String(n))

/** Texte cité, raccourci s'il est long (mentions légales…) ; « vide » s'il n'y a rien. */
const quote = (v: unknown) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  return s ? `« ${s.length > 60 ? s.slice(0, 57) + '…' : s} »` : 'vide'
}

const ORDER_STEPS: Record<string, string> = { recue: 'Reçue', validee: 'Validée', fabrication: 'En fabrication', prete: 'Prête', livree: 'Livrée / retirée', annulee: 'Annulée' }

const MODES: Record<string, string> = { virement: 'virement', cheque: 'chèque', carte: 'carte bancaire', especes: 'espèces' }
const day = (v: unknown) => (typeof v === 'string' ? new Date(`${v}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : String(v))

const PLACES: Record<string, string> = { accueil: 'accueil', realisation: 'réalisations', couvertine: 'couvertine', bavette: 'bavette', bandeau: 'bandeau' }

const QTY: Record<string, string> = { aucune: 'aucune', fixe: 'nombre fixe', par_piece: 'une par pièce', jonctions: 'une par jonction' }

// Libellés et unités des champs du catalogue, pour décrire un changement de prix lisiblement
const CATALOG_FIELDS: Record<string, { label: string; fmt: (v: unknown) => string }> = {
  prixM2: { label: 'prix au m²', fmt: eur },
  epaisseur: { label: 'épaisseur', fmt: (v) => `${String(v).replace('.', ',')} mm` },
  retourMin: { label: 'retour minimum', fmt: (v) => `${v} mm` },
  majoration: { label: 'majoration', fmt: (v) => `${String(v).replace('.', ',')} %` },
  delaiSup: { label: 'délai supplémentaire', fmt: (v) => `${v} j` },
  actif: { label: 'statut', fmt: (v) => (v ? 'actif' : 'désactivé') },
  nom: { label: 'nom', fmt: (v) => `« ${v} »` },
  reference: { label: 'référence', fmt: (v) => `« ${v} »` },
  hex: { label: 'teinte', fmt: (v) => String(v) },
  prixPliMl: { label: 'prix par pli et par mètre', fmt: eur },
  miseEnRoute: { label: 'mise en route', fmt: eur },
  minimumCommande: { label: 'minimum de commande', fmt: eur },
  remisePro: { label: 'remise pro', fmt: (v) => `${String(v).replace('.', ',')} %` },
  tva: { label: 'TVA', fmt: (v) => `${String(v).replace('.', ',')} %` },
  delaiStandard: { label: 'délai standard', fmt: (v) => `${v} j` },
  largeurTole: { label: 'largeur de tôle', fmt: (v) => `${v} mm` },
  longueurMin: { label: 'longueur minimum', fmt: (v) => `${v} mm` },
  longueurMax: { label: 'longueur maximum', fmt: (v) => `${v} mm` },
  plisMax: { label: 'plis maximum', fmt: (v) => String(v) },
  angleMin: { label: 'angle minimum', fmt: (v) => `${v}°` },
  angleMax: { label: 'angle maximum', fmt: (v) => `${v}°` },
  pinceAutorisee: { label: 'pinces', fmt: (v) => (v ? 'faites' : 'non faites') },
  prix: { label: 'prix', fmt: eur },
  unite: { label: 'unité', fmt: (v) => (v === 'paire' ? 'à la paire' : 'à la pièce') },
  modeles: { label: 'modèles', fmt: (v) => (Array.isArray(v) ? v.join(', ') : String(v)) },
  cotes: { label: 'cotes', fmt: (v) => (Array.isArray(v) ? v.map((c, i) => `${String.fromCharCode(65 + i)} ${c}`).join(' ') : String(v)) },
  angles: { label: 'plis', fmt: (v) => (Array.isArray(v) ? v.map((a: number) => (Math.abs(a) === 1 ? 'pince' : `${Math.abs(a)}°${a < 0 ? '↓' : '↑'}`)).join(' ') : String(v)) },
  noms: { label: 'noms des cotes', fmt: (v) => (Array.isArray(v) ? v.map((n) => n || '—').join(', ') : String(v)) },
  cap: { label: 'orientation du dessin', fmt: (v) => `${v}°` },
  longueur: { label: 'longueur proposée', fmt: (v) => `${v} mm` },
  quantite: { label: 'quantité proposée', fmt: (v) => `${v} pièce${Number(v) > 1 ? 's' : ''}` },
  quantiteAuto: { label: 'quantité proposée', fmt: (v) => QTY[String(v)] ?? String(v) },
  quantiteFixe: { label: 'quantité fixe', fmt: (v) => String(v) },
  retraitActif: { label: 'retrait à l’atelier', fmt: (v) => (v ? 'proposé' : 'désactivé') },
  retraitInfo: { label: 'infos de retrait', fmt: (v) => `« ${v} »` },
  atelierAdresse: { label: 'adresse de départ', fmt: (v) => `« ${v} »` },
  longueurSeuil: { label: 'seuil des pièces longues', fmt: (v) => (v === null ? 'aucun' : `${v} mm`) },
  longueurPrix: { label: 'supplément pièces longues', fmt: eur },
  zones: {
    label: 'zones de livraison',
    fmt: (v) =>
      Array.isArray(v) && v.length
        ? v.map((z: { distanceMax: number; prix: number; franco: number | null }) => `${z.distanceMax} km : ${eur(z.prix)}${z.franco !== null ? ` (offerte dès ${eur(z.franco)})` : ''}`).join(', ')
        : 'aucune',
  },
  // Modèles de documents
  raisonSociale: { label: 'raison sociale', fmt: (v) => quote(v) },
  formeJuridique: { label: 'forme juridique', fmt: (v) => quote(v) },
  capital: { label: 'capital', fmt: (v) => quote(v) },
  adresse: { label: 'adresse', fmt: (v) => quote(v) },
  telephone: { label: 'téléphone', fmt: (v) => quote(v) },
  email: { label: 'e-mail', fmt: (v) => quote(v) },
  siteWeb: { label: 'site web', fmt: (v) => quote(v) },
  siret: { label: 'SIRET', fmt: (v) => quote(v) },
  rcs: { label: 'RCS', fmt: (v) => quote(v) },
  tvaIntra: { label: 'TVA intracommunautaire', fmt: (v) => quote(v) },
  iban: { label: 'IBAN', fmt: (v) => quote(v) },
  bic: { label: 'BIC', fmt: (v) => quote(v) },
  couleur: { label: 'couleur', fmt: (v) => String(v) },
  entete: { label: 'introduction', fmt: (v) => quote(v) },
  conditionsPaiement: { label: 'conditions de paiement', fmt: (v) => quote(v) },
  validiteDevis: { label: 'validité du devis', fmt: (v) => `${v} j` },
  echeanceFacture: { label: 'délai de paiement', fmt: (v) => `${v} j` },
  noteDevis: { label: 'note du devis', fmt: (v) => quote(v) },
  noteFacture: { label: 'note de la facture', fmt: (v) => quote(v) },
  mentionsLegales: { label: 'mentions légales', fmt: (v) => quote(v) },
  piedDePage: { label: 'pied de page', fmt: (v) => quote(v) },
  prefixeDevis: { label: 'préfixe des devis', fmt: (v) => quote(v) },
  prefixeFacture: { label: 'préfixe des factures', fmt: (v) => quote(v) },
  remisesQuantite: {
    label: 'remises quantité',
    fmt: (v) =>
      Array.isArray(v) && v.length
        ? v.map((p: { seuil: number; remise: number }) => `−${String(p.remise).replace('.', ',')} % dès ${p.seuil}`).join(', ')
        : 'aucune',
  },
}
function changes(c: Record<string, { avant: unknown; apres: unknown }> | undefined) {
  return Object.entries(c ?? {})
    .map(([k, { avant, apres }]) => {
      const f = CATALOG_FIELDS[k] ?? { label: k, fmt: String }
      return `${f.label} ${f.fmt(avant)} → ${f.fmt(apres)}`
    })
    .join(', ')
}

/** Phrase lisible et couleur pour une ligne du journal. Les futures actions métier s'ajoutent ici. */
export function describe(e: AuditEntry): { text: string; tone: Tone } {
  const d = (e.details ?? {}) as Record<string, any>
  const cible = e.targetName ?? d.nom ?? d.identifiant ?? 'un compte'
  switch (e.action) {
    case 'login.success':
      return { text: d.remember ? 'Connexion (rester connecté)' : 'Connexion', tone: 'neutral' }
    case 'login.failed':
      return { text: e.userId ? 'Mot de passe incorrect' : `Échec de connexion avec l’identifiant « ${e.identifiant} »`, tone: 'bad' }
    case 'login.locked':
      return { text: `Connexion bloquée après trop d’essais (« ${e.identifiant} »)`, tone: 'bad' }
    case 'login.disabled':
      return { text: 'Tentative de connexion sur un compte désactivé', tone: 'bad' }
    case 'logout':
      return { text: 'Déconnexion', tone: 'neutral' }
    case 'password.changed':
      return { text: d.autresSessionsFermees ? `A changé son mot de passe (${d.autresSessionsFermees} autre(s) appareil(s) déconnecté(s))` : 'A changé son mot de passe', tone: 'accent' }
    case 'password.change_failed':
      return { text: 'Mot de passe actuel incorrect lors d’un changement', tone: 'bad' }
    case 'session.revoked':
      return { text: `A déconnecté un appareil (${d.appareil ?? 'inconnu'})`, tone: 'neutral' }
    case 'session.revoked_all':
      return { text: `A déconnecté ses autres appareils (${d.nombre})`, tone: 'neutral' }
    case 'user.created':
      return { text: `A créé le compte de ${d.nom} (${ROLE[d.role] ?? d.role})`, tone: 'accent' }
    case 'user.updated': {
      const parts = []
      if (d.role) parts.push(`rôle ${ROLE[d.role.avant] ?? d.role.avant} → ${ROLE[d.role.apres] ?? d.role.apres}`)
      if (d.nom) parts.push(`nom « ${d.nom.avant} » → « ${d.nom.apres} »`)
      return { text: `A modifié le compte de ${cible} : ${parts.join(', ')}`, tone: 'accent' }
    }
    case 'user.disabled':
      if (d.raison === 'date de sortie') return { text: `Compte de ${cible} désactivé automatiquement : date de sortie atteinte`, tone: 'bad' }
      return { text: `A désactivé le compte de ${cible}`, tone: 'bad' }
    case 'employee.created':
      return { text: `A ajouté ${d.nom} à l’équipe${d.compte ? ' avec un compte de connexion' : ''}`, tone: 'accent' }
    case 'employee.updated':
      return { text: `A modifié la fiche de ${d.nom ?? cible} (${(d.champs ?? []).join(', ')})`, tone: 'neutral' }
    case 'catalog.material_created':
      return { text: `A ajouté la matière ${d.nom} (${eur(d.prixM2)}/m²)`, tone: 'accent' }
    case 'catalog.material_updated':
      return { text: `A modifié la matière ${d.nom} : ${changes(d.changements)}`, tone: 'accent' }
    case 'catalog.color_created':
      return { text: `A ajouté le coloris ${d.nom}`, tone: 'accent' }
    case 'catalog.settings_updated':
      return { text: `A modifié le façonnage et les conditions : ${changes(d.changements)}`, tone: 'accent' }
    case 'catalog.color_updated':
      return { text: `A modifié le coloris ${d.nom} : ${changes(d.changements)}`, tone: 'accent' }
    case 'catalog.accessory_created':
      return { text: `A ajouté l’accessoire ${d.nom} (${eur(d.prix)} ${d.unite === 'paire' ? 'la paire' : 'la pièce'})`, tone: 'accent' }
    case 'catalog.accessory_updated':
      return { text: `A modifié l’accessoire ${d.nom} : ${changes(d.changements)}`, tone: 'accent' }
    case 'catalog.model_created':
      return { text: `A ajouté le modèle de pièce ${d.nom} (${d.forme})`, tone: 'accent' }
    case 'catalog.model_updated':
      return { text: `A modifié le modèle de pièce ${d.nom} : ${changes(d.changements)}`, tone: 'accent' }
    case 'catalog.delivery_updated':
      return { text: `A modifié la livraison : ${changes(d.changements)}`, tone: 'accent' }
    case 'documents.company_updated':
      return { text: `A modifié l’identité de l’entreprise : ${changes(d.changements)}`, tone: 'accent' }
    case 'documents.template_updated':
      return { text: `A modifié le modèle des devis et factures : ${changes(d.changements)}`, tone: 'accent' }
    case 'documents.numbering_updated':
      return { text: `A fixé le prochain numéro ${d.type === 'facture' ? 'de facture' : 'de devis'} ${d.annee} : ${d.avant} → ${d.apres}`, tone: 'accent' }
    case 'documents.logo_updated':
      return { text: `A envoyé un nouveau logo (${d.type === 'image/png' ? 'PNG' : 'JPEG'}, ${d.largeur} × ${d.hauteur} px)`, tone: 'accent' }
    case 'documents.logo_removed':
      return { text: 'A remis le logo de l’appli sur les documents', tone: 'accent' }
    case 'client.created':
      return { text: `A ajouté le client ${d.nom}${d.type === 'professionnel' ? ' (professionnel)' : ''}`, tone: 'accent' }
    case 'client.updated':
      return { text: `A modifié la fiche de ${d.nom} (${(d.champs ?? []).join(', ')})`, tone: 'neutral' }
    case 'client.archived':
      return { text: `A archivé le client ${d.nom}`, tone: 'neutral' }
    case 'client.unarchived':
      return { text: `A sorti le client ${d.nom} des archives`, tone: 'neutral' }
    case 'client.site_added':
      return { text: `A ajouté le chantier « ${d.chantier} » (${d.ville}) à ${d.nom}`, tone: 'neutral' }
    case 'client.site_updated':
      return { text: `A modifié le chantier « ${d.chantier} » de ${d.nom}`, tone: 'neutral' }
    case 'client.site_removed':
      return { text: `A retiré le chantier « ${d.chantier} » de ${d.nom}`, tone: 'neutral' }
    case 'order.created':
      return { text: `A enregistré la commande ${d.numero} de ${d.client} (${eur(d.ht)} HT)`, tone: 'accent' }
    case 'order.updated':
      return { text: `A modifié la commande ${d.numero} (${eur(d.avant)} → ${eur(d.apres)} HT)`, tone: 'neutral' }
    case 'order.status_changed':
      return {
        text: d.apres === 'annulee' ? `A annulé la commande ${d.numero}${d.note ? ` : ${d.note}` : ''}` : `A passé la commande ${d.numero} à « ${ORDER_STEPS[d.apres] ?? d.apres} »`,
        tone: d.apres === 'annulee' ? 'bad' : 'neutral',
      }
    case 'order.sheet_printed':
      return { text: `A imprimé la fiche de fabrication de la commande ${d.numero}`, tone: 'neutral' }
    case 'billing.devis_created':
      return { text: `A émis le devis ${d.numero} pour ${d.client} (commande ${d.commande}, ${eur(d.ttc)} TTC)`, tone: 'accent' }
    case 'billing.facture_created':
      return { text: `A émis la facture ${d.numero} pour ${d.client} (commande ${d.commande}, ${eur(d.ttc)} TTC)`, tone: 'accent' }
    case 'billing.avoir_created':
      return { text: `A émis l’avoir ${d.numero} qui annule la facture ${d.facture} de ${d.client}${d.motif ? ` : ${d.motif}` : ''}`, tone: 'bad' }
    case 'billing.sent':
      return { text: `A marqué ${String(d.numero).startsWith('D') ? 'le devis' : 'la facture'} ${d.numero} comme envoyé${String(d.numero).startsWith('D') ? '' : 'e'} à ${d.client}`, tone: 'neutral' }
    case 'billing.devis_answered':
      return { text: `A noté le devis ${d.numero} comme ${d.reponse === 'accepte' ? 'accepté' : 'refusé'} par ${d.client}`, tone: d.reponse === 'accepte' ? 'accent' : 'neutral' }
    case 'billing.paid':
      return { text: `A enregistré le paiement de la facture ${d.numero} (${eur(d.ttc)}, ${MODES[d.mode] ?? d.mode}, le ${day(d.date)})`, tone: 'accent' }
    case 'billing.exported':
      return { text: `A exporté les ${d.type === 'ventes' ? 'ventes (factures et avoirs)' : 'encaissements'} du ${day(d.du)} au ${day(d.au)} pour le comptable (${d.lignes} ligne${Number(d.lignes) > 1 ? 's' : ''})`, tone: 'neutral' }
    case 'billing.payment_cancelled':
      return { text: `A annulé le paiement enregistré sur la facture ${d.numero}`, tone: 'bad' }
    case 'site.content_updated':
      return { text: `A modifié les textes du site (${(d.champs ?? []).join(', ')})`, tone: 'accent' }
    case 'site.content_reset':
      return { text: `A rétabli le texte d’origine du site : ${d.champ}`, tone: 'neutral' }
    case 'site.photo_added':
      return { text: `A ajouté une photo au site (${PLACES[d.emplacement as string] ?? d.emplacement}, ${d.largeur} × ${d.hauteur} px)`, tone: 'accent' }
    case 'site.photo_updated':
      return { text: `A modifié une photo du site (${(d.champs ?? []).join(', ')})`, tone: 'neutral' }
    case 'site.photo_deleted':
      return { text: `A supprimé une photo du site (${PLACES[d.emplacement as string] ?? d.emplacement})`, tone: 'bad' }
    case 'contact.received':
      return { text: `Demande de contact reçue par le site : « ${d.objet} »${d.fichier ? ' (plan joint)' : ''}`, tone: 'accent' }
    case 'contact.file_downloaded':
      return { text: `A téléchargé le plan joint à la demande « ${d.objet} »`, tone: 'neutral' }
    case 'contact.handled':
      return { text: `A marqué la demande « ${d.objet} » comme traitée`, tone: 'neutral' }
    case 'contact.reopened':
      return { text: `A remis la demande « ${d.objet} » à traiter`, tone: 'neutral' }
    case 'contact.deleted':
      return { text: `A supprimé la demande de contact « ${d.objet} »`, tone: 'bad' }
    case 'user.enabled':
      return { text: `A réactivé le compte de ${cible}`, tone: 'accent' }
    case 'user.password_reset':
      return { text: `A réinitialisé le mot de passe de ${cible}`, tone: 'accent' }
    default:
      return { text: e.action, tone: 'neutral' }
  }
}
