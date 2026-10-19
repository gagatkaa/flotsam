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
      if (this.isLocked || !this.enabled) return
      if ((event.target as HTMLElement).closest('#chart, #draft, #overlay, #pause, #land')) return
      this.lock()
    })
  }

  update(delta: number) {
    const throttleTarget = this.axis('w', 's')
    // positive rudder swings the bow to starboard (right)
    const rudderTarget = this.axis('d', 'a')

    this.throttle += (throttleTarget - this.throttle) * Math.min(1, THROTTLE_RATE * delta)
    this.rudder += (rudderTarget - this.rudder) * Math.min(1, RUDDER_RATE * delta)

    if (Math.abs(this.throttle) < 0.001) this.throttle = 0
    if (Math.abs(this.rudder) < 0.001) this.rudder = 0
  }

  /** +1 while the positive letter is held, -1 for the negative one, 0 for both or neither */
  private axis(positive: string, negative: string) {
    return Number(this.isHeld(positive)) - Number(this.isHeld(negative))
  }

  /** a letter key is held if either its physical key or the letter it types is down */
  private isHeld(letter: string) {
    return this.keys.has(`Key${letter.toUpperCase()}`) || this.keys.has(letter)
  }
}

/** single characters as lowercase, so Caps Lock and layout never matter */
function keyName(key: string) {
  return key.length === 1 ? key.toLowerCase() : key
}