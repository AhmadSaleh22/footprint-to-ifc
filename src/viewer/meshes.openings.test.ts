import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import type { Opening } from '../core'
import { toThree } from './axes'
import { buildWallMeshes, wallGeometry } from './meshes'
import { closedProblems, positionKey, signedVolume, triangleNormal, trianglesOf } from './testing/geometry'
import { lShapeBuilding, rectangleBuilding } from './testing/buildings'

const VOLUME_TOLERANCE = 1e-4 // m³, Float32 positions

const opening = (over: Partial<Opening> = {}): Opening => ({
  id: 'opening-1',
  wallId: 'wall-0',
  offset: 4.4,
  sill: 0.9,
  width: 1.2,
  height: 1.4,
  ...over,
})

// wallGeometry(wall) of step 03, frozen: positions of rectangle wall-0 and L-shape wall-2 at thickness 0.3, height 12.
const STEP_03_RECT_WALL_0 = [0,12,0,10,12,0,9.699999809265137,12,-0.30000001192092896,0,12,0,9.699999809265137,12,-0.30000001192092896,0.30000001192092896,12,-0.30000001192092896,0,0,0,0.30000001192092896,0,-0.30000001192092896,9.699999809265137,0,-0.30000001192092896,0,0,0,9.699999809265137,0,-0.30000001192092896,10,0,0,0,0,0,10,0,0,10,12,0,0,0,0,10,12,0,0,12,0,10,0,0,9.699999809265137,0,-0.30000001192092896,9.699999809265137,12,-0.30000001192092896,10,0,0,9.699999809265137,12,-0.30000001192092896,10,12,0,9.699999809265137,0,-0.30000001192092896,0.30000001192092896,0,-0.30000001192092896,0.30000001192092896,12,-0.30000001192092896,9.699999809265137,0,-0.30000001192092896,0.30000001192092896,12,-0.30000001192092896,9.699999809265137,12,-0.30000001192092896,0.30000001192092896,0,-0.30000001192092896,0,0,0,0,12,0,0.30000001192092896,0,-0.30000001192092896,0,12,0,0.30000001192092896,12,-0.30000001192092896]
const STEP_03_L_WALL_2 = [10,12,-4,4,12,-4,3.700000047683716,12,-3.700000047683716,10,12,-4,3.700000047683716,12,-3.700000047683716,9.699999809265137,12,-3.700000047683716,10,0,-4,9.699999809265137,0,-3.700000047683716,3.700000047683716,0,-3.700000047683716,10,0,-4,3.700000047683716,0,-3.700000047683716,4,0,-4,10,0,-4,4,0,-4,4,12,-4,10,0,-4,4,12,-4,10,12,-4,4,0,-4,3.700000047683716,0,-3.700000047683716,3.700000047683716,12,-3.700000047683716,4,0,-4,3.700000047683716,12,-3.700000047683716,4,12,-4,3.700000047683716,0,-3.700000047683716,9.699999809265137,0,-3.700000047683716,9.699999809265137,12,-3.700000047683716,3.700000047683716,0,-3.700000047683716,9.699999809265137,12,-3.700000047683716,3.700000047683716,12,-3.700000047683716,9.699999809265137,0,-3.700000047683716,10,0,-4,10,12,-4,9.699999809265137,0,-3.700000047683716,10,12,-4,9.699999809265137,12,-3.700000047683716]

const wall0 = rectangleBuilding().walls[0]!

const volumeOf = (geometry: THREE.BufferGeometry): number => signedVolume(trianglesOf(geometry))

const expectedVolume = (planArea: number, height: number, thickness: number, openings: Opening[]): number =>
  planArea * height - openings.reduce((sum, o) => sum + o.width * o.height * thickness, 0)

const rayHits = (geometry: THREE.BufferGeometry, origin: [number, number, number], direction: [number, number, number]): boolean => {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ side: THREE.FrontSide }))
  mesh.updateMatrixWorld()
  const raycaster = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction).normalize())
  return raycaster.intersectObject(mesh, false).length > 0
}

describe('8. no openings gives exactly the step 03 geometry', () => {
  // JSON cannot hold -0, so the frozen arrays have 0 where Three.js has -0 (the same position): adding 0 normalises it.
  const positions = (g: THREE.BufferGeometry) => Array.from(g.getAttribute('position').array, (v) => v + 0)

  test('rectangle wall-0: the frozen step 03 positions, with and without the second argument', () => {
    expect(positions(wallGeometry(wall0))).toEqual(STEP_03_RECT_WALL_0)
    expect(positions(wallGeometry(wall0, []))).toEqual(STEP_03_RECT_WALL_0)
  })

  test('L-shape wall-2 (slanted mitre ends): the frozen step 03 positions', () => {
    expect(positions(wallGeometry(lShapeBuilding().walls[2]!, []))).toEqual(STEP_03_L_WALL_2)
  })

  test('openings that belong to other walls change nothing', () => {
    expect(positions(wallGeometry(wall0, [opening({ wallId: 'wall-2' })]))).toEqual(STEP_03_RECT_WALL_0)
  })

  test('12 non-indexed triangles with normals', () => {
    const geometry = wallGeometry(wall0, [])
    expect(geometry.index).toBeNull()
    expect(geometry.getAttribute('position').count).toBe(36)
    expect(geometry.getAttribute('normal').count).toBe(36)
  })
})

