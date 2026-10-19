import './style.css'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/fraunces/wght-italic.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import * as THREE from 'three/webgpu'
import {
  cameraPosition,
  colorSpaceToWorking,
  normalize,
  positionWorld,
  screenSize,
  uniform,
  vec4,
  wgsl,
  wgslFn,
} from 'three/tsl'

import seascapeHelpers from './shaders/water/lib.wgsl?raw'
import seascapeEntry from './shaders/water/fragment.wgsl?raw'

import { BoatControls } from './controls/BoatControls'
import { EndingCamera, type Shot } from './controls/EndingCamera'
import { Ship } from './objects/Ship'
import { loadIsland } from './objects/models'
import { WaveField, BASE_CHOPPY } from './objects/WaveField'
import { Physics } from './physics/Physics'
import { Soundscape, type Clip } from './audio/Soundscape'
import {
  bearingAndRange,
  buildWorld,
  CHART_PIECES,
  choppyForPieces,
  driftForPieces,
  flatDistance,
  MAX_EXTRA_CHOP,
  putOutBeacon,
  tintCss,
  type Island,
} from './game/world'
import { Daylight, SUN_YAW } from './game/daylight'
import { eventFor } from './game/events'
import { PICKUP_RANGE } from './game/flotsam'
import { recordBest, scoreVoyage } from './game/score'
import { Run, type IslandEvent } from './game/run'
import { describe } from './game/stats'
import { renderCompass, type CompassMark } from './ui/compass'
import { button, choiceCard, introSheet, scoreSheet, sceneBlock, seasickWarning, voyageLog } from './ui/story'
import { announceChanges, toast, type Tally } from './ui/toasts'

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!

const canvas = document.createElement('canvas')
canvas.id = 'webgl'
$('#app').appendChild(canvas)

// the ported shader is raw WGSL, so there is no WebGL2 fallback
/** fade out the loading screen once the page underneath is ready to be seen */
function reveal() {
  document.documentElement.classList.add('ready')
  const loader = $('#loader')
  loader.classList.add('gone')
  loader.addEventListener('transitionend', () => loader.remove(), { once: true })
}

if (!('gpu' in navigator)) {
  $('#overlay').classList.remove('hidden')
  reveal()
  throw new Error('WebGPU is not available in this browser')
}

// ------------------------------------------------------- renderer + scene
const renderer = new THREE.WebGPURenderer({ canvas, antialias: false })
// the raymarched sea is expensive per pixel, so skip high-DPI rendering
renderer.setPixelRatio(1)
renderer.toneMapping = THREE.NoToneMapping
await renderer.init()

const scene = new THREE.Scene()
const haze = new THREE.FogExp2(0x9fc4dd, 0.0035)
scene.fog = haze

// ---------------------------------------------------------------- ocean shader
// "Seascape" by Alexander Alekseev aka TDM - https://www.shadertoy.com/view/Ms2SD1
const seascape = wgslFn(seascapeEntry, [wgsl(seascapeHelpers)])

const uTime = uniform(0)
const uChoppy = uniform(BASE_CHOPPY)
const uShipPos = uniform(new THREE.Vector2(0, 0))
const uShipDir = uniform(new THREE.Vector2(0, -1))
const uShipSpeed = uniform(0)

const daylight = new Daylight()
const uSunDir = uniform(daylight.direction)
const uDusk = uniform(0)

// backgroundNode is drawn on a skybox with translation stripped, so positionWorld
// is the view ray. Arguments are matched to the WGSL parameters by name.
const seaColor = seascape({
  rayDir: normalize(positionWorld),
  rayOrigin: cameraPosition,
  iResolution: screenSize,
  iTime: uTime,
  choppy: uChoppy,
  shipPos: uShipPos,
  shipDir: uShipDir,
  shipSpeed: uShipSpeed,
  sunDir: uSunDir,
  dusk: uDusk,
}) as THREE.Node<'vec3'>

// Seascape outputs sRGB already; without this it would be converted twice and wash out
scene.backgroundNode = colorSpaceToWorking(vec4(seaColor, 1), THREE.SRGBColorSpace)

