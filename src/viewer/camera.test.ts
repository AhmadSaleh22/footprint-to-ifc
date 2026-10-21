import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { toThree } from './axes'
import { frameBuilding } from './camera'
import { fixtureBuilding, rectangleBuilding } from './testing/buildings'

const wallVertices = (building: ReturnType<typeof rectangleBuilding>): THREE.Vector3[] =>
  building.walls.flatMap((wall) => wall.polygon.flatMap((p) => [toThree(p, 0), toThree(p, wall.height)]))

describe('frameBuilding', () => {
  test('looks at the centre of the footprint bounding box at half height', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    const target = frameBuilding(camera, rectangleBuilding())
    expect([target.x, target.y, target.z]).toEqual([5, 6, -10])
  })

  test('sits south-west and above the centre: direction (-1, 1, 1) normalised in Three.js coordinates', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    const target = frameBuilding(camera, rectangleBuilding())
    const direction = camera.position.clone().sub(target).normalize()
    const expected = new THREE.Vector3(-1, 1, 1).normalize()
    expect(direction.distanceTo(expected)).toBeLessThan(1e-9)
  })

  test('the camera looks at the target', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    const target = frameBuilding(camera, rectangleBuilding())
    camera.updateMatrixWorld()
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    const toTarget = target.clone().sub(camera.position).normalize()
    expect(forward.distanceTo(toTarget)).toBeLessThan(1e-9)
  })

  test('the distance fits the bounding sphere in the vertical field of view with 10% margin', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    const building = rectangleBuilding()
    const target = frameBuilding(camera, building)
    const radius = Math.max(...wallVertices(building).map((v) => v.distanceTo(target)))
    const expected = (1.1 * radius) / Math.sin(THREE.MathUtils.degToRad(25))
    expect(Math.abs(camera.position.distanceTo(target) - expected)).toBeLessThan(1e-9)
  })

  test.each([[1], [2]])('every wall vertex projects inside the view at aspect %s', (aspect) => {
    for (const building of [rectangleBuilding(), fixtureBuilding()]) {
      const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000)
      frameBuilding(camera, building)
      camera.updateMatrixWorld()
      camera.updateProjectionMatrix()
      for (const v of wallVertices(building)) {
        const ndc = v.clone().project(camera)
        expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1)
        expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1)
        expect(ndc.z).toBeLessThan(1)
      }
    }
  })

  test('from the south-west the fixture wall-5 (the long west wall) shows its outer face', () => {
    const building = fixtureBuilding()
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    frameBuilding(camera, building)
    const [p0, p1] = building.walls[5]!.polygon
    // outward is to the right of the edge direction (counter-clockwise ring)
    const outward = new THREE.Vector3(p1.y - p0.y, -(p1.x - p0.x), 0).normalize()
    const outwardThree = toThree({ x: outward.x, y: outward.y }, 0)
    const mid = toThree({ x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }, building.walls[5]!.height / 2)
    expect(outwardThree.dot(camera.position.clone().sub(mid))).toBeGreaterThan(0)
  })
})
