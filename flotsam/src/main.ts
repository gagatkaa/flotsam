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
import { Ship } from './objects/Ship'
import { WaveField } from './objects/WaveField'
import { Physics } from './physics/Physics'
import {
  bearingAndRange,
  buildWorld,
  CHART_PIECES,
  choppyForIslands,
  driftForIslands,
  raiseFlag,
  type Island,
  type World,
} from './game/world'
import { eventFor } from './game/events'
import { cardName } from './game/cards'
import { Run, type Choice, type IslandEvent } from './game/run'
import { describe } from './game/stats'

const canvas = document.createElement('canvas')
canvas.id = 'webgl'
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas)

// ----------------------------------------------------------------------- map
// One pass top to bottom:
//   1. renderer + scene          the WebGPURenderer and the skybox it will draw
//   2. ocean shader             "Seascape" wired in as scene.backgroundNode (lines ~58)
//   3. the run + ship           the game state machine and the boat that sails it
//   4. lighting, then the hud   sun, the reading panels, the opening page
//   5. the loop                 every frame: shader uniforms -> sail -> physics
//                               -> islands/rocks -> compass -> hud
// The interesting-to-a-teacher parts are the ocean shader section and the
// per-frame loop (marked `loop` below); everything else is presentation for the
// "more than just looking around" part of the assignment.

// the ported shader is raw WGSL, so there is no WebGL2 fallback
if (!('gpu' in navigator)) {
  document.querySelector<HTMLDivElement>('#overlay')?.classList.remove('hidden')
  document.querySelector<HTMLDivElement>('#chart')?.classList.add('hidden')
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
const seascape = wgslFn<[THREE.Node, THREE.Node, THREE.Node, THREE.Node, THREE.Node, THREE.Node, THREE.Node, THREE.Node]>(
  seascapeEntry,
  [wgsl(seascapeHelpers)],
)

const uTime = uniform(0)
const uChoppy = uniform(4)
// the boat's own wake: where she is, which way she points, and how fast
const uShipPos = uniform(new THREE.Vector2(0, 0))
const uShipDir = uniform(new THREE.Vector2(0, -1))
const uShipSpeed = uniform(0)

// `wgslFn` is typed as returning an untyped Node, so cast it to a vec3 node
const seascapeColor = seascape as unknown as (...args: THREE.Node[]) => ReturnType<typeof vec3>

const rayDir = normalize(positionWorld)
// three renders scene.backgroundNode on a skybox sphere with its translation
// stripped, so positionWorld is the world space view ray of this fragment.
scene.backgroundNode = vec4(
  seascapeColor(rayDir, cameraPosition, screenSize, uTime, uChoppy, uShipPos, uShipDir, uShipSpeed),
  1,
)

// ---------------------------------------------------------------------- the run
// the CPU mirror of the shader's wave field, so the ship rides the visible water
const waves = new WaveField()

const run = new Run({
  onTell(event, island) {
    showTell(event, island)
  },
  onAshore(event) {
    showAshore(event)
  },
  onDepart() {
    // a choice can change the boat, so hand the new numbers over and redraw
    ship.applyStats(run.stats)
    renderBuild()
    closePanels()
    lock()
  },
  onDamage(amount) {
    ship.damage(amount)
  },
  onCharted() {
    showCharted()
  },
  onHome(log) {
    renderBuild()
    showHome(log)
  },
  onSunk(log) {
    renderBuild()
    showSunk(log)
  },
})

const ship = new Ship(run.stats)
scene.add(ship.rig)

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 2000)
ship.cameraMount.add(camera)

const controls = new BoatControls(camera, canvas)

// ------------------------------------------------------------------- lighting
const sun = new THREE.DirectionalLight(0xfff2d8, 2.4)
sun.position.set(-40, 14, -20)
scene.add(sun)

const sky = new THREE.HemisphereLight(0xbfe3ff, 0x1d4a63, 1.1)
scene.add(sky)

const physics = new Physics()
let world: World

