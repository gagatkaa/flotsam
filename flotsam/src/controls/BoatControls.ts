import * as THREE from 'three/webgpu'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'

const THROTTLE_RATE = 3
const RUDDER_RATE = 2.6

export class BoatControls extends PointerLockControls {
  throttle = 0
  rudder = 0

  private readonly keys = new Set<string>()

  constructor(camera: THREE.Camera, domElement: HTMLElement) {
    super(camera, domElement)

    window.addEventListener('keydown', (event) => {
      // arrows steer while sailing, so they must not also scroll the page
      if (this.isLocked && event.code.startsWith('Arrow')) event.preventDefault()
      this.keys.add(event.code)
      this.keys.add(keyName(event.key))
    })
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code)
      this.keys.delete(keyName(event.key))
    })
    window.addEventListener('blur', () => this.keys.clear())

    window.addEventListener('click', (event) => {
      if (this.isLocked || !this.enabled) return
      if ((event.target as Element | null)?.closest?.('#chart, #draft, #overlay, #pause, #land')) return
      this.lock()
    })
  }

  update(delta: number) {
    const throttleTarget = this.axis(['w', 'ArrowUp'], ['s', 'ArrowDown'])
    const rudderTarget = this.axis(['d', 'ArrowRight'], ['a', 'ArrowLeft'])

    this.throttle += (throttleTarget - this.throttle) * Math.min(1, THROTTLE_RATE * delta)
    this.rudder += (rudderTarget - this.rudder) * Math.min(1, RUDDER_RATE * delta)

    if (Math.abs(this.throttle) < 0.001) this.throttle = 0
    if (Math.abs(this.rudder) < 0.001) this.rudder = 0
  }

  private axis(positive: [string, string], negative: [string, string]) {
    return Number(this.isHeld(...positive)) - Number(this.isHeld(...negative))
  }

  private isHeld(letter: string, arrow: string) {
    return this.keys.has(`Key${letter.toUpperCase()}`) || this.keys.has(letter) || this.keys.has(arrow)
  }
}

function keyName(key: string) {
  return key.length === 1 ? key.toLowerCase() : key
}
