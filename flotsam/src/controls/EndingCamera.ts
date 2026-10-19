import * as THREE from 'three/webgpu'

/** how far out the camera ends up, and how it gets there */
export interface Shot {
  /** distance from the boat across the water, in metres */
  radius: number
  /** height above the water, in metres */
  height: number
  /** how far it swings round the boat on the way out, in radians */
  sweep: number
  /**
   * Where to end up instead, as a fixed angle round the boat (the same angle as
   * Math.atan2(x, z) of the camera's offset from her). Held there, it does not
   * circle, so a shot that has to keep something in frame stays put.
   */
  bearing?: number
  /** moves a camera position that has ended up inside something back out into the open */
  keepClear?: (position: THREE.Vector3) => void
  /** the lens it settles on: narrower than the deck's, so the boat fills more of the frame */
  fov: number
}

/** seconds the pull-out takes before the camera settles into its orbit */
const PULL_OUT = 6
/** seconds the gaze takes to turn from wherever you were looking to the boat */
const TURN = 2.2
/** once settled it keeps circling, slowly, so the last shot never freezes */
const ORBIT = 0.05

/**
 * The closing shot. The camera lifts off the deck, turns to face the boat and
 * pulls away up into the sky, swinging round her as it goes, so the end of the
 * voyage is something you watch happen rather than a page you are handed.
 */
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

  /** take the camera off the deck, keeping exactly where it is and where it looks */
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
    // to a fixed bearing, the short way round; otherwise sweep, then keep circling
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
