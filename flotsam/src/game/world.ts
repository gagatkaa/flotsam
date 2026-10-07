import * as THREE from 'three/webgpu'
import { BASE_CHOPPY } from '../objects/WaveField'

export interface Hazard {
  position: THREE.Vector3
  radius: number
  /** damage per second while you are grinding against it */
  damage: number
  mesh: THREE.Object3D
}

export interface Island {
  id: string
  name: string
  /** one line of flavour, shown in the destination list */
  note: string
  /** the island's own hue, painted on the land itself and on its chart marks */
  tint: number
  position: THREE.Vector3
  /** you count as landed inside this */
  radius: number
  /** index into the event table, filled in when the events land */
  event: string
  group: THREE.Group
  /** raised once you have been here, so the island is visibly finished */
  flagged: boolean
  /** the cloth on the pole, kept back so the loop can move it */
  flag: THREE.Object3D | null
  /**
   * Where the island is riding this frame, smoothed across frames by the loop.
   * Heavy land does not snap to the water like a hull does: it heaves and leans
   * into the swell a beat behind it.
   */
  ride: { height: number; pitch: number; roll: number }
}

export interface World {
  islands: Island[]
  hazards: Hazard[]
}

export function randomSource(seed: number) {
  // mulberry32, so a seed always lays out the same islands
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** the sea closes in the longer you're out there */
export function choppyForIslands(cleared: number) {
  return BASE_CHOPPY + Math.min(2.7, cleared * 0.68)
}

/** the wind that pushes you off a straight line, strongest late in a run */
export function driftForIslands(cleared: number) {
  return Math.min(1.9, cleared * 0.48)
}

interface IslandSpec {
  id: string
  name: string
  note: string
  event: string
  tint: number
}

const SPECS: IslandSpec[] = [
  {
    id: 'wreck',
    name: "The Ship That Wouldn't Sink",
    note: 'Drifting in circles, half underwater already, with no one on deck.',
    event: 'wreck',
    tint: 0x8a4a34,
  },
  {
    id: 'gallows',
    name: 'The Lighthouse With No Light',
    note: 'Its lantern is dark, but the great mirror inside still turns.',
    event: 'gallows',
    tint: 0x6c5b80,
  },
  {
    id: 'kitchen',
    name: 'The Crab Market',
    note: 'A dock turned into a market, shouting and selling and an enormous crab.',
    event: 'kitchen',
    tint: 0x9c6429,
  },
  {
    id: 'bones',
    name: 'The Sleeping Giant',
    note: 'White cliffs that move when you watch them long enough.',
    event: 'bones',
    tint: 0xc9bc9d,
  },
]

/**
 * Every island holds a piece of the chart. Derived rather than written down, so
 * changing the archipelago cannot leave the win condition disagreeing with the
 * map.
 */
export const CHART_PIECES = SPECS.length

/** a squat stack of cones and cylinders: enough to read as land at 400m */
function makeIslandBody(random: () => number, radius: number, tint: number) {
  const group = new THREE.Group()

  const baseColor = new THREE.Color(tint)

  const rock = new THREE.MeshStandardNodeMaterial({
    color: baseColor.clone().multiplyScalar(0.9),
    roughness: 0.95,
    flatShading: true,
  })
  const grass = new THREE.MeshStandardNodeMaterial({
    color: baseColor.clone().multiplyScalar(1.15),
    roughness: 0.9,
    flatShading: true,
  })
  const sand = new THREE.MeshStandardNodeMaterial({ color: 0xbdae86, roughness: 1, flatShading: true })

  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.25, 3, 9), rock)
  base.position.y = -0.5
  group.add(base)

  const beach = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.06, radius * 1.24, 1.1, 9), sand)
  beach.position.y = 0.35
  group.add(beach)

  // a few humps of higher ground, one taller than the rest
  const humps = 3 + Math.floor(random() * 3)
  for (let i = 0; i < humps; i++) {
    const tall = i === 0
    const height = tall ? radius * 0.9 : radius * (0.25 + random() * 0.4)
    const hump = new THREE.Mesh(
      new THREE.ConeGeometry(radius * (tall ? 0.55 : 0.3 + random() * 0.2), height, tall ? 7 : 6),
      tall ? rock : grass,
    )
    const angle = random() * Math.PI * 2
    const spread = random() * radius * 0.35
    hump.position.set(Math.sin(angle) * spread, height * 0.5 + 0.4, Math.cos(angle) * spread)
    hump.rotation.y = random() * 3
    group.add(hump)
  }

  // a few leaning posts, so the silhouette is not just a lump
  for (let i = 0; i < 3; i++) {
    if (random() > 0.6) continue
    const timber = new THREE.MeshStandardNodeMaterial({ color: 0x4a3a28, roughness: 0.9 })
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 3 + random() * 3, 5), timber)
    const angle = random() * Math.PI * 2
    post.position.set(Math.sin(angle) * radius * 0.6, 2, Math.cos(angle) * radius * 0.6)
    post.rotation.z = (random() - 0.5) * 0.4
    group.add(post)
  }

  return group
}

function makeRock(radius: number, random: () => number) {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardNodeMaterial({
    color: 0x5c5750,
    roughness: 0.95,
    flatShading: true,
  })

  const count = 2 + Math.floor(random() * 2)
  for (let i = 0; i < count; i++) {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(radius * (0.5 + random() * 0.5), 0),
      material,
    )
    rock.position.set((random() - 0.5) * radius, radius * 0.25, (random() - 0.5) * radius)
    rock.rotation.set(random() * 3, random() * 3, random() * 3)
    group.add(rock)
  }

  return group
}