const waves = new WaveField()

// ---------------------------------------------------------------- the run + ship
const run = new Run({
  onTell: showTell,
  onAshore: showAshore,
  onVisited: putOutBeacon,
  onDepart() {
    sound.leave()
    ship.applyStats(run.stats)
    renderBuild()
    closePanels()
    lock()
  },
  onDamage(amount): boolean {
    ship.damage(amount)
    return ship.alive
  },
  onCharted: showCharted,
  onHome(log) {
    renderBuild()
    beginEnding(true, log)
  },
  onSunk(log) {
    renderBuild()
    beginEnding(false, log)
  },
})

const ship = new Ship(run.stats)
scene.add(ship.rig)

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 2000)
ship.cameraMount.add(camera)

const controls = new BoatControls(camera, canvas)
const endingCamera = new EndingCamera(camera, scene)

const sound = new Soundscape()

const ARRIVAL_SOUNDS: Partial<Record<string, Clip>> = {
  wreck: 'bell',
  gallows: 'door',
  kitchen: 'market',
}

// audio can only start after a user gesture
const wakeAudio = () => sound.start()
window.addEventListener('pointerdown', wakeAudio, { once: true })
window.addEventListener('keydown', wakeAudio, { once: true })

// ---------------------------------------------------------- lighting + world
const sun = new THREE.DirectionalLight()
scene.add(sun)

const skyLight = new THREE.HemisphereLight()
scene.add(skyLight)

const physics = new Physics()
const world = buildWorld(await loadIsland())
for (const island of world.islands) {
  scene.add(island.group)
  if (island.beacon) scene.add(island.beacon)
  physics.island(island.position.x, island.position.z, island.radius)
}
// rocks sit at the average sea level so the swell washes over them instead of carrying them
const seaLevel = averageSeaLevel()
for (const hazard of world.hazards) {
  hazard.mesh.position.set(hazard.position.x, seaLevel, hazard.position.z)
  scene.add(hazard.mesh)
  physics.rock(hazard.position.x, hazard.position.z, hazard.radius)
}
for (const item of world.flotsam) scene.add(item.mesh)

function averageSeaLevel() {
  let sum = 0
  let samples = 0
  for (let t = 0; t < 20; t += 2) {
    waves.time = t
    for (let x = -60; x <= 60; x += 6) {
      for (let z = -60; z <= 60; z += 6) {
        sum += waves.height(x + 500, z + 500)
        samples++
      }
    }
  }
  waves.time = 0
  return sum / samples
}

// --------------------------------------------------------------------- the hud
const overlay = $<HTMLDivElement>('#overlay')
const speedEl = $<HTMLSpanElement>('#readout')
const healthFill = $<HTMLSpanElement>('#health-fill')
const healthNum = $<HTMLSpanElement>('#health-num')
const piecesEl = $<HTMLSpanElement>('#pieces')
const buildEl = $<HTMLUListElement>('#build-list')
const chartEl = $<HTMLDivElement>('#chart')
const draftEl = $<HTMLDivElement>('#draft')
const damageFlash = $<HTMLDivElement>('#damage')
const windEl = $<HTMLSpanElement>('#wind')
const bearingsEl = $<HTMLUListElement>('#bearings')
const pauseEl = $<HTMLDivElement>('#pause')
const pauseStatEl = $<HTMLParagraphElement>('#pause-stat')
const loadCrewEl = $<HTMLSpanElement>('#load-crew')
const loadPassEl = $<HTMLSpanElement>('#load-pass')
const loadGoldEl = $<HTMLSpanElement>('#load-gold')
const loadFoodEl = $<HTMLSpanElement>('#load-food')
const landEl = $<HTMLButtonElement>('#land')
const landNameEl = $<HTMLElement>('#land-name')
const toastsEl = $<HTMLDivElement>('#toasts')
const compassEl = $<HTMLDivElement>('#compass')
const compass = {
  tape: $<HTMLDivElement>('#compass-tape'),
  head: $<HTMLSpanElement>('#compass-head'),
  word: $<HTMLSpanElement>('#compass-word'),
}

