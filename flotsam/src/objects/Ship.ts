import * as THREE from 'three/webgpu'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import boatUrl from './BoatModel.FBX?url'
import type { WaveField } from './WaveField'
import type { Stats } from '../game/stats'

const HULL_LENGTH = 1.6
/** the FBX is authored in cm; fit her to the length the handling was tuned around */
const MODEL_LENGTH = 4.2
/** wood tone multiplied over the model's own material colours */
const HULL_COLOR = 0x6b4a2f
const HIT_COLOR = new THREE.Color(0xff5533)

/**
 * How much slower the boat sheds way than she puts it on. She coasts a long
 * while, which is the other half of feeling like a boat: momentum you have to
 * plan for, not speed you can cancel.
 */
const COAST = 0.32

/** how hard backing the sail stops her, against merely easing it */
const BACKWIND = 1

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
 * The boat model (BoatModel.FBX) riding the CPU mirror of the shader's wave
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
  readonly velocity = new THREE.Vector3()
  /** how hard the helm is over, -1 to 1. kept around so the deck can heel into it */
  turnLoad = 0
  /** set while the player is ashore: she is anchored at the island, not gliding */
  hold = false
  readonly position = new THREE.Vector3()

  hp: number
  speed = 0
  yaw = 0
  sinking = false

  /** the world-space direction her bow points, kept up to date by update() */
  get facing() {
    return this.forward
  }

  private readonly forward = new THREE.Vector3(0, 0, -1)
  private stats: Stats
  private readonly tints: { material: THREE.MeshStandardNodeMaterial; base: THREE.Color }[] = []

  private smoothedHeight = 0
  private pitch = 0
  private roll = 0
  private flashTimer = 0
  private sinkTimer = 0

  constructor(stats: Stats) {
    this.stats = stats
    this.hp = stats.hull
    this.rig.add(this.deck)
    this.deck.add(this.cameraMount)
    this.cameraMount.position.set(0, 1.05, -0.2)

    // handling is live from the first frame; the mesh appears a beat later
    new FBXLoader().load(boatUrl, (model) => {
      // she was authored stern-forward, so swing her round to point at -Z
      model.rotation.y = Math.PI

      const box = new THREE.Box3().setFromObject(model)
      const size = box.getSize(new THREE.Vector3())
      model.scale.setScalar(MODEL_LENGTH / Math.max(size.x, size.z))

      const fitted = new THREE.Box3().setFromObject(model)
      const centre = fitted.getCenter(new THREE.Vector3())
      model.position.sub(centre)

      const hull = new THREE.Color(HULL_COLOR)
      model.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        const sources = Array.isArray(child.material) ? child.material : [child.material]
        const materials = sources.map((source) => {
          const material = new THREE.MeshStandardNodeMaterial({
            color: hull.clone().multiply((source as THREE.MeshPhongMaterial).color),
            roughness: 0.7,
          })
          this.tints.push({ material, base: material.color.clone() })
          return material
        })
        child.material = Array.isArray(child.material) ? materials : materials[0]
      })

      this.deck.add(model)
    }, undefined, (err) => {
      console.warn('could not load BoatModel.FBX', err)
    })
  }

  get alive() {
    return !this.sinking
  }

  get isSunk() {
    return this.sinking && this.sinkTimer > 6
  }

  get health() {
    return this.hp / this.stats.hull
  }

  /** swap in newly resolved stats after a draft, keeping current hull damage */
  applyStats(stats: Stats) {
    const health = this.health
    this.stats = stats
    this.hp = stats.hull * health
  }

  damage(amount: number) {
    if (this.sinking) return
    this.hp -= amount * this.stats.frailty
    this.flashTimer = 0.14
    if (this.hp <= 0) {
      this.hp = 0
      this.sinking = true
    }
  }

  update(delta: number, waves: WaveField, throttle: number, rudder: number) {
    const stats = this.stats

    // Ashore. Whatever way on she carried in with, she is anchored now, so the
    // scene stays put while the player reads and answers instead of drifting
    // past the island underneath the story.
    if (this.hold) {
      this.speed = 0
      this.turnLoad = 0
      throttle = 0
      rudder = 0
    }

    // pumps claw back speed once the bilge is winning
    const pumps = this.health < 0.5 ? stats.pumps : 1
    const maxSpeed = stats.speed * pumps

    if (this.sinking) {
      this.sinkTimer += delta
      this.speed = 0
      this.turnLoad = 0
    } else {
      // ---- speed. A sail cannot push backwards, so S is not reverse: it is
      // backing the sheet, which stops her far harder than easing does. Losing
      // that distinction is most of what makes a saildriven boat feel like a
      // launch with a sail on it.
      const eased = THREE.MathUtils.clamp(throttle, 0, 1)
      const backing = Math.max(0, -throttle)

      const ahead = maxSpeed * eased
      const toward = ahead - this.speed

      // easing the sheet coasts, backing it stops her, and trimming up fills
      const rate = backing > 0
        ? stats.accel * BACKWIND
        : toward > 0
          ? stats.accel
          : stats.accel * COAST

      this.speed += toward * Math.min(1, rate * delta)

      if (eased === 0 && backing === 0 && this.speed < 0.05) this.speed = 0
      this.speed = THREE.MathUtils.clamp(this.speed, 0, maxSpeed)

      // ---- rudder authority: way on gives grip, a helm upgrade works at rest,
      // and stopped she still swings her head round rather than freezing
      const fromWay = Math.min(1, Math.abs(this.speed) / 2.5)
      const stopped = fromWay < 0.08
      const authority = stopped
        ? REST_HELM
        : Math.max(stats.helmFloor, fromWay)
      const helm = rudder * authority * Math.sign(this.speed || 1)
      this.yaw -= helm * stats.turn * delta

      // ---- she loses way round a turn, and loses it faster the harder she is
      // put over. Turning should be a thing you spend speed to do.
      this.speed -= this.speed * Math.abs(helm) * TURN_DRAG * delta
      this.turnLoad = helm
    }

    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    this.position.addScaledVector(this.forward, this.speed * delta)
    this.velocity.copy(this.forward).multiplyScalar(this.speed)

    // ---- ride the surface: sample bow, stern and both sides
    const e = HULL_LENGTH
    const { x, z } = this.position
    const f = this.forward
    const rx = -f.z
    const rz = f.x

    const centre = waves.height(x, z)
    const bow = waves.height(x + f.x * e, z + f.z * e)
    const stern = waves.height(x - f.x * e, z - f.z * e)
    const starboard = waves.height(x + rx * e, z + rz * e)
    const port = waves.height(x - rx * e, z - rz * e)

    this.smoothedHeight += (centre - this.smoothedHeight) * (1 - Math.min(1, 8 * delta))

    const follow = 1 - Math.min(1, 6 * delta)
    const impact = stats.waveImpact

    // ---- heel under sail: she lies over with way on, and leans further into
    // a turn. Without this the boat sits bolt upright under full sail, which is
    // the clearest tell that it is not being driven by the wind.
    const loaded = Math.min(1, Math.abs(this.speed) / Math.max(1, this.stats.speed))
    const heel = this.sinking ? 0 : HEEL * loaded * (0.6 + Math.abs(this.turnLoad) * 0.25)
    const turnHeel = this.sinking ? 0 : -this.turnLoad * HEEL * 0.55

    const waveRoll = Math.atan2(starboard - port, e * 2) * 0.7 * impact
    // she lies over to a gentle, fixed list and stays there: the camera rides
    // the deck, so a full capsize reads as the world spinning out of control
    const targetRoll = this.sinking ? 0.22 : waveRoll + heel + turnHeel
    // sink slow, list slow — settle onto the beam over a couple of seconds
    const sway = this.sinking ? 1 - Math.min(1, 1.1 * delta) : follow
    this.pitch += (this.sinking ? -this.pitch : Math.atan2(bow - stern, e * 2) * impact - this.pitch) * sway
    this.roll += (targetRoll - this.roll) * sway

    this.position.y = this.smoothedHeight + stats.rideHeight - Math.min(this.sinkTimer, 9) * 0.9
    this.rig.position.set(x, this.position.y, z)
    this.rig.rotation.y = this.yaw
    this.deck.rotation.x = this.pitch
    this.deck.rotation.z = this.roll

    // ---- damage flash
    if (this.flashTimer > 0) {
      this.flashTimer -= delta
      if (this.flashTimer <= 0) {
        for (const { material, base } of this.tints) material.color.copy(base)
      } else {
        for (const { material, base } of this.tints) {
          material.color.copy(base).lerp(HIT_COLOR, 0.75)
        }
      }
    }
  }
}