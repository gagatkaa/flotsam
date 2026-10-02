import * as THREE from 'three/webgpu'

interface FlotsamItem {
  mesh: THREE.Mesh
  baseY: number
  bobSpeed: number
  bobPhase: number
  spin: number
}

/**
 * Cheap procedural drift for the floating debris.
 * Physics (cannon-es) replaces this later.
 */
export class FlotsamField {
  readonly group: THREE.Group

  private readonly items: FlotsamItem[] = []

  constructor(count = 14, spread = 70) {
    this.group = new THREE.Group()

    for (let i = 0; i < count; i++) {
      const item = this.createItem(spread)
      this.items.push(item)
      this.group.add(item.mesh)
    }
  }

  update(elapsed: number) {
    for (const { mesh, baseY, bobSpeed, bobPhase, spin } of this.items) {
      mesh.position.y = baseY + Math.sin(elapsed * bobSpeed + bobPhase) * 0.14
      mesh.rotation.x = Math.sin(elapsed * bobSpeed * 0.7 + bobPhase) * 0.09
      mesh.rotation.z = Math.cos(elapsed * bobSpeed * 0.5 + bobPhase) * 0.09
      mesh.rotation.y += spin
    }
  }

  private createItem(spread: number): FlotsamItem {
    const isBottle = Math.random() > 0.7

    const geometry = isBottle
      ? new THREE.CylinderGeometry(0.18, 0.22, 0.9, 10)
      : new THREE.BoxGeometry(0.3 + Math.random() * 1.6, 0.16, 0.25 + Math.random() * 0.7)

    const color = new THREE.Color().setHSL(isBottle ? 0.45 : 0.08, isBottle ? 0.45 : 0.4, 0.28 + Math.random() * 0.14)
    const material = new THREE.MeshStandardNodeMaterial({ color, roughness: isBottle ? 0.25 : 0.85 })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(
      (Math.random() - 0.5) * spread,
      0,
      (Math.random() - 0.5) * spread,
    )
    mesh.rotation.y = Math.random() * Math.PI * 2
    mesh.castShadow = false

    return {
      mesh,
      baseY: 0.35 + Math.random() * 0.7,
      bobSpeed: 0.5 + Math.random() * 0.6,
      bobPhase: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.01,
    }
  }
}
