import * as CANNON from 'cannon-es'

type SolidKind = 'rock' | 'island'

export interface ContactHit {
  nx: number
  nz: number
  depth: number
  speed: number
  kind: SolidKind
}

interface Point {
  x: number
  y: number
  z: number
}

const FIXED = 1 / 60
const HULL = 2

interface Solid {
  kind: SolidKind
  body: CANNON.Body
  radius: number
  x: number
  z: number
}

/**
 * A cannon-es world used only for collision detection. The ship body is parked
 * on the boat every step and everything else is static, so the boat's own
 * kinematics stay the single source of truth for where she is.
 */
export class Physics {
  private readonly world = new CANNON.World()
  private readonly ship: CANNON.Body
  private readonly solids: Solid[] = []

  constructor() {
    this.world.gravity.set(0, 0, 0)
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)
    this.world.allowSleep = false

    // the hull as three spheres along her length
    this.ship = new CANNON.Body({ mass: 1 })
    this.ship.allowSleep = false
    this.ship.addShape(new CANNON.Sphere(0.95), new CANNON.Vec3(0, 0, 0))
    this.ship.addShape(new CANNON.Sphere(0.7), new CANNON.Vec3(0, 0, -1.4))
    this.ship.addShape(new CANNON.Sphere(0.7), new CANNON.Vec3(0, 0, 1.4))
    this.ship.fixedRotation = true
    this.world.addBody(this.ship)
  }

  island(x: number, z: number, radius: number) {
    const body = new CANNON.Body({ mass: 0 })
    const rim = radius * 1.12 + 1.5
    body.addShape(new CANNON.Cylinder(rim, rim + 0.1, 6, 12), new CANNON.Vec3(x, -2, z))
    this.solids.push({ kind: 'island', body, radius: rim, x, z })
    this.world.addBody(body)
  }

  rock(x: number, z: number, radius: number) {
    const body = new CANNON.Body({ mass: 0 })
    const reach = radius + 1.1
    body.addShape(new CANNON.Sphere(reach), new CANNON.Vec3(x, 0, z))
    this.solids.push({ kind: 'rock', body, radius: reach, x, z })
    this.world.addBody(body)
  }

  /**
   * Open water between a point and the nearest shore or rock (negative inside
   * it), and the direction away from it. For steering and the camera, not collisions.
   */
  nearest(x: number, z: number) {
    const result = { gap: Infinity, nx: 0, nz: 0 }
    for (const solid of this.solids) {
      const dx = x - solid.x
      const dz = z - solid.z
      const distance = Math.hypot(dx, dz) || 1e-6
      const gap = distance - solid.radius
      if (gap >= result.gap) continue
      result.gap = gap
      result.nx = dx / distance
      result.nz = dz / distance
    }
    return result
  }

  step(position: Point, velocity: Point): ContactHit[] {
    const ship = this.ship
    ship.position.set(position.x, position.y, position.z)
    ship.velocity.set(velocity.x, 0, velocity.z)
    this.world.step(FIXED)

    const touched = new Set<CANNON.Body>()
    for (const contact of this.world.contacts) {
      if (contact.bi === ship) touched.add(contact.bj)
      if (contact.bj === ship) touched.add(contact.bi)
    }

    const hits: ContactHit[] = []
    for (const solid of this.solids) {
      if (!touched.has(solid.body)) continue

      // measured from the position we were given: the solver nudges the body during the step
      const dx = position.x - solid.x
      const dz = position.z - solid.z
      const distance = Math.hypot(dx, dz)
      const depth = solid.radius + HULL - distance
      if (depth <= 0) continue

      const scale = distance > 1e-4 ? 1 / distance : 1
      const nx = dx * scale
      const nz = dz * scale
      const speed = Math.abs(velocity.x * nx + velocity.z * nz)

      hits.push({ nx, nz, depth, speed, kind: solid.kind })
    }
    return hits
  }
}