function renderBuild() {
  buildEl.innerHTML = ''
  for (const [card, count] of run.counts()) {
    const li = document.createElement('li')
    li.innerHTML =
      `<b>${count > 1 ? `${count}× ` : ''}${card.name}</b>` +
      `<span class="effect">${describe(card)}</span>` +
      `<span class="desc">${card.text}</span>`
    buildEl.appendChild(li)
  }

  loadCrewEl.textContent = `crew ${run.crew}`
  loadPassEl.textContent = `rescued ${run.passengers}`
  loadGoldEl.textContent = `gold ${run.gold}`
  loadFoodEl.textContent = `food ${run.provisions}`
}

// ---- panels: the intro lives in #chart, every other page of the story in #draft

function panelIsOpen() {
  return !chartEl.classList.contains('hidden') || !draftEl.classList.contains('hidden')
}

function isPaused() {
  return !pauseEl.classList.contains('hidden')
}

function hidePanels() {
  chartEl.classList.add('hidden')
  draftEl.classList.add('hidden')
}

function closePanels() {
  hidePanels()
  overlay.classList.add('hidden')
  ship.hold = false
}

function openPanel(...content: HTMLElement[]) {
  draftEl.replaceChildren(...content)
  hidePause()
  draftEl.classList.remove('hidden')
  overlay.classList.add('hidden')
  document.body.classList.remove('locked')
  applyModal()
}

/**
 * While a panel is up the boat is anchored and the pointer is released. Browsers
 * can refuse an unlock, so this is re-asserted every frame rather than trusted once.
 */
function applyModal() {
  const modal = panelIsOpen()
  ship.hold = modal
  if (modal && controls.isLocked) controls.unlock()
  return modal
}

function showIntro() {
  chartEl.replaceChildren(introSheet(), button('sail', 'Start sailing', showWarning))

  chartEl.classList.remove('hidden')
  draftEl.classList.add('hidden')
  overlay.classList.add('hidden')
  document.body.classList.remove('locked')
}

function showWarning() {
  chartEl.replaceChildren(
    seasickWarning(),
    button('sail', 'I understand, set sail', () => {
      sound.start()
      run.sail()
    }),
  )
  chartEl.scrollTop = 0
}

function backToSea() {
  closePanels()
  lock()
}

function showNothingHere(island: Island) {
  openPanel(
    sceneBlock(island.name, 'Nothing here yet. This island has no story to tell.'),
    button('go', 'back to sea', backToSea),
  )
}

function showTell(event: IslandEvent, island: Island) {
  const greeting = ARRIVAL_SOUNDS[island.id]
  if (greeting) sound.arrive(greeting)
  openPanel(
    sceneBlock(event.title, event.telling, event.adventure),
    button('go', 'go ashore', () => run.decide(event, island)),
    leaveButton(),
  )
}

function showAshore(event: IslandEvent) {
  const hand = document.createElement('div')
  hand.className = 'choices'

  for (const choice of event.choices) {
    if (choice.requires && !run.flags.has(choice.requires)) continue
    if (choice.blockedBy && run.flags.has(choice.blockedBy)) continue
    const held = !!choice.gain && run.deck.includes(choice.gain)
    hand.appendChild(choiceCard(choice, run.canAfford(choice), held, () => run.resolve(choice)))
  }

  openPanel(sceneBlock(event.title, event.adventure), hand, leaveButton())
}

/** back to the boat without choosing: the island stays unvisited */
function leaveButton() {
  return button('leave', 'leave for now, back to the boat (Esc)', () => leaveIsland(false))
}

function leaveIsland(byKey: boolean) {
  shownOn = null
  run.leave()
  // Esc is not a gesture that may take the pointer, so the lock can be refused;
  // the pause menu's Resume button can take it
  if (byKey && !controls.isLocked) showPause()
}

