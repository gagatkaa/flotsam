import * as THREE from 'three/webgpu'
import { CHART_PIECES } from './world'

// The voyage runs from noon to sunset. Every piece of the map brings the clock
// on, so the sun sinks and the light warms as the chart fills in, and the last
// piece leaves her sailing into the sunset.

/** the sun's height above the horizon, in degrees: at noon, and as it sets */
const NOON_ELEVATION = 55
const SUNSET_ELEVATION = 3

/**
 * Which way the sun lies across the water. It keeps the same bearing all day,
 * so the sunset is where the afternoon sun has been all along.
 */
const SUN_AZIMUTH = Math.atan2(-2, -1)

/** how quickly the sky catches up with a new piece: a few seconds, not a jump */
const CATCH_UP = 0.35

/** the boat heading that points her bow at the sun */
export const SUN_YAW = Math.atan2(-Math.sin(SUN_AZIMUTH), -Math.cos(SUN_AZIMUTH))

/** each colour at noon and at sunset */
const SUN_LIGHT = [new THREE.Color(0xfff2d8), new THREE.Color(0xff9a55)]
const SKY_LIGHT = [new THREE.Color(0xbfe3ff), new THREE.Color(0xffb08a)]
const GROUND_LIGHT = [new THREE.Color(0x1d4a63), new THREE.Color(0x2c2440)]
const HAZE = [new THREE.Color(0x9fc4dd), new THREE.Color(0xd99a7a)]

export class Daylight {
  /** how far through the afternoon: 0 at noon, 1 at sunset */
  hour = 0
  /** towards the sun */
  readonly direction = new THREE.Vector3()
  readonly sunColor = new THREE.Color()
  readonly skyColor = new THREE.Color()
  readonly groundColor = new THREE.Color()
  readonly hazeColor = new THREE.Color()
  sunIntensity = 0
  skyIntensity = 0

  constructor() {
    this.apply()
  }

  /** move the clock towards the time the map says it is */
  update(delta: number, pieces: number) {
    const target = Math.min(1, pieces / CHART_PIECES)
    this.hour += (target - this.hour) * Math.min(1, CATCH_UP * delta)
    this.apply()
  }

  private apply() {
    const t = this.hour
    const elevation = THREE.MathUtils.lerp(NOON_ELEVATION, SUNSET_ELEVATION, t)
    this.direction.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevation), SUN_AZIMUTH)

    // the colours hold on through the afternoon and turn fast near the end
    const warm = t * t
    this.sunColor.lerpColors(SUN_LIGHT[0], SUN_LIGHT[1], warm)
    this.skyColor.lerpColors(SKY_LIGHT[0], SKY_LIGHT[1], warm)
    this.groundColor.lerpColors(GROUND_LIGHT[0], GROUND_LIGHT[1], warm)
    this.hazeColor.lerpColors(HAZE[0], HAZE[1], warm)
    this.sunIntensity = THREE.MathUtils.lerp(2.4, 1.7, warm)
    this.skyIntensity = THREE.MathUtils.lerp(1.1, 0.75, warm)
  }
}
