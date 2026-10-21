import { describe, expect, test } from 'vitest'
import geojsonRaw from '../../fixtures/berlin-lod2-building.geojson?raw'
import { InvalidBuildingError, type BuildingErrorReason } from './errors'
import { footprintFromGeoJSON, normaliseRing, type Footprint } from './footprint'
import { expectBuildingInvariants } from './testing/building-invariants'
import { buildWalls, type Building } from './walls'

type P = { x: number; y: number }

const COORD = 1e-9 // m
const AREA = 1e-6 // m²

const pts = (...coords: Array<[number, number]>): P[] => coords.map(([x, y]) => ({ x, y }))

/** A footprint the way step 01 would produce it: the ring goes through normaliseRing. */
const footprintOf = (points: P[], height = 10): Footprint => ({
  crs: 'EPSG:25833',
  origin: { easting: 0, northing: 0 },
  ring: normaliseRing(points),
  height,
})

/** A footprint with the ring taken as given, for the inputs that step 01 would never produce. */
const rawFootprint = (ring: P[], height = 10): Footprint => ({
  crs: 'EPSG:25833',
  origin: { easting: 0, northing: 0 },
  ring,
  height,
})

const totalPlanArea = (building: Building): number => building.walls.reduce((sum, wall) => sum + wall.planArea, 0)

const expectPoint = (actual: P, expected: [number, number]) => {
  expect(Math.abs(actual.x - expected[0])).toBeLessThan(COORD)
  expect(Math.abs(actual.y - expected[1])).toBeLessThan(COORD)
}

const expectBuildingError = (run: () => unknown, reason: BuildingErrorReason, messagePrefix?: string) => {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidBuildingError)
    expect((error as InvalidBuildingError).reason).toBe(reason)
    if (messagePrefix !== undefined) expect((error as InvalidBuildingError).message.startsWith(messagePrefix)).toBe(true)
    return
  }
  throw new Error(`expected InvalidBuildingError(${reason}), nothing was thrown`)
}

const deepFreezeFootprint = (footprint: Footprint): Footprint => {
  footprint.ring.forEach((p) => Object.freeze(p))
  Object.freeze(footprint.ring)
  Object.freeze(footprint.origin)
  return Object.freeze(footprint)
}

const RECT = pts([0, 0], [10, 0], [10, 20], [0, 20])
const NECK = pts(
  [0, 0], [10, 0], [10, 4.75], [15, 4.75], [15, 0], [25, 0],
  [25, 10], [14.8, 10], [14.8, 5.25], [10.2, 5.25], [10.2, 10], [0, 10],
)

describe('InvalidBuildingError', () => {
  test('carries its reason and a name', () => {
    const error = new InvalidBuildingError('invalid-thickness')
    expect(error.reason).toBe('invalid-thickness')
    expect(error.name).toBe('InvalidBuildingError')
  })

  test('is an Error and survives instanceof, with the given or a default message', () => {
    const error = new InvalidBuildingError('thickness-too-large', '5a: edge 3')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(InvalidBuildingError)
    expect(error.message).toBe('5a: edge 3')
    expect(new InvalidBuildingError('invalid-footprint').message.length).toBeGreaterThan(0)
  })
})

describe('1. rectangle', () => {
  const building = buildWalls(footprintOf(RECT, 7), 0.3)

  test('has 4 walls and the inner ring (0.3,0.3) (9.7,0.3) (9.7,19.7) (0.3,19.7)', () => {
    expect(building.walls).toHaveLength(4)
    expect(building.inner).toHaveLength(4)
    expect(building.thickness).toBe(0.3)
    ;[[0.3, 0.3], [9.7, 0.3], [9.7, 19.7], [0.3, 19.7]].forEach((xy, i) => expectPoint(building.inner[i]!, xy as [number, number]))
  })

  test('wall 0 is (0,0) (10,0) (9.7,0.3) (0.3,0.3) with planArea 2.91 and faceArea 10 x height', () => {
    const wall = building.walls[0]!
    ;[[0, 0], [10, 0], [9.7, 0.3], [0.3, 0.3]].forEach((xy, i) => expectPoint(wall.polygon[i]!, xy as [number, number]))
    expect(Math.abs(wall.planArea - 2.91)).toBeLessThan(AREA)
    expect(Math.abs(wall.length - 10)).toBeLessThan(COORD)
    expect(Math.abs(wall.faceArea - 70)).toBeLessThan(AREA)
    expect(wall.height).toBe(7)
    expect(wall.thickness).toBe(0.3)
    expect(wall.id).toBe('wall-0')
    expect(wall.index).toBe(0)
  })

  test('the total planArea is 17.64 m²', () => {
    expect(Math.abs(totalPlanArea(building) - 17.64)).toBeLessThan(AREA)
  })

  test('the footprint is a copy of the input', () => {
    expect(building.footprint).toEqual(footprintOf(RECT, 7))
  })

  test('invariants 1 to 7 hold', () => {
    expectBuildingInvariants(building)
  })
})