/**
 * Lay out the seven islands and the rock between them. Islands are spread
 * around the origin on a rough ring so any one can be sailed to first, which is
 * what makes the destination list a real decision rather than a queue.
 */
/** clear water to leave between two islands' landing beaches */
const SEPARATION = 52

export function buildWorld(seed = Math.random() * 0xffffffff): World {
  const random = randomSource(seed)
  const islands: Island[] = []
  const hazards: Hazard[] = []

  const place = new THREE.Vector3()

  SPECS.forEach((spec, index) => {
    const radius = 15 + random() * 9

    // Rejection sampling rather than nudging: pick a spot on the ring, and if
    // it lands too near an island already placed, draw again. Nudging a point
    // off a neighbour can drop it onto a different one, and there is no reason
    // to accept a bad layout when free spots are cheap.
    let x = 0
    let z = 0
    for (let attempt = 0; attempt < 80; attempt++) {
      // golden-angle spread keeps them from clumping; jitter breaks the pattern
      const angle = index * 2.39996 + random() * 1.2 + attempt * 0.7
      // widen the ring a little on each retry so a crowded start can still fit
      const distance = 80 + random() * 120 + attempt * 3

      x = Math.sin(angle) * distance
      z = Math.cos(angle) * distance

      const clear = islands.every((other) => {
        const gap = Math.hypot(x - other.position.x, z - other.position.z)
        return gap > radius + other.radius + SEPARATION
      })
      if (clear) break
    }

    // Guarantee it. If every candidate was crowded, walk outward along the
    // direction away from the nearest neighbour until there is room. Slowly
    // breaking the ring is much better than two islands you cannot land on.
    for (let pass = 0; pass < 40; pass++) {
      let nearest: Island | null = null
      let gap = Infinity
      for (const other of islands) {
        const distance = Math.hypot(x - other.position.x, z - other.position.z)
        if (distance < gap) {
          gap = distance
          nearest = other
        }
      }
      if (!nearest || gap > radius + nearest.radius + SEPARATION) break

      const away = new THREE.Vector3(x - nearest.position.x, 0, z - nearest.position.z)
      if (away.lengthSq() < 0.001) away.set(1, 0, 0)
      away.normalize().multiplyScalar(radius + nearest.radius + SEPARATION - gap + 1)
      x += away.x
      z += away.z
    }

    place.set(x, 0, z)

    const group = makeIslandBody(random, radius, spec.tint)
    group.name = spec.id

    islands.push({
      id: spec.id,
      name: spec.name,
      note: spec.note,
      tint: spec.tint,
      event: spec.event,
      position: place.clone(),
      radius,
      group,
      flagged: false,
      flag: null,
      ride: { height: 0, pitch: 0, roll: 0 },
    })
  })

  // rock in the water between the islands: something to steer around, so a
  // crossing costs attention instead of being dead time
  for (let i = 0; i < 70; i++) {
    const a = islands[Math.floor(random() * islands.length)]
    const b = islands[Math.floor(random() * islands.length)]
    if (a === b) continue

    const along = 0.2 + random() * 0.6
    const across = (random() - 0.5) * 150

    const x = THREE.MathUtils.lerp(a.position.x, b.position.x, along) + across
    const z = THREE.MathUtils.lerp(a.position.z, b.position.z, along) + across

    // never inside an island's landing area
    if (islands.some((island) => Math.hypot(island.position.x - x, island.position.z - z) < island.radius + 40)) {
      continue
    }

    const radius = 2.4 + random() * 3.4
    hazards.push({
      position: new THREE.Vector3(x, 0, z),
      radius,
      damage: 10,
      mesh: makeRock(radius, random),
    })
  }

  return { islands, hazards }
}

/**
 * Raise a flag on the beach. This is the only permanent mark the game leaves on
 * the world, so it doubles as the way the player knows an island is spent: you
 * cannot land on it twice, and the flag is why that reads at two hundred metres.
 */
export function raiseFlag(island: Island) {
  if (island.flagged) return
  island.flagged = true

  const timber = new THREE.MeshStandardNodeMaterial({ color: 0x53442f, roughness: 0.9 })
  const cloth = new THREE.MeshStandardNodeMaterial({
    color: 0x35b06a,
    roughness: 0.85,
    side: THREE.DoubleSide,
  })

  const pole = new THREE.Group()

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.6, 5), timber)
  mast.position.y = 2.3
  pole.add(mast)

  // a plane with enough segments to actually bend when the loop moves it
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.05, 7, 3), cloth)
  banner.position.set(0.9, 3.75, 0)
  pole.add(banner)

  // stand it up on the beach, clear of the rocks. Hash the id so each flag
  // lands in a different spot rather than all seven in a neat ring.
  const seed = [...island.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  const angle = ((seed % 360) / 360) * Math.PI * 2
  const out = island.radius * 0.6
  pole.position.set(Math.sin(angle) * out, 0.4, Math.cos(angle) * out)
  pole.rotation.y = angle

  island.group.add(pole)
  island.flag = banner
}

const bearingScratch = new THREE.Vector3()

/** compass bearing to a target, and the range to it, for the destination list */
export function bearingAndRange(from: THREE.Vector3, to: THREE.Vector3) {
  bearingScratch.set(to.x - from.x, 0, to.z - from.z)
  const range = bearingScratch.length()
  const degrees = (Math.atan2(bearingScratch.x, -bearingScratch.z) * 180) / Math.PI
  return {
    bearing: ((degrees + 360) % 360).toFixed(0),
    range: range.toFixed(0),
  }
}