function finalTally(home: boolean) {
  const score = scoreVoyage({
    home,
    pieces: run.pieces.size,
    crew: run.crew,
    passengers: run.passengers,
    gold: run.gold,
    provisions: run.provisions,
    hull: ship.hp,
    seconds: run.sailTime,
  })
  return scoreSheet(score, recordBest(score.total))
}

const SUNK_SHOT: Shot = { radius: 22, height: 9, sweep: 1.1, fov: 55 }
const HOME_SHOT: Shot = { radius: 20, height: 4, sweep: 0, bearing: SUN_YAW, fov: 55 }
const SUNK_DELAY = 7
const HOME_DELAY = 6
const CAMERA_ROOM = 6

const endingFocus = new THREE.Vector3()
function updateEndingFocus() {
  endingFocus.set(ship.position.x, ship.waterline + 0.6, ship.position.z)
  return endingFocus
}

function clearShot(shot: Shot): Shot {
  const from = camera.getWorldPosition(new THREE.Vector3())
  const angle = Math.atan2(from.x - ship.position.x, from.z - ship.position.z)

  const sweeps = [shot.sweep, -shot.sweep, shot.sweep + 1.6, -shot.sweep - 1.6]
  const best = sweeps.reduce((a, b) =>
    roomAlong(angle + b, shot.radius, angle) > roomAlong(angle + a, shot.radius, angle) ? b : a,
  )
  return { ...shot, sweep: best, keepClear }
}

function clearHomeShot(shot: Shot): Shot {
  const ideal = shot.bearing ?? 0
  for (const step of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
    const bearing = ideal + step * 0.35
    if (roomAlong(bearing, shot.radius) > CAMERA_ROOM) return { ...shot, bearing, keepClear }
  }
  return { ...shot, keepClear }
}

function roomAlong(bearing: number, radius: number, from = bearing) {
  let least = Infinity
  for (const k of [0.4, 0.7, 1]) {
    const a = from + (bearing - from) * k
    const near = physics.nearest(ship.position.x + Math.sin(a) * radius * k, ship.position.z + Math.cos(a) * radius * k)
    least = Math.min(least, near.gap)
  }
  return least
}

function keepClear(position: THREE.Vector3) {
  const near = physics.nearest(position.x, position.z)
  if (near.gap >= CAMERA_ROOM) return
  position.x += near.nx * (CAMERA_ROOM - near.gap)
  position.z += near.nz * (CAMERA_ROOM - near.gap)
}

function beginEnding(home: boolean, log: string[]) {
  sound.leave()
  ship.hold = false
  if (!home) ship.sink()

  hidePanels()
  hidePause()
  landEl.classList.add('hidden')
  document.body.classList.remove('locked')
  document.body.classList.add('ending')
  controls.enabled = false
  if (controls.isLocked) controls.unlock()

  endingCamera.start(updateEndingFocus(), home ? clearHomeShot(HOME_SHOT) : clearShot(SUNK_SHOT))

  let shown = false
  const show = () => {
    if (shown) return
    shown = true
    window.clearTimeout(timer)
    window.removeEventListener('pointerdown', show)
    window.removeEventListener('keydown', show)
    if (home) showHome(log)
    else showSunk(log)
  }
  const timer = window.setTimeout(show, (home ? HOME_DELAY : SUNK_DELAY) * 1000)
  window.addEventListener('pointerdown', show)
  window.addEventListener('keydown', show)
}

function showEnding(home: boolean, title: string, text: string, log: string[]) {
  const block = sceneBlock(title, text)
  block.append(finalTally(home), button('go', 'set sail again', () => location.reload()))
  openPanel(block, ...(log.length ? [voyageLog(log)] : []))
}

function showSunk(log: string[]) {
  showEnding(
    false,
    'Sunk',
    'She goes down with the map still folded on the cabin table. Whatever it ' +
      'was about to show you, it will show nobody now. The sea closes over the boat — ' +
      'and over you.',
    log,
  )
}

function showHome(log: string[]) {
  showEnding(
    true,
    'Home',
    `All ${CHART_PIECES} pieces, and a crew still alive to read them. Home opens a way ` +
      'for you that no map could have named. You are not the same boat that left it.',
    log,
  )
}

