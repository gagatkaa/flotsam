import * as THREE from 'three/webgpu'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import boatUrl from './boat.fbx?url'
import islandUrl from './island.fbx?url'

const loader = new FBXLoader()


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


const BOAT_LENGTH = 4.2


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


export async function loadBoat(onMaterial: (material: THREE.MeshStandardNodeMaterial) => void) {
  const file = await loader.loadAsync(boatUrl)
  const model = file.getObjectByName('Rowboat') ?? file
  model.removeFromParent()
  useNodeMaterials(model, onMaterial)
  const boat = wrap(model)

  boat.rotation.y = Math.PI / 2
  const length = boxOf(boat).getSize(new THREE.Vector3()).z
  boat.scale.setScalar(BOAT_LENGTH / length)


  const hull = boxOf(boat, 'Rowboat_Hull').getCenter(new THREE.Vector3())
  boat.position.sub(hull)
  return { boat, bow: bowTip(boat) }
}


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


  return wrap(island)
}
