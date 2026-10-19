import * as THREE from 'three/webgpu'
import { clamp, color, materialColor, mix, positionWorld, uniform } from 'three/tsl'
import { loadBoat } from './models'
import type { WaveField } from './WaveField'
import type { Stats } from '../game/stats'

/** half the hull's length: how far fore and aft she feels the waves */
const HULL_LENGTH = 1.6
const HIT_COLOR = new THREE.Color(0xff5533)

/**
 * How much slower the boat sheds way than she puts it on. She coasts a long
 * while, which is the other half of feeling like a boat: momentum you have to
 * plan for, not speed you can cancel.
 */
const COAST = 0.32

/** how much speed a hard turn bleeds away. a boat that turns for free is a launch */
const TURN_DRAG = 0.55

/** how far she lies over at full sail, in radians */
const HEEL = 0.19

/**
 * With the rudder going only needs way on, a boat stopped dead cannot be
 * steered at all. Since S is a brake rather than astern, that leaves nowhere to
 * turn to. She will swing her head round at this fraction of full helm while
 * she has almost no way on, which reads as working the helm slowly and keeps a
 * dead-stalled boat from being stranded pointing at nothing.
 */
const REST_HELM = 0.25

/**
 * Where the player's eyes are: just in front of the mast (which stands about
 * 0.77 m forward of the middle, with the sail behind it), low enough to look
 * out over the open foredeck and the bow. A negative distance aft means
 * forward of the middle. Sideways, the camera lines up with the tip of the bow
 * once the model has loaded, so the bow points straight ahead.
 */
const CAMERA_HEIGHT = 0.85
const CAMERA_AFT = -0.9

/**
 * Where the hull snaps when she goes down, as a distance aft of the middle: a
 * little behind the mast, so the mast and most of the sail go down with the bow.
 */
const BREAK_AT = 0.25

/**
 * The sea is drawn behind everything, so it cannot hide what is under it. The
 * wreck fades into this colour as it goes deeper, and is gone entirely by
 * SUNK_DEPTH, so she reads as sinking into the water rather than through it.
 */
const SEA_DEEP = 0x0a2633
const SUNK_DEPTH = 3.5

/**
 * The rowboat model (boat.fbx, made in Blender) riding the CPU mirror of the shader's wave
 * field. Every handling number comes from the player's Stats, so whatever an
 * island gives you is just a change to that object.
 */
export class Ship {
  /** rig: yaw only, so the camera mount stays independent of the hull */
  readonly rig = new THREE.Group()
  /** deck: pitch + roll, carries hull and the camera mount */
  readonly deck = new THREE.Group()
  /** the point a camera rides on */
  readonly cameraMount = new THREE.Object3D()
  readonly position = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  /** the world-space direction her bow points, kept up to date by update() */
  readonly facing = new THREE.Vector3(0, 0, -1)
  /** set while the player is ashore: she is anchored at the island, not gliding */
  hold = false

  hp: number
  speed = 0
  yaw = 0
  sinking = false

  /** how hard the helm is over, -1 to 1. kept around so the deck can heel into it */
  private turnLoad = 0
  private stats: Stats
  private readonly tints: { material: THREE.MeshStandardNodeMaterial; base: THREE.Color }[] = []

  private smoothedHeight = 0
  private pitch = 0
  private roll = 0
  private flashTimer = 0
  private sinkTimer = 0

  /** the loaded model, once it has arrived */
  private boat: THREE.Object3D | null = null
  /** the two halves she breaks into when she goes down */
  private halves: { bow: THREE.Group; stern: THREE.Group } | null = null
  /** the height of the sea around her, and whether the sinking fade is on */
  private readonly uWater = uniform(0)
  private readonly uSubmerge = uniform(0)

