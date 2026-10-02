import './style.css'
import * as THREE from 'three/webgpu'
import {
  cameraPosition,
  normalize,
  positionWorld,
  screenSize,
  uniform,
  vec3,
  vec4,
  wgsl,
  wgslFn,
} from 'three/tsl'

import seascapeHelpers from './shaders/water/lib.wgsl?raw'
import seascapeEntry from './shaders/water/fragment.wgsl?raw'

import { BoatControls } from './controls/BoatControls'
import { Boat } from './objects/Boat'
import { BASE_CHOPPY, WaveField } from './objects/WaveField'
import { FlotsamField } from './objects/FlotsamField'

const canvas = document.createElement('canvas')
canvas.id = 'webgl'
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas)

// the ported shader is raw WGSL, so there is no WebGL2 fallback
if (!('gpu' in navigator)) {
  const cta = document.querySelector<HTMLDivElement>('#overlay .cta')
  if (cta) cta.textContent = 'WebGPU required — use Chrome or Edge over https'
  throw new Error('WebGPU is not available in this browser')
}

const renderer = new THREE.WebGPURenderer({ canvas, antialias: false })
// Seascape is expensive (32 raymarch steps + 4 detailed height samples per pixel),
// so render at 1 device pixel per CSS pixel.
renderer.setPixelRatio(1)
renderer.toneMapping = THREE.NoToneMapping
await renderer.init()

const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(0x9fc4dd, 0.0035)

// ---------------------------------------------------------------- ocean shader
// "Seascape" by Alexander Alekseev aka TDM - https://www.shadertoy.com/view/Ms2SD1
// The helpers are emitted at module scope ahead of the entry function.
const seascape = wgslFn<[THREE.Node, THREE.Node, THREE.Node, THREE.Node, THREE.Node]>(seascapeEntry, [wgsl(seascapeHelpers)])

const uTime = uniform(0)
const uChoppy = uniform(BASE_CHOPPY)

// `wgslFn` is typed as returning an untyped Node, so cast it to a vec3 node
const seascapeColor = seascape as unknown as (...args: THREE.Node[]) => ReturnType<typeof vec3>

const rayDir = normalize(positionWorld)
// three renders scene.backgroundNode on a skybox sphere with its translation
// stripped, so positionWorld is the world space view ray of this fragment.
scene.backgroundNode = vec4(
  seascapeColor(rayDir, cameraPosition, screenSize, uTime, uChoppy),
  1,
)

// ------------------------------------------------------------------- boat + sea
// the CPU mirror of the shader's wave field, so the boat rides the visible waves
const waves = new WaveField()

const boat = new Boat()
scene.add(boat.rig)

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 2000)
boat.cameraMount.add(camera)

const controls = new BoatControls(camera, canvas)

// ------------------------------------------------------------------- lighting
const sun = new THREE.DirectionalLight(0xfff2d8, 2.4)
sun.position.set(-40, 14, -20)
scene.add(sun)

const sky = new THREE.HemisphereLight(0xbfe3ff, 0x1d4a63, 1.1)
scene.add(sky)

const flotsam = new FlotsamField(waves)
scene.add(flotsam.group)

// ------------------------------------------------------------------------- hud
const overlay = document.querySelector<HTMLDivElement>('#overlay')!
const readouts = document.querySelector<HTMLSpanElement>('#readout')!

controls.controls.addEventListener('lock', () => {
  overlay.classList.add('hidden')
  document.body.classList.add('locked')
})
controls.controls.addEventListener('unlock', () => {
  overlay.classList.remove('hidden')
  document.body.classList.remove('locked')
})

// ----------------------------------------------------------------------- loop
function resize() {
  const width = window.innerWidth
  const height = window.innerHeight

  renderer.setSize(width, height)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

let previous = performance.now()

function animate() {
  const now = performance.now()
  const delta = Math.min((now - previous) / 1000, 1 / 30)
  previous = now

  const elapsed = now / 1000

  controls.update(delta)

  uTime.value = elapsed
  // faster boat -> choppier sea, mirrored on the CPU side so the hull keeps its waterline
  uChoppy.value = BASE_CHOPPY + Math.min(boat.speed / 14, 1) * 1.6
  waves.time = elapsed
  waves.choppy = uChoppy.value

  boat.update(delta, waves, controls.throttle, controls.rudder)
  flotsam.update(delta, boat.position.x, boat.position.z)

  readouts.textContent = `${(boat.speed * 1.8).toFixed(1)} kn · ${flotsam.collected} pieces of flotsam`

  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

animate()
