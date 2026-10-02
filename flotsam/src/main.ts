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
  choppyForIslands,
  driftForIslands,
  type Island,
  type World,
} from './game/world'
import { eventFor } from './game/events'
import { Run, type Choice, type IslandEvent } from './game/run'
import { describe } from './game/stats'

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
  onChoose() {
    hidePanels()
    lock()
  },
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
    showChart()
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

function hidePanels() {
  chartEl.classList.add('hidden')
  draftEl.classList.add('hidden')
}

function renderBuild() {
  buildEl.innerHTML = ''
  for (const [card, count] of run.counts()) {
    const item = document.createElement('li')
    item.innerHTML =
      `${count > 1 ? `<b>${count}x</b> ` : ''}${card.name}` +
      `<span>${describe(card)}</span>`
    buildEl.appendChild(item)
  }
}

// ---- opening: who you are and what you are looking for, then cast off
function showIntro() {
  chartEl.innerHTML = ''

  const sheet = document.createElement('div')
  sheet.className = 'prologue'

  const story = document.createElement('div')
  story.className = 'scene'
  story.innerHTML =
    '<h1>flotsam</h1>' +
    '<p>Eleven days out of harbour with a cargo you cannot name and a crew of ' +
    'nineteen. On the fourth night the horizon went white in the wrong direction ' +
    'and never went back, and by the eighth the water had changed and none of the ' +
    'men would say the word for it.</p>' +
    '<p>The chart that would take you home is in six pieces, and the six pieces ' +
    'are on six islands. There is a seventh island where the whole chart can be ' +
    'read. You will have to go and get them.</p>'
  sheet.appendChild(story)

  // a manifest, not a menu. Nothing here is chosen yet.
  const manifest = document.createElement('ol')
  manifest.className = 'manifest'
  manifest.innerHTML =
    '<li>the wreck<em>a hull still above water</em></li>' +
    '<li>gallows cay<em>a chart nailed to a post</em></li>' +
    '<li>kitchen rock<em>smoke, and somebody keeping a fire</em></li>' +
    '<li>the garden<em>green, and somebody working it</em></li>' +
    '<li>bell island<em>a tower, and a sound every eleven seconds</em></li>' +
    '<li>the bones<em>white rock, and a beach not entirely sand</em></li>' +
    '<li class="last">homeward<em>salt-white, and far</em></li>'
  sheet.appendChild(manifest)

  const keys = document.createElement('p')
  keys.className = 'controls-line'
  keys.innerHTML =
    '<b>W</b> <b>S</b> throttle <span>·</span> <b>A</b> <b>D</b> rudder ' +
    '<span>·</span> <b>mouse</b> look <span>·</span> <b>esc</b> release cursor'
  sheet.appendChild(keys)

  chartEl.appendChild(sheet)

  const go = document.createElement('button')
  go.className = 'sail'
  go.textContent = 'start sailing'
  go.addEventListener('click', () => {
    run.phase = 'choosing'
    chartEl.classList.add('hidden')
    showChart()
  })
  chartEl.appendChild(go)

  chartEl.classList.remove('hidden')
  draftEl.classList.add('hidden')
  overlay.classList.add('hidden')
  document.body.classList.remove('locked')
  if (controls.isLocked) controls.unlock()
}