describe('7. wall-0 with one opening (offset 4.4, sill 0.9, 1.2 x 1.4)', () => {
  const o = opening()
  const geometry = wallGeometry(wall0, [o])
  const triangles = trianglesOf(geometry)

  test('is a closed, consistently wound mesh of 12 + 20 triangles, not indexed, with normals', () => {
    expect(closedProblems(triangles)).toEqual([])
    expect(triangles).toHaveLength(32)
    expect(geometry.index).toBeNull()
    expect(geometry.getAttribute('normal').count).toBe(96)
  })

  test('has a signed volume of 34.416 m³ (34.92 - 1.2 x 1.4 x 0.3) within 1e-4', () => {
    expect(Math.abs(volumeOf(geometry) - 34.416)).toBeLessThan(VOLUME_TOLERANCE)
  })

  test('shared vertices are bit-identical: 8 prism corners + 4 + 4 hole corners = 16 distinct positions', () => {
    expect(new Set(triangles.flat().map(positionKey)).size).toBe(16)
  })

  test('a ray from (5, 1.6, 1) towards -z, through the opening centre, does not hit the wall', () => {
    expect(rayHits(geometry, [5, 1.6, 1], [0, 0, -1])).toBe(false)
  })

  test('the control ray from (5, 0.5, 1) towards -z, through solid wall below the sill, hits it', () => {
    expect(rayHits(geometry, [5, 0.5, 1], [0, 0, -1])).toBe(true)
  })

  test('control rays above the head and beside the opening hit; the same rays on the plain wall hit too', () => {
    expect(rayHits(geometry, [5, 3, 1], [0, 0, -1])).toBe(true)
    expect(rayHits(geometry, [3, 1.6, 1], [0, 0, -1])).toBe(true)
    expect(rayHits(geometry, [7, 1.6, 1], [0, 0, -1])).toBe(true)
  })

  test('the hole is a through-hole: a ray from inside the building towards +z also passes', () => {
    expect(rayHits(geometry, [5, 1.6, -1], [0, 0, 1])).toBe(false)
  })

  test('the reveals face into the hole: sill up, head down, jambs towards the opening centre', () => {
    // opening spans x 4.4 to 5.6 and y 0.9 to 2.3 (Three.js), through z from 0 to -0.3
    const centre = new THREE.Vector3(5, 1.6, -0.15)
    const reveals = triangles.filter((t) => t.every((v) => v.z <= 1e-6 && v.z >= -0.3 - 1e-6 && Math.abs(v.x - 5) <= 0.6 + 1e-6 && v.y >= 0.9 - 1e-6 && v.y <= 2.3 + 1e-6))
    expect(reveals).toHaveLength(8)
    for (const t of reveals) {
      const middle = t[0].clone().add(t[1]).add(t[2]).divideScalar(3)
      expect(triangleNormal(t).dot(centre.clone().sub(middle))).toBeGreaterThan(0)
    }
  })

  test('the reveals are perpendicular to the wall faces: hole corners differ by thickness along the inward normal', () => {
    const outer = triangles.flat().filter((v) => v.z === 0 && v.y > 0.5 && v.y < 11.5 && v.x > 1 && v.x < 9)
    const inner = triangles.flat().filter((v) => Math.abs(v.z + 0.3) < 1e-6 && v.y > 0.5 && v.y < 11.5 && v.x > 1 && v.x < 9)
    const keys = (vs: THREE.Vector3[]) => new Set(vs.map((v) => `${v.x.toFixed(5)},${v.y.toFixed(5)}`))
    expect(keys(outer)).toEqual(keys(inner))
    expect(keys(outer).size).toBe(4)
  })
})