function showCharted() {
  sound.leave()
  renderBuild()
  openPanel(
    sceneBlock(
      'The Whole Map',
      `You lay the last of the ${CHART_PIECES} pieces into place and the sea finally ` +
        'closes up into a map. Every route home is on it now — the way in, the way out, ' +
        'and the way you came. The crew can smell land.',
    ),
    button('go', 'sail home', () => run.reachHome()),
  )
}

// ---- landing

/** how close you have to get before the island offers you its beach */
const LANDING = 12

/**
 * The island whose panel was last shown, so it is not offered again until you
 * have sailed well clear of it.
 */
let shownOn: string | null = null

let landingTarget: Island | null = null

function landOn(island: Island | null) {
  if (!island || run.phase !== 'sailing' || panelIsOpen() || isPaused()) return

  shownOn = island.id
  landingTarget = null

  const event = eventFor(island.event)
  if (!event) {
    console.error(`no event written for island: ${island.id} (${island.event})`)
    run.visited.add(island.id)
    putOutBeacon(island)
    showNothingHere(island)
    return
  }

  run.land(event, island)
}

// ---- pause: Esc releases the pointer, and releasing it opens this

function showPause() {
  const visited = run.visited.size
  const unvisited = world.islands.length - visited
  pauseStatEl.textContent =
    `${run.pieces.size}/${CHART_PIECES} of the map · ` +
    `${visited} island${visited === 1 ? '' : 's'} walked · ` +
    `${unvisited} to go`

  pauseEl.classList.remove('hidden')
  overlay.classList.add('hidden')
  document.body.classList.remove('locked')
}

function hidePause() {
  pauseEl.classList.add('hidden')
}

function resume() {
  sound.start()
  hidePause()
  lock()
}

/**
 * Browsers reject a pointer lock request issued right after exitPointerLock,
 * so wait for the unlock to land and retry until it is accepted.
 */
function lock() {
  document.body.classList.add('locked')

  const request = () => {
    if (controls.isLocked || !controls.enabled || panelIsOpen()) return
    const result = canvas.requestPointerLock() as Promise<void> | undefined
    result?.catch(() => window.setTimeout(request, 120))
  }

  if (document.pointerLockElement) window.setTimeout(request, 120)
  else request()
}

controls.addEventListener('lock', () => {
  hidePause()
  overlay.classList.add('hidden')
  document.body.classList.add('locked')
})
controls.addEventListener('unlock', () => {
  document.body.classList.remove('locked')
  if (run.phase === 'sailing' && !panelIsOpen()) showPause()
})

$('#resume').addEventListener('click', resume)
landEl.addEventListener('click', () => landOn(landingTarget))

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyE' || event.key.toLowerCase() === 'e') {
    landOn(landingTarget)
  } else if (event.code === 'Escape' && isPaused()) {
    event.preventDefault()
    resume()
  } else if (event.code === 'Escape' && (run.phase === 'telling' || run.phase === 'ashore')) {
    event.preventDefault()
    leaveIsland(true)
  }
})

// ---- instruments

/** with a Spyglass the instruments show every island, not just the nearest */
function hasGlass() {
  return run.stats.lookahead > 0
}

function nearestUnvisited(): Island | null {
  let best: Island | null = null
  let gap = Infinity
  for (const island of world.islands) {
    if (run.visited.has(island.id)) continue
    const distance = flatDistance(ship.position, island.position)
    if (distance < gap) {
      gap = distance
      best = island
    }
  }
  return best
}