function loadWorld(seed?: number) {
  world = buildWorld(seed)
  for (const island of world.islands) {
    scene.add(island.group)
    physics.island(island.position.x, island.position.z, island.radius)
  }
  for (const hazard of world.hazards) {
    scene.add(hazard.mesh)
    physics.rock(hazard.position.x, hazard.position.z, hazard.radius)
  }
}
loadWorld()

// --------------------------------------------------------------------- the hud
const overlay = document.querySelector<HTMLDivElement>('#overlay')!
const readouts = document.querySelector<HTMLSpanElement>('#readout')!
const hullEl = document.querySelector<HTMLSpanElement>('#hull-fill')!
const piecesEl = document.querySelector<HTMLSpanElement>('#pieces')!
const buildEl = document.querySelector<HTMLUListElement>('#build-list')!
const chartEl = document.querySelector<HTMLDivElement>('#chart')!
const draftEl = document.querySelector<HTMLDivElement>('#draft')!
const flash = document.querySelector<HTMLDivElement>('#damage')!
const windEl = document.querySelector<HTMLSpanElement>('#wind')!
const bearingsEl = document.querySelector<HTMLUListElement>('#bearings')!
const pauseEl = document.querySelector<HTMLDivElement>('#pause')!
const resumeEl = document.querySelector<HTMLButtonElement>('#resume')!
const pauseStatEl = document.querySelector<HTMLParagraphElement>('#pause-stat')!
const loadCrewEl = document.querySelector<HTMLSpanElement>('#load-crew')!
const loadPassEl = document.querySelector<HTMLSpanElement>('#load-pass')!
const loadGoldEl = document.querySelector<HTMLSpanElement>('#load-gold')!
const loadFoodEl = document.querySelector<HTMLSpanElement>('#load-food')!
const landEl = document.querySelector<HTMLButtonElement>('#land')!
const compassEl = document.querySelector<HTMLDivElement>('#compass')!
const compassTape = document.querySelector<HTMLDivElement>('#compass-tape')!
const compassHead = document.querySelector<HTMLSpanElement>('#compass-head')!
const compassWord = document.querySelector<HTMLSpanElement>('#compass-word')!

landEl.addEventListener('click', () => landOn(landingTarget))

function hidePanels() {
  chartEl.classList.add('hidden')
  draftEl.classList.add('hidden')
}

function renderBuild() {
  buildEl.innerHTML = ''
  const counts = run.counts()
  for (const [card, count] of counts) {
    const li = document.createElement('li')
    li.innerHTML =
      `<span class="count">${count > 1 ? `${count}×` : ''}</span> ${card.name} ` +
      `<span class="effect">${describe(card)}</span>` +
      `<span class="desc">${card.text}</span>`
    buildEl.appendChild(li)
  }

  loadCrewEl.textContent = `crew ${run.crew}`
  loadPassEl.textContent = `rescued ${run.passengers}`
  loadGoldEl.textContent = `gold ${run.gold}`
  loadFoodEl.textContent = `food ${run.provisions}`
}

// ---- opening: the situation, the seven, then cast off
function showIntro() {
  chartEl.innerHTML = ''

  const sheet = document.createElement('div')
  sheet.className = 'prologue'

  sheet.innerHTML =
    '<p class="eyebrow">a short crossing</p>' +
    '<h1>Flotsam</h1>' +
    '<div class="lede">' +
    `<p>Eleven days lost, and home is torn into ${CHART_PIECES} pieces — each one ` +
    'waiting on an island. Sail to whichever you can see, and decide what it is ' +
    'worth to you when you get there.</p>' +
    '</div>' +
    '<ol class="manifest">' +
    '<li><b>The Ship That Wouldn\'t Sink</b><span>and the bell keeps ringing below</span></li>' +
    '<li><b>The Lighthouse With No Light</b><span>the door just slammed behind you</span></li>' +
    '<li><b>The Crab Market</b><span>loud, and one crab bigger than a cart</span></li>' +
    '<li class="last"><b>The Sleeping Giant</b><span>white cliffs, if you look twice</span></li>' +
    '</ol>' +

    '<p class="keys">' +
    '<b>W</b> speed up<i>·</i><b>S</b> slow down<i>·</i><b>A</b><b>D</b> steer<i>·</i>' +
    '<b>E</b> go ashore<i>·</i><b>Mouse</b> look<i>·</i><b>Esc</b> release cursor' +
    '</p>'

  chartEl.appendChild(sheet)

  const go = document.createElement('button')
  go.className = 'sail'
  go.textContent = 'Start sailing'
  go.addEventListener('click', () => {
    run.sail()
    hidePanels()
    lock()
  })
  chartEl.appendChild(go)

  // the intro is a page, not a popup: it stays up until Start sailing
  chartEl.classList.remove('hidden')
  draftEl.classList.add('hidden')
  overlay.classList.add('hidden')
  document.body.classList.remove('locked')
  if (controls.isLocked) controls.unlock()
}

