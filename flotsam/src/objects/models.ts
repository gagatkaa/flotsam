import * as THREE from 'three/webgpu'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import boatUrl from './boat.fbx?url'
import islandUrl from './island.fbx?url'

const loader = new FBXLoader()

/**
 * Swap the FBX loader's Phong materials for node materials the WebGPU renderer
 * can light. Double-sided, because the sail and palm leaves are single sheets.
 */
function useNodeMaterials(model: THREE.Object3D, onMaterial?: (material: THREE.MeshStandardNodeMaterial) => void) {
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const sources = Array.isArray(child.material) ? child.material : [child.material]
    const materials = sources.map((source) => {
      const material = new THREE.MeshStandardNodeMaterial({
        color: (source as THREE.MeshPhongMaterial).color.clone(),
        roughness: 0.8,
        flatShading: true,
        side: THREE.DoubleSide,
      })
      onMaterial?.(material)
      return material
    })
    child.material = Array.isArray(child.material) ? materials : materials[0]
  })
}

/**
 * The FBX root carries Blender's Z-up rotation and centimetre scale, so all
 * fitting happens on a wrapper group instead of overwriting it.
 */
function wrap(model: THREE.Object3D) {
  const wrapper = new THREE.Group()
  wrapper.add(model)
  return wrapper
}

function boxOf(model: THREE.Object3D, meshName?: string) {
  model.updateMatrixWorld(true)
  const mesh = meshName ? model.getObjectByName(meshName) : undefined
  return new THREE.Box3().setFromObject(mesh ?? model)
}

/** in metres; the handling was tuned around it */
const BOAT_LENGTH = 4.2

/** the most forward point of the hull, in the boat's own space */
function bowTip(boat: THREE.Object3D) {
  boat.updateMatrixWorld(true)
  const hull = boat.getObjectByName('Rowboat_Hull') as THREE.Mesh
  const positions = hull.geometry.attributes.position
  const point = new THREE.Vector3()
  const tip = new THREE.Vector3(0, 0, Infinity)
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(hull.matrixWorld)
    if (point.z < tip.z) tip.copy(point)
  }
  return tip
}

/** the rowboat scaled to length, bow down -Z, hull centred on the origin */
export async function loadBoat(onMaterial: (material: THREE.MeshStandardNodeMaterial) => void) {
  const model = await loader.loadAsync(boatUrl)
  useNodeMaterials(model, onMaterial)
  const boat = wrap(model)

  // modelled bow towards +X
  boat.rotation.y = Math.PI / 2
  const length = boxOf(boat).getSize(new THREE.Vector3()).z
  boat.scale.setScalar(BOAT_LENGTH / length)

  // centre on the hull, not the whole model: the mast would pull her under
  const hull = boxOf(boat, 'Rowboat_Hull').getCenter(new THREE.Vector3())
  boat.position.sub(hull)
  return { boat, bow: bowTip(boat) }
}

/** the island fitted to unit radius, centred, with the top of its sandy base at y = 0 */
export async function loadIsland() {
  const model = await loader.loadAsync(islandUrl)
  useNodeMaterials(model)
  const island = wrap(model)

  const base = boxOf(island, 'Island_Base')
  const size = base.getSize(new THREE.Vector3())
  const centre = base.getCenter(new THREE.Vector3())

  const scale = 2 / Math.max(size.x, size.z)
  island.scale.setScalar(scale)
  island.position.set(-centre.x, -base.max.y, -centre.z).multiplyScalar(scale)

  // one more wrapper, so each copy can be sized and turned without undoing the fit
  return wrap(island)
}
