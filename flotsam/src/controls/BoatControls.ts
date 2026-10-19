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
    const throttleTarget = this.axis('w', 's')
    const rudderTarget = this.axis('d', 'a')

    this.throttle += (throttleTarget - this.throttle) * Math.min(1, THROTTLE_RATE * delta)
    this.rudder += (rudderTarget - this.rudder) * Math.min(1, RUDDER_RATE * delta)

    if (Math.abs(this.throttle) < 0.001) this.throttle = 0
    if (Math.abs(this.rudder) < 0.001) this.rudder = 0
  }

  private axis(positive: string, negative: string) {
    return Number(this.isHeld(positive)) - Number(this.isHeld(negative))
  }

  private isHeld(letter: string) {
    return this.keys.has(`Key${letter.toUpperCase()}`) || this.keys.has(letter)
  }
}

function keyName(key: string) {
  return key.length === 1 ? key.toLowerCase() : key
}
