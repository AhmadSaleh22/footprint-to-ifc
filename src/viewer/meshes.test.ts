import * as THREE from 'three'
import { describe, expect, test, vi } from 'vitest'
import type { Building, Wall } from '../core'
import { toThree } from './axes'
import { HIGHLIGHT_COLOR, WALL_COLOR, buildWallMeshes, disposeMeshes, setHighlight, wallGeometry } from './meshes'
import { fixtureBuilding, lShapeBuilding, notchBuilding, rectangleBuilding } from './testing/buildings'

type Triangle = [THREE.Vector3, THREE.Vector3, THREE.Vector3]

const VOLUME_TOLERANCE = 1e-4 // m³, Float32 positions
const BOX_TOLERANCE = 1e-5 // m, Float32 positions

const trianglesOf = (geometry: THREE.BufferGeometry): Triangle[] => {
  const position = geometry.getAttribute('position')
  const out: Triangle[] = []
  for (let i = 0; i + 2 < position.count; i += 3) {
    out.push([0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(position, i + k)) as Triangle)
  }
  return out
}

/** Σ v0 · (v1 × v2) / 6 over the triangles. */
const signedVolume = (triangles: Triangle[]): number =>
  triangles.reduce((sum, [a, b, c]) => sum + a.dot(new THREE.Vector3().crossVectors(b, c)) / 6, 0)

const key = (v: THREE.Vector3): string => `${v.x},${v.y},${v.z}`

/** Counts undirected and directed edges, with vertices compared by exact position. */
const edgeCounts = (triangles: Triangle[]) => {
  const undirected = new Map<string, number>()
  const directed = new Map<string, number>()
  for (const t of triangles) {
    for (let i = 0; i < 3; i++) {
      const a = key(t[i]!)
      const b = key(t[(i + 1) % 3]!)
      const sorted = a < b ? `${a}|${b}` : `${b}|${a}`
      undirected.set(sorted, (undirected.get(sorted) ?? 0) + 1)
      directed.set(`${a}|${b}`, (directed.get(`${a}|${b}`) ?? 0) + 1)
    }
  }
  return { undirected, directed }
}

/** Invariants 2, 3 and 4 for one wall. */
const expectWallGeometry = (wall: Wall) => {
  const geometry = wallGeometry(wall)
  const triangles = trianglesOf(geometry)
  expect(triangles).toHaveLength(12)
  expect(geometry.index).toBeNull()

  // 2: closed, every edge in exactly two triangles, once in each direction (consistent orientation)
  const { undirected, directed } = edgeCounts(triangles)
  for (const [edge, count] of undirected) expect(count, `edge ${edge}`).toBe(2)
  for (const [edge, count] of directed) {
    const [a, b] = edge.split('|')
    expect(count).toBe(1)
    expect(directed.get(`${b}|${a}`), `reverse of ${edge}`).toBe(1)
  }

  // 3: positive signed volume equal to planArea x height
  expect(Math.abs(signedVolume(triangles) - wall.planArea * wall.height)).toBeLessThan(VOLUME_TOLERANCE)

  // 4: bounding box
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  expect(box.min.y).toBe(0)
  expect(box.max.y).toBe(wall.height)
  const corners = wall.polygon.map((p) => toThree(p, 0))
  expect(Math.abs(box.min.x - Math.min(...corners.map((c) => c.x)))).toBeLessThan(BOX_TOLERANCE)
  expect(Math.abs(box.max.x - Math.max(...corners.map((c) => c.x)))).toBeLessThan(BOX_TOLERANCE)
  expect(Math.abs(box.min.z - Math.min(...corners.map((c) => c.z)))).toBeLessThan(BOX_TOLERANCE)
  expect(Math.abs(box.max.z - Math.max(...corners.map((c) => c.z)))).toBeLessThan(BOX_TOLERANCE)
  geometry.dispose()
}

/** Invariant 5 for one building. */
const expectMeshes = (building: Building) => {
  const meshes = buildWallMeshes(building)
  expect(meshes).toHaveLength(building.walls.length)
  meshes.forEach((mesh, i) => expect(mesh.userData.id).toBe(building.walls[i]!.id))
  const materials = meshes.map((m) => m.material)
  expect(new Set(materials).size).toBe(meshes.length)
  for (const material of materials) {
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect((material as THREE.MeshStandardMaterial).side).toBe(THREE.FrontSide)
  }
  expect(new Set(meshes.map((m) => m.geometry)).size).toBe(meshes.length)
  disposeMeshes(meshes)
}