function closePanels() {
  hidePanels()
  overlay.classList.add('hidden')
  ship.hold = false
}

function showNothingHere(island: Island) {
  draftEl.innerHTML = ''
  const block = document.createElement('div')
  block.className = 'scene'
  block.innerHTML =
    `<h2>${island.name}</h2>` +
    `<p>This island keeps its own counsel. Nothing has been written for it yet.</p>`
  draftEl.appendChild(block)

  const next = document.createElement('button')
  next.className = 'go'
  next.textContent = 'back to sea'
  next.addEventListener('click', () => {
    closePanels()
    lock()
  })
  draftEl.appendChild(next)

  openPanel()
}

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
  if (!island || run.phase !== 'sailing' || panelIsOpen()) return
  if (!pauseEl.classList.contains('hidden')) return

  shownOn = island.id
  landingTarget = null

  run.visited.add(island.id)
  raiseFlag(island)

  const event = eventFor(island.event)
  if (!event) {
    // Never fail silently. A missing event used to drop the player straight
    // back into open water, which is indistinguishable from nothing working.
    console.error(`no event written for island: ${island.id} (${island.event})`)
    showNothingHere(island)
    return
  }

  run.land(event, island)
}

/** throttles the bearings list, which does not need 60 rebuilds a second */
let bearingTimer = 0

/**
 * What the instruments can tell you. Without a Navigator's Glass you get the one
 * bearing your own reckoning gives you, to whichever island is nearest. With
 * one, you get every island and its leg, spent ones included, because a chart
 * that remembers where you have already been is worth as much as one that
 * tells you where to go next.
 */
function renderBearings() {
  const glass = run.stats.lookahead > 0

  const nearest = nearestUnvisited()
  if (!glass) {
    bearingsEl.innerHTML = ''
    windEl.textContent = nearest
      ? (() => {
          const { bearing, range } = bearingAndRange(ship.position, nearest.position)
          return `${nearest.name} ${bearing}° · ${range} m`
        })()
      : 'map complete'
    return
  }

  windEl.textContent = 'all islands'

  const rows = [...world.islands].sort((a, b) => {
    const da = Math.hypot(ship.position.x - a.position.x, ship.position.z - a.position.z)
    const db = Math.hypot(ship.position.x - b.position.x, ship.position.z - b.position.z)
    return da - db
  })

  let html = ''
  for (const island of rows) {
    const { bearing, range } = bearingAndRange(ship.position, island.position)
    const spent = run.visited.has(island.id)
    html +=
      `<li${spent ? ' class="spent"' : ''}>` +
      `<span class="name"${spent ? '' : ` style="color:${islandTint(island)}"`}>` +
      island.name +
      `</span>` +
      `<span class="leg">${bearing}° ${range}m</span>` +
      `</li>`
  }
  bearingsEl.innerHTML = html
}

/** how many degrees of the horizon the compass shows on each side of the bow */
const COMPASS_HALF = 130
const CARDINALS = ['N', 'E', 'S', 'W']
const HEADING_WORDS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

const compassDir = new THREE.Vector3()

