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
  raiseFlag,
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

// ----------------------------------------------------------------------- map
// One pass top to bottom:
//   1. renderer + scene    the WebGPURenderer and the scene it draws
//   2. ocean shader        "Seascape" wired in as scene.backgroundNode
//   3. the run + ship      the game state machine and the boat that sails it
//   4. lighting + world    sun, sky, the islands and the rocks
//   5. the hud             the reading panels, the pause menu, the compass
//   6. the loop            every frame: shader uniforms -> sail -> physics
//                          -> islands/rocks/flotsam -> pickups -> landing -> hud

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!

const canvas = document.createElement('canvas')
canvas.id = 'webgl'
$('#app').appendChild(canvas)

// the ported shader is raw WGSL, so there is no WebGL2 fallback
if (!('gpu' in navigator)) {
  $('#overlay').classList.remove('hidden')
  throw new Error('WebGPU is not available in this browser')
}

// ------------------------------------------------------- renderer + scene
const renderer = new THREE.WebGPURenderer({ canvas, antialias: false })
// Seascape is expensive (32 raymarch steps + 4 detailed height samples per pixel),
// so render at 1 device pixel per CSS pixel.
renderer.setPixelRatio(1)
renderer.toneMapping = THREE.NoToneMapping
await renderer.init()

const scene = new THREE.Scene()
const haze = new THREE.FogExp2(0x9fc4dd, 0.0035)
scene.fog = haze

// ---------------------------------------------------------------- ocean shader
// "Seascape" by Alexander Alekseev aka TDM - https://www.shadertoy.com/view/Ms2SD1
// `wgslFn` reads the signature of the entry function; the helpers it calls are
// added to the shader module ahead of it with `wgsl`.
const seascape = wgslFn(seascapeEntry, [wgsl(seascapeHelpers)])

const uTime = uniform(0)
const uChoppy = uniform(BASE_CHOPPY)
// the boat's own wake: where she is, which way she points, and how fast
const uShipPos = uniform(new THREE.Vector2(0, 0))
const uShipDir = uniform(new THREE.Vector2(0, -1))
const uShipSpeed = uniform(0)

/**
 * The time of day, which the map pieces move on from noon to sunset. Its sun
 * direction is the one for everything, so the glitter on the sea, the light on
 * the boat and the disc in the sky all agree.
 */
const daylight = new Daylight()
const uSunDir = uniform(daylight.direction)
const uDusk = uniform(0)

// three renders scene.backgroundNode on a skybox sphere with its translation
// stripped, so positionWorld is the world space view ray of this fragment.
// The arguments are matched to the WGSL parameters by name. TypeScript cannot
// read the WGSL, so it is told here that seascape() returns a vec3f colour.
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

// Seascape outputs display-ready (sRGB) colours, like every Shadertoy shader.
// The boat and islands are lit in three's linear working space and converted to
// sRGB at the end, so mark the sea as sRGB already, or that conversion would
// brighten and wash it out a second time.
scene.backgroundNode = colorSpaceToWorking(vec4(seaColor, 1), THREE.SRGBColorSpace)

// the CPU mirror of the shader's wave field, so the ship rides the visible water
const waves = new WaveField()

