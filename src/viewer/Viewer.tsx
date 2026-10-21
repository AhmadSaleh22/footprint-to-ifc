import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { frameBuilding } from './camera'
import { createDebugHook } from './debugHook'
import { buildWallMeshes, disposeMeshes, setHighlight } from './meshes'
import { pickWall } from './picking'
import { useBuildingStore, useBuildingStoreApi } from './StoreContext'

/** Pointer movement beyond this many CSS pixels between pointerdown and pointerup is an orbit drag, not a click. */
const CLICK_TOLERANCE = 5

type SceneState = {
  scene: THREE.Scene
  meshes: THREE.Mesh[]
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  framed: boolean
}

/**
 * The 3D view. Owns the renderer, scene, camera, controls, grid, lights and render loop. The grid and lights are
 * created once; when the building changes only the wall meshes are replaced, and the old ones are disposed.
 */
export function Viewer() {
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<SceneState | null>(null)
  const storeApi = useBuildingStoreApi()
  const building = useBuildingStore((s) => s.building)
  const selectedId = useBuildingStore((s) => s.selectedId)

  // Everything that exists once: renderer, scene, camera, controls, grid, lights, listeners, render loop.
  useEffect(() => {
    const container = containerRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    const canvas = renderer.domElement
    container.appendChild(canvas)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#f4f4f2')
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    const controls = new OrbitControls(camera, canvas)
    const grid = new THREE.GridHelper(200, 200, '#999999', '#d0d0d0')
    const ambient = new THREE.HemisphereLight('#ffffff', '#8a8a8a', 1.2)
    const sun = new THREE.DirectionalLight('#ffffff', 2)
    sun.position.set(-30, 60, 40)
    scene.add(grid, ambient, sun)
    const state: SceneState = { scene, meshes: [], camera, controls, framed: false }
    stateRef.current = state

    const resize = () => {
      const width = Math.max(1, container.clientWidth)
      const height = Math.max(1, container.clientHeight)
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    let down: { x: number; y: number } | null = null
    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 0) down = { x: event.clientX, y: event.clientY }
    }
    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== 0 || down === null) return
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y)
      down = null
      if (moved > CLICK_TOLERANCE) return
      const rect = canvas.getBoundingClientRect()
      const ndc = {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -(((event.clientY - rect.top) / rect.height) * 2 - 1),
      }
      camera.updateMatrixWorld()
      storeApi.getState().select(pickWall(state.meshes, camera, ndc))
    }
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointerup', onPointerUp)

    const debug = new URLSearchParams(window.location.search).get('debug') === '1'
    let hookSet = false
    renderer.setAnimationLoop(() => {
      controls.update()
      renderer.render(scene, camera)
      if (debug && !hookSet && state.meshes.length > 0) {
        hookSet = true
        window.__viewer = createDebugHook({
          renderer,
          camera,
          meshes: () => state.meshes,
          building: () => storeApi.getState().building,
          selectedId: () => storeApi.getState().selectedId,
        })
      }
    })

    return () => {
      renderer.setAnimationLoop(null)
      if (hookSet) delete window.__viewer
      observer.disconnect()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      grid.geometry.dispose()
      ;(grid.material as THREE.Material).dispose()
      ambient.dispose()
      sun.dispose()
      renderer.dispose()
      canvas.remove()
      stateRef.current = null
    }
  }, [storeApi])

  // The wall meshes: replaced whenever the building changes. The camera is framed on the first building only.
  useEffect(() => {
    const state = stateRef.current!
    const meshes = building === null ? [] : buildWallMeshes(building)
    meshes.forEach((mesh) => state.scene.add(mesh))
    state.meshes = meshes
    if (building !== null && !state.framed) {
      state.controls.target.copy(frameBuilding(state.camera, building))
      state.controls.update()
      state.framed = true
    }
    return () => {
      meshes.forEach((mesh) => state.scene.remove(mesh))
      disposeMeshes(meshes)
    }
  }, [building, storeApi])

  // The highlight follows the selection, and is applied again to freshly built meshes.
  useEffect(() => {
    const state = stateRef.current
    if (state !== null) setHighlight(state.meshes, selectedId)
  }, [building, selectedId])

  return <div ref={containerRef} className="viewer" />
}
