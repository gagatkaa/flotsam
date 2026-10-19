import * as THREE from 'three/webgpu'

export interface Shot {
  radius: number
  height: number
  sweep: number
  bearing?: number
  keepClear?: (position: THREE.Vector3) => void
  fov: number
}

const PULL_OUT = 6
const TURN = 2.2
const ORBIT = 0.05
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