/** the island's hue as a CSS string, for the chart marks that carry it */
function islandTint(island: Island) {
  return `#${island.tint.toString(16).padStart(6, '0')}`
}

function viewHeading(): number {
  camera.getWorldDirection(compassDir)
  const degrees = (Math.atan2(compassDir.x, -compassDir.z) * 180) / Math.PI
  return (degrees + 360) % 360
}

/**
 * The heading-up compass. The notch is where you are looking, so an island is
 * "steer until its mark sits under the notch". Cardinal letters and degree
 * ticks give it a fixed frame to steer against.
 */
function renderCompass() {
  const width = compassTape.clientWidth || 320
  const pxPerDeg = width / (COMPASS_HALF * 2)
  const heading = viewHeading()

  const ticks: string[] = []
  const start = Math.ceil((heading - COMPASS_HALF) / 15) * 15
  for (let deg = start; deg < heading + COMPASS_HALF; deg += 15) {
    const normalized = ((deg % 360) + 360) % 360
    const major = normalized % 45 === 0
    const cardinal = major && normalized % 90 === 0 ? CARDINALS[(normalized / 90) % 4] : ''
    const label = cardinal || (major ? String(normalized).padStart(3, '0') : '')
    const x = Math.round(width / 2 + (deg - heading) * pxPerDeg)
    ticks.push(
      `<i class="tick${major ? ' major' : ''}${cardinal ? ' cardinal' : ''}" style="left:${x}px">` +
        (label ? `<b>${label}</b>` : '') +
        `</i>`,
    )
  }

  const glass = run.stats.lookahead > 0
  const nearest = nearestUnvisited()
  const islands = glass ? world.islands : nearest ? [nearest] : []

  const marks: string[] = []
  for (const island of islands) {
    const { bearing, range } = bearingAndRange(ship.position, island.position)
    const rel = ((parseFloat(bearing) - heading + 540) % 360) - 180
    if (Math.abs(rel) > COMPASS_HALF + 5) continue
    const x = Math.round(width / 2 + rel * pxPerDeg)
    const spent = run.visited.has(island.id)
    const kind = spent ? 'spent' : 'open'
    const target = island.id === nearest?.id
    // open islands read in their own colour; the guiding green of the nearest
    // unvisited island and the spent dimming are louder, so they win
    const tinted = kind === 'open' && !target
    const style = `left:${x}px${tinted ? `;color:${islandTint(island)}` : ''}`
    const rangeText = Math.round(parseFloat(range))
    marks.push(
      `<span class="island ${kind}${target ? ' target' : ''}" style="${style}">` +
        `<em>${island.name} ${rangeText}m</em><i></i></span>`,
    )
  }

  compassTape.innerHTML = ticks.join('') + marks.join('')
  compassHead.textContent = `${String(Math.round(heading)).padStart(3, '0')}°`
  compassWord.textContent = HEADING_WORDS[Math.round(heading / 45) % 8]
}

/** the closest island still holding a piece of chart */
function nearestUnvisited(): Island | null {
  let best: Island | null = null
  let gap = Infinity
  for (const island of world.islands) {
    if (run.visited.has(island.id)) continue
    const distance = Math.hypot(
      ship.position.x - island.position.x,
      ship.position.z - island.position.z,
    )
    if (distance < gap) {
      gap = distance
      best = island
    }
  }
  return best
}

// ---- arrival, beat one: what the island is, and what you find ashore
function showTell(event: IslandEvent, island: Island) {
  draftEl.innerHTML = ''

  const block = document.createElement('div')
  block.className = 'scene'
  block.innerHTML =
    `<h2>${event.title}</h2>` +
    `<p>${event.telling}</p>` +
    `<p>${event.adventure}</p>`
  draftEl.appendChild(block)

  const next = document.createElement('button')
  next.className = 'go'
  next.textContent = 'go ashore'
  next.addEventListener('click', () => run.decide(event, island))
  draftEl.appendChild(next)

  openPanel()
}

