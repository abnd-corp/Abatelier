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
  statut: 'validee' | 'fabrication' | 'prete'
  livraisonMode: 'retrait' | 'livraison'
  datePrevue: string | null
  pieces: number
  modeles: string
}
const lignes = ref<Ligne[]>([])
const majLe = ref<Date | null>(null)
const coupure = ref(false)
const entier = ref(false)
const maintenant = ref(new Date())

async function load() {
  try {
    lignes.value = (await api<{ orders: Ligne[] }>('/ecran')).orders
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
const fullscreenOk = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen
async function basculerEntier() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    // refusé par le navigateur : l'écran reste simplement sur toute la page
  }
}
const onFullscreen = () => (entier.value = !!document.fullscreenElement)
onMounted(() => {
  void load()
  timer = setInterval(() => void load(), REFRESH_MS)
  horloge = setInterval(() => (maintenant.value = new Date()), 1000)
  document.addEventListener('fullscreenchange', onFullscreen)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  clearInterval(horloge)
  document.removeEventListener('fullscreenchange', onFullscreen)
})

const today = todayParis()
const enRetard = (l: Ligne) => !!l.datePrevue && l.datePrevue < today && l.statut !== 'prete'
const COLONNES = [
  { id: 'validee', titre: 'À lancer', tone: 'info' },
  { id: 'fabrication', titre: 'En fabrication', tone: 'accent' },
  { id: 'prete', titre: 'Prêtes', tone: 'ok' },
] as const
const colonnes = computed(() => COLONNES.map((c) => ({ ...c, lignes: lignes.value.filter((l) => l.statut === c.id) })))
const retards = computed(() => lignes.value.filter(enRetard).length)
const heure = computed(() => maintenant.value.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
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
      <button v-if="fullscreenOk" class="btn small" type="button" :aria-pressed="entier" @click="basculerEntier">{{ entier ? 'Quitter l’écran entier' : 'Écran entier' }}</button>
      <RouterLink :to="{ name: 'dashboard' }" class="btn small"><AppIcon name="arrow-left" :size="15" />Application</RouterLink>
    </header>

    <main class="colonnes">
      <section v-for="c in colonnes" :key="c.id" class="colonne" :class="c.tone" :aria-labelledby="`c-${c.id}`" :data-colonne="c.id">
        <h2 :id="`c-${c.id}`">
          {{ c.titre }} <span class="count">{{ c.lignes.length }}</span>
        </h2>
        <p v-if="!c.lignes.length" class="vide">Aucune</p>
        <ul>
          <li v-for="l in c.lignes" :key="l.id" :class="{ retard: enRetard(l) }">
            <span class="numero mono">{{ l.numero }}</span>
            <span class="modeles">{{ l.modeles || 'Commande' }}</span>
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
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
  overflow: auto;
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
.numero {
  font-size: 1.15rem;
  color: var(--muted);
}
.modeles {
  font-size: 1.6rem;
  font-weight: 700;
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
  .colonne {
    min-height: auto;
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
