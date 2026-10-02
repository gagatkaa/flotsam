import * as THREE from 'three/webgpu'
import type { WaveField } from './WaveField'

const COLLECT_RADIUS = 2.6
const COLLECT_TIME = 0.4
const RESPAWN_MIN = 70
const RESPAWN_MAX = 150

interface FlotsamItem {
  mesh: THREE.Mesh
  x: number
  z: number
  yaw: number
  spin: number
  bobPhase: number
  collecting: number
}

/**
 * Debris drifting on the wave surface, collected by sailing into it.
 * Sits on the CPU mirror of the shader's height field, so it rides the same waves.
 */
export class FlotsamField {
  readonly group = new THREE.Group()

  collected = 0

  private readonly items: FlotsamItem[] = []
  private readonly waves: WaveField
  private readonly normal = new THREE.Vector3()

  constructor(waves: WaveField, count = 16, spread = 90) {
    this.waves = waves
    this.group.name = 'flotsam'

    for (let i = 0; i < count; i++) {
      const item = this.spawn(
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread,
      )
      this.items.push(item)
      this.group.add(item.mesh)
    }
  }

  /** returns how many pieces were picked up this frame */
  update(delta: number, boatX: number, boatZ: number) {
    let picked = 0

    for (const item of this.items) {
      if (item.collecting > 0) {
        item.collecting -= delta
        const t = Math.max(0, item.collecting / COLLECT_TIME)

        item.mesh.scale.setScalar(t)
        item.mesh.position.y += delta * 3
        item.mesh.rotation.y += delta * 6

        if (item.collecting <= 0) this.respawn(item, boatX, boatZ)

        continue
      }

      const dx = item.x - boatX
      const dz = item.z - boatZ

      if (dx * dx + dz * dz < COLLECT_RADIUS * COLLECT_RADIUS) {
        item.collecting = COLLECT_TIME
        this.collected++
        picked++

        continue
      }

      const y = this.waves.height(item.x, item.z)
      this.waves.normal(item.x, item.z, this.normal)

      item.mesh.position.set(item.x, y + 0.1, item.z)
      item.mesh.quaternion.setFromUnitVectors(UP, this.normal)
      item.mesh.rotateY(item.yaw)
      item.mesh.rotateY(this.waves.time * item.spin + item.bobPhase)
    }

    return picked
  }

  private respawn(item: FlotsamItem, boatX: number, boatZ: number) {
    const heading = Math.random() * Math.PI * 2
    const distance = RESPAWN_MIN + Math.random() * (RESPAWN_MAX - RESPAWN_MIN)

    item.x = boatX + Math.sin(heading) * distance
    item.z = boatZ + Math.cos(heading) * distance
    item.mesh.position.set(item.x, this.waves.height(item.x, item.z) + 0.1, item.z)
    item.mesh.scale.setScalar(1)
    item.collecting = 0
  }

  private spawn(x: number, z: number): FlotsamItem {
    const isBottle = Math.random() > 0.72

    const geometry = isBottle
      ? new THREE.CylinderGeometry(0.18, 0.22, 0.9, 10)
      : new THREE.BoxGeometry(0.3 + Math.random() * 1.8, 0.16, 0.25 + Math.random() * 0.8)

    const color = new THREE.Color().setHSL(
      isBottle ? 0.45 : 0.08,
      isBottle ? 0.5 : 0.45,
      0.3 + Math.random() * 0.15,
    )
    const material = new THREE.MeshStandardNodeMaterial({ color, roughness: isBottle ? 0.2 : 0.85 })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, this.waves.height(x, z) + 0.1, z)

    return {
      mesh,
      x,
      z,
      yaw: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.15,
      bobPhase: Math.random() * Math.PI * 2,
      collecting: 0,
    }
  }
}

const UP = new THREE.Vector3(0, 1, 0)
