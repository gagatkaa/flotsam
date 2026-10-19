import * as THREE from 'three/webgpu'
import { clamp, color, materialColor, mix, positionWorld, uniform } from 'three/tsl'
import { loadBoat } from './models'
import { SEA_DEEP, type WaveField } from './WaveField'
import type { Stats } from '../game/stats'

/** half the hull's length: how far fore and aft she samples the waves */
const HULL_LENGTH = 1.6

/** per-second easing rates for heave and lean; slow enough to ride through small chop */
const HEAVE_RATE = 3
const LEAN_RATE = 2.2

/**
 * How much of the deck's pitch and roll the camera cancels, 0 to 1. A camera
 * bolted to the deck is what makes the view sickening.
 */
const HORIZON_HOLD = 0.6
const HIT_COLOR = new THREE.Color(0xff5533)

/** how much slower she sheds speed than she gains it */
const COAST = 0.32

/** how much speed a hard turn bleeds away */
const TURN_DRAG = 0.55

/** heel at full sail, in radians */
const HEEL = 0.19

/** helm authority at a dead stop, so a stalled boat can still swing her head round */
const REST_HELM = 0.25

/** eye position: just ahead of the mast. Negative aft means forward of the middle */
const CAMERA_HEIGHT = 0.85
const CAMERA_AFT = -0.9

/** where the hull snaps when she goes down, as a distance aft of the middle */
const BREAK_AT = 0.25

/** the wreck fades into SEA_DEEP as it sinks, and is gone by this depth */
const SUNK_DEPTH = 3.5

export class Ship {
  /** yaw only */
  readonly rig = new THREE.Group()
  /** pitch + roll; carries the hull and the camera mount */
  readonly deck = new THREE.Group()
  readonly cameraMount = new THREE.Object3D()
  readonly position = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  readonly facing = new THREE.Vector3(0, 0, -1)
  /** anchored while a panel is up */
  hold = false

  hp: number
  speed = 0
  yaw = 0
  sinking = false

  /** current helm, -1 to 1, so the deck can heel into the turn */
  private turnLoad = 0
  private stats: Stats
  private readonly tints: { material: THREE.MeshStandardNodeMaterial; base: THREE.Color }[] = []

  private smoothedHeight = 0
  private pitch = 0
  private roll = 0
  private flashTimer = 0
  private sinkTimer = 0

  private boat: THREE.Object3D | null = null
  private halves: { bow: THREE.Group; stern: THREE.Group } | null = null
  private readonly uWater = uniform(0)
  private readonly uSubmerge = uniform(0)

  constructor(stats: Stats) {
    this.stats = stats
    this.hp = stats.hull
    this.rig.add(this.deck)
    this.deck.add(this.cameraMount)
    this.cameraMount.position.set(0, CAMERA_HEIGHT, CAMERA_AFT)
    // undoes the deck's pitch-then-roll in reverse order
    this.cameraMount.rotation.order = 'ZYX'

    // every material is kept for the hit flash, and fades into the sea once she sinks
    const remember = (material: THREE.MeshStandardNodeMaterial) => {
      this.tints.push({ material, base: material.color.clone() })
      const depth = this.uWater.sub(positionWorld.y)
      const drowned = clamp(depth.div(SUNK_DEPTH), 0, 1).mul(this.uSubmerge)
      material.colorNode = mix(materialColor, color(SEA_DEEP), drowned)
      material.maskNode = this.uSubmerge.lessThan(0.5).or(depth.lessThan(SUNK_DEPTH))
    }
    loadBoat(remember)
      .then(({ boat, bow }) => {
        this.boat = boat
        this.deck.add(boat)
        this.cameraMount.position.x = bow.x
        // she may have gone down before the model arrived
        if (this.sinking) this.breakHull()
      })
      .catch((err) => console.warn('could not load boat.fbx', err))
  }

  get alive() {
    return !this.sinking
  }

  /** hull left, 0 to 1 */
  get health() {
    return this.hp / this.stats.hull
  }

  /** swap in new stats, keeping the same share of hull damage */
  applyStats(stats: Stats) {
    const health = this.health
    this.stats = stats
    this.hp = stats.hull * health
  }

  repair(amount: number) {
    if (this.sinking) return
    this.hp = Math.min(this.stats.hull, this.hp + amount)
  }

