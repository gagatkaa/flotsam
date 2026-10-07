import * as THREE from 'three/webgpu'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'

const THROTTLE_RATE = 3
const RUDDER_RATE = 2.6

/**
 * Mouse look through PointerLockControls, plus the sailing inputs: W/S for
 * throttle, A/D for rudder.
 */
export class BoatControls extends PointerLockControls {
  throttle = 0
  rudder = 0

  private readonly keys = new Set<string>()

  constructor(camera: THREE.Camera, domElement: HTMLElement) {
    super(camera, domElement)

    // track the physical key (event.code) and the letter it types (event.key):
    // a remapped keyboard or one that reports a wrong scan code still steers
    window.addEventListener('keydown', (event) => {
      this.keys.add(event.code)
      this.keys.add(keyName(event.key))
    })
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code)
      this.keys.delete(keyName(event.key))
    })
    window.addEventListener('blur', () => this.keys.clear())

    // listen on window, not the canvas: the HUD overlay covers the canvas.
    // Ignore clicks that land inside a panel, or picking an island would
    // immediately lock the pointer away from the player.
    window.addEventListener('click', (event) => {
      if (this.isLocked) return
      if ((event.target as HTMLElement).closest('#chart, #draft, #overlay, #pause, #land')) return
      this.lock()
    })
  }

  update(delta: number) {
    const keys = this.keys
    const throttleTarget = (keys.has('KeyW') || keys.has('w') ? 1 : 0) - (keys.has('KeyS') || keys.has('s') ? 1 : 0)
    const rudderTarget = (keys.has('KeyA') || keys.has('a') ? 1 : 0) - (keys.has('KeyD') || keys.has('d') ? 1 : 0)

    this.throttle += (throttleTarget - this.throttle) * Math.min(1, THROTTLE_RATE * delta)
    this.rudder += (rudderTarget - this.rudder) * Math.min(1, RUDDER_RATE * delta)

    if (Math.abs(this.throttle) < 0.001) this.throttle = 0
    if (Math.abs(this.rudder) < 0.001) this.rudder = 0
  }
}

/** single characters as lowercase, so Caps Lock and layout never matter */
function keyName(key: string) {
  return key.length === 1 ? key.toLowerCase() : key
}