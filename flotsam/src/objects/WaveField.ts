import * as THREE from 'three/webgpu'

const SEA_SPEED = 0.8
const SEA_FREQ = 0.16
const SEA_HEIGHT = 0.6
const ITER_GEOMETRY = 3

export const BASE_CHOPPY = 4

const fract = (v: number) => v - Math.floor(v)
const fr = Math.fround

function hash(x: number, y: number): number {
  return fract(fr(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123))
}

function noise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)

  const a = hash(ix, iy)
  const b = hash(ix + 1, iy)
  const c = hash(ix, iy + 1)
  const d = hash(ix + 1, iy + 1)

  return -1 + 2 * (a + (b - a) * ux + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy)
}

function seaOctave(ux: number, uz: number, choppy: number): number {
  const n = noise(ux, uz)
  const ax = ux + n
  const az = uz + n

  let wx = 1 - Math.abs(Math.sin(ax))
  let wz = 1 - Math.abs(Math.sin(az))
  const cx = Math.abs(Math.cos(ax))
  const cz = Math.abs(Math.cos(az))
  wx += (cx - wx) * wx
  wz += (cz - wz) * wz

  return Math.pow(1 - Math.pow(wx * wz, 0.65), choppy)
}

/**
 * The boat's contribution to the surface height, mirroring the `wake()`
 * function in src/shaders/water/lib.wgsl so the hull rides the same dent it
 * carves into the visible sea.
 */
function wake(x: number, z: number, sx: number, sz: number, dx: number, dz: number, speed: number): number {
  const toX = x - sx
  const toZ = z - sz

  const along = toX * dx + toZ * dz
  const perpX = -dz
  const perpZ = dx
  const across = toX * perpX + toZ * perpZ
  const dist = Math.hypot(toX, toZ)

  const v = Math.max(0, Math.min(1.6, speed / 8))

  const hull = Math.exp(-dist * dist * 0.1)

  // mirror of WGSL smoothstep(0, 0.8, x): ramp the wake in over the bow and out
  // over the stern so the trench/bow seam at along=0 does not read as a crease
  const ramp = (v: number) => {
    const t = Math.max(0, Math.min(1, v / 0.8))
    return t * t * (3 - 2 * t)
  }
  const behind = ramp(-along)
  const ahead = ramp(along)

  const trench = -0.4 * v * Math.exp(-behind * 0.16) * Math.exp(-across * across * 0.08)
  const bow = 0.3 * v * Math.exp(-ahead * 0.2) * Math.exp(-across * across * 0.1)
  const chevron =
    0.16 * v * Math.sin(behind * 1.7 - Math.abs(across) * 2.4) * Math.exp(-behind * 0.06) * Math.exp(-Math.abs(across) * 0.22)

  return (trench + bow + chevron) * (1 - hull * 0.85)
}

/**
 * CPU mirror of the wave height field in src/shaders/water/lib.wgsl.
 * The GPU marches this exact function for the pixels, so the boat and the debris can
 * be placed on the visible surface instead of guessing a flat sea level.
 */
export class WaveField {
  /** must match the iTime uniform fed to the shader */
  time = 0
  /** must match the choppy uniform fed to the shader */
  choppy: number = BASE_CHOPPY

  /** the boat's wake, kept in sync with uShipPos / uShipDir / uShipSpeed */
  shipX = 0
  shipZ = 0
  shipDirX = 0
  shipDirZ = -1
  shipSpeed = 0

  private readonly scratch = new THREE.Vector3()

  height(x: number, z: number): number {
    const seaTime = 1 + this.time * SEA_SPEED

    let freq = SEA_FREQ
    let amp = SEA_HEIGHT
    let choppy = this.choppy
    let ux = x * 0.75
    let uz = z
    let h = 0

    for (let i = 0; i < ITER_GEOMETRY; i++) {
      const s = seaTime * freq
      const c = freq

      h += (
        seaOctave(ux * c + s, uz * c + s, choppy) +
        seaOctave(ux * c - s, uz * c - s, choppy)
      ) * amp

      const rx = ux * 1.6 + uz * 1.2
      const rz = ux * -1.2 + uz * 1.6
      ux = rx
      uz = rz

      freq *= 1.9
      amp *= 0.22
      choppy += (1 - choppy) * 0.2
    }

    return h + wake(x, z, this.shipX, this.shipZ, this.shipDirX, this.shipDirZ, this.shipSpeed)
  }

  /** surface normal from central differences */
  normal(x: number, z: number, target = this.scratch): THREE.Vector3 {
    const e = 0.35
    const dx = this.height(x + e, z) - this.height(x - e, z)
    const dz = this.height(x, z + e) - this.height(x, z - e)

    return target.set(-dx, 2 * e, -dz).normalize()
  }
}