describe('2. L-shape', () => {
  const building = buildWalls(footprintOf(pts([0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10])), 0.3)

  test('the reflex corner (4,4) gives the inner vertex (3.7,3.7)', () => {
    expectPoint(building.inner[3]!, [3.7, 3.7])
  })

  test('the total planArea is 11.64 m² and the invariants hold', () => {
    expect(Math.abs(totalPlanArea(building) - 11.64)).toBeLessThan(AREA)
    expectBuildingInvariants(building)
  })
})

describe('3. collinear vertex', () => {
  const building = buildWalls(footprintOf(pts([0, 0], [5, 0], [10, 0], [10, 10], [0, 10])), 0.3)

  test('keeps 5 walls and puts the inner vertex of (5,0) at (5,0.3)', () => {
    expect(building.walls).toHaveLength(5)
    expectPoint(building.inner[1]!, [5, 0.3])
  })

  test('the total planArea is 11.64 m² and the invariants hold', () => {
    expect(Math.abs(totalPlanArea(building) - 11.64)).toBeLessThan(AREA)
    expectBuildingInvariants(building)
  })
})

describe('4. short edge between two reflex corners (notch)', () => {
  const ring = pts([0, 0], [10, 0], [10, 10], [5.1, 10], [5.1, 9], [4.9, 9], [4.9, 10], [0, 10])

  test('is valid at thickness 0.3 with a total planArea of 12.24 m²', () => {
    const building = buildWalls(footprintOf(ring), 0.3)
    expect(building.walls).toHaveLength(8)
    expect(Math.abs(totalPlanArea(building) - 12.24)).toBeLessThan(AREA)
    expectBuildingInvariants(building)
  })
})

describe('5. short chamfer between two convex corners', () => {
  const ring = pts([0.2, 0], [10, 0], [10, 10], [0, 10], [0, 0.2])

  test('thickness 0.3 is valid with a total planArea of 11.620294 m²', () => {
    const building = buildWalls(footprintOf(ring), 0.3)
    expect(Math.abs(totalPlanArea(building) - 11.620294)).toBeLessThan(AREA)
    expectBuildingInvariants(building)
  })

  test('thickness 0.4 throws thickness-too-large with 5a: the chamfer inner edge reverses', () => {
    expectBuildingError(() => buildWalls(footprintOf(ring), 0.4), 'thickness-too-large', '5a:')
  })
})

describe('6. thin triangle', () => {
  const ring = pts([0, 0], [10, 0], [0, 1])

  test('thickness 0.3 is valid with a total planArea of 4.321025 m²', () => {
    const building = buildWalls(footprintOf(ring), 0.3)
    expect(Math.abs(totalPlanArea(building) - 4.321025)).toBeLessThan(AREA)
    expectBuildingInvariants(building)
  })

  test('thickness 0.48 throws with 5a although the inner ring is still counter-clockwise', () => {
    expectBuildingError(() => buildWalls(footprintOf(ring), 0.48), 'thickness-too-large', '5a:')
  })
})

describe('7. narrow neck', () => {
  const rotate = (points: P[], angle: number): P[] =>
    points.map((p) => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) }))

  test('thickness 0.2 is valid with a total planArea of 17.64 m²', () => {
    const building = buildWalls(footprintOf(NECK), 0.2)
    expect(Math.abs(totalPlanArea(building) - 17.64)).toBeLessThan(AREA)
    expectBuildingInvariants(building)
  })

  test('thickness 0.3 throws with 5b, with every inner edge still pointing the right way', () => {
    expectBuildingError(() => buildWalls(footprintOf(NECK), 0.3), 'thickness-too-large', '5b:')
  })

  test('the same ring rotated by 30° gives the same two results', () => {
    const rotated = rotate(NECK, Math.PI / 6)
    const building = buildWalls(footprintOf(rotated), 0.2)
    expect(Math.abs(totalPlanArea(building) - 17.64)).toBeLessThan(AREA)
    expectBuildingInvariants(building)
    expectBuildingError(() => buildWalls(footprintOf(rotated), 0.3), 'thickness-too-large', '5b:')
  })
})

describe('8. thickness that eats the rectangle', () => {
  test.each([[5], [6]])('10 x 20 rectangle with thickness %s throws thickness-too-large', (thickness) => {
    expectBuildingError(() => buildWalls(footprintOf(RECT), thickness), 'thickness-too-large')
  })
})

