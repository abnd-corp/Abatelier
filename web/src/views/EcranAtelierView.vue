<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import { shortDay } from '@/lib/orders'
import { todayParis } from '@/lib/employees'

// Écran de l'atelier : les commandes en cours, en grand, en lecture seule. Rien à toucher, rien à saisir :
// il se met à jour tout seul et dit clairement quand il ne reçoit plus rien. Ni client ni prix, jamais.
interface Ligne {
  id: string
  numero: string
  client: string
  statut: 'validee' | 'fabrication' | 'prete'
  livraisonMode: 'retrait' | 'livraison'
  datePrevue: string | null
  pieces: number
  modeles: string
}
const lignes = ref<Ligne[]>([])
const majLe = ref<Date | null>(null)
const coupure = ref(false)
const maintenant = ref(new Date())

async function load() {
  try {
    lignes.value = (await api<{ orders: Ligne[] }>('/public/ecran')).orders
    majLe.value = new Date()
    coupure.value = false
  } catch {
    // On garde ce qui est affiché, mais on le dit : une information périmée ne doit pas passer pour à jour
    coupure.value = true
  }
}

let timer: ReturnType<typeof setInterval> | undefined
let horloge: ReturnType<typeof setInterval> | undefined
const REFRESH_MS = 15_000
// Défilement automatique : un écran au mur n'a personne pour toucher la souris. Chaque colonne trop pleine descend doucement,
// marque une pause en bas, puis remonte à la même vitesse, jusqu'en haut : rien ne reste caché et rien ne saute.
const PAUSE_MS = 3000
const VITESSE = 30 // pixels par seconde
const etats = new WeakMap<Element, { since: number; phase: 'haut' | 'descend' | 'bas' | 'monte'; pos: number; last: number }>()
let raf = 0
function defile(now: number) {
  for (const el of document.querySelectorAll<HTMLElement>('.colonne ul')) {
    const max = el.scrollHeight - el.clientHeight
    const st = etats.get(el) ?? { since: now, phase: 'haut' as const, pos: 0, last: now }
    etats.set(el, st)
    if (max <= 1) {
      st.pos = 0
      el.scrollTop = 0
      continue
    }
    if (st.phase === 'descend') {
      st.pos = Math.min(max, st.pos + ((now - st.last) * VITESSE) / 1000)
      el.scrollTop = st.pos
      if (st.pos >= max) Object.assign(st, { phase: 'bas', since: now })
    } else if (st.phase === 'monte') {
      st.pos = Math.max(0, st.pos - ((now - st.last) * VITESSE) / 1000)
      el.scrollTop = st.pos
      if (st.pos <= 0) Object.assign(st, { phase: 'haut', since: now })
    } else if (now - st.since >= PAUSE_MS) {
      st.phase = st.phase === 'haut' ? 'descend' : 'monte'
    }
    st.last = now
  }
  raf = requestAnimationFrame(defile)
}
onMounted(() => {
  raf = requestAnimationFrame(defile)
  void load()
  timer = setInterval(() => void load(), REFRESH_MS)
  horloge = setInterval(() => (maintenant.value = new Date()), 1000)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  clearInterval(timer)
  clearInterval(horloge)
})

const today = todayParis()
const enRetard = (l: Ligne) => !!l.datePrevue && l.datePrevue < today && l.statut !== 'prete'
// « Prêtes » est éclaté selon le mode de remise : à livrer (par un salarié) ou à retirer (par le client à l'atelier)
const COLONNES = [
  { id: 'validee', titre: 'À lancer', tone: 'info', garde: (l: Ligne) => l.statut === 'validee' },
  { id: 'fabrication', titre: 'En fabrication', tone: 'accent', garde: (l: Ligne) => l.statut === 'fabrication' },
  { id: 'livrer', titre: 'À livrer', tone: 'ok', garde: (l: Ligne) => l.statut === 'prete' && l.livraisonMode === 'livraison' },
  { id: 'retirer', titre: 'À retirer', tone: 'ok', garde: (l: Ligne) => l.statut === 'prete' && l.livraisonMode === 'retrait' },
] as const
const colonnes = computed(() => COLONNES.map((c) => ({ id: c.id, titre: c.titre, tone: c.tone, lignes: lignes.value.filter(c.garde) })))
const pretes = computed(() => lignes.value.filter((l) => l.statut === 'prete').length)
const retards = computed(() => lignes.value.filter(enRetard).length)
const heure = computed(() => maintenant.value.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
const jour = computed(() => maintenant.value.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))
const depuis = computed(() => (majLe.value ? majLe.value.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''))
</script>