  constructor(stats: Stats) {
    this.stats = stats
    this.hp = stats.hull
    this.rig.add(this.deck)
    this.deck.add(this.cameraMount)
    this.cameraMount.position.set(0, CAMERA_HEIGHT, CAMERA_AFT)

    // handling is live from the first frame; the mesh appears a beat later.
    // Every material is remembered so a hit can flash the whole boat red.
    // Each one also learns to fade into the sea below the waterline once she is
    // sinking, and to vanish below SUNK_DEPTH.
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

  /** swap in newly resolved stats after a draft, keeping current hull damage */
  applyStats(stats: Stats) {
    const health = this.health
    this.stats = stats
    this.hp = stats.hull * health
  }

  /** patch the hull, never past what it can hold */
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

  /** she is done for: the hull snaps in two and both halves go under */
  sink() {
    if (this.sinking) return
    this.hp = 0
    this.sinking = true
    this.uSubmerge.value = 1
    this.breakHull()
  }

  /**
   * Cut the boat in two at BREAK_AT. Every triangle goes to whichever side of
   * the cut its middle is on, so the break is ragged, like splintered planking.
   * Each half hangs from the break, so tipping a half lifts its far end.
   */
  private breakHull() {
    const boat = this.boat
    if (!boat) return

    this.deck.updateMatrixWorld(true)
    const toDeck = this.deck.matrixWorld.clone().invert()
    const bow = new THREE.Group()
    const stern = new THREE.Group()
    bow.position.z = BREAK_AT
    stern.position.z = BREAK_AT

    boat.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      // bake the mesh into the deck's space, measured from the break
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
    // Ashore. Whatever way on she carried in with, she is anchored now, so the
    // scene stays put while the player reads and answers instead of drifting
    // past the island underneath the story.
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

  /** throttle and rudder into speed and heading */
  private sail(delta: number, throttle: number, rudder: number) {
    const stats = this.stats

    // pumps claw back speed once the bilge is winning
    const pumps = this.health < 0.5 ? stats.pumps : 1
    const maxSpeed = stats.speed * pumps

    // ---- speed. A sail cannot push backwards, so S is not reverse: it is
    // backing the sheet, which stops her harder than easing it does.
    const target = maxSpeed * THREE.MathUtils.clamp(throttle, 0, 1)
    const toward = target - this.speed
    const backing = throttle < 0

    // backing the sheet or trimming up acts at full rate; easing it only coasts
    const rate = backing || toward > 0 ? stats.accel : stats.accel * COAST
    this.speed += toward * Math.min(1, rate * delta)

    if (throttle === 0 && this.speed < 0.05) this.speed = 0
    this.speed = THREE.MathUtils.clamp(this.speed, 0, maxSpeed)

    // ---- rudder authority: way on gives grip, a helm upgrade works at rest,
    // and stopped she still swings her head round rather than freezing
    const fromWay = Math.min(1, this.speed / 2.5)
    const authority = fromWay < 0.08 ? REST_HELM : Math.max(stats.helmFloor, fromWay)
    const helm = rudder * authority
    this.yaw -= helm * stats.turn * delta

    // ---- she loses way round a turn, and loses it faster the harder she is
    // put over. Turning should be a thing you spend speed to do.
    this.speed -= this.speed * Math.abs(helm) * TURN_DRAG * delta
    this.turnLoad = helm
  }

  /** sample bow, stern and both sides of the hull, and pitch, roll and heave to match */
  private rideWaves(delta: number, waves: WaveField) {
    const e = HULL_LENGTH
    const { x, z } = this.position
    const f = this.facing
    // starboard, a right angle off the bow
    const rx = -f.z
    const rz = f.x

    const centre = waves.height(x, z)
    const bow = waves.height(x + f.x * e, z + f.z * e)
    const stern = waves.height(x - f.x * e, z - f.z * e)
    const starboard = waves.height(x + rx * e, z + rz * e)
    const port = waves.height(x - rx * e, z - rz * e)

    this.smoothedHeight += (centre - this.smoothedHeight) * (1 - Math.min(1, 8 * delta))

    const impact = this.stats.waveImpact
    let targetPitch = Math.atan2(bow - stern, e * 2) * impact
    let targetRoll: number
    let follow = 1 - Math.min(1, 6 * delta)

    if (this.sinking) {
      // she settles level fore and aft and lies over to a gentle, fixed list:
      // the camera rides the deck, so a full capsize would read as the world
      // spinning out of control. Sink slow, list slow.
      targetPitch = 0
      targetRoll = 0.08
      follow = 1 - Math.min(1, 1.1 * delta)
      this.breakApart()
    } else {
      // ---- heel under sail: she lies over with way on, and leans further into
      // a turn. Without this the boat sits bolt upright under full sail, which
      // is the clearest tell that it is not being driven by the wind.
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
  }

  /** the sea level where she lies, for anything that wants to look at her */
  get waterline() {
    return this.smoothedHeight
  }

  /** how far under she has gone: slow while she fills, then faster once she goes */
  private sunkBy() {
    const t = this.sinkTimer
    return Math.min(14, 0.2 * t + 0.11 * t * t)
  }

  /**
   * The two halves fold up into a V about the break: the broken middle drags
   * them down, so bow and stern both rise, drift apart and roll away from each
   * other. The longer she goes, the steeper they stand.
   */
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

  /** tint the hull red for a moment after a hit */
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

/**
 * One mesh, cut at z = 0 into the triangles ahead of it (the bow side, -z) and
 * those behind it: one new mesh per side and material.
 */
function splitAtZero(geometry: THREE.BufferGeometry, materials: THREE.Material[]) {
  const position = geometry.attributes.position
  const triangles = position.count / 3
  const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: position.count, materialIndex: 0 }]

  // triangle numbers, sorted by side and then by material
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
