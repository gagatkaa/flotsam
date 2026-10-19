import * as THREE from 'three/webgpu'

export interface Shot {
  /** distance from the boat across the water, in metres */
  radius: number
  /** height above the water, in metres */
  height: number
  /** how far it swings round the boat on the way out, in radians */
  sweep: number
  /** a fixed angle round the boat (atan2(x, z) of the offset) to settle at instead of circling */
  bearing?: number
  /** moves a camera position that ended up inside something back into the open */
  keepClear?: (position: THREE.Vector3) => void
  fov: number
}

/** seconds the pull-out takes */
const PULL_OUT = 6
/** seconds the gaze takes to turn to the boat */
const TURN = 2.2
/** slow orbit once settled, so the last shot never freezes */
const ORBIT = 0.05

/** the closing shot: lifts off the deck, turns to the boat and pulls away */
export class EndingCamera {
  active = false

  private time = 0
  private shot: Shot = { radius: 0, height: 0, sweep: 0, fov: 75 }
  private startRadius = 0
  private startHeight = 0
  private startAngle = 0
  private startFov = 75
  private readonly startQuat = new THREE.Quaternion()
  private readonly lookQuat = new THREE.Quaternion()
  private readonly look = new THREE.Matrix4()
  private readonly up = new THREE.Vector3(0, 1, 0)

  private readonly camera: THREE.PerspectiveCamera
  private readonly scene: THREE.Scene

  constructor(camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    this.camera = camera
    this.scene = scene
  }

  /** take the camera off the deck, keeping where it is and where it looks */
  start(focus: THREE.Vector3, shot: Shot) {
    this.scene.attach(this.camera)
    this.shot = shot
    this.time = 0
    this.active = true

    const offset = this.camera.position.clone().sub(focus)
    this.startRadius = Math.hypot(offset.x, offset.z)
    this.startHeight = offset.y
    this.startAngle = Math.atan2(offset.x, offset.z)
    this.startFov = this.camera.fov
    this.startQuat.copy(this.camera.quaternion)
  }

  update(delta: number, focus: THREE.Vector3) {
    if (!this.active) return
    this.time += delta

    const out = THREE.MathUtils.smootherstep(this.time, 0, PULL_OUT)
    const { bearing } = this.shot
    // to a fixed bearing the short way round; otherwise sweep, then keep circling
    const angle =
      bearing === undefined
        ? this.startAngle + this.shot.sweep * out + this.time * ORBIT
        : this.startAngle + Math.atan2(Math.sin(bearing - this.startAngle), Math.cos(bearing - this.startAngle)) * out
    const radius = THREE.MathUtils.lerp(this.startRadius, this.shot.radius, out)
    const height = THREE.MathUtils.lerp(this.startHeight, this.shot.height, out)

    this.camera.position.set(
      focus.x + Math.sin(angle) * radius,
      focus.y + height,
      focus.z + Math.cos(angle) * radius,
    )
    this.shot.keepClear?.(this.camera.position)

    this.look.lookAt(this.camera.position, focus, this.up)
    this.lookQuat.setFromRotationMatrix(this.look)
    this.camera.quaternion.slerpQuaternions(this.startQuat, this.lookQuat, THREE.MathUtils.smoothstep(this.time, 0, TURN))

    this.camera.fov = THREE.MathUtils.lerp(this.startFov, this.shot.fov, out)
    this.camera.updateProjectionMatrix()
  }
}
