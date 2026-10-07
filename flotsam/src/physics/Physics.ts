import * as CANNON from 'cannon-es'

/** one collision the boat was in since the last step */
export interface ContactHit {
  /** world-space normal pointing away from the thing it hit, on the XZ plane */
  nx: number
  nz: number
  /** how hard she hit it, along the normal */
  speed: number
  kind: 'rock' | 'island'
}

const FIXED = 1 / 60

/** cannon-es ships no type for its collide event, so we sketch the shape we use */
interface CollideEvent {
  body: CANNON.Body
  contact: CANNON.ContactEquation
  target: CANNON.Body
}

/**
 * cannon-es world whose only job is collision detection. The sail kinematics in
 * Ship.ts keep driving the hull — this is the "where is the deck hitting the
 * rocks and the shore" half, which cannon's closest-point solver does properly
 * instead of the old hand-rolled distance checks.
 *
 * The ship body is teleported onto the Ship's position every step and
 * everything else is static, so the world never becomes another source of truth
 * for where she is: it only answers "what did she touch this frame".
 */
export class Physics {
  private readonly world = new CANNON.World()
  private readonly ship: CANNON.Body
  private hits: ContactHit[] = []
  private readonly kinds = new Map<CANNON.Body, 'rock' | 'island'>()

  /** the hull as three spheres along her length: cheap, but reads as a hull */
  private SHIP_SPHERES = [
    { offset: new CANNON.Vec3(0, 0, 0), radius: 0.95 },
    { offset: new CANNON.Vec3(0, 0, -1.4), radius: 0.7 },
    { offset: new CANNON.Vec3(0, 0, 1.4), radius: 0.7 },
  ]

  constructor() {
    this.world.gravity.set(0, 0, 0)
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)
    this.world.allowSleep = true

    this.ship = new CANNON.Body({ mass: 1 })
    for (const { offset, radius } of this.SHIP_SPHERES) {
      this.ship.addShape(new CANNON.Sphere(radius), offset)
    }
    this.ship.fixedRotation = true
    this.world.addBody(this.ship)

    this.ship.addEventListener('collide', (event: CollideEvent) => {
      const other = event.body
      const kind = this.kinds.get(other)
      if (!kind) return

      // outward normal from the thing hit toward the boat, read straight off the
      // two body centres so we never depend on cannon's contact normal winding
      let nx = this.ship.position.x - other.position.x
      let nz = this.ship.position.z - other.position.z
      const length = Math.hypot(nx, nz)
      if (length > 1e-4) {
        nx /= length
        nz /= length
      } else {
        nx = 1
        nz = 0
      }

      this.hits.push({
        nx,
        nz,
        speed: Math.abs(event.contact.getImpactVelocityAlongNormal()),
        kind,
      })
    })
  }

  /** drop a standing island into the world to collide against */
  island(x: number, z: number, radius: number) {
    const body = new CANNON.Body({ mass: 0 })
    // tall enough that the hull spheres always meet it across the wave heave
    body.addShape(new CANNON.Cylinder(radius, radius * 1.08, 6, 12), new CANNON.Vec3(x, -2, z))
    this.kinds.set(body, 'island')
    this.world.addBody(body)
  }

  /** a rock ground—it does not move, it makes you move */
  rock(x: number, z: number, radius: number) {
    const body = new CANNON.Body({ mass: 0 })
    body.addShape(new CANNON.Sphere(radius + 1.1), new CANNON.Vec3(x, 0, z))
    this.kinds.set(body, 'rock')
    this.world.addBody(body)
  }

  /** park the body on the boat, let the solver find her contacts, and reap the hits */
  step(
    dt: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vz: number,
  ): ContactHit[] {
    this.ship.position.set(x, y, z)
    this.ship.velocity.set(vx, 0, vz)
    this.world.step(FIXED, dt, 3)

    const out = this.hits
    this.hits = []
    return out
  }
}