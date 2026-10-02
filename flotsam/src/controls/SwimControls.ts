import * as THREE from 'three/webgpu'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'

const MIN_HEIGHT = 0.6
const MAX_HEIGHT = 60
const THROTTLE = 34

export class SwimControls {
  readonly controls: PointerLockControls

  /** horizontal speed in units/second, fed to the ocean shader */
  speed: number

  private readonly velocity = new THREE.Vector3()
  private readonly forward = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly keys: Record<string, boolean> = {}

  constructor(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
    this.speed = 0
    this.controls = new PointerLockControls(camera, canvas)

    // listen on the window, not the canvas: the HUD overlay covers the canvas
    window.addEventListener('click', () => {
      if (!this.controls.isLocked) this.controls.lock()
    })

    window.addEventListener('keydown', (e) => { this.keys[e.code] = true })
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false })
    window.addEventListener('blur', () => {
      for (const code of Object.keys(this.keys)) this.keys[code] = false
    })
  }

  get locked() {
    return this.controls.isLocked
  }

  update(delta: number) {
    const keys = this.keys
    const camera = this.controls.object as THREE.PerspectiveCamera

    this.velocity.x *= 1 - Math.min(1, 4 * delta)
    this.velocity.y *= 1 - Math.min(1, 2.5 * delta)
    this.velocity.z *= 1 - Math.min(1, 4 * delta)

    this.speed = Math.hypot(this.velocity.x, this.velocity.z)

    if (!this.locked) return

    this.forward.set(0, 0, -1).applyQuaternion(camera.quaternion)
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion)

    if (keys.KeyW) this.velocity.addScaledVector(this.forward, THROTTLE * delta)
    if (keys.KeyS) this.velocity.addScaledVector(this.forward, -THROTTLE * delta)
    if (keys.KeyD) this.velocity.addScaledVector(this.right, THROTTLE * delta)
    if (keys.KeyA) this.velocity.addScaledVector(this.right, -THROTTLE * delta)
    if (keys.Space || keys.KeyQ) this.velocity.y += THROTTLE * 0.7 * delta
    if (keys.ShiftLeft || keys.ShiftRight || keys.ControlLeft || keys.KeyE) this.velocity.y -= THROTTLE * 0.7 * delta

    // moveRight / moveForward already translate along the camera's local axes
    camera.updateMatrix()
    this.controls.moveRight(this.velocity.x * delta)
    this.controls.moveForward(this.velocity.z * delta)

    camera.position.y += this.velocity.y * delta
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, MIN_HEIGHT, MAX_HEIGHT)
  }
}
