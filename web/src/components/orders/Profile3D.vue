<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { pieceParts } from '@/lib/piece3d'

// Pièce pliée en 3D, au coloris choisi, que l'on fait tourner à la souris ou au doigt.
// Chargé à la demande (three.js est lourd) : seulement quand on ouvre la vue 3D.
const props = defineProps<{ cotes: number[]; angles: number[]; cap: number; longueur: number; epaisseur: number; color: string; label: string }>()

const box = ref<HTMLElement | null>(null)
const failed = ref(false)
const shortened = ref(false)

let renderer: THREE.WebGLRenderer | null = null
let controls: OrbitControls | null = null
let frame = 0
let resize: ResizeObserver | null = null
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(35, 4 / 3, 1, 100_000)
const piece = new THREE.Group()
const material = new THREE.MeshStandardMaterial({ metalness: 0.35, roughness: 0.45, side: THREE.DoubleSide })
scene.add(piece)
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 2.2))
const sun = new THREE.DirectionalLight(0xffffff, 1.8)
sun.position.set(1, 2, 1.5)
scene.add(sun)
const back = new THREE.DirectionalLight(0xffffff, 0.6)
back.position.set(-1.5, -0.5, -1)
scene.add(back)

// Coloris en hexadécimal ; à défaut (aucun coloris choisi), la couleur d'accent du thème
const resolveColor = (c: string) => (c.startsWith('#') ? c : getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6b3fa0')

let framed = false
function build() {
  for (const child of [...piece.children]) {
    ;(child as THREE.Mesh).geometry.dispose()
    piece.remove(child)
  }
  material.color.set(resolveColor(props.color))
  const parts = pieceParts(props.cotes, props.angles, props.cap, props.longueur, props.epaisseur)
  shortened.value = parts.shortened
  for (const p of parts.plates) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.len, parts.thickness, parts.length), material)
    mesh.position.set(p.x, p.y, 0)
    mesh.rotation.z = p.angle
    piece.add(mesh)
  }
  for (const j of parts.joints) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(parts.thickness / 2, parts.thickness / 2, parts.length, 16), material)
    mesh.rotation.x = Math.PI / 2
    mesh.position.set(j.x, j.y, 0)
    piece.add(mesh)
  }
  // Cadrage : seulement la première fois, pour ne pas perdre l'orientation choisie pendant la saisie
  if (!framed) {
    const radius = new THREE.Box3().setFromObject(piece).getBoundingSphere(new THREE.Sphere()).radius
    const distance = (radius / Math.sin(((camera.fov / 2) * Math.PI) / 180)) * 0.8
    camera.position.copy(new THREE.Vector3(0.75, 0.55, 1).normalize().multiplyScalar(distance))
    camera.near = distance / 100
    camera.far = distance * 10
    camera.updateProjectionMatrix()
    controls?.update()
    framed = true
  }
}

function fit() {
  if (!renderer || !box.value) return
  const { clientWidth: w, clientHeight: h } = box.value
  if (!w || !h) return
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

onMounted(() => {
  const el = box.value!
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  } catch {
    failed.value = true
    return
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.domElement.setAttribute('role', 'img')
  renderer.domElement.setAttribute('aria-label', props.label)
  el.appendChild(renderer.domElement)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enablePan = false
  controls.enableDamping = true
  // Tourne doucement tant qu'on n'y a pas touché, sauf si l'appareil demande moins d'animations
  controls.autoRotate = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  controls.autoRotateSpeed = 1.2
  controls.addEventListener('start', () => controls && (controls.autoRotate = false))
  build()
  fit()
  resize = new ResizeObserver(fit)
  resize.observe(el)
  const loop = () => {
    frame = requestAnimationFrame(loop)
    controls!.update()
    renderer!.render(scene, camera)
  }
  loop()
})

watch(
  () => [props.cotes, props.angles, props.cap, props.longueur, props.epaisseur, props.color],
  () => renderer && build(),
  { deep: true },
)
watch(
  () => props.label,
  (l) => renderer?.domElement.setAttribute('aria-label', l),
)

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  resize?.disconnect()
  controls?.dispose()
  for (const child of piece.children) (child as THREE.Mesh).geometry.dispose()
  material.dispose()
  renderer?.dispose()
})
</script>

<template>
  <div class="view3d">
    <div ref="box" class="stage" />
    <p v-if="failed" class="muted fallback">La vue 3D n’est pas disponible sur cet appareil.</p>
    <p v-else class="muted note">Glissez pour tourner<template v-if="shortened"> · longueur raccourcie</template></p>
  </div>
</template>

<style scoped>
.view3d {
  position: relative;
  width: 100%;
  height: 100%;
}
.stage {
  width: 100%;
  height: 100%;
  cursor: grab;
}
.stage:active {
  cursor: grabbing;
}
.stage :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
.note {
  position: absolute;
  left: 6px;
  bottom: 2px;
  margin: 0;
  font-size: 0.75rem;
  pointer-events: none;
}
.fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  text-align: center;
  margin: 0;
  padding: 12px;
}
</style>
