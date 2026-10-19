<!--
  Logo Alu Pliage Service, redessiné d'après le favicon du site (entreprise/sources/logo/) :
  deux jambages obliques formant un « A », un triangle renversé au sommet et un petit triangle
  au centre, chacun avec son dégradé. Les formes sont séparées par de vrais espaces (pas de
  contour plein), le logo reste donc lisible sur n'importe quel fond, en clair comme en sombre.
  Coordonnées dans le repère 270 × 270 du favicon d'origine.
-->
<script setup lang="ts">
import { useId } from 'vue'

// Identifiants uniques : le logo peut apparaître plusieurs fois sur une page
const id = useId()
</script>

<template>
  <svg viewBox="8 18 252 234" role="img" aria-label="Alu Pliage Service">
    <defs>
      <linearGradient :id="`${id}-g`" x1="0" y1="62" x2="0" y2="246" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#4a1873" />
        <stop offset="1" stop-color="#b768cf" />
      </linearGradient>
      <linearGradient :id="`${id}-d`" x1="0" y1="62" x2="0" y2="246" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#2d4d90" />
        <stop offset="0.35" stop-color="#6f93c7" />
        <stop offset="1" stop-color="#c4d9f1" />
      </linearGradient>
      <linearGradient :id="`${id}-h`" x1="0" y1="26" x2="0" y2="108" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#c7a3e6" />
        <stop offset="1" stop-color="#a191dc" />
      </linearGradient>
      <linearGradient :id="`${id}-c`" x1="0" y1="133" x2="0" y2="198" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#6c42a6" />
        <stop offset="1" stop-color="#ad8ade" />
      </linearGradient>
    </defs>
    <!-- Liseré clair sur les bords, comme le reflet du logo d'origine -->
    <g stroke="#fff" stroke-opacity="0.55" stroke-width="2.5" stroke-linejoin="round">
      <polygon points="97,62 125,120 70,246 14,246" :fill="`url(#${id}-g)`" />
      <polygon points="165.5,62.5 253.5,246 200,246 137.5,122" :fill="`url(#${id}-d)`" />
      <polygon points="91.5,26 171.5,26 132.5,107.5" :fill="`url(#${id}-h)`" />
      <polygon points="131.5,133 162,198 102,198" :fill="`url(#${id}-c)`" />
    </g>
  </svg>
</template>