// ---- the destination list: the actual decision the player makes each island
function showChart() {
  chartEl.innerHTML = ''

  const heading = document.createElement('h2')
  heading.textContent = run.pieces.size ? 'where to next' : 'seven islands, six pieces of chart'
  chartEl.appendChild(heading)

  for (const island of world.islands) {
    const { bearing, range } = bearingAndRange(ship.position, island.position)
    const button = document.createElement('button')
    button.className = 'island'
    if (run.visited.has(island.id)) button.classList.add('visited')

    // Homeward is not a place you can just turn up at. Six pieces of chart
    // and you can read the way in; without them you would only find out.
    const locked = island.id === 'homeward' && run.pieces.size < 6
    if (locked) button.disabled = true

    button.innerHTML =
      `<span class="title">${island.name}</span>` +
      `<span class="note">${run.visited.has(island.id) ? 'walked' : island.note}</span>` +
      `<span class="nav">${bearing}° · ${range} m</span>` +
      (locked
        ? `<span class="locked">${6 - run.pieces.size} more piece${6 - run.pieces.size === 1 ? '' : 's'}</span>`
        : '')

    if (!locked) button.addEventListener('click', () => run.setDestination(island))
    chartEl.appendChild(button)
  }

  const hint = document.createElement('p')
  hint.className = 'hint'
  hint.textContent = 'pick an island. the water gets worse the longer you are out there.'
  chartEl.appendChild(hint)

  chartEl.classList.remove('hidden')
  draftEl.classList.add('hidden')
  overlay.classList.add('hidden')
  document.body.classList.remove('locked')
  if (controls.isLocked) controls.unlock()
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
  next.textContent = 'back to the chart'
  next.addEventListener('click', showChart)
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

    const consequences: string[] = []
    if (choice.gain) consequences.push(`+ ${choice.gain.name}`)
    if (choice.lose) consequences.push(`- ${choice.lose}`)
    if (choice.damage) consequences.push(`- ${choice.damage} hull`)

    button.innerHTML =
      `<span class="text">${choice.text}</span>` +
      (consequences.length ? `<span class="mods">${consequences.join('  ')}</span>` : '')

    button.addEventListener('click', () => take(choice))
    hand.appendChild(button)
  }

  draftEl.appendChild(hand)
  draftEl.classList.remove('hidden')
  overlay.classList.remove('hidden')
  document.body.classList.remove('locked')
  if (controls.isLocked) controls.unlock()
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
    '<p>Six pieces of chart, and a crew who are still alive to read it. ' +
    'You did not come back the way you left.</p>'
  draftEl.appendChild(block)
  draftEl.appendChild(buildLog(log))
  openPanel()
}

function openPanel() {
  draftEl.classList.remove('hidden')
  overlay.classList.add('hidden')
  document.body.classList.remove('locked')
  if (controls.isLocked) controls.unlock()
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
  overlay.classList.add('hidden')
  document.body.classList.add('locked')
})
controls.addEventListener('unlock', () => {
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
  // the sea closes in the longer you're out there
  const choppy = choppyForIslands(run.pieces.size)
  uChoppy.value = choppy
  waves.time = elapsed
  waves.choppy = choppy

  // no throttle and no steering unless you're actually under way
  const sailing = run.phase === 'sailing'

  ship.update(delta, waves, sailing ? controls.throttle : 0, sailing ? controls.rudder : 0)

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

  // ---- arrival
  if (run.phase === 'sailing' && run.destination) {
    const distance = Math.hypot(
      ship.position.x - run.destination.position.x,
      ship.position.z - run.destination.position.z,
    )
    if (distance < run.destination.radius + 14) {
      const island = run.destination

      // Homeward ends the run outright: no choice, just the way in.
      if (island.id === 'homeward') {
        run.visited.add(island.id)
        run.reachHome()
      } else if (!eventFor(island.event)) {
        // Never fail silently. A missing event used to bounce the player
        // straight back to the chart, which is indistinguishable from the
        // game simply not working.
        console.error(`no event written for island: ${island.id} (${island.event})`)
        run.visited.add(island.id)
        run.destination = null
        run.phase = 'choosing'
        showNothingHere(island)
      } else {
        run.land(eventFor(island.event)!, island)
      }
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
  piecesEl.textContent = `${run.pieces.size}/6`

  if (run.destination) {
    const { bearing, range } = bearingAndRange(ship.position, run.destination.position)
    windEl.textContent = `${bearing}° · ${range} m`
  } else {
    windEl.textContent = 'adrift'
  }

  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

run.phase = 'intro'
showIntro()
animate()