// ---- arrival, beat two: the decision
function showAshore(event: IslandEvent) {
  draftEl.innerHTML = ''

  const block = document.createElement('div')
  block.className = 'scene'
  block.innerHTML = `<h2>${event.title}</h2><p>${event.adventure}</p>`
  draftEl.appendChild(block)

  const hand = document.createElement('div')
  hand.className = 'choices'

  for (const choice of event.choices) {
    // a flag set on an earlier island can remove a choice entirely
    if (choice.requires && !run.flags.has(choice.requires)) continue
    if (choice.blockedBy && run.flags.has(choice.blockedBy)) continue

    const button = document.createElement('button')
    button.className = 'card'

    // Every choice says what it will hand over and what it will cost, in prose
    // and then in hard numbers, so the decision is never a guess.
    const gains: string[] = []
    const costs: string[] = []
    if (choice.piece) gains.push(`${event.title} map piece`)
    if (choice.gain) gains.push(choice.gain.name)
    if (choice.crewDelta && choice.crewDelta > 0) gains.push(`${choice.crewDelta} crew`)
    if (choice.passengersDelta && choice.passengersDelta > 0) gains.push(`${choice.passengersDelta} rescued`)
    if (choice.goldDelta && choice.goldDelta > 0) gains.push(`${choice.goldDelta} gold`)
    if (choice.provisionsDelta && choice.provisionsDelta > 0) gains.push(`${choice.provisionsDelta} food`)

    if (choice.crewDelta && choice.crewDelta < 0) costs.push(`${Math.abs(choice.crewDelta)} crew`)
    if (choice.passengersDelta && choice.passengersDelta < 0) costs.push(`${Math.abs(choice.passengersDelta)} rescued`)
    if (choice.goldDelta && choice.goldDelta < 0) costs.push(`${Math.abs(choice.goldDelta)} gold`)
    if (choice.provisionsDelta && choice.provisionsDelta < 0) costs.push(`${Math.abs(choice.provisionsDelta)} food`)
    if (choice.lose) costs.push(`${cardName(choice.lose)}`)
    if (choice.damage) costs.push(`${choice.damage} health`)

    const mods = [
      ...gains.map((g) => `+ ${g}`),
      ...costs.map((c) => `\u2212 ${c}`),
    ].join('   ')

    button.innerHTML =
      `<span class="text">${choice.text}</span>` +
      `<span class="preview">${choice.preview}</span>` +
      (mods ? `<span class="mods">${mods}</span>` : '')

    button.addEventListener('click', () => take(choice))
    hand.appendChild(button)
  }

  draftEl.appendChild(hand)
  openPanel()
}

function take(choice: Choice) {
  run.resolve(choice)
}

function showSunk(log: string[]) {
  draftEl.innerHTML = ''
  const block = document.createElement('div')
  block.className = 'scene'
  block.innerHTML =
    '<h2>Sunk</h2>' +
    '<p>She goes down with the chart still folded in the cabin table. Whatever it ' +
    'was about to show you, it will show nobody now. The sea closes over the boat — ' +
    'and over you.</p>'
  draftEl.appendChild(block)
  draftEl.appendChild(buildLog(log))
  openPanel()
}

function buildLog(log: string[]) {
  const list = document.createElement('ol')
  list.id = 'log'
  for (const line of log) {
    const item = document.createElement('li')
    item.textContent = line
    list.appendChild(item)
  }
  return list
}

function showHome(log: string[]) {
  draftEl.innerHTML = ''
  const block = document.createElement('div')
  block.className = 'scene'
  block.innerHTML =
    '<h2>Home</h2>' +
    `<p>All ${CHART_PIECES} pieces, and a crew still alive to read them. Home opens a way ` +
    'for you that no chart could have named. You are not the same boat that left it.</p>'
  draftEl.appendChild(block)
  draftEl.appendChild(buildLog(log))
  openPanel()
}