// ---------------------------------------------------------------- the run + ship
const run = new Run({
  onTell: showTell,
  onAshore: showAshore,
  onVisited: raiseFlag,
  onDepart() {
    sound.leave()
    // a choice can change the boat, so hand the new numbers over and redraw
    ship.applyStats(run.stats)
    renderBuild()
    closePanels()
    lock()
  },
  onDamage(amount) {
    ship.damage(amount)
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

/** the sound each island greets you with as you step ashore, keyed by island id */
const ARRIVAL_SOUNDS: Partial<Record<string, Clip>> = {
  wreck: 'bell',
  gallows: 'door',
  kitchen: 'market',
}

// the sea can only begin after a gesture: start it on the very first click or
// keypress, so it is already breathing by the time the player sets off.
const wakeAudio = () => sound.start()
window.addEventListener('pointerdown', wakeAudio, { once: true })
window.addEventListener('keydown', wakeAudio, { once: true })

// ---------------------------------------------------------- lighting + world
// both lights take their colour, strength and direction from the daylight
// every frame (see updateSky)
const sun = new THREE.DirectionalLight()
scene.add(sun)

const skyLight = new THREE.HemisphereLight()
scene.add(skyLight)

const physics = new Physics()
// every island is a copy of the Blender island, so it has to be loaded first
const world = buildWorld(await loadIsland())
for (const island of world.islands) {
  scene.add(island.group)
  if (island.beacon) scene.add(island.beacon)
  physics.island(island.position.x, island.position.z, island.radius)
}
// rocks are set into the sea at its average height, so the swell washes up
// them and drains off them instead of carrying them up and down like corks
const seaLevel = averageSeaLevel()
for (const hazard of world.hazards) {
  hazard.mesh.position.set(hazard.position.x, seaLevel, hazard.position.z)
  scene.add(hazard.mesh)
  physics.rock(hazard.position.x, hazard.position.z, hazard.radius)
}
for (const item of world.flotsam) scene.add(item.mesh)

/** the height of the open sea, averaged over a patch of it and a stretch of time */
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

/** the upgrades list and what is on board */
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

// ---- panels. The intro lives in #chart, every other page of the story in #draft.

/** a panel of the game's own has the screen */
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

/** show these elements as the next page of the story */
function openPanel(...content: HTMLElement[]) {
  draftEl.replaceChildren(...content)
  hidePause()
  draftEl.classList.remove('hidden')
  overlay.classList.add('hidden')
  document.body.classList.remove('locked')
  applyModal()
}

/**
 * A panel of the game's own is modal: the boat is anchored, the helm does
 * nothing and the pointer is handed back so the choice can be clicked. Browsers
 * can refuse a pointer lock request, so the unlock is re-asserted every frame
 * while the panel is up rather than trusted to land once.
 */
function applyModal() {
  const modal = panelIsOpen()
  ship.hold = modal
  if (modal && controls.isLocked) controls.unlock()
  return modal
}

// ---- opening: the situation, the islands, then cast off.
// The intro is a page, not a popup: it stays up until Start sailing.
function showIntro() {
  chartEl.replaceChildren(introSheet(), button('sail', 'Start sailing', showWarning))

  chartEl.classList.remove('hidden')
  draftEl.classList.add('hidden')
  overlay.classList.add('hidden')
  document.body.classList.remove('locked')
}

/** the motion sickness warning, on the same page as the intro, before the boat moves */
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

// ---- arrival, beat one: what the island is, and what you find ashore
function showTell(event: IslandEvent, island: Island) {
  const greeting = ARRIVAL_SOUNDS[island.id]
  if (greeting) sound.arrive(greeting)
  openPanel(
    sceneBlock(event.title, event.telling, event.adventure),
    button('go', 'go ashore', () => run.decide(event, island)),
    leaveButton(),
  )
}

// ---- arrival, beat two: the decision
function showAshore(event: IslandEvent) {
  const hand = document.createElement('div')
  hand.className = 'choices'

  for (const choice of event.choices) {
    // a flag set on an earlier island can remove a choice entirely
    if (choice.requires && !run.flags.has(choice.requires)) continue
    if (choice.blockedBy && run.flags.has(choice.blockedBy)) continue
    hand.appendChild(choiceCard(choice, run.canAfford(choice), () => run.resolve(choice)))
  }

  openPanel(sceneBlock(event.title, event.adventure), hand, leaveButton())
}

/** back to the boat without choosing: the island stays unvisited, so you can return */
function leaveButton() {
  return button('leave', 'leave for now, back to the boat (Esc)', () => leaveIsland(false))
}

function leaveIsland(byKey: boolean) {
  // the prompt may offer this island again straight away; it never forces a landing
  shownOn = null
  run.leave()
  // Browsers do not count Esc as a gesture that may take the mouse, so the lock
  // the departure asks for can be refused. Show the pause menu, whose Resume
  // button can; it hides itself if the lock lands after all.
  if (byKey && !controls.isLocked) showPause()
}

/** the score for the voyage as it stands, recorded against the best so far */
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

/**
 * Sunk, you rise over the spot where she went down. Home, you drop in astern of
 * her, low enough that the sun she is sailing for is in the frame above her.
 */
const SUNK_SHOT: Shot = { radius: 22, height: 9, sweep: 1.1, fov: 55 }
const HOME_SHOT: Shot = { radius: 20, height: 4, sweep: 0, bearing: SUN_YAW, fov: 55 }
/** seconds the closing shot plays before the last page of the story comes up */
const SUNK_DELAY = 7
const HOME_DELAY = 6

/** where the closing shot looks: the boat, at the level of the sea she is on */
const endingFocus = new THREE.Vector3()
function updateEndingFocus() {
  endingFocus.set(ship.position.x, ship.waterline + 0.6, ship.position.z)
  return endingFocus
}

/**
 * Swing round her whichever way keeps the most open water between the camera
 * and the nearest rock or island, so the shot does not end up inside one.
 */
function clearShot(shot: Shot): Shot {
  const from = camera.getWorldPosition(new THREE.Vector3())
  const angle = Math.atan2(from.x - ship.position.x, from.z - ship.position.z)

  const sweeps = [shot.sweep, -shot.sweep, shot.sweep + 1.6, -shot.sweep - 1.6]
  const best = sweeps.reduce((a, b) =>
    roomAlong(angle + b, shot.radius, angle) > roomAlong(angle + a, shot.radius, angle) ? b : a,
  )
  return { ...shot, sweep: best, keepClear }
}

/**
 * Home, the camera wants to be astern of her with the sun ahead. If a shore or
 * a rock is in that spot, it settles a little to one side or the other instead,
 * as close to dead astern as the open water allows.
 */
function clearHomeShot(shot: Shot): Shot {
  const ideal = shot.bearing ?? 0
  for (const step of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
    const bearing = ideal + step * 0.35
    if (roomAlong(bearing, shot.radius) > CAMERA_ROOM) return { ...shot, bearing, keepClear }
  }
  return { ...shot, keepClear }
}

/** open water around the camera's way out to this bearing and distance from the boat */
function roomAlong(bearing: number, radius: number, from = bearing) {
  let least = Infinity
  for (const k of [0.4, 0.7, 1]) {
    const a = from + (bearing - from) * k
    const near = physics.nearest(ship.position.x + Math.sin(a) * radius * k, ship.position.z + Math.cos(a) * radius * k)
    least = Math.min(least, near.gap)
  }
  return least
}

/** how much open water the closing camera keeps between itself and any shore or rock */
const CAMERA_ROOM = 6

/** if the camera has drifted into an island or a rock, move it straight back out */
function keepClear(position: THREE.Vector3) {
  const near = physics.nearest(position.x, position.z)
  if (near.gap >= CAMERA_ROOM) return
  position.x += near.nx * (CAMERA_ROOM - near.gap)
  position.z += near.nz * (CAMERA_ROOM - near.gap)
}

/**
 * The voyage is over. Before any page comes up, the camera leaves the deck and
 * pulls away into the sky so you watch it end: the boat breaking up and going
 * under, or sailing on home. A click or a key skips straight to the page.
 */
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

/** the last page of the story: what happened, the score, and the way back to the start */
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

/** the chart is complete: going home is a choice you can make from anywhere */
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
 * An island that has already shown its panel, so it cannot show it again while
 * you are still sitting on top of it. Cleared once you have actually sailed off
 * it. Without this, a panel that does not change phase re-fires every frame and
 * the player cannot get away from it.
 */
let shownOn: string | null = null

/** the island currently being offered, or null while nothing is in range */
let landingTarget: Island | null = null

/**
 * What putting you ashore actually does. Split out from the range check so the
 * player starts it — with E, or the prompt — rather than being swept into the
 * island's panel the moment they drift close.
 */
function landOn(island: Island | null) {
  if (!island || run.phase !== 'sailing' || panelIsOpen() || isPaused()) return

  shownOn = island.id
  landingTarget = null

  const event = eventFor(island.event)
  if (!event) {
    // Never fail silently: a missing event would otherwise drop the player
    // straight back into open water, which looks like nothing working.
    console.error(`no event written for island: ${island.id} (${island.event})`)
    run.visited.add(island.id)
    raiseFlag(island)
    showNothingHere(island)
    return
  }

  run.land(event, island)
}

// ---- pause: Esc releases the pointer, and releasing the pointer opens this.
// A panel of the game's own also releases it, so only treat it as a pause when
// nothing else has the screen.
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
 * Hand the cursor back to the player. Browsers reject a pointer lock request
 * issued in the same tick as exitPointerLock, so wait for the document to
 * actually report unlocked before asking again.
 */
function lock() {
  document.body.classList.add('locked')

  const request = () => {
    // once the voyage is over the closing shot has the camera, so stop asking
    if (controls.isLocked || !controls.enabled) return
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
  // E — or clicking the prompt — is what puts you ashore. Sailing close to an
  // island only ever offers it.
  if (event.code === 'KeyE' || event.key.toLowerCase() === 'e') {
    landOn(landingTarget)
  }
  // Esc while the menu is up puts you straight back on the tiller
  else if (event.code === 'Escape' && isPaused()) {
    event.preventDefault()
    resume()
  }
  // Esc on an island walks you back to the boat
  else if (event.code === 'Escape' && (run.phase === 'telling' || run.phase === 'ashore')) {
    event.preventDefault()
    leaveIsland(true)
  }
})

// ---- instruments

/** with a Navigator's Glass the instruments show every island, not just the nearest */
function hasGlass() {
  return run.stats.lookahead > 0
}

/** the closest island still holding a piece of chart */
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

/**
 * What the instruments can tell you. Without a Navigator's Glass you get the one
 * bearing your own reckoning gives you, to whichever island is nearest. With
 * one, you get every island and its leg, spent ones included, because a chart
 * that remembers where you have already been is worth as much as one that
 * tells you where to go next.
 */
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

/** which way the camera is looking, as a compass heading in degrees */
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
  const width = window.innerWidth
  const height = window.innerHeight

  renderer.setSize(width, height)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

/** true on frames the boat is pressing into a rock, so a bump only charges once */
let grounded = false
/** true on frames the hull is touching any solid, so a bump sounds only at the start */
let wasTouching = false
/** throttles the bearings list, which does not need 60 rebuilds a second */
let bearingTimer = 0
/** seconds at the helm since the crew last ate */
let hungerClock = 0
/** how often the crew eats a day's food, in seconds at the helm */
const MEAL_INTERVAL = 20
/** the numbers on screen last frame, so every change can be announced */
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

  // no throttle and no steering unless you are actually sailing and holding
  // the tiller. Without the isLocked check, W drives the boat from the pause menu.
  const sailing = run.phase === 'sailing' && controls.isLocked
  steerShip(delta, elapsed, sailing)
  collide(delta)
  floatIslands(delta, elapsed)
  collectFlotsam(sailing)
  offerLanding(sailing)

  if (!ship.alive && run.phase !== 'dead') run.sink()

  updateHud(delta)
  if (endingCamera.active) endingCamera.update(delta, updateEndingFocus())

  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

/** keep the shader and its CPU mirror on the same sea, and the sound on top of it */
function updateSea(elapsed: number) {
  // the sea closes in the more of the map you hold
  const choppy = choppyForPieces(run.pieces.size)
  uTime.value = elapsed
  uChoppy.value = choppy
  waves.time = elapsed
  waves.choppy = choppy

  const rough = Math.max(0, Math.min(1, (choppy - BASE_CHOPPY) / MAX_EXTRA_CHOP))
  sound.tick(rough, ship.speed, isPaused())

  // the boat carves her own wake into the raymarched sea
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

/**
 * Every piece of the map moves the clock on, so the afternoon wears away as the
 * chart fills in and the voyage ends at sunset. The sky, the lights and the haze
 * all follow the one clock.
 */
function updateSky(delta: number) {
  daylight.update(delta, run.pieces.size)
  // uSunDir holds daylight.direction itself, so it is already up to date
  uDusk.value = daylight.hour * daylight.hour

  // a directional light shines from its position towards the origin, so this
  // lights the boat from where the sun is drawn
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
  // home, nobody is at the helm, but she turns for the sun and sails on into it
  const home = run.phase === 'home'
  if (home) ship.hold = false
  const throttle = atHelm ? controls.throttle : home ? 0.35 : 0
  const rudder = atHelm ? controls.rudder : home ? helmToward(homeHeading()) : 0
  ship.update(delta, waves, throttle, rudder)
  if (atHelm) passTime(delta)

  // becalmed, the wind sets you down and you can do nothing about it. A wreck
  // is past all of that: the tide takes her, not the wind.
  if (!sailing && run.phase !== 'dead') {
    const push = driftForPieces(run.pieces.size)
    ship.position.x += Math.sin(elapsed * 0.21) * push * delta
    ship.position.z += Math.cos(elapsed * 0.17) * push * delta
  }
}

/** how close, in metres, a shore or rock has to be before she bears away from it */
const GIVE_WAY = 22

/**
 * Home, she makes for the sun, but the last piece is usually won on an island,
 * so the sun can lie straight through it. Near a shore or rock she leans away
 * from it and round it, harder the closer it is, and comes back onto the sun
 * once she is in open water.
 */
function homeHeading() {
  let x = -Math.sin(SUN_YAW)
  let z = -Math.cos(SUN_YAW)

  const near = physics.nearest(ship.position.x, ship.position.z)
  const lean = THREE.MathUtils.clamp(1 - near.gap / GIVE_WAY, 0, 1) * 2.5
  if (lean > 0) {
    // round it on whichever side is nearer the sun, so she never stalls
    // facing a shore with the sun pulling one way and the rocks the other
    const side = -near.nz * x + near.nx * z >= 0 ? 1 : -1
    x += (near.nx - near.nz * side) * lean
    z += (near.nz + near.nx * side) * lean
  }
  return Math.atan2(-x, -z)
}

/** the rudder that swings her bow round to this heading, easing off as she comes onto it */
function helmToward(yaw: number) {
  const off = Math.atan2(Math.sin(yaw - ship.yaw), Math.cos(yaw - ship.yaw))
  // positive rudder turns her to starboard, which lowers her yaw
  return THREE.MathUtils.clamp(-off * 1.5, -1, 1)
}

/** the clock runs while you sail: the score counts it, and the crew gets hungry */
function passTime(delta: number) {
  run.sailTime += delta
  hungerClock += delta
  if (hungerClock < MEAL_INTERVAL) return

  hungerClock = 0
  if (run.provisions === 0) return
  run.eat()
  // a short commons slows the crew down, so the boat needs the new numbers
  ship.applyStats(run.stats)
  if (run.provisions === 2) toast(toastsEl, 'Food is running low', 'info')
  if (run.provisions === 0) toast(toastsEl, 'The larder is empty. The crew grows weak', 'cost')
}

/**
 * cannon-es answers what the boat touched this frame. She still sails by the
 * hand-rolled kinematics; physics just keeps her out of the rocks and slides
 * her along the shores instead of sailing through them.
 */
function collide(delta: number) {
  const hits = physics.step(delta, ship.position, ship.velocity)

  // once she is gone she is gone: no shoving, no grinding, no damage. The wreck
  // just lists over and goes under.
  if (!ship.alive) return

  let touching = false
  let grinding = false
  let hardestContact = 0
  let fastestRockHit = 0
  for (const hit of hits) {
    // push her back out of whatever she is biting into, plus a hair of slack
    ship.position.x += hit.nx * (hit.depth + 0.4)
    ship.position.z += hit.nz * (hit.depth + 0.4)

    touching = true
    hardestContact = Math.max(hardestContact, hit.speed)
    if (hit.kind === 'rock') {
      grinding = true
      fastestRockHit = Math.max(fastestRockHit, hit.speed)
    }
  }

  // nothing hurts or sounds while a menu or a panel has the screen, or once
  // she is home: sailing into the sun, a rock cannot undo the ending
  const clearDeck = !isPaused() && !panelIsOpen() && run.phase !== 'home'

  // the hull-slam sounds on first contact and not again until she is clear
  if (touching && !wasTouching && clearDeck) sound.bump(hardestContact)
  wasTouching = touching

  // A bump costs a visible chunk of the hull, charged once per grinding
  // episode. Calling damage() every frame drip-feeds the readout with a
  // fraction a human cannot see; one charge per contact is a hit you feel.
  if (grinding && !grounded) {
    if (clearDeck) ship.damage(8 + Math.max(0, fastestRockHit - 1) * 0.8)
    flashDamage()
  }
  grounded = grinding
}

/** restart the red vignette's CSS animation */
function flashDamage() {
  damageFlash.classList.remove('on')
  void damageFlash.offsetWidth // force a reflow, or the browser skips the restart
  damageFlash.classList.add('on')
}

/**
 * Islands ride the water: heave on the swell, and lean into its slope the way a
 * hull does, but slower, because land is heavier than a boat. Rocks just sit on it.
 */
function floatIslands(delta: number, elapsed: number) {
  // a beat behind the water: land heaves, it does not snap
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

    // the beacon breathes, so the eye catches it on the horizon
    if (island.beacon) {
      island.beacon.position.set(x, ride.height + 44, z)
      island.beacon.material.opacity = 0.24 + Math.sin(elapsed * 1.6 + x * 0.1) * 0.08
    }

    // the flag is the only thing on these islands that moves on its own, which
    // is what makes it readable as a signal from a distance
    if (island.flag) {
      const gust = elapsed * 2.3 + x * 0.05
      island.flag.rotation.z = Math.sin(gust) * 0.14
      island.flag.rotation.y = Math.sin(gust * 0.7) * 0.5
    }
  }

  // rocks stand still and the sea moves round them: only the waterline they
  // darken and foam against goes up and down
  for (const hazard of world.hazards) {
    hazard.water.value = waves.height(hazard.position.x, hazard.position.z)
  }

  // wreckage turns slowly and rocks on the swell
  for (const item of world.flotsam) {
    if (item.collected) continue
    const { x, z } = item.position
    item.mesh.position.set(x, waves.height(x, z) + 0.15, z)
    item.mesh.rotation.y += item.spin * delta
    item.mesh.rotation.x = Math.sin(elapsed * 1.3 + x) * 0.15
  }
}

/** sail into floating wreckage to haul it aboard */
function collectFlotsam(sailing: boolean) {
  if (!sailing || !ship.alive) return

  for (const item of world.flotsam) {
    if (item.collected || flatDistance(ship.position, item.position) > PICKUP_RANGE) continue

    item.collected = true
    item.mesh.removeFromParent()
    run.addCargo(item.loot.provisions, item.loot.gold)
    ship.repair(item.loot.repair ?? 0)
    // food and gold both change how she handles
    ship.applyStats(run.stats)
    toast(toastsEl, `Picked up ${item.loot.label}`, 'info')
    sound.play('chest')
  }
}

/**
 * No destination was ever chosen, so you simply arrive wherever you happen to
 * have sailed. Landing is an offer, not a trap: coast within sight of the beach
 * and the game asks; it never grabs you.
 */
function offerLanding(sailing: boolean) {
  let offered: Island | null = null
  let offeredGap = Infinity
  for (const island of world.islands) {
    const distance = flatDistance(ship.position, island.position)

    // forget an island once you are well clear of it, so you can come back
    if (shownOn === island.id && distance > island.radius + LANDING * 6) shownOn = null

    if (!sailing || shownOn === island.id) continue
    // a spent island cannot be landed on again
    if (run.visited.has(island.id)) continue
    if (distance > island.radius + LANDING) continue

    if (distance < offeredGap) {
      offeredGap = distance
      offered = island
    }
  }
  // name the island on the prompt, but only touch the DOM when the offer changes
  if (offered && offered !== landingTarget) landNameEl.textContent = offered.name
  landingTarget = offered

  landEl.classList.toggle('hidden', !(landingTarget && sailing && !panelIsOpen()))
}

/** the numbers the pop-up messages watch */
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

  // rewriting the list every frame is pointless, so a few times a second will do
  bearingTimer += delta
  if (bearingTimer > 0.2) {
    bearingTimer = 0
    renderBearings()
  }
  if (!compassEl.classList.contains('hidden')) updateCompass()
}

showIntro()
animate()