describe('2. rectangle wall 0', () => {
  const wall = rectangleBuilding().walls[0]!

  test('has 12 triangles, is closed, and has a signed volume of 34.92 m³ within 1e-4', () => {
    const triangles = trianglesOf(wallGeometry(wall))
    expect(triangles).toHaveLength(12)
    expect(Math.abs(signedVolume(triangles) - 34.92)).toBeLessThan(VOLUME_TOLERANCE)
    for (const count of edgeCounts(triangles).undirected.values()) expect(count).toBe(2)
  })

  test('the triangles are not indexed and carry normals', () => {
    const geometry = wallGeometry(wall)
    expect(geometry.index).toBeNull()
    expect(geometry.getAttribute('position').count).toBe(36)
    expect(geometry.getAttribute('normal').count).toBe(36)
  })

  test('every triangle normal points away from the wall centre (outward)', () => {
    const triangles = trianglesOf(wallGeometry(wall))
    const centre = new THREE.Vector3()
    for (const t of triangles) t.forEach((v) => centre.add(v))
    centre.divideScalar(36)
    for (const [a, b, c] of triangles) {
      const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a))
      const away = a.clone().add(b).add(c).divideScalar(3).sub(centre)
      expect(normal.dot(away)).toBeGreaterThan(0)
    }
  })
})

describe('3. invariants 2 to 5 for every wall at thickness 0.3', () => {
  test.each([
    ['rectangle', rectangleBuilding],
    ['L-shape', lShapeBuilding],
    ['notch', notchBuilding],
    ['fixture', fixtureBuilding],
  ])('%s', (_name, make) => {
    const building = make()
    for (const wall of building.walls) expectWallGeometry(wall)
    expectMeshes(building)
  })
})

describe('4. mutation guard', () => {
  test('reversing one triangle of a wall geometry makes invariant 3 fail', () => {
    const wall = rectangleBuilding().walls[0]!
    const triangles = trianglesOf(wallGeometry(wall))
    const [a, b, c] = triangles[0]!
    triangles[0] = [a, c, b]
    expect(Math.abs(signedVolume(triangles) - wall.planArea * wall.height)).toBeGreaterThan(VOLUME_TOLERANCE)
  })
})

describe('buildWallMeshes', () => {
  test('colours every wall #d9d4c7 with its own FrontSide material and sets userData.id', () => {
    const meshes = buildWallMeshes(rectangleBuilding())
    expect(meshes.map((m) => m.userData.id)).toEqual(['wall-0', 'wall-1', 'wall-2', 'wall-3'])
    for (const mesh of meshes) {
      expect('#' + (mesh.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('#d9d4c7')
    }
    expect(WALL_COLOR).toBe('#d9d4c7')
  })

  test('a second call shares nothing with the first', () => {
    const building = rectangleBuilding()
    const a = buildWallMeshes(building)
    const b = buildWallMeshes(building)
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.geometry).not.toBe(b[i]!.geometry)
      expect(a[i]!.material).not.toBe(b[i]!.material)
    }
  })
})

describe('6. disposeMeshes', () => {
  test('calls dispose exactly once on every geometry and every material', () => {
    const meshes = buildWallMeshes(lShapeBuilding())
    const geometrySpies = meshes.map((m) => vi.spyOn(m.geometry, 'dispose'))
    const materialSpies = meshes.map((m) => vi.spyOn(m.material as THREE.Material, 'dispose'))
    disposeMeshes(meshes)
    for (const spy of [...geometrySpies, ...materialSpies]) expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('7. setHighlight', () => {
  const colourOf = (mesh: THREE.Mesh): string => '#' + (mesh.material as THREE.MeshStandardMaterial).color.getHexString()

  test('colours the selected mesh #e07a2f and every other mesh #d9d4c7', () => {
    const meshes = buildWallMeshes(rectangleBuilding())
    setHighlight(meshes, 'wall-2')
    expect(HIGHLIGHT_COLOR).toBe('#e07a2f')
    expect(meshes.map(colourOf)).toEqual([WALL_COLOR, WALL_COLOR, HIGHLIGHT_COLOR, WALL_COLOR])
  })

  test('moving the highlight resets the previous mesh, and null clears it', () => {
    const meshes = buildWallMeshes(rectangleBuilding())
    setHighlight(meshes, 'wall-1')
    setHighlight(meshes, 'wall-3')
    expect(meshes.map(colourOf)).toEqual([WALL_COLOR, WALL_COLOR, WALL_COLOR, HIGHLIGHT_COLOR])
    setHighlight(meshes, null)
    expect(meshes.map(colourOf)).toEqual([WALL_COLOR, WALL_COLOR, WALL_COLOR, WALL_COLOR])
  })

  test('an unknown id highlights nothing', () => {
    const meshes = buildWallMeshes(rectangleBuilding())
    setHighlight(meshes, 'wall-99')
    expect(meshes.map(colourOf)).toEqual([WALL_COLOR, WALL_COLOR, WALL_COLOR, WALL_COLOR])
  })

  test('changes colours only: the geometry and material objects stay the same', () => {
    const meshes = buildWallMeshes(rectangleBuilding())
    const before = meshes.map((m) => [m.geometry, m.material])
    setHighlight(meshes, 'wall-0')
    setHighlight(meshes, 'wall-1')
    setHighlight(meshes, null)
    expect(meshes.map((m) => [m.geometry, m.material])).toEqual(before)
    meshes.forEach((m, i) => {
      expect(m.geometry).toBe(before[i]![0])
      expect(m.material).toBe(before[i]![1])
    })
  })
})
