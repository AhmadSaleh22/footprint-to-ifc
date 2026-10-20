import { describe, expect, test } from 'vitest'
import { InvalidFootprintError } from './errors'
import { footprintFromGeoJSON } from './footprint'
import geojsonRaw from '../../fixtures/berlin-lod2-building.geojson?raw'
import referenceRaw from '../../fixtures/berlin-lod2-building.25833.json?raw'

type Position = unknown[]

// Berlin, about 13.55 m east-west and 11.13 m north-south, clockwise as GeoJSON authors often deliver it.
const LON = 13.4
const LAT = 52.5
const BERLIN_CW: Position[] = [
  [LON, LAT],
  [LON, LAT + 0.0001],
  [LON + 0.0002, LAT + 0.0001],
  [LON + 0.0002, LAT],
  [LON, LAT],
]

const polygon = (ring: unknown): unknown => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'Polygon', coordinates: [ring] },
})

const expectReason = (feature: unknown, height: unknown, reason: string) => {
  try {
    footprintFromGeoJSON(feature, height as number)
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidFootprintError)
    expect((error as InvalidFootprintError).reason).toBe(reason)
    return
  }
  throw new Error(`expected InvalidFootprintError(${reason}), nothing was thrown`)
}

describe('happy path', () => {
  test('returns an EPSG:25833 footprint with an integer origin and a counter-clockwise ring', () => {
    const fp = footprintFromGeoJSON(polygon(BERLIN_CW), 12)
    expect(fp.crs).toBe('EPSG:25833')
    expect(fp.height).toBe(12)
    expect(Number.isInteger(fp.origin.easting)).toBe(true)
    expect(Number.isInteger(fp.origin.northing)).toBe(true)
    expect(fp.origin.easting).toBeGreaterThan(390_000)
    expect(fp.origin.easting).toBeLessThan(393_000)
    expect(fp.origin.northing).toBeGreaterThan(5_810_000)
    expect(fp.origin.northing).toBeLessThan(5_830_000)
    expect(fp.ring).toHaveLength(4)

    let twiceArea = 0
    for (let i = 0; i < fp.ring.length; i++) {
      const a = fp.ring[i]!
      const b = fp.ring[(i + 1) % fp.ring.length]!
      twiceArea += a.x * b.y - b.x * a.y
    }
    // 0.0002° · 111,320 · cos(52.5°) by 0.0001° · 111,320 is about 150.9 m²
    expect(twiceArea / 2).toBeGreaterThan(148)
    expect(twiceArea / 2).toBeLessThan(154)
  })

  test('the closing vertex in the input is not repeated in the output', () => {
    const closed = footprintFromGeoJSON(polygon(BERLIN_CW), 3)
    const open = footprintFromGeoJSON(polygon(BERLIN_CW.slice(0, -1)), 3)
    expect(closed.ring).toEqual(open.ring)
    expect(closed.origin).toEqual(open.origin)
  })

  test('an altitude value is ignored', () => {
    const withAltitude = BERLIN_CW.map((p) => [...p, 123.4])
    expect(footprintFromGeoJSON(polygon(withAltitude), 3)).toEqual(footprintFromGeoJSON(polygon(BERLIN_CW), 3))
  })

  test('the input feature is not mutated', () => {
    const feature = polygon(BERLIN_CW.map((p) => [...p]))
    const snapshot = JSON.stringify(feature)
    footprintFromGeoJSON(feature, 3)
    expect(JSON.stringify(feature)).toBe(snapshot)
  })
})

describe('8. unsupported-geometry', () => {
  const pt = (dx: number, dy: number): Position => [LON + dx, LAT + dy]
  const square = [pt(0, 0), pt(0.0002, 0), pt(0.0002, 0.0001), pt(0, 0.0001), pt(0, 0)]
  const hole = [pt(0.00005, 0.00002), pt(0.00005, 0.00008), pt(0.00015, 0.00008), pt(0.00015, 0.00002), pt(0.00005, 0.00002)]

  test.each([
    ['MultiPolygon', { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [[square]] } }],
    ['Polygon with a hole', { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [square, hole] } }],
    ['FeatureCollection', { type: 'FeatureCollection', features: [polygon(square)] }],
    ['bare geometry', { type: 'Polygon', coordinates: [square] }],
    ['null geometry', { type: 'Feature', properties: {}, geometry: null }],
    ['missing coordinates', { type: 'Feature', properties: {}, geometry: { type: 'Polygon' } }],
    ['empty coordinates', { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } }],
    ['non-array coordinates', { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: 'abc' } }],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'Feature'],
    ['a number', 42],
  ])('%s', (_name, feature) => {
    expectReason(feature, 5, 'unsupported-geometry')
  })

  test('a MultiPolygon that also contains NaN reports unsupported-geometry, not invalid-coordinate', () => {
    const feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPolygon', coordinates: [[[[Number.NaN, LAT], [LON, LAT], [LON, LAT + 0.0001]]]] },
    }
    expectReason(feature, 5, 'unsupported-geometry')
  })
})

describe('8. invalid-height', () => {
  test.each([[0], [-1], [Number.NaN], [Number.POSITIVE_INFINITY], ['5'], [null], [undefined]])('height %s', (height) => {
    expectReason(polygon(BERLIN_CW), height, 'invalid-height')
  })

  test('is reported before invalid-coordinate', () => {
    expectReason(polygon([[Number.NaN, LAT], [LON, LAT], [LON, LAT + 0.0001]]), 0, 'invalid-height')
  })
})

