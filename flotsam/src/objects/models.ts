import * as THREE from 'three/webgpu'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import boatUrl from './boat.fbx?url'
import islandUrl from './island.fbx?url'

// The Blender models (boat.fbx and island.fbx), loaded and fitted so the rest
// of the game can treat them as plain building blocks. Both were modelled in
// centimetres with flat colours and no textures.

const loader = new FBXLoader()

/**
 * Swap the FBX loader's Phong materials for node materials the WebGPU renderer
 * lights like everything else, keeping each one's Blender colour and the flat,
 * faceted low-poly look. Both sides are drawn, because thin parts like the sail
 * and the palm leaves are single sheets that would vanish when seen from
 * behind. `onMaterial` sees every new material.
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
 * Put the model inside an empty group. The FBX loader stores Blender's own
 * transform (its Z-up rotation and centimetre scale) on the model's root, so
 * all our fitting happens on this wrapper and never overwrites it.
 */
function wrap(model: THREE.Object3D) {
  const wrapper = new THREE.Group()
  wrapper.add(model)
  return wrapper
}

/** the bounding box of the named mesh, or of the whole model if there is none */
function boxOf(model: THREE.Object3D, meshName?: string) {
  model.updateMatrixWorld(true)
  const mesh = meshName ? model.getObjectByName(meshName) : undefined
  return new THREE.Box3().setFromObject(mesh ?? model)
}

/** the boat's length from bow to stern, in metres: the handling was tuned around it */
const BOAT_LENGTH = 4.2

/** the most forward point of the hull, in the boat's own space: the tip of the bow */
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

/**
 * The rowboat, scaled to length, pointing its bow down -Z, with the middle of
 * its hull on the origin so it sits in the water at the deck's height. Also
 * returns where the tip of the bow ends up, so the camera can line up with it.
 */
export async function loadBoat(onMaterial: (material: THREE.MeshStandardNodeMaterial) => void) {
  const model = await loader.loadAsync(boatUrl)
  useNodeMaterials(model, onMaterial)
  const boat = wrap(model)

  // she was built bow towards +X in Blender; turn her so the bow faces -Z
  boat.rotation.y = Math.PI / 2
  const length = boxOf(boat).getSize(new THREE.Vector3()).z
  boat.scale.setScalar(BOAT_LENGTH / length)

  // centre on the hull, not the whole model: the mast would pull her under
  const hull = boxOf(boat, 'Rowboat_Hull').getCenter(new THREE.Vector3())
  boat.position.sub(hull)
  return { boat, bow: bowTip(boat) }
}

/**
 * The island, fitted to a unit size: centred on the origin, 1 unit from the
 * middle to the edge of its sandy base, and the top of that base at y = 0.
 * Each island in the world is a scaled copy of this.
 */
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

  // one more group around it, so each copy can be sized and turned without
  // undoing the fitting above
  return wrap(island)
}
