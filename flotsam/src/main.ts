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
const seascape = wgslFn<[THREE.Node, THREE.Node, THREE.Node, THREE.Node, THREE.Node]>(seascapeEntry, [wgsl(seascapeHelpers)])

const uTime = uniform(0)
const uChoppy = uniform(4)

// `wgslFn` is typed as returning an untyped Node, so cast it to a vec3 node
const seascapeColor = seascape as unknown as (...args: THREE.Node[]) => ReturnType<typeof vec3>

const rayDir = normalize(positionWorld)
// three renders scene.backgroundNode on a skybox sphere with its translation
// stripped, so positionWorld is the world space view ray of this fragment.
scene.backgroundNode = vec4(
  seascapeColor(rayDir, cameraPosition, screenSize, uTime, uChoppy),
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

let world: World

function loadWorld(seed?: number) {
  world = buildWorld(seed)
  for (const island of world.islands) scene.add(island.group)
  for (const hazard of world.hazards) scene.add(hazard.mesh)
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
  loadFoodEl.textContent = `rations ${run.provisions}`
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
    '<p>Eleven days out of harbour with a cargo you cannot name and a crew of ' +
    'nineteen. On the fourth night the horizon went white in the wrong direction ' +
    'and never went back. By the eighth the water had changed, and none of the ' +
    'men would say the word for it.</p>' +
    `<p>The chart that would take you home is in ${CHART_PIECES} pieces. The pieces ` +
    `are on ${CHART_PIECES} islands. Sail to whichever one you can see, and decide ` +
    'what you are willing to do when you get there.</p>' +
    '</div>' +
    '<ol class="manifest">' +
    '<li><b>The Wreck</b><span>A hull still above water</span></li>' +
    '<li><b>Gallows Cay</b><span>A chart nailed to a post</span></li>' +
    '<li><b>Kitchen Rock</b><span>Smoke, and somebody keeping a fire</span></li>' +
    '<li><b>The Bones</b><span>White rock, and a beach not entirely sand</span></li>' +
    '<li class="last"><b>Homeward</b><span>Salt-white, and far</span></li>' +

    '<p class="keys">' +
    '<b>W</b> sail<i>·</i><b>S</b> back the sail<i>·</i><b>A</b><b>D</b> helm<i>·</i>' +
    '<b>Mouse</b> look<i>·</i><b>Esc</b> release cursor' +
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
    `<p>Nothing has been written for this island yet.</p>`
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

/** how close you have to get before you have landed */
const LANDING = 12

/**
 * An island that has already shown its panel, so it cannot show it again while
 * you are still sitting on top of it. Cleared once you have actually sailed off
 * it. Without this, a panel that does not change phase re-fires every frame and
 * the player cannot get away from it.
 */
let shownOn: string | null = null

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
      : 'chart complete'
    return
  }

  windEl.textContent = 'all bearings'

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
      `<span class="name">${island.name}</span>` +
      `<span class="leg">${bearing}° ${range}m</span>` +
      `</li>`
  }
  bearingsEl.innerHTML = html
}

/** the closest island still holding a piece of chart, Homeward included */
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

