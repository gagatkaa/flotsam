// Every constant and function here mirrors one in src/shaders/water/lib.wgsl.
// Change one side and the boat will no longer ride the water you can see.

const SEA_SPEED = 0.8
const SEA_FREQ = 0.16
const SEA_HEIGHT = 0.6
const ITER_GEOMETRY = 3

export const BASE_CHOPPY = 4

const fract = (v: number) => v - Math.floor(v)
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** the shader hashes in 32-bit floats, so round through f32 to land on the same value */
function hash(x: number, y: number): number {
  return fract(Math.fround(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123))
}

function noise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)

  const bottom = mix(hash(ix, iy), hash(ix + 1, iy), ux)
  const top = mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), ux)
  return -1 + 2 * mix(bottom, top, uy)
}

function seaOctave(ux: number, uz: number, choppy: number): number {
  const n = noise(ux, uz)
  const ax = ux + n
  const az = uz + n

  const wx = 1 - Math.abs(Math.sin(ax))
  const wz = 1 - Math.abs(Math.sin(az))
  const sx = mix(wx, Math.abs(Math.cos(ax)), wx)
  const sz = mix(wz, Math.abs(Math.cos(az)), wz)

  return Math.pow(1 - Math.pow(sx * sz, 0.65), choppy)
}

/** the hollow the boat drags behind her and the water she piles ahead */
function wake(x: number, z: number, sx: number, sz: number, dx: number, dz: number, speed: number): number {
  const toX = x - sx
  const toZ = z - sz

  const along = toX * dx + toZ * dz
  const across = toX * -dz + toZ * dx
  const dist = Math.hypot(toX, toZ)

  const v = Math.max(0, Math.min(1.6, speed / 8))

  // calm the water right under the hull
  const hull = Math.exp(-dist * dist * 0.1)

  // ramp the wake in over the bow and out over the stern, so there is no crease at along = 0
  const behind = smoothstep(0, 0.8, -along)
  const ahead = smoothstep(0, 0.8, along)

  const trench = -0.4 * v * Math.exp(-behind * 0.16) * Math.exp(-across * across * 0.08)
  const bow = 0.3 * v * Math.exp(-ahead * 0.2) * Math.exp(-across * across * 0.1)
  const chevron =
    0.16 * v * Math.sin(behind * 1.7 - Math.abs(across) * 2.4) * Math.exp(-behind * 0.06) * Math.exp(-Math.abs(across) * 0.22)

  return (trench + bow + chevron) * (1 - hull * 0.85)
}

/**
 * CPU mirror of the wave height field the shader raymarches. The ocean only
 * exists on the GPU, so this is how the boat, the islands and the rocks find
 * the visible surface instead of guessing a flat sea level.
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
      h += (
        seaOctave(ux * freq + s, uz * freq + s, choppy) +
        seaOctave(ux * freq - s, uz * freq - s, choppy)
      ) * amp

      // rotate the sample point between octaves so the layers do not line up
      const rx = ux * 1.6 + uz * 1.2
      const rz = ux * -1.2 + uz * 1.6
      ux = rx
      uz = rz

      freq *= 1.9
      amp *= 0.22
      choppy = mix(choppy, 1, 0.2)
    }

    return h + wake(x, z, this.shipX, this.shipZ, this.shipDirX, this.shipDirZ, this.shipSpeed)
  }
}