<template>
  <div class="ecran">
    <header class="barre">
      <h1>Atelier</h1>
      <p class="quand">
        <time class="heure">{{ heure }}</time> <span class="jour">{{ jour }}</span>
      </p>
      <p v-if="retards" class="retards pill bad">{{ retards }} en retard</p>
      <span class="espace"></span>
      <p v-if="coupure" class="coupure" role="alert"><AppIcon name="x" :size="18" />Plus de nouvelles du serveur depuis {{ depuis || 'le début' }}</p>
    </header>

    <main class="colonnes">
      <h2 class="pretes-titre" aria-hidden="true">
        Prêtes <span class="count">{{ pretes }}</span>
      </h2>
      <section v-for="c in colonnes" :key="c.id" class="colonne" :class="[c.tone, `c-${c.id}`]" :aria-labelledby="`c-${c.id}`" :data-colonne="c.id">
        <h2 :id="`c-${c.id}`">
          {{ c.titre }} <span class="count">{{ c.lignes.length }}</span>
        </h2>
        <p v-if="!c.lignes.length" class="vide">Aucune</p>
        <ul>
          <li v-for="l in c.lignes" :key="l.id" :class="{ retard: enRetard(l) }">
            <span class="client">{{ l.client || 'Client' }}</span>
            <span class="modeles">{{ l.modeles || 'Commande' }}</span>
            <span class="numero mono">{{ l.numero }}</span>
            <span class="meta">
              {{ l.pieces }} pièce{{ l.pieces > 1 ? 's' : '' }} · {{ l.livraisonMode === 'retrait' ? 'Retrait' : 'Livraison' }} · {{ shortDay(l.datePrevue) }}
              <b v-if="enRetard(l)" class="alerte">en retard</b>
            </span>
          </li>
        </ul>
      </section>
    </main>
  </div>
</template>

<style scoped>
.ecran {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--ink);
  overflow: hidden;
}
.barre {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 12px max(20px, env(safe-area-inset-right, 0px)) 12px max(20px, env(safe-area-inset-left, 0px));
  padding-top: max(12px, env(safe-area-inset-top, 0px));
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}
.barre h1 {
  font-size: 2rem;
}
.quand {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.heure {
  font-family: var(--f-display);
  font-stretch: 78%;
  font-weight: 750;
  font-size: 2.4rem;
  font-variant-numeric: tabular-nums;
}
.jour {
  font-size: 1.2rem;
  color: var(--muted);
  text-transform: capitalize;
}
.retards {
  font-size: 1.1rem;
  padding: 4px 14px;
  margin: 0;
}
.espace {
  flex: 1;
}
.coupure {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--bad-soft);
  color: var(--bad);
  font-weight: 600;
}
.colonnes {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0 16px;
  padding: 16px max(20px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(20px, env(safe-area-inset-left, 0px));
}
.colonne {
  --tone: var(--info);
  --tone-soft: var(--info-soft);
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid color-mix(in srgb, var(--tone) 40%, var(--line));
  border-radius: var(--r);
  background: color-mix(in srgb, var(--tone-soft) 45%, var(--bg));
  overflow: hidden;
}
.c-validee,
.c-fabrication {
  grid-row: 1 / 3;
}
.c-validee {
  grid-column: 1;
}
.c-fabrication {
  grid-column: 2;
}
.c-livrer {
  grid-column: 3;
  grid-row: 2;
}
.c-retirer {
  grid-column: 4;
  grid-row: 2;
}
/* « Prêtes » coiffe les deux colonnes À livrer et À retirer, collées sous lui */
.pretes-titre {
  grid-column: 3 / 5;
  grid-row: 1;
  padding: 12px 16px;
  font-size: 1.6rem;
  background: var(--ok-soft);
  color: var(--ok);
  border: 1px solid color-mix(in srgb, var(--ok) 40%, var(--line));
  border-bottom: 0;
  border-radius: var(--r) var(--r) 0 0;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.c-livrer,
.c-retirer {
  border-radius: 0;
}
.c-livrer {
  border-right-width: 0;
  border-bottom-left-radius: var(--r);
}
.c-retirer {
  border-bottom-right-radius: var(--r);
}
.colonne.accent {
  --tone: var(--accent);
  --tone-soft: var(--accent-soft);
}
.colonne.ok {
  --tone: var(--ok);
  --tone-soft: var(--ok-soft);
}
.colonne h2 {
  padding: 12px 16px;
  font-size: 1.6rem;
  background: var(--tone-soft);
  color: var(--tone);
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.count {
  font-variant-numeric: tabular-nums;
}
.vide {
  margin: 20px 16px;
  color: var(--muted);
  font-size: 1.2rem;
}
ul {
  list-style: none;
  margin: 0;
  padding: 12px;
  display: grid;
  gap: 10px;
  align-content: start;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
}
ul::-webkit-scrollbar {
  display: none;
}
li {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 6px solid var(--tone);
  border-radius: var(--r);
}
li.retard {
  border-left-color: var(--bad);
  background: var(--bad-soft);
}
.client {
  font-size: 1.7rem;
  font-weight: 750;
  line-height: 1.1;
  overflow-wrap: anywhere;
}
.numero {
  font-size: 1rem;
  color: var(--muted);
}
.modeles {
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.15;
  overflow-wrap: anywhere;
}
.meta {
  font-size: 1.1rem;
  color: var(--muted);
}
.alerte {
  color: var(--bad);
  margin-left: 6px;
}
@media (max-width: 900px) {
  .colonnes {
    grid-template-columns: 1fr;
    overflow: auto;
  }
  .colonne,
  .c-validee,
  .c-fabrication,
  .c-livrer,
  .c-retirer {
    grid-column: auto;
    grid-row: auto;
    min-height: auto;
    border-radius: var(--r);
    border-width: 1px;
    margin-bottom: 16px;
  }
  .pretes-titre {
    display: none;
  }
  .jour {
    display: none;
  }
  .barre {
    flex-wrap: wrap;
    gap: 8px 14px;
  }
}
</style>