describe('several openings and other walls', () => {
  test('two openings on wall-0: 12 + 40 triangles, closed, volume minus both', () => {
    const list = [opening({ id: 'opening-1', offset: 1, width: 1, height: 1 }), opening({ id: 'opening-2', offset: 5, width: 2, sill: 3, height: 2 })]
    const geometry = wallGeometry(wall0, list)
    const triangles = trianglesOf(geometry)
    expect(triangles).toHaveLength(52)
    expect(closedProblems(triangles)).toEqual([])
    expect(Math.abs(signedVolume(triangles) - expectedVolume(wall0.planArea, 12, 0.3, list))).toBeLessThan(VOLUME_TOLERANCE)
  })

  test('stacked openings at the same offset keep the mesh closed', () => {
    const list = [opening({ id: 'opening-1', sill: 0.5, height: 1.5 }), opening({ id: 'opening-2', sill: 2.2, height: 1.5 })]
    const geometry = wallGeometry(wall0, list)
    expect(closedProblems(trianglesOf(geometry))).toEqual([])
    expect(Math.abs(volumeOf(geometry) - expectedVolume(wall0.planArea, 12, 0.3, list))).toBeLessThan(VOLUME_TOLERANCE)
  })

  test('a window at the extreme of the range keeps the mesh closed', () => {
    const o = opening({ offset: 0.41, width: 9.18, sill: 0.11, height: 11.78 })
    const geometry = wallGeometry(wall0, [o])
    expect(closedProblems(trianglesOf(geometry))).toEqual([])
    expect(Math.abs(volumeOf(geometry) - expectedVolume(wall0.planArea, 12, 0.3, [o]))).toBeLessThan(VOLUME_TOLERANCE)
  })

  test('L-shape wall-2 with slanted mitre ends: an opening keeps the mesh closed with the right volume', () => {
    const wall = lShapeBuilding().walls[2]!
    const o = opening({ wallId: 'wall-2', offset: 1, width: 2 })
    const geometry = wallGeometry(wall, [o])
    expect(closedProblems(trianglesOf(geometry))).toEqual([])
    expect(Math.abs(volumeOf(geometry) - expectedVolume(wall.planArea, 12, 0.3, [o]))).toBeLessThan(VOLUME_TOLERANCE)
  })

  test('the opening sits where the wall coordinates say, in Three.js coordinates', () => {
    // wall-2 of the L-shape runs (10,4) to (4,4): u = 1 is core (9, 4), so Three.js x = 9, z = -4
    const wall = lShapeBuilding().walls[2]!
    const geometry = wallGeometry(wall, [opening({ wallId: 'wall-2', offset: 1, width: 2 })])
    const corner = toThree({ x: 9, y: 4 }, 0.9)
    expect(trianglesOf(geometry).flat().some((v) => Math.abs(v.x - corner.x) < 1e-5 && Math.abs(v.y - corner.y) < 1e-5 && Math.abs(v.z - corner.z) < 1e-5)).toBe(true)
  })

  test('the openings argument is not mutated', () => {
    const list = Object.freeze([Object.freeze(opening())])
    expect(() => wallGeometry(wall0, list)).not.toThrow()
  })
})

describe('buildWallMeshes with openings', () => {
  test('only the wall with the opening gets the larger geometry; ids and materials as before', () => {
    const building = rectangleBuilding()
    const meshes = buildWallMeshes(building, [opening()])
    expect(meshes.map((m) => m.geometry.getAttribute('position').count / 3)).toEqual([32, 12, 12, 12])
    expect(meshes.map((m) => m.userData.id)).toEqual(['wall-0', 'wall-1', 'wall-2', 'wall-3'])
    expect(new Set(meshes.map((m) => m.material)).size).toBe(4)
  })

  test('with no second argument it is the step 03 result', () => {
    const meshes = buildWallMeshes(rectangleBuilding())
    expect(meshes.map((m) => m.geometry.getAttribute('position').count / 3)).toEqual([12, 12, 12, 12])
  })
})

