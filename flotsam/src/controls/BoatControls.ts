import * as THREE from 'three/webgpu'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'

/**
 * Look with the mouse, drive with the keyboard.
 * Throttle and rudder are smoothed here so the boat feels like it has mass.
 */
export class BoatControls {
  readonly controls: PointerLockControls

  throttle: number
  rudder: number

  private readonly keys: Record<string, boolean> = {}

  constructor(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
    this.throttle = 0
    this.rudder = 0
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
    const smooth = 1 - Math.min(1, 4 * delta)

    const targetThrottle =
      (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0)
    const targetRudder =
      (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0)

    this.throttle += (targetThrottle - this.throttle) * smooth
    this.rudder += (targetRudder - this.rudder) * smooth

    if (!this.locked) {
      this.throttle *= smooth
      this.rudder *= smooth
    }
  }
}
