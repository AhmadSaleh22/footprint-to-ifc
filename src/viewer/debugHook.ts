import * as THREE from 'three'
import type { Building, Opening } from '../core'
import { toThree } from './axes'
import type { ViewerDebug } from './debug'
import { pickWall } from './picking'

type Sources = {
  renderer: THREE.WebGLRenderer
  camera: THREE.PerspectiveCamera
  meshes: () => ReadonlyArray<THREE.Mesh>
  building: () => Building | null
  openings: () => ReadonlyArray<Opening>
  selectedId: () => string | null
}

/** Offset from the outer face, metres: far enough to be on the face's front side, near enough to stay on the wall. */
const OUTWARD = 0.05

/**
 * Builds the object behind `window.__viewer`. The projection only turns a core wall point into a pixel:
 * the point comes from `Wall.polygon` and `Wall.height`, nothing about the building is computed here.
 */
export function createDebugHook({ renderer, camera, meshes, building, openings, selectedId }: Sources): ViewerDebug {
  const raycaster = new THREE.Raycaster()
  const toPage = (ndc: THREE.Vector3) => {
    const rect = renderer.domElement.getBoundingClientRect()
    return { x: rect.left + ((ndc.x + 1) / 2) * rect.width, y: rect.top + ((1 - ndc.y) / 2) * rect.height }
  }
  return {
    geometries: () => renderer.info.memory.geometries,
    selectedId,
    cameraPosition: () => [camera.position.x, camera.position.y, camera.position.z],
    colorOf: (id) => {
      const mesh = meshes().find((m) => m.userData.id === id)
      return mesh === undefined ? '' : '#' + (mesh.material as THREE.MeshStandardMaterial).color.getHexString()
    },
    screenPoint: (id) => {
      const wall = building()?.walls.find((w) => w.id === id)
      if (wall === undefined) return null
      const [start, end] = wall.polygon
      const length = Math.hypot(end.x - start.x, end.y - start.y)
      // The ring is counter-clockwise, so outward is to the right of the edge direction.
      const outward = { x: (end.y - start.y) / length, y: -(end.x - start.x) / length }
      const point = toThree(
        { x: (start.x + end.x) / 2 + OUTWARD * outward.x, y: (start.y + end.y) / 2 + OUTWARD * outward.y },
        wall.height / 2,
      )
      camera.updateMatrixWorld()
      const ndc = point.project(camera)
      if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || ndc.z > 1) return null
      if (pickWall(meshes(), camera, ndc) !== id) return null
      return toPage(ndc)
    },
    openings: () => openings().map((o) => ({ ...o })),
    openingScreenPoint: (id) => {
      const opening = openings().find((o) => o.id === id)
      const wall = building()?.walls.find((w) => w.id === opening?.wallId)
      if (opening === undefined || wall === undefined) return null
      const [start, end] = wall.polygon
      const u = opening.offset + opening.width / 2
      const along = u / wall.length
      const centre = toThree(
        { x: start.x + along * (end.x - start.x), y: start.y + along * (end.y - start.y) },
        opening.sill + opening.height / 2,
      )
      camera.updateMatrixWorld()
      const ndc = centre.clone().project(camera)
      if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || ndc.z > 1) return null
      // Hidden only by something in front of the point. A hit beyond it is the far side seen through the hole.
      raycaster.set(camera.position, centre.clone().sub(camera.position).normalize())
      const first = raycaster.intersectObjects([...meshes()], false)[0]
      if (first !== undefined && first.distance < camera.position.distanceTo(centre) - 0.01) return null
      return toPage(ndc)
    },
  }
}
