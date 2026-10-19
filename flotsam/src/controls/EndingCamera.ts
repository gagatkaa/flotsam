import * as THREE from 'three/webgpu'

/** how far out the camera ends up, and how it gets there */
export interface Shot {
  /** distance from the boat across the water, in metres */
  radius: number
  /** height above the water, in metres */
  height: number
  /** how far it swings round the boat on the way out, in radians */
  sweep: number
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
    const angle = this.startAngle + this.shot.sweep * out + this.time * ORBIT
    const radius = THREE.MathUtils.lerp(this.startRadius, this.shot.radius, out)
    const height = THREE.MathUtils.lerp(this.startHeight, this.shot.height, out)

    this.camera.position.set(
      focus.x + Math.sin(angle) * radius,
      focus.y + height,
      focus.z + Math.cos(angle) * radius,
    )

    this.look.lookAt(this.camera.position, focus, this.up)
    this.lookQuat.setFromRotationMatrix(this.look)
    this.camera.quaternion.slerpQuaternions(this.startQuat, this.lookQuat, THREE.MathUtils.smoothstep(this.time, 0, TURN))

    this.camera.fov = THREE.MathUtils.lerp(this.startFov, this.shot.fov, out)
    this.camera.updateProjectionMatrix()
  }
}