describe('8. invalid-coordinate', () => {
  const withBadFirst = (bad: unknown): unknown => polygon([bad, ...BERLIN_CW.slice(1)])

  test.each([
    ['NaN longitude', [Number.NaN, LAT]],
    ['NaN latitude', [LON, Number.NaN]],
    ['Infinity', [Number.POSITIVE_INFINITY, LAT]],
    ['null', [null, LAT]],
    ['a string', ['13.4', LAT]],
    ['one value', [LON]],
    ['empty position', []],
    ['a non-array position', 'abc'],
    ['a null position', null],
  ])('%s', (_name, bad) => {
    expectReason(withBadFirst(bad), 5, 'invalid-coordinate')
  })

  test('is reported before outside-zone', () => {
    expectReason(polygon([[11.9, LAT], [LON, Number.NaN], [LON, LAT + 0.0001]]), 5, 'invalid-coordinate')
  })
})

describe('8. outside-zone', () => {
  // A triangle of about 10 m whose first vertex is replaced by the position under test.
  const triangle = (lon: number, lat: number, first: [number, number]): unknown =>
    polygon([first, [lon, lat], [lon + 0.0001, lat]])

  test('longitude 11.9', () => {
    expectReason(polygon([[11.9, LAT], [LON, LAT], [LON, LAT + 0.0001]]), 5, 'outside-zone')
  })

  test('swapped position [52.5, 13.4]', () => {
    expectReason(polygon([[52.5, 13.4], [LON, LAT], [LON, LAT + 0.0001]]), 5, 'outside-zone')
  })

  test.each([
    ['longitude 18.001', [18.001, 60]],
    ['longitude 11.999', [11.999, 60]],
    ['latitude 84.001', [17, 84.001]],
    ['latitude -0.001', [15, -0.001]],
  ] as const)('%s', (_name, [lon, lat]) => {
    expectReason(triangle(LON, LAT, [lon, lat]), 5, 'outside-zone')
  })

  test.each([
    ['longitude 12, latitude 0', [12, 0], [12.0001, 0], [12.0001, 0.0001]],
    ['longitude 18, latitude 84', [17.9999, 83.9999], [18, 83.9999], [18, 84]],
  ] as const)('boundary is inclusive: %s', (_name, a, b, c) => {
    const fp = footprintFromGeoJSON(polygon([a, b, c]), 5)
    expect(fp.ring).toHaveLength(3)
  })
})

describe('rings the spec leaves to later steps', () => {
  test('an empty ring throws too-few-vertices', () => {
    expectReason(polygon([]), 5, 'too-few-vertices')
  })

  test('rings with one or two positions throw too-few-vertices', () => {
    expectReason(polygon([[LON, LAT]]), 5, 'too-few-vertices')
    expectReason(polygon([[LON, LAT], [LON + 0.0001, LAT]]), 5, 'too-few-vertices')
  })

  test('a collinear ring throws zero-area', () => {
    expectReason(polygon([[LON, LAT], [LON + 0.0001, LAT], [LON + 0.0002, LAT]]), 5, 'zero-area')
  })

  test('a self-intersecting ring throws self-intersection', () => {
    const bowtie = [[LON, LAT], [LON + 0.0001, LAT + 0.0001], [LON + 0.0001, LAT], [LON, LAT + 0.0002]]
    expectReason(polygon(bowtie), 5, 'self-intersection')
  })
})

describe('9. real fixture: Berlin LoD2 building DEBE02YY400000z3', () => {
  // GeoJSON made by scripts/extract-footprint.py (pyproj, 9 decimals); reference is the original EPSG:25833 ring.
  const reference = (JSON.parse(referenceRaw) as { ring: Array<[number, number]> }).ring
  const fp = footprintFromGeoJSON(JSON.parse(geojsonRaw), 10)
  const absolute = fp.ring.map((v): [number, number] => [v.x + fp.origin.easting, v.y + fp.origin.northing])

  const within1cm = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= 0.01

  /** True when `ring` equals `expected` from some start vertex, walking in either direction. */
  const sameRing = (ring: Array<[number, number]>, expected: Array<[number, number]>) => {
    if (ring.length !== expected.length) return false
    const n = ring.length
    return [1, -1].some((step) =>
      Array.from({ length: n }, (_, start) => start).some((start) =>
        ring.every((v, i) => within1cm(v, expected[(start + step * i + n * n) % n]!)),
      ),
    )
  }

  test('the output ring plus the origin equals the reference ring up to start vertex and orientation, within 1 cm', () => {
    expect(sameRing(absolute, reference)).toBe(true)
  })

  test('the vertex count matches the reference (no closing vertex, nothing dropped)', () => {
    expect(reference).toHaveLength(7)
    expect(fp.ring).toHaveLength(7)
  })

  test('the origin is the floor of the minimum easting and northing', () => {
    expect(fp.origin).toEqual({ easting: 390_248, northing: 5_816_242 })
  })

  test('the clockwise source ring is reversed and starts at its lowest vertex', () => {
    expect(within1cm(absolute[0]!, [390_254.05, 5_816_242.044])).toBe(true)
    expect(Math.min(...fp.ring.map((v) => v.x))).toBeGreaterThanOrEqual(0)
    expect(Math.min(...fp.ring.map((v) => v.y))).toBeGreaterThanOrEqual(0)
    let twiceArea = 0
    fp.ring.forEach((a, i) => {
      const b = fp.ring[(i + 1) % fp.ring.length]!
      twiceArea += a.x * b.y - b.x * a.y
    })
    expect(twiceArea / 2).toBeGreaterThan(0)
  })
})
