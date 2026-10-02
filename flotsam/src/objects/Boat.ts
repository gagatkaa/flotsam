import * as THREE from 'three/webgpu'
import type { WaveField } from './WaveField'

const MAX_SPEED = 14
const REVERSE_SPEED = 4
const ACCELERATION = 9
const TURN_RATE = 1.15
const HULL_LENGTH = 1.6
const CAMERA_HEIGHT = 1.05
const HULL_RIDE_HEIGHT = 0.25

/**
 * A low-poly sloop built from primitives, riding the CPU mirror of the shader's wave
 * field. Yaw is driven by the rudder, pitch/roll by sampling the surface at the bow,
 * stern and both sides.
 */
export class Boat {
  /** rig: yaw only. camera and hull are children, so mouse look stays independent */
  readonly rig = new THREE.Group()
  /** deck: pitch + roll, carries the hull and the camera mount */
  readonly deck = new THREE.Group()
  /** the point the camera rides on */
  readonly cameraMount = new THREE.Object3D()

  readonly position = new THREE.Vector3(0, 0, 0)

  speed = 0

  private yaw = 0
  private smoothedHeight = 0
  private pitch = 0
  private roll = 0

  constructor() {
    this.rig.add(this.deck)
    this.deck.add(this.cameraMount)
    this.cameraMount.position.set(0, CAMERA_HEIGHT, -0.2)

    const wood = new THREE.MeshStandardNodeMaterial({ color: 0x6b4a2f, roughness: 0.7 })
    const darkWood = new THREE.MeshStandardNodeMaterial({ color: 0x4a3320, roughness: 0.8 })
    const sailCloth = new THREE.MeshStandardNodeMaterial({ color: 0xe8e2d2, roughness: 0.9, side: THREE.DoubleSide })

    // hull: a 4 sided cone laid along -Z, narrow end forward, reads as a pointed hull
    const hullAxis = new THREE.Group()
    hullAxis.rotation.x = -Math.PI / 2
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.95, 4.2, 4, 1, false), wood)
    hull.rotation.y = Math.PI / 4
    hull.scale.set(0.8, 1, 0.8)
    hullAxis.add(hull)
    this.deck.add(hullAxis)

    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 3.4), darkWood)
    deck.position.y = 0.32
    this.deck.add(deck)

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 6), darkWood)
    mast.position.set(0, 1.9, 0.1)
    this.deck.add(mast)

    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), darkWood)
    boom.rotation.z = Math.PI / 2
    boom.position.set(0, 0.6, 0.1)
    this.deck.add(boom)

    const sail = new THREE.Mesh(sailGeometry(1.5, 2.9), sailCloth)
    sail.position.z = 0.1
    this.deck.add(sail)

    this.position.set(0, 0, 0)
  }

  update(delta: number, waves: WaveField, throttle: number, rudder: number) {
    // ---- speed: throttle, quadratic drag, a little windage
    this.speed += throttle * ACCELERATION * delta
    this.speed -= this.speed * Math.abs(this.speed) * 0.055 * delta
    this.speed -= this.speed * 0.55 * delta

    if (throttle === 0 && Math.abs(this.speed) < 0.05) this.speed = 0
    this.speed = THREE.MathUtils.clamp(this.speed, -REVERSE_SPEED, MAX_SPEED)

    // ---- rudder only bites once the hull is moving
    const authority = Math.min(1, Math.abs(this.speed) / 2.5)
    this.yaw -= rudder * TURN_RATE * authority * Math.sign(this.speed || 1) * delta

    const fx = -Math.sin(this.yaw)
    const fz = -Math.cos(this.yaw)
    const rx = Math.cos(this.yaw)
    const rz = -Math.sin(this.yaw)

    this.position.x += fx * this.speed * delta
    this.position.z += fz * this.speed * delta

    // ---- ride the surface: sample bow, stern and both sides
    const sample = HULL_LENGTH
    const centre = waves.height(this.position.x, this.position.z)
    const bow = waves.height(this.position.x + fx * sample, this.position.z + fz * sample)
    const stern = waves.height(this.position.x - fx * sample, this.position.z - fz * sample)
    const starboard = waves.height(this.position.x + rx * sample, this.position.z + rz * sample)
    const port = waves.height(this.position.x - rx * sample, this.position.z - rz * sample)

    const follow = 1 - Math.min(1, 6 * delta)
    this.smoothedHeight += (centre - this.smoothedHeight) * (1 - Math.min(1, 8 * delta))

    const targetPitch = Math.atan2(bow - stern, sample * 2)
    const targetRoll = Math.atan2(starboard - port, sample * 2) * 0.7
    this.pitch += (targetPitch - this.pitch) * follow
    this.roll += (targetRoll - this.roll) * follow

    this.rig.position.set(this.position.x, this.smoothedHeight + HULL_RIDE_HEIGHT, this.position.z)
    this.rig.rotation.y = this.yaw
    this.deck.rotation.x = this.pitch
    this.deck.rotation.z = this.roll
  }
}

/** flat triangular sail, in the XY plane, attached to the mast */
function sailGeometry(width: number, height: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const w = width / 2

  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    w, 0, 0,
    0, height, 0,
    0, 0, 0,
    0, height, 0,
    -w, 0, 0,
  ], 3))
  geometry.computeVertexNormals()

  return geometry
}
