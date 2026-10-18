import * as THREE from 'three/webgpu'
import type { Hazard, Island } from './world'

/** what a piece of floating wreckage gives you when you sail into it */
export interface Loot {
  /** shown in the pop-up when you pick it up */
  label: string
  provisions?: number
  gold?: number
  /** hull points patched back on */
  repair?: number
}

export const CRATE: Loot = { label: 'a crate of food', provisions: 2 }
export const BARREL: Loot = { label: 'a barrel of coin', gold: 10 }
export const PLANKS: Loot = { label: 'loose planks to patch the hull', repair: 10 }

export interface Flotsam {
  loot: Loot
  position: THREE.Vector3
  mesh: THREE.Object3D
  /** how fast it turns on the water, radians per second */
  spin: number
  collected: boolean
}

/** how close the hull has to come to scoop something up */
export const PICKUP_RANGE = 3.4

const COUNT = 28

/**
 * Scatter wreckage over the open water between the islands, clear of the
 * beaches and the rocks, so every crossing has something worth steering for.
 */
export function scatterFlotsam(islands: Island[], hazards: Hazard[], random: () => number): Flotsam[] {
  const flotsam: Flotsam[] = []

  for (let attempt = 0; attempt < COUNT * 10 && flotsam.length < COUNT; attempt++) {
    const angle = random() * Math.PI * 2
    const distance = 40 + random() * 220
    const position = new THREE.Vector3(Math.sin(angle) * distance, 0, Math.cos(angle) * distance)

    const nearLand = islands.some((island) => position.distanceTo(island.position) < island.radius + 16)
    const nearRock = hazards.some((hazard) => position.distanceTo(hazard.position) < hazard.radius + 5)
    if (nearLand || nearRock) continue

    const roll = random()
    const loot = roll < 0.45 ? CRATE : roll < 0.75 ? PLANKS : BARREL
    flotsam.push({ loot, position, mesh: makeMesh(loot), spin: (random() - 0.5) * 0.8, collected: false })
  }

  return flotsam
}

const wood = new THREE.MeshStandardNodeMaterial({ color: 0xa8743a, roughness: 0.85, flatShading: true })
const darkWood = new THREE.MeshStandardNodeMaterial({ color: 0x6b3f22, roughness: 0.85, flatShading: true })
const brass = new THREE.MeshStandardNodeMaterial({ color: 0xd8b25e, roughness: 0.4, metalness: 0.6 })

function makeMesh(loot: Loot) {
  const group = new THREE.Group()

  if (loot === CRATE) {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1), wood))
  } else if (loot === BARREL) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10), darkWood)
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.14, 10), brass)
    barrel.rotation.z = Math.PI / 2
    band.rotation.z = Math.PI / 2
    group.add(barrel, band)
  } else {
    // a few planks lashed together at odd angles
    for (let i = 0; i < 3; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 0.32), i === 1 ? darkWood : wood)
      plank.position.set(0, i * 0.08, (i - 1) * 0.34)
      plank.rotation.y = (i - 1) * 0.25
      group.add(plank)
    }
  }

  return group
}
