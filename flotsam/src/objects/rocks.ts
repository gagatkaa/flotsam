import * as THREE from 'three/webgpu'
import { color, mix, positionWorld, smoothstep, uniform, vertexColor } from 'three/tsl'

/** how high the foam runs up the stone above the water, in metres */
const FOAM = 0.22

/** metres above the average sea that stay wet and dark, and then green with weed */
const WET_LINE = 0.15
const WEED_LINE = 0.5

const STONE = [0x8a8378, 0x7d776d, 0x938b7f, 0x726c63].map((hex) => new THREE.Color(hex))
const WET = new THREE.Color(0x34332f)
const WEED = new THREE.Color(0x4b5236)
const SALT = new THREE.Color(0xcdc8bb)

export interface Rock {
  group: THREE.Group
  /** the sea level around it, kept current by the loop */
  water: { value: number }
}

/** two to four boulders, all inside `radius`, the rock's collision footprint */
export function makeRock(radius: number, random: () => number): Rock {
  const water = uniform(0)
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, flatShading: true })

  // clip the stone at the moving waterline with a lick of foam; fading it into a
  // dark under-sea colour instead reads as a shadow, as if the rock were hovering
  const above = positionWorld.y.sub(water)
  const foam = smoothstep(FOAM, 0, above).mul(0.6)
  material.colorNode = mix(vertexColor(), color(0xeef4f5), foam)
  material.maskNode = above.greaterThan(0)

  const group = new THREE.Group()
  const count = 2 + Math.floor(random() * 3)
  for (let i = 0; i < count; i++) {
    const main = i === 0
    const size = radius * (main ? 0.55 + random() * 0.2 : 0.22 + random() * 0.2)
    const lift = size * (main ? 0.25 + random() * 0.2 : -0.1 + random() * 0.25)
    const boulder = new THREE.Mesh(makeBoulder(size, lift, main ? 2 : 1, random), material)
    boulder.position.y = lift

    if (!main) {
      const angle = random() * Math.PI * 2
      const out = radius * (0.45 + random() * 0.3)
      boulder.position.x = Math.cos(angle) * out
      boulder.position.z = Math.sin(angle) * out
    }
    boulder.rotation.y = random() * Math.PI * 2
    group.add(boulder)
  }

  return { group, water }
}

/**
 * A lumpy, squat ball about `size` metres in radius whose middle sits `lift`
 * metres above the average sea. The geometry is unindexed, so every face keeps
 * its own flat colour.
 */
function makeBoulder(size: number, lift: number, detail: number, random: () => number) {
  const geometry = new THREE.IcosahedronGeometry(1, detail)
  const position = geometry.attributes.position

  const lumps = Array.from({ length: 6 }, () => ({
    dir: new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize(),
    push: (random() - 0.45) * 0.55,
    width: 2 + random() * 4,
  }))
  const tall = 0.75 + random() * 0.4
  const shelf = 0.5 + random() * 0.3
  const grit = random() * 100

  const point = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i)

    // a corner appears once per face that shares it, so every push must depend
    // only on where the corner is, or the faces would tear apart
    let reach = 1
    for (const lump of lumps) reach += lump.push * Math.exp(-lump.width * (1 - point.dot(lump.dir)))
    reach += Math.sin(point.x * 7.1 + grit) * Math.sin(point.y * 6.3 - grit) * Math.sin(point.z * 5.7 + grit) * 0.09

    point.multiplyScalar(reach)
    // flare the foot so the sides run down into the water instead of curling under
    if (point.y < 0) {
      const flare = 1 - point.y * 0.45
      point.x *= flare
      point.z *= flare
    }
    point.y *= tall
    const crown = shelf * tall
    if (point.y > crown) point.y = crown + (point.y - crown) * 0.35

    position.setXYZ(i, point.x * size, point.y * size, point.z * size)
  }

  geometry.computeVertexNormals()
  paint(geometry, lift, random)
  return geometry
}

/** colour every face by its height above the sea and which way it faces */
function paint(geometry: THREE.BufferGeometry, lift: number, random: () => number) {
  const position = geometry.attributes.position
  const normal = geometry.attributes.normal
  const colors = new Float32Array(position.count * 3)
  const stone = STONE[Math.floor(random() * STONE.length)]
  const shade = new THREE.Color()

  for (let face = 0; face < position.count; face += 3) {
    const height = lift + (position.getY(face) + position.getY(face + 1) + position.getY(face + 2)) / 3
    const up = normal.getY(face)

    shade.copy(stone).multiplyScalar(0.88 + random() * 0.24)

    if (height < WET_LINE) shade.lerp(WET, 0.7)
    else if (height < WEED_LINE) shade.lerp(WEED, 0.55)
    else if (up > 0.7 && random() < 0.45) shade.lerp(SALT, 0.55 + random() * 0.3)

    for (let v = 0; v < 3; v++) shade.toArray(colors, (face + v) * 3)
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}