describe('9. invalid thickness', () => {
  test.each([[0], [0.0005], [-1], [Number.NaN], [Number.POSITIVE_INFINITY]])('thickness %s', (thickness) => {
    expectBuildingError(() => buildWalls(footprintOf(RECT), thickness), 'invalid-thickness')
  })

  test('1 mm is accepted', () => {
    expect(buildWalls(footprintOf(RECT), 0.001).walls).toHaveLength(4)
  })
})

describe('10. very sharp spike', () => {
  test('(0,0) (1000,0) (0,0.002) with thickness 0.3 throws thickness-too-large with 4', () => {
    expectBuildingError(() => buildWalls(footprintOf(pts([0, 0], [1000, 0], [0, 0.002])), 0.3), 'thickness-too-large', '4:')
  })
})

describe('11. invalid footprint', () => {
  test('a clockwise ring', () => {
    expectBuildingError(() => buildWalls(rawFootprint(pts([0, 0], [0, 20], [10, 20], [10, 0])), 0.3), 'invalid-footprint')
  })

  test('a ring that normaliseRing would rotate to another start vertex', () => {
    expectBuildingError(() => buildWalls(rawFootprint(pts([10, 0], [10, 20], [0, 20], [0, 0])), 0.3), 'invalid-footprint')
  })

  test('a ring with a NaN vertex', () => {
    expectBuildingError(() => buildWalls(rawFootprint(pts([0, 0], [10, 0], [Number.NaN, 20], [0, 20])), 0.3), 'invalid-footprint')
  })

  test.each([[Number.NaN], [0], [-1], [Number.POSITIVE_INFINITY]])('height %s', (height) => {
    expectBuildingError(() => buildWalls(rawFootprint(RECT, height), 0.3), 'invalid-footprint')
  })

  test('errors from normaliseRing become invalid-footprint: too few vertices, zero area, self-intersection', () => {
    expectBuildingError(() => buildWalls(rawFootprint(pts([0, 0], [10, 0])), 0.3), 'invalid-footprint')
    expectBuildingError(() => buildWalls(rawFootprint(pts([0, 0], [5, 0], [10, 0])), 0.3), 'invalid-footprint')
    expectBuildingError(() => buildWalls(rawFootprint(pts([0, 0], [10, 10], [10, 0], [0, 20])), 0.3), 'invalid-footprint')
  })

  test('a repeated closing vertex or a near-duplicate vertex is invalid, because normaliseRing would remove it', () => {
    expectBuildingError(() => buildWalls(rawFootprint(pts([0, 0], [10, 0], [10, 20], [0, 20], [0, 0])), 0.3), 'invalid-footprint')
  })

  test('the footprint is checked before the thickness', () => {
    expectBuildingError(() => buildWalls(rawFootprint(pts([0, 0], [0, 20], [10, 20], [10, 0])), Number.NaN), 'invalid-footprint')
  })

  test('crs and origin are not checked', () => {
    const footprint = { ...footprintOf(RECT), origin: { easting: Number.NaN, northing: 0.5 } }
    expect(buildWalls(footprint, 0.3).walls).toHaveLength(4)
  })
})

describe('inputs and outputs', () => {
  test('a frozen footprint is accepted and not mutated', () => {
    const footprint = deepFreezeFootprint(footprintOf(RECT))
    const snapshot = JSON.stringify(footprint)
    buildWalls(footprint, 0.3)
    expect(JSON.stringify(footprint)).toBe(snapshot)
  })

  test('no object is shared with the input or within the output', () => {
    const input = footprintOf(RECT)
    const building = buildWalls(input, 0.3)
    const objects: object[] = [
      building.footprint,
      building.footprint.ring,
      building.footprint.origin,
      ...building.footprint.ring,
      building.inner,
      ...building.inner,
      building.walls,
      ...building.walls.flatMap((wall) => [wall, wall.polygon, ...wall.polygon]),
    ]
    const inputObjects = [input, input.ring, input.origin, ...input.ring]
    expect(new Set(objects).size).toBe(objects.length)
    for (const object of inputObjects) expect(objects.includes(object)).toBe(false)
  })

  test('calling buildWalls twice gives equal output', () => {
    const footprint = footprintOf(RECT)
    expect(buildWalls(footprint, 0.3)).toEqual(buildWalls(footprint, 0.3))
  })
})

describe('12. real fixture: Berlin LoD2 building DEBE02YY400000z3', () => {
  const footprint = footprintFromGeoJSON(JSON.parse(geojsonRaw), 12)
  const building = buildWalls(footprint, 0.3)

  test('has 7 walls and a total planArea of 31.7720685 m² (Shapely band area of the ring footprintFromGeoJSON produces)', () => {
    expect(building.walls).toHaveLength(7)
    expect(Math.abs(totalPlanArea(building) - 31.7720685)).toBeLessThan(AREA)
  })

  test('invariants 1 to 7 hold', () => {
    expectBuildingInvariants(building)
  })
})
