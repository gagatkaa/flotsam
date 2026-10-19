import * as THREE from 'three/webgpu'
import type { Hazard, Island } from './world'

export interface Loot {
  label: string
  provisions?: number
  gold?: number
  repair?: number
}

export const CRATE: Loot = { label: 'a crate of food', provisions: 2 }
export const BARREL: Loot = { label: 'a barrel of coin', gold: 10 }
export const PLANKS: Loot = { label: 'loose planks to patch the hull', repair: 10 }

export interface Flotsam {
  loot: Loot
  position: THREE.Vector3
  mesh: THREE.Object3D
  spin: number
  collected: boolean
}

export const PICKUP_RANGE = 3.4

const COUNT = 28

const REEF_GAP = { min: 4, max: 13 }

export function scatterFlotsam(islands: Island[], hazards: Hazard[], random: () => number): Flotsam[] {
  const flotsam: Flotsam[] = []
  if (hazards.length === 0) return flotsam

  for (let attempt = 0; attempt < COUNT * 15 && flotsam.length < COUNT; attempt++) {
    const rock = hazards[Math.floor(random() * hazards.length)]
    const angle = random() * Math.PI * 2
    const gap = rock.radius + REEF_GAP.min + random() * (REEF_GAP.max - REEF_GAP.min)
    const position = new THREE.Vector3(
      rock.position.x + Math.sin(angle) * gap,
      0,
      rock.position.z + Math.cos(angle) * gap,
    )

    const nearLand = islands.some((island) => position.distanceTo(island.position) < island.radius + 16)
    const nearRock = hazards.some((hazard) => position.distanceTo(hazard.position) < hazard.radius + REEF_GAP.min)
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
    for (let i = 0; i < 3; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 0.32), i === 1 ? darkWood : wood)
      plank.position.set(0, i * 0.08, (i - 1) * 0.34)
      plank.rotation.y = (i - 1) * 0.25
      group.add(plank)
    }
  }

  return group
}
