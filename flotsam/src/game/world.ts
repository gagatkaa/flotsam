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
  position: THREE.Vector3
  /** you count as landed inside this */
  radius: number
  /** index into the event table, filled in when the events land */
  event: string
  group: THREE.Group
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
  return BASE_CHOPPY + Math.min(3.4, cleared * 0.48)
}

/** the wind that pushes you off a straight line, strongest late in a run */
export function driftForIslands(cleared: number) {
  return Math.min(2.4, cleared * 0.34)
}

interface IslandSpec {
  id: string
  name: string
  note: string
  event: string
}

const SPECS: IslandSpec[] = [
  {
    id: 'wreck',
    name: 'The Wreck',
    note: 'A hull broken on the reef, still above water.',
    event: 'wreck',
  },
  {
    id: 'gallows',
    name: 'Gallows Cay',
    note: 'Someone hung a chart here, and half of it is yours.',
    event: 'gallows',
  },
  {
    id: 'kitchen',
    name: 'Kitchen Rock',
    note: 'Low, black, and shaped like a stove. Smells of smoke.',
    event: 'kitchen',
  },
  {
    id: 'garden',
    name: 'The Garden',
    note: 'Green in a way that makes the crew stop talking.',
    event: 'garden',
  },
  {
    id: 'bell',
    name: 'Bell Island',
    note: 'A bell tower with no bell. Something rings anyway.',
    event: 'bell',
  },
  {
    id: 'bones',
    name: 'The Bones',
    note: 'White rock, and a beach that is not entirely sand.',
    event: 'bones',
  },
  {
    id: 'homeward',
    name: 'Homeward',
    note: 'Salt-white and far. You have been avoiding this one.',
    event: 'homeward',
  },
]

/** a squat stack of cones and cylinders: enough to read as land at 400m */
function makeIslandBody(random: () => number, radius: number) {
  const group = new THREE.Group()

  const rock = new THREE.MeshStandardNodeMaterial({
    color: 0x6b6357,
    roughness: 0.95,
    flatShading: true,
  })
  const grass = new THREE.MeshStandardNodeMaterial({
    color: 0x4a5c39,
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

    const group = makeIslandBody(random, radius)
    group.name = spec.id

    islands.push({
      id: spec.id,
      name: spec.name,
      note: spec.note,
      event: spec.event,
      position: place.clone(),
      radius,
      group,
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