/** the chart is complete: going home is a choice you can make from anywhere */
function showCharted() {
  draftEl.innerHTML = ''
  const block = document.createElement('div')
  block.className = 'scene'
  block.innerHTML =
    '<h2>The Whole Chart</h2>' +
    `<p>You lay the last of the ${CHART_PIECES} pieces into place and the sea finally ` +
    'closes up into a map. Every route home is on it now — the way in, the way out, ' +
    'and the way you came. The crew can smell land.</p>'
  draftEl.appendChild(block)

  const home = document.createElement('button')
  home.className = 'go'
  home.textContent = 'sail home'
  home.addEventListener('click', () => run.reachHome())
  draftEl.appendChild(home)
  openPanel()
}

function openPanel() {
  hidePause()
  draftEl.classList.remove('hidden')
  overlay.classList.add('hidden')
  document.body.classList.remove('locked')
  applyModal()
}

renderBuild()

/**
 * Hand the cursor back to the player. Browsers reject a pointer lock request
 * issued in the same tick as exitPointerLock, so wait for the document to
 * actually report unlocked before asking again.
 */
function lock() {
  document.body.classList.add('locked')

  const request = () => {
    if (controls.isLocked) return
    const result = canvas.requestPointerLock() as Promise<void> | undefined
    if (result && typeof result.catch === 'function') {
      result.catch(() => window.setTimeout(request, 120))
    }
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

resumeEl.addEventListener('click', () => {
  hidePause()
  lock()
})

// E — or clicking the prompt — is what puts you ashore. Sailing close to an
// island only ever offers it.
window.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyE') return
  landOn(landingTarget)
})

// Esc while the menu is up puts you straight back on the tiller
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Escape') return
  if (pauseEl.classList.contains('hidden')) return
  event.preventDefault()
  hidePause()
  lock()
})