function renderBearings() {
  if (!hasGlass()) {
    const nearest = nearestUnvisited()
    bearingsEl.innerHTML = ''
    if (nearest) {
      const { bearing, range } = bearingAndRange(ship.position, nearest.position)
      windEl.textContent = `${nearest.name} ${bearing}° · ${range} m`
    } else {
      windEl.textContent = 'all islands found'
    }
    return
  }

  windEl.textContent = 'every island'

  const byDistance = [...world.islands].sort(
    (a, b) => flatDistance(ship.position, a.position) - flatDistance(ship.position, b.position),
  )

  bearingsEl.innerHTML = byDistance
    .map((island) => {
      const { bearing, range } = bearingAndRange(ship.position, island.position)
      const spent = run.visited.has(island.id)
      return (
        `<li${spent ? ' class="spent"' : ''}>` +
        `<span class="name"${spent ? '' : ` style="color:${tintCss(island)}"`}>${island.name}</span>` +
        `<span class="leg">${bearing}° ${range}m</span>` +
        `</li>`
      )
    })
    .join('')
}

const lookDirection = new THREE.Vector3()

/** camera look direction as a compass heading in degrees */
function viewHeading(): number {
  camera.getWorldDirection(lookDirection)
  const degrees = (Math.atan2(lookDirection.x, -lookDirection.z) * 180) / Math.PI
  return (degrees + 360) % 360
}

function updateCompass() {
  const nearest = nearestUnvisited()
  const islands = hasGlass() ? world.islands : nearest ? [nearest] : []

  const marks: CompassMark[] = islands.map((island) => ({
    name: island.name,
    ...bearingAndRange(ship.position, island.position),
    spent: run.visited.has(island.id),
    target: island.id === nearest?.id,
    tint: tintCss(island),
  }))

  renderCompass(compass, viewHeading(), marks)
}

renderBuild()

