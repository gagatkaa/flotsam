import './style.css'
import * as THREE from 'three/webgpu'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { wgslFn, uniform, vec2, vec3, vec4, float } from 'three/tsl'

import waterFragment from './shaders/water/fragment.wgsl?raw'

const canvas = document.createElement('canvas')
canvas.id = 'webgl'
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas)

const renderer = new THREE.WebGPURenderer({ canvas, alpha: false })
await renderer.init()

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x061826)

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.set(0, 10, 30)

const controls = new PointerLockControls(camera, canvas)

let prevTime = 0

const keys: Record<string, boolean> = {}
const velocity = new THREE.Vector3()
const direction = new THREE.Vector3()

let moveForward = false
let moveBackward = false
let moveLeft = false
let moveRight = false
let canJump = false

const mouse = new THREE.Vector4(0, 0, 0, 0)

// Water shader using TSL
const waterFn = wgslFn(waterFragment, { name: 'waterMain' })

const iTime = uniform(0)
const iResolution = uniform(new THREE.Vector2())
const iMouseUniform = uniform(mouse)
const cameraPos = uniform(new THREE.Vector3())
const worldPos = uniform(new THREE.Vector3())

const waterGeometry = new THREE.PlaneGeometry(200, 200, 128, 128)
const waterMaterial = new THREE.MeshBasicNodeMaterial({
  colorNode: waterFn(vec2(new THREE.Vector2()), iResolution, iTime, iMouseUniform, cameraPos, worldPos),
  transparent: true
})
const water = new THREE.Mesh(waterGeometry, waterMaterial)
water.rotation.x = -Math.PI / 2
water.position.y = 0
scene.add(water)

// Seafloor
const floorGeometry = new THREE.PlaneGeometry(200, 200, 50, 50)
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x2d3826, roughness: 0.9 })
const floor = new THREE.Mesh(floorGeometry, floorMaterial)
floor.rotation.x = -Math.PI / 2
floor.position.y = -15
scene.add(floor)

// Directional light
const light = new THREE.DirectionalLight(0xffffff, 1.2)
light.position.set(50, 80, 30)
scene.add(light)
scene.add(new THREE.AmbientLight(0x304d75, 0.5))

// Sky dome
const skyGeometry = new THREE.SphereGeometry(600, 32, 16)
const skyMaterial = new THREE.MeshBasicMaterial({ color: 0x0a1e3d, side: THREE.BackSide })
const sky = new THREE.Mesh(skyGeometry, skyMaterial)
scene.add(sky)

// Simple floating boxes as flotsam (physics-free for MVP, can add cannon-es later)
const flotsamGroup = new THREE.Group()
for (let i = 0; i < 10; i++) {
  const size = 1 + Math.random() * 2
  const geo = new THREE.BoxGeometry(size, 0.2, size)
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.05, 0.5, 0.4) })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set((Math.random() - 0.5) * 80, -0.5 + Math.random() * 2, (Math.random() - 0.5) * 80)
  mesh.rotation.y = Math.random() * Math.PI
  mesh.userData.floatSpeed = 0.2 + Math.random() * 0.3
  mesh.userData.floatOffset = Math.random() * Math.PI * 2
  flotsamGroup.add(mesh)
}
scene.add(flotsamGroup)

function initControls() {
  canvas.addEventListener('click', () => {
    controls.lock()
  })

  controls.addEventListener('lock', () => {})
  controls.addEventListener('unlock', () => {})

  document.addEventListener('keydown', (e) => {
    keys[e.code] = true
    switch (e.code) {
      case 'KeyW': moveForward = true; break
      case 'KeyA': moveLeft = true; break
      case 'KeyS': moveBackward = true; break
      case 'KeyD': moveRight = true; break
      case 'Space':
        velocity.y += 15
        break
      case 'ShiftLeft':
      case 'ControlLeft':
        velocity.y -= 15
        break
    }
  })

  document.addEventListener('keyup', (e) => {
    keys[e.code] = false
    switch (e.code) {
      case 'KeyW': moveForward = false; break
      case 'KeyA': moveLeft = false; break
      case 'KeyS': moveBackward = false; break
      case 'KeyD': moveRight = false; break
    }
  })

  canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX
    mouse.y = e.clientY
    mouse.z = e.movementX || 0
    mouse.w = e.movementY || 0
  })
}

function updateMovement(delta: number) {
  if (controls.isLocked) {
    velocity.x -= velocity.x * 8.0 * delta
    velocity.z -= velocity.z * 8.0 * delta
    velocity.y -= velocity.y * 4.0 * delta

    direction.z = Number(moveForward) - Number(moveBackward)
    direction.x = Number(moveRight) - Number(moveLeft)
    direction.normalize()

    const speed = 25.0

    if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta
    if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta

    controls.moveRight(-velocity.x * delta)
    controls.moveForward(-velocity.z * delta)
    camera.position.y += velocity.y * delta

    if (camera.position.y < -12) camera.position.y = -12
    if (camera.position.y > 80) camera.position.y = 80
  }
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio, 2)
  renderer.setSize(window.innerWidth * dpr, window.innerHeight * dpr, false)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  iResolution.value.set(window.innerWidth * dpr, window.innerHeight * dpr)
}

window.addEventListener('resize', resize)
resize()
initControls()

function animate() {
  const time = performance.now()
  const delta = Math.min((time - prevTime) / 1000, 0.016)
  prevTime = time

  const elapsed = time * 0.001
  iTime.value = elapsed
  cameraPos.value.copy(camera.position)
  worldPos.value.copy(water.position)

  flotsamGroup.children.forEach((obj: any) => {
    obj.position.y += Math.sin(elapsed + obj.userData.floatOffset) * 0.01 * obj.userData.floatSpeed
    obj.rotation.y += 0.001 * obj.userData.floatSpeed
  })

  updateMovement(delta)
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

prevTime = performance.now()
animate()
