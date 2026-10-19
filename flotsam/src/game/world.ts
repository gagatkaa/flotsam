import * as THREE from 'three/webgpu'
import { BASE_CHOPPY } from '../objects/WaveField'
import { makeRock } from '../objects/rocks'
import { scatterFlotsam, type Flotsam } from './flotsam'

export interface Hazard {
  position: THREE.Vector3
  radius: number
  mesh: THREE.Object3D
  /** the sea height at the rock, kept current by the loop */
  water: { value: number }
}

export interface Island {
  id: string
  name: string
  tint: number
  position: THREE.Vector3
  radius: number
  /** key into the event table in events.ts */
  event: string
  group: THREE.Group
  /** the column of light over an island not yet visited */
  beacon: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicNodeMaterial> | null
  /** smoothed across frames by the loop, so the land heaves a beat behind the water */
  ride: { height: number; pitch: number; roll: number }
}

export interface World {
  islands: Island[]
  hazards: Hazard[]
  flotsam: Flotsam[]
}

/** mulberry32, so a seed always lays out the same sea */
function randomSource(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const MAX_EXTRA_CHOP = 2.7

export function choppyForPieces(pieces: number) {
  return BASE_CHOPPY + Math.min(MAX_EXTRA_CHOP, pieces * 0.68)
}

export function driftForPieces(pieces: number) {
  return Math.min(1.9, pieces * 0.48)
}

interface IslandSpec {
  id: string
  name: string
  /** the one-line hint on the opening page */
  teaser: string
  event: string
  tint: number
}

export const ISLAND_SPECS: readonly IslandSpec[] = [
  {
    id: 'wreck',
    name: "The Ship That Wouldn't Sink",
    teaser: 'and the bell keeps ringing below',
    event: 'wreck',
    tint: 0x8a4a34,
  },
  {
    id: 'gallows',
    name: 'The Lighthouse With No Light',
    teaser: 'the door just slammed behind you',
    event: 'gallows',
    tint: 0x6c5b80,
  },
  {
    id: 'kitchen',
    name: 'The Crab Market',
    teaser: 'loud, and one crab bigger than a cart',
    event: 'kitchen',
    tint: 0x9c6429,
  },
  {
    id: 'bones',
    name: 'The Sleeping Giant',
    teaser: 'white cliffs, if you look twice',
    event: 'bones',
    tint: 0xc9bc9d,
  },
]

/** every island holds one piece of the chart */
export const CHART_PIECES = ISLAND_SPECS.length

/** clear water to leave between two islands */
const SEPARATION = 52

/** how far the model's sandy base reaches, as a multiple of the island's radius */
const SHORE_REACH = 1.15
const BEACH_HEIGHT = 0.9

function makeIslandBody(islandModel: THREE.Object3D, radius: number, random: () => number) {
  const group = new THREE.Group()
  const body = islandModel.clone()
  body.scale.setScalar(radius * SHORE_REACH)
  body.position.y = BEACH_HEIGHT
  body.rotation.y = random() * Math.PI * 2
  group.add(body)
  return group
}

/** ignores the fog on purpose, so it can be picked out on the horizon */
function makeBeacon(tint: number) {
  const color = new THREE.Color(0xffd27a).lerp(new THREE.Color(tint), 0.25)
  const material = new THREE.MeshBasicNodeMaterial({
    color,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  })
  return new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.6, 90, 16, 1, true), material)
}

/** a spot on a rough ring around the origin, clear of the islands already placed */
function placeIsland(index: number, radius: number, placed: Island[], random: () => number) {
  const isClear = (x: number, z: number, other: Island) =>
    Math.hypot(x - other.position.x, z - other.position.z) > radius + other.radius + SEPARATION

  let x = 0
  let z = 0
  for (let attempt = 0; attempt < 80; attempt++) {
    // golden-angle spread, with jitter, and a ring that widens on each retry
    const angle = index * 2.39996 + random() * 1.2 + attempt * 0.7
    const distance = 80 + random() * 120 + attempt * 3

    x = Math.sin(angle) * distance
    z = Math.cos(angle) * distance
    if (placed.every((other) => isClear(x, z, other))) break
  }

  // fallback: push away from the nearest neighbour until there is room
  for (let pass = 0; pass < 40; pass++) {
    let nearest: Island | null = null
    let gap = Infinity
    for (const other of placed) {
      const distance = Math.hypot(x - other.position.x, z - other.position.z)
      if (distance < gap) {
        gap = distance
        nearest = other
      }
    }
    if (!nearest || isClear(x, z, nearest)) break

    const away = new THREE.Vector3(x - nearest.position.x, 0, z - nearest.position.z)
    if (away.lengthSq() < 0.001) away.set(1, 0, 0)
    away.normalize().multiplyScalar(radius + nearest.radius + SEPARATION - gap + 1)
    x += away.x
    z += away.z
  }

  return new THREE.Vector3(x, 0, z)
}

/** lay out the islands and the rocks between them; the same seed gives the same sea */
export function buildWorld(islandModel: THREE.Object3D, seed = Math.random() * 0xffffffff): World {
  const random = randomSource(seed)
  const islands: Island[] = []
  const hazards: Hazard[] = []

  ISLAND_SPECS.forEach((spec, index) => {
    const radius = 15 + random() * 9
    const position = placeIsland(index, radius, islands, random)

    const group = makeIslandBody(islandModel, radius, random)
    group.name = spec.id
    // kept out of the island group, so it stands upright while the land rocks
    const beacon = makeBeacon(spec.tint)

    islands.push({
      id: spec.id,
      name: spec.name,
      tint: spec.tint,
      event: spec.event,
      position,
      radius,
      group,
      beacon,
      ride: { height: 0, pitch: 0, roll: 0 },
    })
  })

  // rocks scattered along the crossings between pairs of islands
  for (let i = 0; i < 70; i++) {
    const a = islands[Math.floor(random() * islands.length)]
    const b = islands[Math.floor(random() * islands.length)]
    if (a === b) continue

    const along = 0.2 + random() * 0.6
    const across = (random() - 0.5) * 150

    const dx = b.position.x - a.position.x
    const dz = b.position.z - a.position.z
    const length = Math.hypot(dx, dz) || 1
    const x = THREE.MathUtils.lerp(a.position.x, b.position.x, along) - (dz / length) * across
    const z = THREE.MathUtils.lerp(a.position.z, b.position.z, along) + (dx / length) * across

    if (islands.some((island) => Math.hypot(island.position.x - x, island.position.z - z) < island.radius + 40)) {
      continue
    }

    const radius = 2.4 + random() * 3.4
    const rock = makeRock(radius, random)
    hazards.push({
      position: new THREE.Vector3(x, 0, z),
      radius,
      mesh: rock.group,
      water: rock.water,
    })
  }

  return { islands, hazards, flotsam: scatterFlotsam(islands, hazards, random) }
}

/** the beacon going out is how the player sees an island is spent */
export function putOutBeacon(island: Island) {
  island.beacon?.removeFromParent()
  island.beacon = null
}

export function tintCss(island: Island) {
  return `#${island.tint.toString(16).padStart(6, '0')}`
}

/** distance across the water, ignoring height */
export function flatDistance(a: THREE.Vector3, b: THREE.Vector3) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** compass bearing (whole degrees, 0 = north) and range (whole metres) to a target */
export function bearingAndRange(from: THREE.Vector3, to: THREE.Vector3) {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const degrees = (Math.atan2(dx, -dz) * 180) / Math.PI
  return {
    bearing: Math.round((degrees + 360) % 360),
    range: Math.round(Math.hypot(dx, dz)),
  }
}