// ----------------------------------------------------------------------- loop
function resize() {
  // a hidden or minimised window reports 0, which WebGPU rejects as a texture size
  const width = Math.max(1, window.innerWidth)
  const height = Math.max(1, window.innerHeight)

  renderer.setSize(width, height)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

/** a rock bump charges damage once per contact, not every frame */
let grounded = false
let wasTouching = false
let bearingTimer = 0
let hungerClock = 0
/** seconds at the helm per day of food eaten */
const MEAL_INTERVAL = 20
let tally = readTally()

let previous = performance.now()

function animate() {
  const now = performance.now()
  const delta = Math.min((now - previous) / 1000, 1 / 30)
  previous = now
  const elapsed = now / 1000

  controls.update(delta)
  updateSea(elapsed)
  updateSky(delta)

  // without the isLocked check, W drives the boat from the pause menu
  const sailing = run.phase === 'sailing' && controls.isLocked
  steerShip(delta, elapsed, sailing)
  collide()
  floatIslands(delta, elapsed)
  collectFlotsam(sailing)
  offerLanding(sailing)

  if (!ship.alive && run.phase !== 'dead') run.sink()

  updateHud(delta)
  if (endingCamera.active) endingCamera.update(delta, updateEndingFocus())

  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

function updateSea(elapsed: number) {
  const choppy = choppyForPieces(run.pieces.size)
  uTime.value = elapsed
  uChoppy.value = choppy
  waves.time = elapsed
  waves.choppy = choppy

  const rough = Math.max(0, Math.min(1, (choppy - BASE_CHOPPY) / MAX_EXTRA_CHOP))
  sound.tick(rough, ship.speed, isPaused())

  const wakeSpeed = Math.max(0, ship.speed - 0.5)
  uShipPos.value.set(ship.position.x, ship.position.z)
  uShipDir.value.set(ship.facing.x, ship.facing.z)
  uShipSpeed.value = wakeSpeed
  waves.shipX = ship.position.x
  waves.shipZ = ship.position.z
  waves.shipDirX = ship.facing.x
  waves.shipDirZ = ship.facing.z
  waves.shipSpeed = wakeSpeed
}

function updateSky(delta: number) {
  // uSunDir holds daylight.direction itself, so it needs no update here
  daylight.update(delta, run.pieces.size)
  uDusk.value = daylight.hour * daylight.hour

  sun.position.copy(daylight.direction).multiplyScalar(50)
  sun.color.copy(daylight.sunColor)
  sun.intensity = daylight.sunIntensity
  skyLight.color.copy(daylight.skyColor)
  skyLight.groundColor.copy(daylight.groundColor)
  skyLight.intensity = daylight.skyIntensity
  haze.color.copy(daylight.hazeColor)
}

function steerShip(delta: number, elapsed: number, sailing: boolean) {
  const modal = applyModal()
  const atHelm = sailing && !modal
  compassEl.classList.toggle('hidden', !atHelm)
  // home, nobody is at the helm: she turns for the sun and sails on into it
  const home = run.phase === 'home'
  if (home) ship.hold = false
  const throttle = atHelm ? controls.throttle : home ? 0.35 : 0
  const rudder = atHelm ? controls.rudder : home ? helmToward(homeHeading()) : 0
  ship.update(delta, waves, throttle, rudder)
  if (atHelm) passTime(delta)

  // off the helm the wind sets her down, unless she is anchored or wrecked
  if (!sailing && !ship.hold && run.phase !== 'dead') {
    const push = driftForPieces(run.pieces.size)
    ship.position.x += Math.sin(elapsed * 0.21) * push * delta
    ship.position.z += Math.cos(elapsed * 0.17) * push * delta
  }
}

/** how close a shore or rock has to be before she bears away from it on the way home */
const GIVE_WAY = 22

/** the sun's heading, bent away from any shore or rock close by */
function homeHeading() {
  let x = -Math.sin(SUN_YAW)
  let z = -Math.cos(SUN_YAW)

  const near = physics.nearest(ship.position.x, ship.position.z)
  const lean = THREE.MathUtils.clamp(1 - near.gap / GIVE_WAY, 0, 1) * 2.5
  if (lean > 0) {
    // round it on the side nearer the sun, so she never stalls facing the shore
    const side = -near.nz * x + near.nx * z >= 0 ? 1 : -1
    x += (near.nx - near.nz * side) * lean
    z += (near.nz + near.nx * side) * lean
  }
  return Math.atan2(-x, -z)
}

function helmToward(yaw: number) {
  const off = Math.atan2(Math.sin(yaw - ship.yaw), Math.cos(yaw - ship.yaw))
  // positive rudder turns to starboard, which lowers yaw
  return THREE.MathUtils.clamp(-off * 1.5, -1, 1)
}

function passTime(delta: number) {
  run.sailTime += delta
  hungerClock += delta
  if (hungerClock < MEAL_INTERVAL) return

  hungerClock = 0
  if (!run.eat()) return
  ship.applyStats(run.stats)
  if (run.provisions === 2) toast(toastsEl, 'Food is running low', 'info')
  if (run.provisions === 0) toast(toastsEl, 'The larder is empty. The crew grows weak', 'cost')
}

/** physics only reports contacts; the boat still sails by Ship's own kinematics */
function collide() {
  const hits = physics.step(ship.position, ship.velocity)
  if (!ship.alive) return

  let touching = false
  let grinding = false
  let hardestContact = 0
  let fastestRockHit = 0
  for (const hit of hits) {
    ship.position.x += hit.nx * (hit.depth + 0.4)
    ship.position.z += hit.nz * (hit.depth + 0.4)

    touching = true
    hardestContact = Math.max(hardestContact, hit.speed)
    if (hit.kind === 'rock') {
      grinding = true
      fastestRockHit = Math.max(fastestRockHit, hit.speed)
    }
  }

  // nothing hurts while a menu or panel is up, or once she is sailing home
  const clearDeck = !isPaused() && !panelIsOpen() && run.phase !== 'home'

  if (touching && !wasTouching && clearDeck) sound.bump(hardestContact)
  wasTouching = touching

  if (grinding && !grounded && clearDeck) {
    ship.damage(8 + Math.max(0, fastestRockHit - 1) * 0.8)
    flashDamage()
  }
  grounded = grinding
}

function flashDamage() {
  damageFlash.classList.remove('on')
  void damageFlash.offsetWidth // force a reflow so the animation restarts
  damageFlash.classList.add('on')
}

/** islands heave and lean on the swell a beat behind it; rocks stay put */
function floatIslands(delta: number, elapsed: number) {
  const follow = 1 - Math.exp(-1.6 * delta)
  const lean = 2.2

  for (const island of world.islands) {
    const { x, z } = island.position
    const reach = island.radius * 0.7

    const centre = waves.height(x, z)
    const east = waves.height(x + reach, z)
    const west = waves.height(x - reach, z)
    const north = waves.height(x, z - reach)
    const south = waves.height(x, z + reach)

    const ride = island.ride
    ride.height += (centre - ride.height) * follow
    ride.pitch += (Math.atan2(north - south, reach * 2) * lean - ride.pitch) * follow
    ride.roll += (Math.atan2(east - west, reach * 2) * lean - ride.roll) * follow

    island.group.position.set(x, ride.height - 1.2, z)
    island.group.rotation.x = ride.pitch
    island.group.rotation.z = ride.roll

    if (island.beacon) {
      island.beacon.position.set(x, ride.height + 44, z)
      island.beacon.material.opacity = 0.24 + Math.sin(elapsed * 1.6 + x * 0.1) * 0.08
    }
  }

  for (const hazard of world.hazards) {
    hazard.water.value = waves.height(hazard.position.x, hazard.position.z)
  }

  for (const item of world.flotsam) {
    if (item.collected) continue
    const { x, z } = item.position
    item.mesh.position.set(x, waves.height(x, z) + 0.15, z)
    item.mesh.rotation.y += item.spin * delta
    item.mesh.rotation.x = Math.sin(elapsed * 1.3 + x) * 0.15
  }
}

function collectFlotsam(sailing: boolean) {
  if (!sailing || !ship.alive) return

  for (const item of world.flotsam) {
    if (item.collected || flatDistance(ship.position, item.position) > PICKUP_RANGE) continue

    item.collected = true
    item.mesh.removeFromParent()
    run.addCargo(item.loot.provisions, item.loot.gold)
    ship.repair(item.loot.repair ?? 0)
    ship.applyStats(run.stats)
    toast(toastsEl, `Picked up ${item.loot.label}`, 'info')
    sound.play('chest')
  }
}

/** coming within range only offers a landing; E or the prompt actually lands */
function offerLanding(sailing: boolean) {
  let offered: Island | null = null
  let offeredGap = Infinity
  for (const island of world.islands) {
    const distance = flatDistance(ship.position, island.position)

    if (shownOn === island.id && distance > island.radius + LANDING * 6) shownOn = null

    if (!sailing || shownOn === island.id) continue
    if (run.visited.has(island.id)) continue
    if (distance > island.radius + LANDING) continue

    if (distance < offeredGap) {
      offeredGap = distance
      offered = island
    }
  }
  if (offered && offered !== landingTarget) landNameEl.textContent = offered.name
  landingTarget = offered

  landEl.classList.toggle('hidden', !(landingTarget && sailing && !panelIsOpen()))
}

function readTally(): Tally {
  return {
    health: Math.round(ship.hp),
    pieces: run.pieces.size,
    crew: run.crew,
    rescued: run.passengers,
    gold: run.gold,
    food: run.provisions,
  }
}

function updateHud(delta: number) {
  const now = readTally()
  if (now.pieces > tally.pieces) sound.play('map')
  if (announceChanges(toastsEl, tally, now)) renderBuild()
  tally = now

  healthFill.style.width = `${ship.health * 100}%`
  healthFill.style.backgroundColor = ship.health < 0.35 ? '#ff6a4d' : '#7fd4a1'
  healthNum.textContent = String(Math.round(ship.hp))
  speedEl.textContent = `${(ship.speed * 1.2).toFixed(1)} knots`
  piecesEl.textContent = `${run.pieces.size}/${CHART_PIECES}`

  bearingTimer += delta
  if (bearingTimer > 0.2) {
    bearingTimer = 0
    renderBearings()
  }
  if (!compassEl.classList.contains('hidden')) updateCompass()
}

showIntro()
animate()
// wait for the intro's web fonts too, so the text doesn't swap in front of the player
document.fonts.ready.then(reveal, reveal)
