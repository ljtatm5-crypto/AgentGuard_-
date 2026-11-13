import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { useReducedMotion } from 'motion/react'

export default function WelcomeScene() {
  const host = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    const element = host.current
    if (!element) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    } catch {
      element.dataset.webgl = 'unavailable'
      return
    }

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    camera.position.set(0, 0.05, 6.8)

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    element.appendChild(renderer.domElement)

    const pmrem = new THREE.PMREMGenerator(renderer)
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = environment

    const ambient = new THREE.AmbientLight(0xdde9ff, 1.65)
    const key = new THREE.DirectionalLight(0xffffff, 4.6)
    key.position.set(3.5, 4.5, 5)
    const rim = new THREE.PointLight(0x8fc9ff, 28, 14, 2)
    rim.position.set(-4, 1.8, -2)
    const warm = new THREE.PointLight(0xffd9b3, 13, 12, 2)
    warm.position.set(3.8, -2.6, 2.4)
    scene.add(ambient, key, rim, warm)

    const sculpture = new THREE.Group()
    sculpture.rotation.set(0.18, -0.2, -0.08)
    scene.add(sculpture)

    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xdce9ff,
      metalness: 0.08,
      roughness: 0.075,
      transmission: 0.94,
      thickness: 1.55,
      ior: 1.46,
      clearcoat: 1,
      clearcoatRoughness: 0.035,
      transparent: true,
      opacity: 0.96,
      envMapIntensity: 1.35,
    })
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.31, 0.31, 240, 40, 2, 3), glass)
    knot.rotation.z = 0.28
    sculpture.add(knot)

    const chrome = new THREE.MeshPhysicalMaterial({
      color: 0xf8fbff,
      metalness: 1,
      roughness: 0.14,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.4,
    })
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.53, 5), chrome)
    core.rotation.set(0.4, -0.3, 0.2)
    sculpture.add(core)

    const ringMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xeef6ff,
      metalness: 0.9,
      roughness: 0.16,
      transparent: true,
      opacity: 0.66,
      envMapIntensity: 1.2,
    })
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.82, 0.012, 10, 220), ringMaterial)
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(2.06, 0.008, 8, 220), ringMaterial.clone())
    ringA.rotation.set(1.08, 0.3, 0.5)
    ringB.rotation.set(1.35, -0.4, -0.24)
    sculpture.add(ringA, ringB)

    const particleGeometry = new THREE.BufferGeometry()
    const positions = new Float32Array(180 * 3)
    for (let index = 0; index < 180; index += 1) {
      const radius = 2.35 + Math.random() * 2.4
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      positions[index * 3 + 2] = radius * Math.cos(phi)
    }
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({ color: 0xd9ecff, size: 0.018, transparent: true, opacity: 0.58, depthWrite: false }),
    )
    scene.add(particles)

    let targetX = 0
    let targetY = 0
    let currentX = 0
    let currentY = 0
    const onPointerMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2
      targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })

    const resize = () => {
      const width = element.clientWidth
      const height = element.clientHeight
      if (!width || !height) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()

    let frame = 0
    const clock = new THREE.Clock()
    const animate = () => {
      frame = requestAnimationFrame(animate)
      const elapsed = clock.getElapsedTime()
      currentX += (targetX - currentX) * 0.045
      currentY += (targetY - currentY) * 0.045
      const motionScale = reduce ? 0 : 1
      sculpture.rotation.y = -0.2 + currentX * 0.18 + elapsed * 0.075 * motionScale
      sculpture.rotation.x = 0.18 + currentY * 0.13 + Math.sin(elapsed * 0.45) * 0.035 * motionScale
      core.rotation.y += 0.003 * motionScale
      core.rotation.x += 0.0015 * motionScale
      ringA.rotation.z = 0.5 + elapsed * 0.055 * motionScale
      ringB.rotation.z = -0.24 - elapsed * 0.045 * motionScale
      particles.rotation.y = elapsed * 0.012 * motionScale
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => material.dispose())
        }
      })
      environment.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [reduce])

  return <div className="welcome-scene" ref={host} aria-hidden="true" />
}