describe('openings whose corners line up', () => {
  // Earcut drops the degenerate triangles between collinear corners, which leaves T-junctions. The faces must still
  // keep every hole corner as a vertex, so the mesh stays closed with the plain triangle count.
  const row = [opening({ id: 'opening-1', offset: 1, width: 1.2 }), opening({ id: 'opening-2', offset: 4, width: 1.2 })]
  const grid = [
    opening({ id: 'opening-1', offset: 1, width: 1.2, sill: 0.9, height: 1.4 }),
    opening({ id: 'opening-2', offset: 4, width: 1.2, sill: 0.9, height: 1.4 }),
    opening({ id: 'opening-3', offset: 1, width: 1.2, sill: 3.5, height: 1.4 }),
    opening({ id: 'opening-4', offset: 4, width: 1.2, sill: 3.5, height: 1.4 }),
  ]
  const sameSill = [opening({ id: 'opening-1', offset: 1, width: 1.2, height: 1.4 }), opening({ id: 'opening-2', offset: 4, width: 1.2, height: 2.6 })]
  const sameEdge = [opening({ id: 'opening-1', offset: 1, width: 1.2, sill: 0.9, height: 1.4 }), opening({ id: 'opening-2', offset: 4, width: 1.2, sill: 2.3 + 0.1, height: 1.4 })]

  test.each([
    ['a row of two windows with the same sill and height', row],
    ['a 2 x 2 grid of identical windows', grid],
    ['two windows with the same sill and different heights', sameSill],
    ['two windows, the second one starting 0.1 m above the first one head', sameEdge],
  ])('%s: closed, 12 + 20 per opening triangles, volume minus every opening', (_name, list) => {
    const geometry = wallGeometry(wall0, list)
    const triangles = trianglesOf(geometry)
    expect(closedProblems(triangles)).toEqual([])
    expect(triangles).toHaveLength(12 + 20 * list.length)
    expect(Math.abs(signedVolume(triangles) - expectedVolume(wall0.planArea, 12, 0.3, list))).toBeLessThan(VOLUME_TOLERANCE)
    expect(new Set(triangles.flat().map(positionKey)).size).toBe(8 + 8 * list.length)
  })

  test('windows sharing a vertical line with the wall end are closed too', () => {
    const list = [opening({ id: 'opening-1', offset: 0.4, width: 1 }), opening({ id: 'opening-2', offset: 0.4, sill: 3, width: 1 })]
    expect(closedProblems(trianglesOf(wallGeometry(wall0, list)))).toEqual([])
  })
})

describe('openings whose corners lie on one slanted line in wall coordinates', () => {
  // Earcut also drops degenerate triangles between points that are collinear along a slanted line, so these corners
  // are checked too. Windows are 1 x 1 on wall-0 of the rectangle (valid: 1 m apart in both directions).
  const window = (n: number, offset: number, sill: number, size = 1): Opening =>
    opening({ id: `opening-${n}`, offset, sill, width: size, height: size })

  const cases: Array<[string, Opening[]]> = [
    // corners (1,1) (2,2) (3,3) (4,4) (5,5) (6,6) all lie on v = u
    ['rising diagonal v = u, integer corners', [window(1, 1, 1), window(2, 3, 3), window(3, 5, 5)]],
    // corners (1,6) (2,5) (3,4) (4,3) (5,2) (6,1) all lie on v = 7 - u
    ['falling diagonal v = 7 - u, integer corners', [window(1, 1, 5), window(2, 3, 3), window(3, 5, 1)]],
    // the same rising diagonal with decimal corners that are not exact in binary
    ['rising diagonal with decimal corners', [window(1, 1.1, 1.1, 1.1), window(2, 3.3, 3.3, 1.1), window(3, 5.5, 5.5, 1.1)]],
    // slope 1/2 with binary-exact coordinates and no shared u or v level: bottom-left corners (1,1) (3.5,2.25) (6,3.5)
    // lie on v = u / 2 + 0.5, and no corner shares a coordinate with another window
    ['shallow slanted line, binary-exact corners, no shared levels', [window(1, 1, 1), window(2, 3.5, 2.25), window(3, 6, 3.5)]],
    // the same slope with windows whose edges meet at shared levels (one head level with the next sill): horizontal
    // alignment as well, which is what makes earcut drop triangles here
    ['slope 1/2 where a head and the next sill share a level', [window(1, 1, 1), window(2, 3, 2), window(3, 5, 3)]],
  ]

  test.each(cases)('%s: closed, 12 + 20 per opening triangles, every corner a vertex, volume minus every opening', (_name, list) => {
    const geometry = wallGeometry(wall0, list)
    const triangles = trianglesOf(geometry)
    expect(closedProblems(triangles)).toEqual([])
    expect(triangles).toHaveLength(12 + 20 * list.length)
    expect(new Set(triangles.flat().map(positionKey)).size).toBe(8 + 8 * list.length)
    expect(Math.abs(signedVolume(triangles) - expectedVolume(wall0.planArea, 12, 0.3, list))).toBeLessThan(VOLUME_TOLERANCE)
  })

  test('the integer diagonal really has collinear corners in wall coordinates (so the case is meaningful)', () => {
    const corners = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6]]
    for (const [u, v] of corners) expect(v).toBe(u)
    const triangles = trianglesOf(wallGeometry(wall0, cases[0]![1]))
    // on the outer face (z = 0) the hole corners are at Three.js x = u, y = v
    const outerHoleCorners = triangles.flat().filter((p) => p.z === 0 && p.x > 0.5 && p.x < 9.5 && p.y > 0.5 && p.y < 11.5)
    const onDiagonal = new Set(outerHoleCorners.filter((p) => p.x === p.y).map(positionKey))
    expect(onDiagonal.size).toBe(6)
  })
})