// ---- pause: Esc releases the pointer, and releasing the pointer opens this.
// A panel of the game's own also releases it, so only treat it as a pause when
// nothing else has the screen.
function panelIsOpen() {
  return (
    !chartEl.classList.contains('hidden') || !draftEl.classList.contains('hidden')
  )
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
  // the sea closes in the longer you're out there
  const choppy = choppyForIslands(run.pieces.size)
  uChoppy.value = choppy
  waves.time = elapsed
  waves.choppy = choppy

  // the boat carves her own wake into the raymarched sea
  const sailSpeed = Math.max(0, ship.speed - 0.5)
  uShipPos.value = new THREE.Vector2(ship.position.x, ship.position.z)
  uShipDir.value = new THREE.Vector2(ship.facing.x, ship.facing.z)
  uShipSpeed.value = sailSpeed
  waves.shipX = ship.position.x
  waves.shipZ = ship.position.z
  waves.shipDirX = ship.facing.x
  waves.shipDirZ = ship.facing.z
  waves.shipSpeed = sailSpeed

  // no throttle and no steering unless you are actually sailing and holding
  // the tiller. Without the isLocked check, W drives the boat from the pause menu.
  const sailing = run.phase === 'sailing' && controls.isLocked

  const modal = applyModal()
  compassEl.classList.toggle('hidden', !(sailing && !modal))
  ship.update(
    delta,
    waves,
    sailing && !modal ? controls.throttle : 0,
    sailing && !modal ? controls.rudder : 0,
  )

  // becalmed, the wind sets you down and you can do nothing about it
  if (!sailing) {
    const push = driftForIslands(run.pieces.size)
    ship.position.x += Math.sin(elapsed * 0.21) * push * delta
    ship.position.z += Math.cos(elapsed * 0.17) * push * delta
  }

  // ---- cannon-es answers what the boat touched this frame. She still sails
  // by the hand-rolled kinematics; physics just keeps her out of the rocks and
  // slides her along the shores instead of sailing through them.
  const hits = physics.step(
    delta,
    ship.position.x,
    ship.position.y,
    ship.position.z,
    ship.velocity.x,
    ship.velocity.z,
  )

  let grinding = false
  for (const hit of hits) {
    // push her back out of whatever she is biting into, plus a hair of slack
    ship.position.x += hit.nx * (hit.depth + 0.4)
    ship.position.z += hit.nz * (hit.depth + 0.4)

    if (hit.kind !== 'rock') continue
    grinding = true
    // grinding wears the hull; hitting her fast adds to it
    if (sailing) ship.damage((8 + Math.max(0, hit.speed - 1) * 0.8) * delta)
  }

  if (grinding && !flash.classList.contains('on')) {
    flash.classList.remove('on')
    void flash.offsetWidth
    flash.classList.add('on')
  }

  // ---- islands ride the water: heave on the swell, and lean into its slope
  // the way a hull does, but slower, because land is heavier than a boat
  for (const island of world.islands) {
    const { x, z } = island.position
    const reach = island.radius * 0.7

    const centre = waves.height(x, z)
    const east = waves.height(x + reach, z)
    const west = waves.height(x - reach, z)
    const north = waves.height(x, z - reach)
    const south = waves.height(x, z + reach)

    // a beat behind the water: land heaves, it does not snap
    const follow = 1 - Math.min(1, 1.6 * delta)
    const ride = island.ride
    const lean = 2.2

    ride.height += (centre - ride.height) * follow
    ride.pitch += (Math.atan2(north - south, reach * 2) * lean - ride.pitch) * follow
    ride.roll += (Math.atan2(east - west, reach * 2) * lean - ride.roll) * follow

    island.group.position.set(x, ride.height - 1.2, z)
    island.group.rotation.x = ride.pitch
    island.group.rotation.z = ride.roll

    // the flag is the only thing on these islands that moves on its own, which
    // is what makes it readable as a signal from a distance
    if (island.flag) {
      const gust = elapsed * 2.3 + island.position.x * 0.05
      island.flag.rotation.z = Math.sin(gust) * 0.14
      island.flag.rotation.y = Math.sin(gust * 0.7) * 0.5
    }
  }

  // ---- rock: cannon-es handles the grinding damage, all that is left here is
  // to seat each outcrop on the water so it looks like it belongs
  for (const hazard of world.hazards) {
    const y = waves.height(hazard.position.x, hazard.position.z)
    hazard.mesh.position.set(hazard.position.x, y, hazard.position.z)
  }

  // ---- arrival: no destination was ever chosen, so you simply arrive
  // wherever you happen to have sailed into. Landing is an offer, not a trap:
  // coast within sight of the beach and the game asks; it never grabs you.
  let offered: Island | null = null
  let offeredGap = Infinity
  for (const island of world.islands) {
    const dx = ship.position.x - island.position.x
    const dz = ship.position.z - island.position.z
    const distance = Math.hypot(dx, dz)

    // forget an island once you are well clear of it, so you can come back
    if (shownOn === island.id && distance > island.radius + LANDING * 6) shownOn = null

    if (!sailing) continue
    if (distance > island.radius + LANDING) continue
    if (shownOn === island.id) continue

    // A spent island cannot be landed on again.
    const spent = run.visited.has(island.id)
    if (spent) continue

    if (distance < offeredGap) {
      offeredGap = distance
      offered = island
    }
  }
  landingTarget = offered

  if (landingTarget && sailing && !panelIsOpen()) landEl.classList.remove('hidden')
  else landEl.classList.add('hidden')

  if (ship.hp <= 0 && run.phase !== 'dead') {
    run.phase = 'dead'
    showSunk(run.log)
  }

  // ---- hud
  hullEl.style.width = `${ship.health * 100}%`
  hullEl.style.background = ship.health < 0.35 ? '#ff6a4d' : '#7fd4a1'
  readouts.textContent = `${(ship.speed * 1.2).toFixed(1)} knots`
  piecesEl.textContent = `${run.pieces.size}/${CHART_PIECES}`

  // ---- the instruments: one bearing by dead reckoning, the whole set with a
  // glass. Throttled, because rewriting the list every frame is pointless.
  bearingTimer += delta
  if (bearingTimer > 0.2) {
    bearingTimer = 0
    renderBearings()
  }
  if (!compassEl.classList.contains('hidden')) renderCompass()

  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

run.phase = 'intro'
showIntro()
animate()