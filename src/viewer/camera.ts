import * as THREE from 'three'
import type { Building } from '../core'
import { toThree } from './axes'

const DIRECTION = new THREE.Vector3(-1, 1, 1).normalize() // west, up, south (Three.js frame)
const MARGIN = 1.1

/**
 * Places the camera to look at the centre of the footprint's bounding box (at half the wall height) from the
 * south-west and above, far enough for the bounding sphere to fit the vertical field of view with 10% margin.
 * From there the long west wall of the fixture shows its outer face.
 * @param camera The camera to place. Its vertical fov is in degrees.
 * @param building A building from core. Metres, core frame.
 * @returns The point looked at, in metres, Three.js frame (for the orbit controls' target).
 */
export function frameBuilding(camera: THREE.PerspectiveCamera, building: Building): THREE.Vector3 {
  const { ring, height } = building.footprint
  const xs = ring.map((p) => p.x)
  const ys = ring.map((p) => p.y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const target = toThree({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, height / 2)
  const radius = Math.hypot(maxX - minX, maxY - minY, height) / 2
  const distance = (MARGIN * radius) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))
  camera.position.copy(target).addScaledVector(DIRECTION, distance)
  camera.lookAt(target)
  camera.updateMatrixWorld()
  return target
}