  damage(amount: number) {
    if (this.sinking) return
    this.hp -= amount * this.stats.frailty
    this.flashTimer = 0.14
    if (this.hp <= 0) this.sink()
  }

  sink() {
    if (this.sinking) return
    this.hp = 0
    this.sinking = true
    this.uSubmerge.value = 1
    this.breakHull()
  }

  /**
   * Cut the boat in two at BREAK_AT. Each triangle goes to whichever side its
   * middle is on, so the break is ragged. Each half pivots about the break.
   */
  private breakHull() {
    const boat = this.boat
    if (!boat || this.halves) return

    this.deck.updateMatrixWorld(true)
    const toDeck = this.deck.matrixWorld.clone().invert()
    const bow = new THREE.Group()
    const stern = new THREE.Group()
    bow.position.z = BREAK_AT
    stern.position.z = BREAK_AT

    boat.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const source = child.geometry as THREE.BufferGeometry
      const geometry = source.index ? source.toNonIndexed() : source.clone()
      geometry.applyMatrix4(toDeck.clone().multiply(child.matrixWorld))
      geometry.translate(0, 0, -BREAK_AT)

      const materials: THREE.Material[] = Array.isArray(child.material) ? child.material : [child.material]
      for (const piece of splitAtZero(geometry, materials)) {
        ;(piece.forward ? bow : stern).add(piece.mesh)
      }
      geometry.dispose()
    })

    boat.removeFromParent()
    this.deck.add(bow, stern)
    this.halves = { bow, stern }
  }

  update(delta: number, waves: WaveField, throttle: number, rudder: number) {
    if (this.hold) {
      this.speed = 0
      this.turnLoad = 0
      throttle = 0
      rudder = 0
    }

    if (this.sinking) {
      this.sinkTimer += delta
      this.speed = 0
      this.turnLoad = 0
    } else {
      this.sail(delta, throttle, rudder)
    }

    this.facing.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    this.position.addScaledVector(this.facing, this.speed * delta)
    this.velocity.copy(this.facing).multiplyScalar(this.speed)

    this.rideWaves(delta, waves)
    this.updateFlash(delta)
  }

  private sail(delta: number, throttle: number, rudder: number) {
    const stats = this.stats

    const pumps = this.health < 0.5 ? stats.pumps : 1
    const maxSpeed = stats.speed * pumps

    // a sail cannot push backwards: S brakes at full rate, easing off only coasts
    const target = maxSpeed * THREE.MathUtils.clamp(throttle, 0, 1)
    const toward = target - this.speed
    const backing = throttle < 0

    const rate = backing || toward > 0 ? stats.accel : stats.accel * COAST
    this.speed += toward * Math.min(1, rate * delta)

    if (throttle === 0 && this.speed < 0.05) this.speed = 0
    this.speed = THREE.MathUtils.clamp(this.speed, 0, maxSpeed)

    const fromWay = Math.min(1, this.speed / 2.5)
    const authority = fromWay < 0.08 ? REST_HELM : Math.max(stats.helmFloor, fromWay)
    const helm = rudder * authority
    this.yaw -= helm * stats.turn * delta

    this.speed -= this.speed * Math.abs(helm) * TURN_DRAG * delta
    this.turnLoad = helm
  }

  /** sample bow, stern and both sides, and pitch, roll and heave to match */
  private rideWaves(delta: number, waves: WaveField) {
    const e = HULL_LENGTH
    const { x, z } = this.position
    const f = this.facing
    // starboard
    const rx = -f.z
    const rz = f.x

    const centre = waves.height(x, z)
    const bow = waves.height(x + f.x * e, z + f.z * e)
    const stern = waves.height(x - f.x * e, z - f.z * e)
    const starboard = waves.height(x + rx * e, z + rz * e)
    const port = waves.height(x - rx * e, z - rz * e)

    this.smoothedHeight += (centre - this.smoothedHeight) * ease(HEAVE_RATE, delta)

    const impact = this.stats.waveImpact
    let targetPitch = Math.atan2(bow - stern, e * 2) * impact
    let targetRoll: number
    let follow = ease(LEAN_RATE, delta)

    if (this.sinking) {
      // a gentle fixed list: the camera rides the deck, so a capsize would spin the world
      targetPitch = 0
      targetRoll = 0.08
      follow = ease(1.1, delta)
      this.breakApart()
    } else {
      const loaded = Math.min(1, this.speed / Math.max(1, this.stats.speed))
      const heel = HEEL * loaded * (0.6 + Math.abs(this.turnLoad) * 0.25)
      const turnHeel = -this.turnLoad * HEEL * 0.55
      const waveRoll = Math.atan2(starboard - port, e * 2) * 0.7 * impact
      targetRoll = waveRoll + heel + turnHeel
    }

    this.pitch += (targetPitch - this.pitch) * follow
    this.roll += (targetRoll - this.roll) * follow

    this.uWater.value = this.smoothedHeight
    this.position.y = this.smoothedHeight + this.stats.rideHeight - this.sunkBy()
    this.rig.position.set(x, this.position.y, z)
    this.rig.rotation.y = this.yaw
    this.deck.rotation.x = this.pitch
    this.deck.rotation.z = this.roll

    this.cameraMount.rotation.set(-this.pitch * HORIZON_HOLD, 0, -this.roll * HORIZON_HOLD)
  }

  /** the sea level where she lies */
  get waterline() {
    return this.smoothedHeight
  }

  private sunkBy() {
    const t = this.sinkTimer
    return Math.min(14, 0.2 * t + 0.11 * t * t)
  }

  /** the two halves fold up into a V about the break and drift apart */
  private breakApart() {
    if (!this.halves) return
    const t = this.sinkTimer
    const snap = THREE.MathUtils.smootherstep(t, 0, 3)
    const tilt = Math.min(1.25, 0.55 * snap + 0.09 * t)
    const { bow, stern } = this.halves

    bow.rotation.x = tilt
    bow.rotation.z = 0.3 * snap
    bow.position.set(0.15 * snap, 0, BREAK_AT - 0.7 * snap - 0.05 * t)

    stern.rotation.x = -tilt * 0.85
    stern.rotation.z = -0.35 * snap
    stern.position.set(-0.2 * snap, 0, BREAK_AT + 0.7 * snap + 0.05 * t)
  }

  private updateFlash(delta: number) {
    if (this.flashTimer <= 0) return

    this.flashTimer -= delta
    const hit = this.flashTimer > 0
    for (const { material, base } of this.tints) {
      material.color.copy(base)
      if (hit) material.color.lerp(HIT_COLOR, 0.75)
    }
  }
}

