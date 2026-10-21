import * as THREE from 'three'
import type { Building, Opening, Wall } from '../core'
import { toThree } from './axes'
import { openedWallGeometry } from './wallFaces'

export const WALL_COLOR = '#d9d4c7'
export const HIGHLIGHT_COLOR = '#e07a2f'

/**
 * A closed prism for one wall: its plan polygon extruded from z = 0 to z = `wall.height`. Bottom, top and four sides
 * as 12 non-indexed triangles, each counter-clockwise seen from outside, so its normal points outward. With openings
 * on the wall, the outer and inner faces get one rectangular through-hole per opening, lined by four reveal faces
 * (see `openedWallGeometry`); with none, the result is exactly this plain prism.
 * @param wall A wall from core. Polygon in metres, core frame, counter-clockwise from above.
 * @param openings Valid openings; only those with `wallId === wall.id` are used. Default none.
 * @returns A geometry in metres, Three.js frame (positions are Float32, as WebGL requires).
 */
export function wallGeometry(wall: Wall, openings: ReadonlyArray<Opening> = []): THREE.BufferGeometry {
  const own = openings.filter((opening) => opening.wallId === wall.id)
  if (own.length > 0) return openedWallGeometry(wall, own)
  const bottom = wall.polygon.map((p) => toThree(p, 0))
  const top = wall.polygon.map((p) => toThree(p, wall.height))
  const corners: THREE.Vector3[] = []
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => corners.push(a, b, c, a, c, d)
  quad(top[0]!, top[1]!, top[2]!, top[3]!)
  quad(bottom[0]!, bottom[3]!, bottom[2]!, bottom[1]!)
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    quad(bottom[i]!, bottom[j]!, top[j]!, top[i]!)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap((v) => [v.x, v.y, v.z]), 3))
  geometry.computeVertexNormals()
  return geometry
}

/**
 * One mesh per wall, with `userData.id = wall.id` and its own material. Materials are never shared.
 * @param building A building from core. Metres, core frame.
 * @param openings Valid openings on the building. Default none.
 * @returns Meshes in metres, Three.js frame, in wall order.
 */
export function buildWallMeshes(building: Building, openings: ReadonlyArray<Opening> = []): THREE.Mesh[] {
  return building.walls.map((wall) => {
    const mesh = new THREE.Mesh(
      wallGeometry(wall, openings),
      new THREE.MeshStandardMaterial({ color: WALL_COLOR, side: THREE.FrontSide }),
    )
    mesh.userData.id = wall.id
    return mesh
  })
}

/**
 * Colours the mesh with the given id with the highlight colour and every other mesh with the wall colour.
 * Changes colours only: nothing is created.
 * @param meshes Meshes made by `buildWallMeshes`.
 * @param id The selected wall id, or null for no highlight.
 */
export function setHighlight(meshes: ReadonlyArray<THREE.Mesh>, id: string | null): void {
  for (const mesh of meshes) {
    ;(mesh.material as THREE.MeshStandardMaterial).color.set(mesh.userData.id === id ? HIGHLIGHT_COLOR : WALL_COLOR)
  }
}

/**
 * Disposes each mesh's geometry and material once.
 * @param meshes Meshes made by `buildWallMeshes`, no longer in a scene.
 */
export function disposeMeshes(meshes: ReadonlyArray<THREE.Mesh>): void {
  for (const mesh of meshes) {
    mesh.geometry.dispose()
    ;[mesh.material].flat().forEach((material) => material.dispose())
  }
}
