import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { buildWallMeshes } from './meshes'
import { pickWall } from './picking'
import { rectangleBuilding } from './testing/buildings'

const cameraAt = (position: [number, number, number], target: [number, number, number]): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
  camera.position.set(...position)
  camera.lookAt(...target)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  return camera
}

/** Möller–Trumbore over every front-facing triangle, without THREE.Raycaster. Returns the nearest wall id. */
const independentPick = (meshes: THREE.Mesh[], origin: THREE.Vector3, direction: THREE.Vector3): string | null => {
  let best: { t: number; id: string } | null = null
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position')
    for (let i = 0; i + 2 < position.count; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(position, i + k)) as [
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3,
      ]
      const e1 = b.clone().sub(a)
      const e2 = c.clone().sub(a)
      const normal = new THREE.Vector3().crossVectors(e1, e2)
      if (normal.dot(direction) >= 0) continue // back face
      const p = new THREE.Vector3().crossVectors(direction, e2)
      const det = e1.dot(p)
      if (Math.abs(det) < 1e-12) continue
      const t0 = origin.clone().sub(a)
      const u = t0.dot(p) / det
      const q = new THREE.Vector3().crossVectors(t0, e1)
      const v = direction.dot(q) / det
      const t = e2.dot(q) / det
      if (u >= 0 && v >= 0 && u + v <= 1 && t > 0 && (best === null || t < best.t)) best = { t, id: mesh.userData.id as string }
    }
  }
  return best?.id ?? null
}

const forward = (camera: THREE.Camera): THREE.Vector3 => new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)

describe('5. pickWall over the rectangle building', () => {
  const meshes = buildWallMeshes(rectangleBuilding())

  test('the ray through NDC (0, 0) from (5, 30, 40) towards (5, 6, -10) returns wall-0', () => {
    const camera = cameraAt([5, 30, 40], [5, 6, -10])
    expect(pickWall(meshes, camera, { x: 0, y: 0 })).toBe('wall-0')
  })

  test('an independent ray-triangle intersection agrees', () => {
    const camera = cameraAt([5, 30, 40], [5, 6, -10])
    expect(independentPick(meshes, camera.position, forward(camera))).toBe('wall-0')
  })

  test('the same camera looking straight up returns null', () => {
    const camera = cameraAt([5, 30, 40], [5, 100, 40])
    expect(pickWall(meshes, camera, { x: 0, y: 0 })).toBeNull()
    expect(independentPick(meshes, camera.position, forward(camera))).toBeNull()
  })

  test('returns the nearest hit: without wall-0 the same ray reaches wall-2 behind it', () => {
    const camera = cameraAt([5, 30, 40], [5, 6, -10])
    expect(pickWall(meshes, camera, { x: 0, y: 0 })).toBe('wall-0')
    const withoutWall0 = meshes.filter((m) => m.userData.id !== 'wall-0')
    expect(pickWall(withoutWall0, camera, { x: 0, y: 0 })).toBe('wall-2')
  })

  test('picks other walls and follows NDC off-centre', () => {
    const camera = cameraAt([5, 30, 40], [5, 6, -10])
    for (const ndc of [{ x: 0.1, y: 0 }, { x: -0.1, y: 0 }, { x: 0, y: 0.1 }]) {
      const origin = camera.position
      const direction = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(camera).sub(origin).normalize()
      expect(pickWall(meshes, camera, ndc)).toBe(independentPick(meshes, origin, direction))
    }
  })

  test('a ray that starts inside the solid of wall-0 only meets back faces and hits nothing', () => {
    // wall-0 occupies z from -0.3 to 0 (Three.js); the ray leaves through its outer face, seen from inside
    const camera = cameraAt([5, 6, -0.15], [5, 6, 50])
    expect(pickWall(meshes, camera, { x: 0, y: 0 })).toBeNull()
  })

  test('a ray from inside the building hits the front-facing inner face of the wall ahead', () => {
    const camera = cameraAt([5, 6, -10], [5, 6, 50])
    expect(pickWall(meshes, camera, { x: 0, y: 0 })).toBe('wall-0')
  })
})