/** split a non-indexed mesh at z = 0 into one mesh per side (bow is -z) and material */
function splitAtZero(geometry: THREE.BufferGeometry, materials: THREE.Material[]) {
  const position = geometry.attributes.position
  const triangles = position.count / 3
  const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: position.count, materialIndex: 0 }]

  const sorted = new Map<string, { forward: boolean; material: number; list: number[] }>()
  for (const group of groups) {
    const material = group.materialIndex ?? 0
    const last = Math.min(triangles, (group.start + group.count) / 3)
    for (let tri = group.start / 3; tri < last; tri++) {
      const z = position.getZ(tri * 3) + position.getZ(tri * 3 + 1) + position.getZ(tri * 3 + 2)
      const forward = z < 0
      const key = `${forward}:${material}`
      let bucket = sorted.get(key)
      if (!bucket) sorted.set(key, (bucket = { forward, material, list: [] }))
      bucket.list.push(tri)
    }
  }

  return [...sorted.values()].map(({ forward, material, list }) => {
    const piece = new THREE.BufferGeometry()
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const size = attribute.itemSize
      const array = new Float32Array(list.length * 3 * size)
      list.forEach((tri, n) => {
        for (let v = 0; v < 3; v++) {
          for (let c = 0; c < size; c++) array[(n * 3 + v) * size + c] = attribute.getComponent(tri * 3 + v, c)
        }
      })
      piece.setAttribute(name, new THREE.BufferAttribute(array, size))
    }
    return { forward, mesh: new THREE.Mesh(piece, materials[material] ?? materials[0]) }
  })
}

/** frame-rate independent share of the way to close towards a target at `rate` per second */
function ease(rate: number, delta: number) {
  return 1 - Math.exp(-rate * delta)
}
