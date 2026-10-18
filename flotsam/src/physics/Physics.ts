import * as CANNON from 'cannon-es'

type SolidKind = 'rock' | 'island'

/** one thing the boat is grinding against right now */
export interface ContactHit {
  /** world-space normal pointing away from the thing she hit, on the XZ plane */
  nx: number
  nz: number
  /** how far the hull overlaps it this frame, in metres */
  depth: number
  /** how hard she is pressing into it, along the normal */
  speed: number
  kind: SolidKind
}

interface Point {
  x: number
  y: number
  z: number
}

const FIXED = 1 / 60
/** how far the boat's own hull reaches out from its centre, metres */
const HULL = 2

interface Solid {
  kind: SolidKind
  body: CANNON.Body
  radius: number
  /** world-space footprint: the shape is an offset of the body, not its position */
  x: number
  z: number
}

/**
 * cannon-es world whose only job is collision detection. The sail kinematics in
 * Ship.ts keep driving the hull — this is the "where is the deck hitting the
 * rocks and the shore" half. cannon's narrowphase answers whether the hull
 * really overlaps a rock or an island this frame; the normal and overlap depth
 * are then read off the world coordinates, which is exact enough here.
 *
 * The ship body is parked on the boat's spot every step and everything else is
 * static, so the world never becomes a second source of truth for where she is.
 */
export class Physics {
  private readonly world = new CANNON.World()
  private readonly ship: CANNON.Body
  private readonly solids: Solid[] = []

  constructor() {
    this.world.gravity.set(0, 0, 0)
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)
    this.world.allowSleep = false

    // the hull as three spheres along her length: cheap, but reads as a hull
    this.ship = new CANNON.Body({ mass: 1 })
    this.ship.allowSleep = false
    this.ship.addShape(new CANNON.Sphere(0.95), new CANNON.Vec3(0, 0, 0))
    this.ship.addShape(new CANNON.Sphere(0.7), new CANNON.Vec3(0, 0, -1.4))
    this.ship.addShape(new CANNON.Sphere(0.7), new CANNON.Vec3(0, 0, 1.4))
    this.ship.fixedRotation = true
    this.world.addBody(this.ship)
  }

  /** a standing island the boat slides along instead of sailing through */
  island(x: number, z: number, radius: number) {
    const body = new CANNON.Body({ mass: 0 })
    // tall enough that the hull spheres always meet it across the wave heave
    const rim = radius * 1.12 + 1.5
    body.addShape(new CANNON.Cylinder(rim, rim + 0.1, 6, 12), new CANNON.Vec3(x, -2, z))
    this.solids.push({ kind: 'island', body, radius: rim, x, z })
    this.world.addBody(body)
  }

  /** a rock that does not move, it makes you move */
  rock(x: number, z: number, radius: number) {
    const body = new CANNON.Body({ mass: 0 })
    const reach = radius + 1.1
    body.addShape(new CANNON.Sphere(reach), new CANNON.Vec3(x, 0, z))
    this.solids.push({ kind: 'rock', body, radius: reach, x, z })
    this.world.addBody(body)
  }

  /** park the body on the boat, ask cannon what she touches, and reap the hits */
  step(dt: number, position: Point, velocity: Point): ContactHit[] {
    const ship = this.ship
    ship.position.set(position.x, position.y, position.z)
    ship.velocity.set(velocity.x, 0, velocity.z)
    this.world.step(FIXED, dt, 3)

    // the bodies cannon's narrowphase found overlapping the hull this frame
    const touched = new Set<CANNON.Body>()
    for (const contact of this.world.contacts) {
      if (contact.bi === ship) touched.add(contact.bj)
      if (contact.bj === ship) touched.add(contact.bi)
    }

    const hits: ContactHit[] = []
    for (const solid of this.solids) {
      if (!touched.has(solid.body)) continue

      // geometry off the boat position we were given: the solver nudges the
      // dynamic body around during the step, so don't read its post-step spot
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