// ---- you can stand on Homeward any time. you can only leave it with all six
function showNoChart() {
  draftEl.innerHTML = ''
  const block = document.createElement('div')
  block.className = 'scene'
  const missing = CHART_PIECES - run.pieces.size
  block.innerHTML =
    '<h2>Homeward</h2>' +
    `<p>You have ${run.pieces.size} of ${CHART_PIECES} pieces of the chart. You could walk the ` +
    `whole shore and it would not tell you the way in. ${missing} more to find.</p>`
  draftEl.appendChild(block)

  const next = document.createElement('button')
  next.className = 'go'
  next.textContent = 'back to sea'
  next.addEventListener('click', () => {
    // let them come back once they have the rest of it
    run.visited.delete('homeward')
    closePanels()
    lock()
  })
  draftEl.appendChild(next)

  openPanel()
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
    if (choice.piece) gains.push(`${event.title} chart piece`)
    if (choice.gain) gains.push(choice.gain.name)
    if (choice.crewDelta && choice.crewDelta > 0) gains.push(`${choice.crewDelta} crew`)
    if (choice.passengersDelta && choice.passengersDelta > 0) gains.push(`${choice.passengersDelta} rescued`)
    if (choice.goldDelta && choice.goldDelta > 0) gains.push(`${choice.goldDelta} gold`)
    if (choice.provisionsDelta && choice.provisionsDelta > 0) gains.push(`${choice.provisionsDelta} rations`)

    if (choice.crewDelta && choice.crewDelta < 0) costs.push(`${Math.abs(choice.crewDelta)} crew`)
    if (choice.passengersDelta && choice.passengersDelta < 0) costs.push(`${Math.abs(choice.passengersDelta)} rescued`)
    if (choice.goldDelta && choice.goldDelta < 0) costs.push(`${Math.abs(choice.goldDelta)} gold`)
    if (choice.provisionsDelta && choice.provisionsDelta < 0) costs.push(`${Math.abs(choice.provisionsDelta)} rations`)
    if (choice.lose) costs.push(`${cardName(choice.lose)}`)
    if (choice.damage) costs.push(`${choice.damage} hull`)

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
    '<p>The boat went down with the chart still folded in the cabin table. ' +
    'Whatever it said, it says it to nobody now.</p>'
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
    `<p>${CHART_PIECES} pieces of chart, and a crew who are still alive to read it. ` +
    'You did not come back the way you left.</p>'
  draftEl.appendChild(block)
  draftEl.appendChild(buildLog(log))
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
  const visited = run.visited.size - (run.visited.has('homeward') ? 1 : 0)
  const unvisited = world.islands.filter((i) => i.id !== 'homeward').length - visited
  pauseStatEl.textContent =
    `${run.pieces.size}/${CHART_PIECES} of the chart · ` +
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

  // no throttle and no steering unless you are actually sailing and holding
  // the tiller. Without the isLocked check, W drives the boat from the pause menu.
  const sailing = run.phase === 'sailing' && controls.isLocked

  const modal = applyModal()
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

  // ---- islands sit on the water
  for (const island of world.islands) {
    const y = waves.height(island.position.x, island.position.z)
    island.group.position.set(island.position.x, y - 1.2, island.position.z)

    // the flag is the only thing on these islands that moves on its own, which
    // is what makes it readable as a signal from a distance
    if (island.flag) {
      const gust = elapsed * 2.3 + island.position.x * 0.05
      island.flag.rotation.z = Math.sin(gust) * 0.14
      island.flag.rotation.y = Math.sin(gust * 0.7) * 0.5
    }
  }

  // ---- rock
  let grinding = false
  for (const hazard of world.hazards) {
    const y = waves.height(hazard.position.x, hazard.position.z)
    hazard.mesh.position.set(hazard.position.x, y, hazard.position.z)

    const dx = ship.position.x - hazard.position.x
    const dz = ship.position.z - hazard.position.z
    const distance = Math.hypot(dx, dz)

    if (distance < hazard.radius + 2) {
      if (sailing) ship.damage(hazard.damage * delta)
      grinding = true

      const push = (hazard.radius + 2 - distance) * 6 * delta
      ship.position.x += (dx / (distance || 1)) * push
      ship.position.z += (dz / (distance || 1)) * push
    }
  }

  if (grinding && !flash.classList.contains('on')) {
    flash.classList.remove('on')
    void flash.offsetWidth
    flash.classList.add('on')
  }

  // ---- arrival: no destination was ever chosen, so you simply arrive
  // wherever you happen to have sailed into
  if (sailing) {
    for (const island of world.islands) {
      const distance = Math.hypot(
        ship.position.x - island.position.x,
        ship.position.z - island.position.z,
      )

      // forget an island once you are well clear of it, so you can come back
      if (shownOn === island.id && distance > island.radius + LANDING * 6) shownOn = null
      if (distance > island.radius + LANDING) continue
      if (shownOn === island.id) continue

      // A spent island cannot be landed on again. Homeward is the exception:
      // you can sit off it as often as you like, it just will not read.
      const spent = run.visited.has(island.id)
      if (spent && island.id !== 'homeward') continue

      if (island.id === 'homeward') {
        shownOn = island.id
        // you can reach it any time. you can only read it with the whole chart.
        run.visited.add(island.id)
        if (run.pieces.size < CHART_PIECES) showNoChart()
        else run.reachHome()
        break
      }

      shownOn = island.id
      run.visited.add(island.id)
      raiseFlag(island)

      const event = eventFor(island.event)
      if (!event) {
        // Never fail silently. A missing event used to drop the player straight
        // back into open water, which is indistinguishable from nothing working.
        console.error(`no event written for island: ${island.id} (${island.event})`)
        showNothingHere(island)
        break
      }

      run.land(event, island)
      break
    }
  }

  if (ship.hp <= 0 && run.phase !== 'dead') {
    run.phase = 'dead'
    showSunk(run.log)
  }

  // ---- hud
  hullEl.style.width = `${ship.health * 100}%`
  hullEl.style.background = ship.health < 0.35 ? '#ff6a4d' : '#7fd4a1'
  readouts.textContent = `${(ship.speed * 1.2).toFixed(1)} kn`
  piecesEl.textContent = `${run.pieces.size}/${CHART_PIECES}`

  // ---- the instruments: one bearing by dead reckoning, the whole set with a
  // glass. Throttled, because rewriting the list every frame is pointless.
  bearingTimer += delta
  if (bearingTimer > 0.2) {
    bearingTimer = 0
    renderBearings()
  }

  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

run.phase = 'intro'
showIntro()
animate()